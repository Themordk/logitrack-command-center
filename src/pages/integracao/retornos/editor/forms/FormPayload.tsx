import { Fragment, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Braces, Check, Copy, ExternalLink, GripVertical, ListTree, Loader2, Plus, Tag, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CampoMapeado } from "../../retornos.types";
import { erroSintaxeJsonata, mapeamentoParaJsonata, presetSoStatus, presetStatusItens } from "../avaliacao";
import { CaminhoInput } from "../campos/CaminhoInput";
import { MIME_CAMINHO, MIME_LISTA, usePainel } from "../campos/painelContext";
import { entidadeDoGatilho } from "../novoNo";
import { usePreviaPayload } from "../usePreviaPayload";
import type { FormNoProps } from "./formTypes";

const MIME_LINHA = "text/x-retorno-linha";
const NADA = "_";

type Tipo = NonNullable<CampoMapeado["tipo"]>;
const TIPOS: { v: Tipo; r: string }[] = [
  { v: "caminho", r: "Campo do documento" }, { v: "fixo", r: "Valor fixo" }, { v: "expressao", r: "Expressão" },
  { v: "lista", r: "Lista (para cada item)" }, { v: "objeto", r: "Objeto" },
];
const FORMATOS = [
  { v: NADA, r: "automático" }, { v: "texto", r: "texto" }, { v: "numero", r: "número" }, { v: "inteiro", r: "inteiro" }, { v: "booleano", r: "sim/não" },
];

function configValida(c: Record<string, unknown>): boolean {
  if (c.modo === "jsonata") return typeof c.expressao === "string";
  return c.modo === "mapeamento" && Array.isArray(c.campos) && c.campos.length > 0;
}

function ultimaParte(caminho: string): string {
  const partes = caminho.replace(/^\$raiz\./, "").split(".").filter((x) => !/^\d+$/.test(x));
  return partes[partes.length - 1] ?? "";
}

/** Caminho absoluto → relativo ao item da lista (ou $raiz. quando fora dela). */
function relativo(caminho: string, base: string | null): string {
  if (!base) return caminho;
  if (caminho.startsWith(`${base}.0.`)) return caminho.slice(base.length + 3);
  return `$raiz.${caminho}`;
}

function baseAbsoluta(valor: string, base: string | null): string {
  const v = valor.trim();
  if (v.startsWith("$raiz.")) return v.slice(6);
  return base ? `${base}.0.${v}` : v;
}

// ---------- JSON com destaque de null ----------
function JsonVisual({ valor, nivel = 0 }: { valor: unknown; nivel?: number }): ReactNode {
  const ind = "  ".repeat(nivel + 1);
  const fim = "  ".repeat(nivel);
  if (valor === null || valor === undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild><span className="rounded bg-amber-500/15 px-0.5 text-amber-400">null</span></TooltipTrigger>
        <TooltipContent>sem valor na amostra</TooltipContent>
      </Tooltip>
    );
  }
  if (Array.isArray(valor)) {
    if (!valor.length) return "[]";
    return <>[{"\n"}{valor.map((v, i) => <Fragment key={i}>{ind}<JsonVisual valor={v} nivel={nivel + 1} />{i < valor.length - 1 ? "," : ""}{"\n"}</Fragment>)}{fim}]</>;
  }
  if (typeof valor === "object") {
    const e = Object.entries(valor as Record<string, unknown>);
    if (!e.length) return "{}";
    return <>{"{"}{"\n"}{e.map(([k, v], i) => <Fragment key={k}>{ind}<span className="text-sky-400">{JSON.stringify(k)}</span>: <JsonVisual valor={v} nivel={nivel + 1} />{i < e.length - 1 ? "," : ""}{"\n"}</Fragment>)}{fim}{"}"}</>;
  }
  return <span className={typeof valor === "string" ? "text-emerald-400" : "text-violet-400"}>{JSON.stringify(valor)}</span>;
}

