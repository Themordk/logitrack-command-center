import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

function normalizar(valor: unknown): unknown {
  if (typeof valor === "string") { try { return JSON.parse(valor); } catch { return valor; } }
  return valor;
}

export function jsonVazio(valor: unknown): boolean {
  const v = normalizar(valor);
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/** Bloco JSON recolhível (fechado por padrão) com botão de copiar. */
export function JsonBloco({ titulo, valor }: { titulo: string; valor: unknown }) {
  const [aberto, setAberto] = useState(false);
  if (jsonVazio(valor)) return null;
  const v = normalizar(valor);
  const texto = typeof v === "string" ? v : JSON.stringify(v, null, 2);

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); toast.success("Copiado"); }
    catch { toast.error("Não foi possível copiar."); }
  }

  return (
    <div className="rounded-lg border border-border/60">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
          className="flex items-center gap-1 text-xs font-medium text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {aberto ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />} {titulo}
        </button>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={copiar}>
          <Copy size={13} aria-hidden /> Copiar JSON
        </Button>
      </div>
      {aberto && (
        <pre className="font-mono text-[11px] bg-secondary/40 rounded-b-lg p-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-foreground">{texto}</pre>
      )}
    </div>
  );
}
