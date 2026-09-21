/**
 * Preview aproximado de etiquetas EPL2 e TSPL renderizado em HTML5 Canvas.
 * Interpreta os comandos mais usados e desenha texto, barcodes, QR e linhas.
 * Não é fiel ao firmware — serve para conferir layout e posicionamento.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import qrcode from "qrcode-generator";
import { AlertTriangle } from "lucide-react";

const DOTS_PER_MM = 8;

export type LinguagemCanvas = "EPL" | "TSPL";

interface Props {
  code: string;
  linguagem: LinguagemCanvas;
  larguraMm: number;
  alturaMm: number;
  dados?: Record<string, string | number | null | undefined>;
  /** px por mm na exibição. Padrão 4. */
  escalaPx?: number;
  maxLarguraPx?: number;
}

export function aplicarPlaceholders(
  code: string,
  dados: Record<string, string | number | null | undefined> = {},
): string {
  let out = code;
  for (const [chave, valor] of Object.entries(dados)) {
    const v = valor === null || valor === undefined ? "" : String(valor);
    out = out.split(`{{${chave}}}`).join(v);
  }
  return out.replace(/\{\{[^}]+\}\}/g, "---");
}

const EPL_FONTS: Record<string, number> = { "1": 12, "2": 16, "3": 20, "4": 24, "5": 48 };
const TSPL_FONTS: Record<string, number> = {
  "0": 20, "1": 12, "2": 16, "3": 20, "4": 24, "5": 28, "6": 28, "7": 32, "8": 32,
};

/** Divide argumentos respeitando aspas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
    } else if (ch === "," && !inQuote) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function unquote(s: string): string {
  const t = (s || "").trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t.slice(1, -1);
  return t;
}

function num(s: string | undefined, fallback = 0): number {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function drawBarcode(
  ctx: CanvasRenderingContext2D,
  data: string,
  x: number,
  y: number,
  height: number,
  moduleWidth: number,
  format: string,
  rot = 0,
) {
  if (!data) return;
  try {
    const off = document.createElement("canvas");
    JsBarcode(off, data, {
      format,
      width: Math.max(1, moduleWidth),
      height: Math.max(10, height),
      displayValue: false,
      margin: 0,
      lineColor: "#000000",
      background: "#FFFFFF",
    });
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(off, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(off, x, y);
    }
  } catch {
    ctx.save();
    ctx.fillStyle = "#999999";
    ctx.fillRect(x, y, 120, Math.max(10, height));
    ctx.restore();
  }
}

function drawQr(ctx: CanvasRenderingContext2D, data: string, x: number, y: number, cell: number) {
  if (!data) return;
  try {
    const qr = qrcode(0, "M");
    qr.addData(data);
    qr.make();
    const count = qr.getModuleCount();
    const size = Math.max(1, cell);
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, count * size, count * size);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(x + c * size, y + r * size, size, size);
      }
    }
    ctx.restore();
  } catch {
    /* ignore */
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  fontPx: number,
  xmul: number,
  ymul: number,
  rot: number,
  invertido = false,
) {
  const size = Math.max(6, fontPx * Math.max(1, ymul));
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  if (xmul > 1) ctx.scale(xmul, 1);
  ctx.font = `${size}px "Courier New", monospace`;
  ctx.textBaseline = "top";
  if (invertido) {
    const w = ctx.measureText(texto).width;
    ctx.fillStyle = "#000000";
    ctx.fillRect(-2, -2, w + 4, size + 4);
    ctx.fillStyle = "#FFFFFF";
  } else {
    ctx.fillStyle = "#000000";
  }
  ctx.fillText(texto, 0, 0);
  ctx.restore();
}

interface RenderResult {
  larguraDots: number;
  alturaDots: number;
  avisos: string[];
}

