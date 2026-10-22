import { useMemo, useRef, useState } from "react";
import { Braces, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TIPO_NO_UI } from "../../retornosUi";
import type { TipoNo } from "../../retornos.types";
import { renderTemplate } from "../avaliacao";
import { referenciasSaidas } from "../saidasAnteriores";
import { MIME_CAMINHO, avisoReferencia, usePainel, type GrupoCaminhos } from "./painelContext";

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multilinha?: boolean;
  semPrevia?: boolean;
  sugestoes?: string[];
  "aria-label"?: string;
}

const LIMITE_GRUPO = 50;

function valorCurto(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return Array.isArray(v) ? `lista (${v.length})` : "objeto";
  return String(v);
}

function relativo(g: GrupoCaminhos, caminho: string): string {
  if (g.id && caminho.startsWith(`saidas.${g.id}.`)) return caminho.slice(`saidas.${g.id}.`.length);
  if (g.id && caminho === `saidas.${g.id}`) return "(saída inteira)";
  return caminho;
}

export function TemplateInput({ id, value, onChange, placeholder, multilinha, semPrevia, sugestoes, ...rest }: Props) {
  const { contexto, somenteLeitura, grupos, anteriores, nosDoFluxo } = usePainel();
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  // Saídas: do mais próximo para o mais distante; depois "Documento".
  const gruposOrdenados = useMemo(() => {
    const saidas = grupos.filter((g) => g.id).reverse();
    return [...saidas, ...grupos.filter((g) => !g.id)];
  }, [grupos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return gruposOrdenados.map((g) => {
      const cabecalho = `${g.titulo} ${g.id ?? ""}`.toLowerCase();
      const itens = !q || cabecalho.includes(q)
        ? g.caminhos
        : g.caminhos.filter((c) => c.caminho.toLowerCase().includes(q) || relativo(g, c.caminho).toLowerCase().includes(q));
      return { g, itens };
    }).filter((x) => x.itens.length || (!q && x.g.aviso));
  }, [gruposOrdenados, busca]);

  const semAnteriores = !grupos.some((g) => g.id);

  const inserir = (caminho: string) => {
    const el = ref.current;
    const ini = el?.selectionStart ?? value.length;
    const fim = el?.selectionEnd ?? value.length;
    const trecho = `{{${caminho}}}`;
    onChange(value.slice(0, ini) + trecho + value.slice(fim));
    setAberto(false);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(ini + trecho.length, ini + trecho.length); }, 0);
  };

  const comum = {
    id, ref, value, placeholder, disabled: somenteLeitura, "aria-label": rest["aria-label"],
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(MIME_CAMINHO)) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => {
      const c = e.dataTransfer.getData(MIME_CAMINHO);
      if (c) { e.preventDefault(); inserir(c); }
    },
    list: sugestoes?.length && id ? `${id}-sug` : undefined,
    className: "rounded-lg bg-secondary/40 font-mono text-xs leading-normal pr-10",
  };
  const previa = renderTemplate(value, contexto);
  const alertas = useMemo(
    () => referenciasSaidas(value).map((r) => avisoReferencia(r, anteriores, nosDoFluxo)).filter((a): a is NonNullable<typeof a> => !!a),
    [value, anteriores, nosDoFluxo],
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {multilinha ? <Textarea {...comum} rows={3} /> : <Input {...comum} className={`${comum.className} h-9`} />}
        {sugestoes?.length && id ? <datalist id={`${id}-sug`}>{sugestoes.map((s) => <option key={s} value={s} />)}</datalist> : null}
        {!somenteLeitura && (
          <Popover open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) setBusca(""); }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" aria-label="Inserir caminho" className="absolute right-1 top-1 h-7 w-7">
                    <Braces size={13} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Inserir {"{{caminho}}"}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-96 p-2">
              <Input autoFocus aria-label="Buscar caminho" placeholder="Buscar caminho, nó ou ID…" value={busca} onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  const primeiro = filtrados[0]?.itens[0];
                  if (e.key === "Enter" && primeiro) { e.preventDefault(); inserir(primeiro.caminho); }
                }}
                className="mb-1 h-8 text-xs bg-secondary/40" />
              {semAnteriores && (
                <p className="mb-1 rounded px-2 py-1 text-[11px] text-muted-foreground">
                  Nenhum nó antes deste gera saída. Adicione um 'Montar payload' antes para reutilizar valores.
                </p>
              )}
              <div className="max-h-72 overflow-y-auto">
                {filtrados.map(({ g, itens }) => {
                  const Icone = g.tipo ? TIPO_NO_UI[g.tipo as TipoNo]?.icone ?? FileText : FileText;
                  return (
                    <section key={g.chave} className="mb-1">
                      <div className="sticky top-0 flex items-center gap-1.5 bg-popover px-1 py-1 text-xs font-semibold text-foreground">
                        <Icone size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{g.titulo}</span>
                        {g.id && <span className="shrink-0 rounded bg-secondary px-1 font-mono text-[10px] font-normal text-muted-foreground">{g.id}</span>}
                      </div>
                      {g.aviso && <p className="px-1 pb-0.5 text-[11px] text-amber-400">{g.aviso}</p>}
                      <ul>
                        {itens.slice(0, LIMITE_GRUPO).map((c) => (
                          <li key={c.caminho}>
                            <button type="button" onClick={() => inserir(c.caminho)} title={c.caminho}
                              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                              <span className="min-w-0 truncate">{relativo(g, c.caminho)}</span>
                              <span className="max-w-[40%] truncate text-sky-400">{valorCurto(c.valor)}</span>
                            </button>
                          </li>
                        ))}
                        {itens.length > LIMITE_GRUPO && <li className="px-2 py-0.5 text-[11px] text-muted-foreground">+{itens.length - LIMITE_GRUPO}…</li>}
                      </ul>
                    </section>
                  );
                })}
                {!filtrados.length && <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum caminho.</p>}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {!semPrevia && value.includes("{{") && (
        <p className="truncate font-mono text-xs text-muted-foreground" title={previa}>→ {previa || "(vazio)"}</p>
      )}
      {alertas.map((a, i) => (
        <p key={i} className={cn("text-xs", a.cor === "rose" ? "text-rose-400" : "text-amber-400")}>{a.texto}</p>
      ))}
    </div>
  );
}