/** Corpo calculado — usado na Saída do payload e na prévia do HTTP. */
export function CorpoPrevia({ config, contexto, tenantId, empresaId, fluxoId, rodape = true }: {
  config: Record<string, unknown> | undefined; contexto: unknown; tenantId: string; empresaId: string; fluxoId: string | null; rodape?: boolean;
}) {
  const previa = usePreviaPayload(config, contexto, tenantId, empresaId, fluxoId);
  const texto = previa.erro === undefined ? JSON.stringify(previa.valor ?? null, null, 2) : "";
  const bytes = useMemo(() => new TextEncoder().encode(JSON.stringify(previa.valor ?? null)).length, [previa.valor]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {previa.erro !== undefined ? (
          <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/30">Erro na avaliação</Badge>
        ) : (
          <Badge variant="outline" className="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
            <Check size={12} aria-hidden /> JSON válido · {bytes.toLocaleString("pt-BR")} bytes
          </Badge>
        )}
        <div className="flex items-center gap-1">
          {previa.calculando && <Loader2 size={13} className="animate-spin text-muted-foreground" aria-label="Calculando" />}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copiar corpo" disabled={previa.erro !== undefined}
                onClick={() => { void navigator.clipboard?.writeText(texto); toast.success("Corpo copiado."); }}>
                <Copy size={13} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {previa.erro !== undefined ? (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-400">{previa.erro}</p>
      ) : (
        <pre className="max-h-[55vh] overflow-auto whitespace-pre rounded-lg bg-secondary/40 p-3 font-mono text-xs text-foreground"><JsonVisual valor={previa.valor ?? null} /></pre>
      )}
      {rodape && <p className="text-[11px] text-muted-foreground">Prévia calculada no navegador. Use Testar para ver o envio real.</p>}
    </div>
  );
}