function renderEpl(
  ctx: CanvasRenderingContext2D,
  linhas: string[],
  larguraDots: number,
  alturaDots: number,
): RenderResult {
  const avisos: string[] = [];
  let w = larguraDots;
  let h = alturaDots;

  for (const raw of linhas) {
    const linha = raw.trim();
    if (!linha) continue;
    const head = linha[0];

    if (linha === "N") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      continue;
    }
    if (head === "q") { w = num(linha.slice(1), w); continue; }
    if (head === "Q") { h = num(splitArgs(linha.slice(1))[0], h); continue; }
    if (head === "D" || linha.startsWith("ZT") || head === "P" || head === "S" || head === "I" || head === "R") continue;

    if (head === "A") {
      const a = splitArgs(linha.slice(1));
      const x = num(a[0]);
      const y = num(a[1]);
      const rot = num(a[2]) * 90;
      const font = String(num(a[3], 3));
      const xmul = num(a[4], 1) || 1;
      const ymul = num(a[5], 1) || 1;
      const rev = (a[6] || "N").toUpperCase() === "R";
      const texto = unquote(a.slice(7).join(","));
      drawText(ctx, texto, x, y, EPL_FONTS[font] ?? 20, xmul, ymul, rot, rev);
      continue;
    }

    if (head === "B") {
      const a = splitArgs(linha.slice(1));
      const x = num(a[0]);
      const y = num(a[1]);
      const rot = num(a[2]) * 90;
      const tipo = (a[3] || "1").toString().replace(/"/g, "").toUpperCase();
      const narrow = num(a[4], 2) || 2;
      const altura = num(a[6], 60);
      const data = unquote(a.slice(8).join(","));
      const format = tipo === "3" || tipo === "3C" ? "CODE39" : tipo === "E30" ? "EAN13" : "CODE128";
      drawBarcode(ctx, data, x, y, altura, narrow, format, rot);
      continue;
    }

    if (linha.startsWith("LO")) {
      const a = splitArgs(linha.slice(2));
      ctx.fillStyle = "#000000";
      ctx.fillRect(num(a[0]), num(a[1]), Math.max(1, num(a[2])), Math.max(1, num(a[3])));
      continue;
    }

    if (linha.startsWith("X")) {
      const a = splitArgs(linha.slice(1));
      const x = num(a[0]); const y = num(a[1]);
      const esp = Math.max(1, num(a[2], 1));
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = esp;
      ctx.strokeRect(x, y, num(a[3]) - x, num(a[4]) - y);
      continue;
    }

    avisos.push(linha.slice(0, 24));
  }

  return { larguraDots: w, alturaDots: h, avisos };
}