// ---------- Primeiro uso ----------
function PrimeiroUso({ p }: { p: FormNoProps }) {
  const entrada = entidadeDoGatilho(p.nos, p.catalogo) === "documento_entrada";
  const cartoes = [
    { icone: Tag, titulo: "Só o status", desc: "Pedido, código ERP, status (com de-para) e data.", cfg: { modo: "mapeamento", campos: presetSoStatus() } },
    { icone: ListTree, titulo: "Status + itens processados", desc: `Status e a lista de itens com ${entrada ? "esperado, conferido e divergente" : "solicitado, atendido e cortado"}.`, cfg: { modo: "mapeamento", campos: presetStatusItens(entrada) } },
    { icone: Braces, titulo: "Personalizado (JSONata)", desc: "Escreva a expressão com o contexto do documento ao lado.", cfg: { modo: "jsonata", expressao: "" } },
  ];
  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-base font-semibold text-foreground">O que o ERP precisa receber?</h4>
      <div className="grid gap-3">
        {cartoes.map((c) => (
          <button key={c.titulo} type="button" disabled={p.somenteLeitura} onClick={() => p.alterar(c.cfg)}
            className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4 text-left transition-colors hover:border-primary/60 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            <c.icone size={18} className="mt-0.5 text-primary" aria-hidden />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">{c.titulo}</span>
              <span className="text-xs text-muted-foreground">{c.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Mapeamento ----------
interface ListaProps {
  campos: CampoMapeado[];
  onChange: (c: CampoMapeado[]) => void;
  base: string | null;
  dominios: string[];
  somenteLeitura: boolean;
}

function ListaCampos({ campos, onChange, base, dominios, somenteLeitura }: ListaProps) {
  const listaId = useId();
  const [sobre, setSobre] = useState<number | null>(null);

  const novoDeCaminho = (abs: string, lista: boolean): CampoMapeado => {
    const rel = relativo(abs, base);
    return lista ? { campo: ultimaParte(abs), tipo: "lista", valor: rel, campos: [] } : { campo: ultimaParte(abs), valor: rel };
  };

  const soltarNaLinha = (e: DragEvent, i: number) => {
    setSobre(null);
    if (somenteLeitura) return;
    const linha = e.dataTransfer.getData(MIME_LINHA);
    if (linha) {
      const [id, de] = linha.split("|");
      if (id !== listaId) return;
      e.preventDefault(); e.stopPropagation();
      const n = [...campos]; const [x] = n.splice(Number(de), 1); n.splice(i, 0, x); onChange(n);
      return;
    }
    const c = e.dataTransfer.getData(MIME_CAMINHO);
    if (!c) return;
    e.preventDefault(); e.stopPropagation();
    const lista = e.dataTransfer.types.includes(MIME_LISTA);
    const atual = campos[i];
    const rel = relativo(c, base);
    const novo: CampoMapeado = lista
      ? { ...atual, campo: atual.campo || ultimaParte(c), tipo: "lista", valor: rel, campos: atual.campos ?? [] }
      : { ...atual, campo: atual.campo || ultimaParte(c), tipo: "caminho", valor: rel, campos: undefined };
    onChange(campos.map((x, j) => (j === i ? novo : x)));
  };

  const aceita = (e: DragEvent) => {
    if (somenteLeitura) return false;
    return e.dataTransfer.types.includes(MIME_CAMINHO) || e.dataTransfer.types.includes(MIME_LINHA);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {campos.map((c, i) => (
        <div key={i}
          onDragOver={(e) => { if (aceita(e)) { e.preventDefault(); e.stopPropagation(); setSobre(i); } }}
          onDragLeave={() => setSobre((s) => (s === i ? null : s))}
          onDrop={(e) => soltarNaLinha(e, i)}
          className={cn("rounded-lg", sobre === i && "ring-1 ring-primary")}>
          <LinhaCampo campo={c} base={base} dominios={dominios} somenteLeitura={somenteLeitura}
            onArrastar={(e) => { e.dataTransfer.setData(MIME_LINHA, `${listaId}|${i}`); e.dataTransfer.effectAllowed = "move"; }}
            onChange={(n) => onChange(campos.map((x, j) => (j === i ? n : x)))}
            onRemover={() => onChange(campos.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div
        onDragOver={(e) => { if (!somenteLeitura && e.dataTransfer.types.includes(MIME_CAMINHO)) { e.preventDefault(); e.stopPropagation(); } }}
        onDrop={(e) => {
          const c = e.dataTransfer.getData(MIME_CAMINHO);
          if (!c || somenteLeitura) return;
          e.preventDefault(); e.stopPropagation();
          onChange([...campos, novoDeCaminho(c, e.dataTransfer.types.includes(MIME_LISTA))]);
        }}
        className="rounded-lg border border-dashed border-border/70 px-2 py-1">
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary" disabled={somenteLeitura}
          onClick={() => onChange([...campos, { campo: "", valor: "" }])}>
          <Plus size={13} /> Adicionar campo
        </Button>
        <span className="text-[11px] text-muted-foreground">ou solte aqui um campo da Entrada</span>
      </div>
    </div>
  );
}

function LinhaCampo({ campo, onChange, onRemover, onArrastar, base, dominios, somenteLeitura }: {
  campo: CampoMapeado; onChange: (c: CampoMapeado) => void; onRemover: () => void; onArrastar: (e: DragEvent) => void;
  base: string | null; dominios: string[]; somenteLeitura: boolean;
}) {
  const tipo = campo.tipo ?? "caminho";
  const valor = campo.valor === undefined || campo.valor === null ? "" : typeof campo.valor === "string" ? campo.valor : JSON.stringify(campo.valor);
  const composto = tipo === "lista" || tipo === "objeto";
  const trocarTipo = (t: Tipo) => {
    const { campos: _c, dominio: _d, formato: _f, ...resto } = campo;
    const base2: CampoMapeado = { ...resto, tipo: t === "caminho" ? undefined : t };
    if (t === "objeto") onChange({ ...base2, valor: undefined, campos: campo.campos ?? [] });
    else if (t === "lista") onChange({ ...base2, campos: campo.campos ?? [] });
    else onChange({ ...base2, dominio: campo.dominio, formato: campo.formato });
  };
  const nomeAria = campo.campo || "novo campo";
  const { fluxoId } = usePainel();
  const semItens = !!campo.dominio && !dominios.includes(campo.dominio);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card/40 p-2">
      <div className="flex flex-nowrap items-center gap-1.5">
        <span draggable={!somenteLeitura} onDragStart={onArrastar} aria-label={`Arrastar ${nomeAria}`} role="button" tabIndex={-1}
          className={cn("shrink-0 text-muted-foreground", !somenteLeitura && "cursor-grab")}><GripVertical size={14} /></span>
        <Input aria-label="Nome do campo no ERP" value={campo.campo} disabled={somenteLeitura} placeholder="campo no ERP"
          onChange={(e) => onChange({ ...campo, campo: e.target.value })} className="h-9 w-36 min-w-0 shrink rounded-lg bg-secondary/40 font-mono text-xs leading-normal" />
        <Select value={tipo} disabled={somenteLeitura} onValueChange={(v) => trocarTipo(v as Tipo)}>
          <SelectTrigger aria-label={`Tipo de ${nomeAria}`} className="h-9 w-44 min-w-0 shrink rounded-lg bg-secondary/40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v} className="text-xs">{t.r}</SelectItem>)}</SelectContent>
        </Select>
        <div className="min-w-0 flex-1">
          {tipo === "caminho" || tipo === "lista" ? (
            <CaminhoInput aria-label={`Valor de ${nomeAria}`} value={valor} placeholder={tipo === "lista" ? "ex.: itens" : base ? "ex.: produto.sku" : "ex.: documento.numero"}
              onChange={(v) => onChange({ ...campo, valor: v })} />
          ) : tipo === "objeto" ? (
            <span className="text-xs text-muted-foreground">Agrupa os subcampos abaixo</span>
          ) : (
            <Input aria-label={`Valor de ${nomeAria}`} value={valor} disabled={somenteLeitura}
              placeholder={tipo === "expressao" ? "expressão JSONata, ex.: evento" : "valor fixo"}
              onChange={(e) => onChange({ ...campo, valor: e.target.value })} className="h-9 rounded-lg bg-secondary/40 font-mono text-xs leading-normal" />
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Remover ${nomeAria}`} disabled={somenteLeitura} onClick={onRemover}><Trash2 size={13} /></Button>
          </TooltipTrigger>
          <TooltipContent>Remover</TooltipContent>
        </Tooltip>
      </div>
      {!composto && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">De-para</span>
          <Select value={campo.dominio ?? NADA} disabled={somenteLeitura}
            onValueChange={(v) => { const { dominio: _d, ...r } = campo; onChange(v === NADA ? r : { ...r, dominio: v }); }}>
            <SelectTrigger aria-label={`De-para de ${nomeAria}`} className="h-8 w-32 rounded-lg bg-secondary/40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NADA} className="text-xs">—</SelectItem>
              {dominios.map((d) => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
              {semItens && <SelectItem value={campo.dominio!} className="text-xs">{campo.dominio} (sem itens)</SelectItem>}
            </SelectContent>
          </Select>
          <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">Formato</span>
          <Select value={campo.formato ?? NADA} disabled={somenteLeitura}
            onValueChange={(v) => { const { formato: _f, ...r } = campo; onChange(v === NADA ? r : { ...r, formato: v as CampoMapeado["formato"] }); }}>
            <SelectTrigger aria-label={`Formato de ${nomeAria}`} className="h-8 w-32 rounded-lg bg-secondary/40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{FORMATOS.map((f) => <SelectItem key={f.v} value={f.v} className="text-xs">{f.r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {!composto && semItens && (
        <p className="flex items-center gap-1.5 pl-6 text-[11px] text-amber-400">
          Sem itens neste domínio: o valor vai sem tradução.
          <a href={`#/config/integracao/retornos?aba=depara${fluxoId ? `&fluxo=${fluxoId}` : ""}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline">Abrir de-para <ExternalLink size={11} aria-hidden /></a>
        </p>
      )}
      {composto && (
        <div className="ml-3 flex flex-col gap-1.5 border-l-2 border-border pl-3">
          {tipo === "lista" && (
            <p className="text-[11px] text-muted-foreground">
              Para cada item de <span className="font-mono text-foreground">{valor || "…"}</span>: caminhos relativos ao item. Use <span className="font-mono">$raiz.</span> para acessar a raiz.
            </p>
          )}
          <ListaCampos campos={campo.campos ?? []} onChange={(cs) => onChange({ ...campo, campos: cs })} dominios={dominios} somenteLeitura={somenteLeitura}
            base={tipo === "lista" ? baseAbsoluta(valor, base) : base} />
        </div>
      )}
    </div>
  );
}

// ---------- JSONata ----------
function EditorJsonata({ valor, onChange, somenteLeitura }: { valor: string; onChange: (v: string) => void; somenteLeitura: boolean }) {
  const { caminhos } = usePainel();
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLPreElement>(null);
  const erro = useMemo(() => erroSintaxeJsonata(valor), [valor]);
  const linhas = Math.max(1, valor.split("\n").length);

  const inserir = (t: string) => {
    if (somenteLeitura) return;
    const el = ref.current;
    const ini = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? valor.length;
    onChange(valor.slice(0, ini) + t + valor.slice(fim));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + t.length, ini + t.length); });
  };
  const variaveis = ['$mapa("status", evento)', "$raiz", "$agora()"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label htmlFor="payload-jsonata" className="text-xs uppercase tracking-wide text-muted-foreground">Expressão JSONata</label>
        <a href="https://docs.jsonata.org" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
          Referência JSONata <ExternalLink size={12} aria-hidden />
        </a>
      </div>
      <div className={cn("flex h-80 overflow-hidden rounded-lg border bg-secondary/40", erro ? "border-rose-500/50" : "border-border")}>
        <pre ref={gutter} aria-hidden className="select-none overflow-hidden border-r border-border/60 px-2 py-2 text-right font-mono text-xs leading-5 text-muted-foreground">
          {Array.from({ length: linhas }, (_, i) => i + 1).join("\n")}
        </pre>
        <textarea id="payload-jsonata" ref={ref} value={valor} disabled={somenteLeitura} spellCheck={false} aria-invalid={!!erro}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME_CAMINHO)) e.preventDefault(); }}
          onDrop={(e) => { const c = e.dataTransfer.getData(MIME_CAMINHO); if (c) { e.preventDefault(); inserir(c); } }}
          placeholder={'{\n  "pedido": documento.numero\n}'}
          className="flex-1 resize-none whitespace-pre bg-transparent px-3 py-2 font-mono text-xs leading-5 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" />
      </div>
      {erro && <p role="alert" className="font-mono text-xs text-rose-400">{erro}</p>}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Variáveis (clique para inserir)</span>
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {[...variaveis, ...caminhos.slice(0, 60)].map((v) => (
            <button key={v} type="button" disabled={somenteLeitura} onClick={() => inserir(v)}
              className="rounded border border-border bg-secondary/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50">
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Parâmetros / Resultado ----------
export function ParametrosPayload(p: FormNoProps) {
  const [confirmar, setConfirmar] = useState<"para_jsonata" | "para_mapeamento" | null>(null);
  const previa = usePreviaPayload(undefined, null, p.tenantId, p.empresaId, p.fluxoId);
  const dominios = useMemo(() => {
    const s = new Set<string>(["status", ...previa.mapa.map((m) => m.dominio)]);
    return [...s].sort();
  }, [previa.mapa]);

  if (!configValida(p.config)) return <PrimeiroUso p={p} />;
  const modo = p.config.modo as "mapeamento" | "jsonata";
  const campos = (p.config.campos as CampoMapeado[]) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={modo} onValueChange={(v) => { if (v !== modo && !p.somenteLeitura) setConfirmar(v === "jsonata" ? "para_jsonata" : "para_mapeamento"); }}>
        <TabsList className="bg-secondary border border-border self-start">
          <TabsTrigger value="mapeamento" className="gap-1.5 text-xs" disabled={p.somenteLeitura && modo !== "mapeamento"}><Workflow size={14} /> Mapeamento</TabsTrigger>
          <TabsTrigger value="jsonata" className="gap-1.5 text-xs" disabled={p.somenteLeitura && modo !== "jsonata"}><Braces size={14} /> JSONata</TabsTrigger>
        </TabsList>
      </Tabs>

      {modo === "mapeamento" ? (
        <ListaCampos campos={campos} base={null} dominios={dominios} somenteLeitura={p.somenteLeitura}
          onChange={(cs) => p.alterar({ modo: "mapeamento", campos: cs })} />
      ) : (
        <EditorJsonata valor={(p.config.expressao as string) ?? ""} somenteLeitura={p.somenteLeitura}
          onChange={(v) => p.alterar({ modo: "jsonata", expressao: v })} />
      )}

      <AlertDialog open={confirmar === "para_jsonata"} onOpenChange={(o) => { if (!o) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passar para JSONata</AlertDialogTitle>
            <AlertDialogDescription>Quer converter o mapeamento atual numa expressão equivalente?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { p.alterar({ modo: "jsonata", expressao: "" }); setConfirmar(null); }}>Começar vazio</AlertDialogCancel>
            <AlertDialogAction onClick={() => { p.alterar({ modo: "jsonata", expressao: mapeamentoParaJsonata(campos) }); setConfirmar(null); }}>Converter</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmar === "para_mapeamento"} onOpenChange={(o) => { if (!o) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar a expressão?</AlertDialogTitle>
            <AlertDialogDescription>A expressão JSONata será descartada e você escolherá um novo mapeamento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { p.alterar({ modo: "mapeamento", campos: [] }); setConfirmar(null); }}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ResultadoPayload(p: FormNoProps) {
  if (!configValida(p.config)) return <p className="text-xs text-muted-foreground">Escolha ao lado o que o ERP precisa receber.</p>;
  return <CorpoPrevia config={p.config} contexto={p.contexto} tenantId={p.tenantId} empresaId={p.empresaId} fluxoId={p.fluxoId} />;
}