function renderTspl(
  ctx: CanvasRenderingContext2D,
  linhas: string[],
  larguraDots: number,
  alturaDots: number,
): RenderResult {
  const avisos: string[] = [];
  const w = larguraDots;
  const h = alturaDots;

  for (const raw of linhas) {
    const linha = raw.trim();
    if (!linha) continue;
    const cmd = linha.split(/[\s,]/)[0].toUpperCase();
    const resto = linha.slice(cmd.length).trim();

    if (cmd === "CLS") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      continue;
    }
    if (["SIZE", "GAP", "DIRECTION", "PRINT", "DENSITY", "SPEED", "REFERENCE", "OFFSET", "SET", "CODEPAGE", "SHIFT"].includes(cmd)) continue;

    if (cmd === "TEXT") {
      const a = splitArgs(resto);
      const x = num(a[0]);
      const y = num(a[1]);
      const font = unquote(a[2] || "3");
      const rot = num(a[3]);
      const xmul = num(a[4], 1) || 1;
      const ymul = num(a[5], 1) || 1;
      const texto = unquote(a.slice(6).join(","));
      drawText(ctx, texto, x, y, TSPL_FONTS[font] ?? 20, xmul, ymul, rot);
      continue;
    }

    if (cmd === "BARCODE") {
      const a = splitArgs(resto);
      const x = num(a[0]);
      const y = num(a[1]);
      const tipo = unquote(a[2] || "128").toUpperCase();
      const altura = num(a[3], 60);
      const rot = num(a[5]);
      const narrow = num(a[6], 2) || 2;
      const data = unquote(a.slice(8).join(","));
      const format = tipo.includes("39") ? "CODE39" : tipo.includes("EAN13") ? "EAN13" : "CODE128";
      drawBarcode(ctx, data, x, y, altura, narrow, format, rot);
      continue;
    }

    if (cmd === "QRCODE") {
      const a = splitArgs(resto);
      const x = num(a[0]);
      const y = num(a[1]);
      const cell = num(a[3], 4) || 4;
      const data = unquote(a.slice(6).join(","));
      drawQr(ctx, data, x, y, cell);
      continue;
    }

    if (cmd === "BOX") {
      const a = splitArgs(resto);
      const x = num(a[0]); const y = num(a[1]);
      const x2 = num(a[2]); const y2 = num(a[3]);
      const esp = Math.max(1, num(a[4], 2));
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = esp;
      // TSPL usa coordenadas do canto oposto; se parecer largura/altura, converte
      const wRect = x2 > x ? x2 - x : x2;
      const hRect = y2 > y ? y2 - y : y2;
      ctx.strokeRect(x, y, Math.max(1, wRect), Math.max(1, hRect));
      continue;
    }

    if (cmd === "BAR") {
      const a = splitArgs(resto);
      ctx.fillStyle = "#000000";
      ctx.fillRect(num(a[0]), num(a[1]), Math.max(1, num(a[2])), Math.max(1, num(a[3])));
      continue;
    }

    avisos.push(linha.slice(0, 24));
  }

  return { larguraDots: w, alturaDots: h, avisos };
}

const DESK_MAT_BG =
  "repeating-linear-gradient(45deg, hsl(var(--muted)) 0px, hsl(var(--muted)) 6px, hsl(var(--secondary)) 6px, hsl(var(--secondary)) 12px)";

export function CanvasLabelPreview({
  code,
  linguagem,
  larguraMm,
  alturaMm,
  dados,
  escalaPx = 4,
  maxLarguraPx = 800,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  const larg = larguraMm > 0 ? larguraMm : 100;
  const alt = alturaMm > 0 ? alturaMm : 40;
  const larguraDots = Math.round(larg * DOTS_PER_MM);
  const alturaDots = Math.round(alt * DOTS_PER_MM);

  const codigoFinal = useMemo(() => aplicarPlaceholders(code || "", dados), [code, dados]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = larguraDots;
    canvas.height = alturaDots;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, larguraDots, alturaDots);

    if (!codigoFinal.trim()) {
      setAvisos([]);
      return;
    }

    const linhas = codigoFinal.split(/\r?\n/);
    try {
      const res =
        linguagem === "EPL"
          ? renderEpl(ctx, linhas, larguraDots, alturaDots)
          : renderTspl(ctx, linhas, larguraDots, alturaDots);
      setAvisos(res.avisos.slice(0, 4));
    } catch (e) {
      console.error("[CanvasLabelPreview]", e);
      setAvisos(["Erro ao interpretar o código."]);
    }
  }, [codigoFinal, linguagem, larguraDots, alturaDots]);

  const widthPx = Math.min(larg * escalaPx, maxLarguraPx);

  return (
    <div className="w-full">
      <div
        className="flex items-center justify-center rounded-lg border border-border p-4 mx-auto max-w-full overflow-auto"
        style={{ background: DESK_MAT_BG, minHeight: `${Math.max(alt * escalaPx + 32, 140)}px` }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: `${widthPx}px`,
            imageRendering: "pixelated",
            background: "#ffffff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.25)",
          }}
        />
      </div>

      <p className="text-[10px] text-muted-foreground text-center italic mt-2">
        {larg}mm × {alt}mm — Preview aproximado {linguagem} (Canvas). O resultado real pode variar
        conforme firmware e DPI.
      </p>

      {avisos.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-500">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>Comandos não interpretados no preview: {avisos.join(", ")}</span>
        </div>
      )}
    </div>
  );
}
