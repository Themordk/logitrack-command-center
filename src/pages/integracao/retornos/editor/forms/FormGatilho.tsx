import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import { INTERVALOS } from "../../../entidades";
import { retornosKeys } from "../../retornosKeys";
import { documentosRecentes } from "../../retornosService";
import type { Combinador, EntidadeDocumento, Regra } from "../../retornos.types";
import { Campo, Secao } from "../campos/Campo";
import { RegraBuilder } from "../campos/RegraBuilder";
import { descreverRegra } from "../campos/regras";
import type { FormNoProps } from "./formTypes";

type Modo = "imediato" | "agrupado" | "manual";

function eventoDoGatilho(p: FormNoProps): string | null {
  if (p.no.data.tipo === "gatilho.manual") return `manual.${(p.config.entidade as string) ?? "documento_saida"}`;
  return (p.config.evento as string | null) ?? null;
}

export function ParametrosGatilho(p: FormNoProps) {
  const { config: c, catalogo, alterar, somenteLeitura } = p;
  const manual = p.no.data.tipo === "gatilho.manual";
  const modo: Modo = manual ? "manual" : ((c.modo as Modo) ?? "imediato");
  const filtros = (c.filtros as Regra[]) ?? [];
  const combinador = (c.combinador as Combinador) ?? "e";
  const eventos = (catalogo?.eventos ?? []).filter((e) => !e.manual);
  const agr = (c.agrupamento as { intervalo_minutos?: number; max_documentos?: number } | undefined) ?? {};
  const semAgrupamento = modo === "agrupado" && !agr.intervalo_minutos && !agr.max_documentos;

  const trocarModo = (m: Modo) => {
    if (m === modo) return;
    if (m === "manual") {
      const ent = catalogo?.eventos.find((e) => e.codigo === c.evento)?.entidade ?? "documento_saida";
      alterar({ entidade: ent, filtros, combinador }, "gatilho.manual");
      return;
    }
    const base: Record<string, unknown> = { evento: manual ? null : c.evento ?? null, filtros, combinador, modo: m };
    if (m === "agrupado") base.agrupamento = { intervalo_minutos: 15, max_documentos: 50, ...agr };
    alterar(base, "gatilho.evento");
  };

  const setAgr = (patch: Partial<typeof agr>) => {
    const novo = { ...agr, ...patch };
    (Object.keys(novo) as (keyof typeof novo)[]).forEach((k) => { if (!novo[k]) delete novo[k]; });
    alterar({ ...c, agrupamento: novo });
  };

  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="Quando">
        {manual ? (
          <Campo rotulo="Tipo de documento" htmlFor="g-entidade">
            <Select value={(c.entidade as string) ?? "documento_saida"} disabled={somenteLeitura}
              onValueChange={(v) => alterar({ ...c, entidade: v as EntidadeDocumento })}>
              <SelectTrigger id="g-entidade" className="h-10 rounded-lg bg-secondary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="documento_saida">Documento de saída</SelectItem>
                <SelectItem value="documento_entrada">Documento de entrada</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        ) : (
          <Campo rotulo="Evento" htmlFor="g-evento">
            <Select value={(c.evento as string) ?? ""} disabled={somenteLeitura} onValueChange={(v) => alterar({ ...c, evento: v })}>
              <SelectTrigger id="g-evento" className="h-10 rounded-lg bg-secondary/40"><SelectValue placeholder="Escolha o evento" /></SelectTrigger>
              <SelectContent>
                {(["documento_entrada", "documento_saida"] as const).map((ent) => (
                  <SelectGroup key={ent}>
                    <SelectLabel>{ent === "documento_entrada" ? "Entrada" : "Saída"}</SelectLabel>
                    {eventos.filter((e) => e.entidade === ent).map((e) => (
                      <SelectItem key={e.codigo} value={e.codigo}>{e.nome} <span className="text-muted-foreground">({e.codigo})</span></SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        )}
      </Secao>

      <Secao titulo="Quais documentos">
        <RegraBuilder
          regras={filtros}
          combinador={combinador}
          catalogo={catalogo}
          textoVazio="Sem filtros: todos os documentos do evento entram."
          onChange={(r, cb) => alterar({ ...c, filtros: r, combinador: cb })}
        />
      </Secao>

      <Secao titulo="Como enviar">
        <RadioGroup value={modo} onValueChange={(v) => trocarModo(v as Modo)} disabled={somenteLeitura} className="grid grid-cols-3 gap-2">
          {([
            ["imediato", "Imediato", "Cada evento gera um envio."],
            ["agrupado", "Agrupado", "Junta vários documentos num lote."],
            ["manual", "Manual", "Só pelo botão no documento ou em Testar."],
          ] as const).map(([v, t, d]) => (
            <Label key={v} htmlFor={`modo-${v}`}
              className={cn("flex cursor-pointer flex-col gap-1 rounded-lg border p-3", modo === v ? "border-primary bg-primary/10" : "border-border bg-secondary/20")}>
              <span className="flex items-center gap-2 text-sm font-semibold"><RadioGroupItem id={`modo-${v}`} value={v} /> {t}</span>
              <span className="text-xs font-normal text-muted-foreground">{d}</span>
            </Label>
          ))}
        </RadioGroup>
        {modo === "agrupado" && (
          <div className="flex flex-wrap items-end gap-3">
            <Campo rotulo="Enviar a cada" htmlFor="g-intervalo">
              <Select value={agr.intervalo_minutos ? String(agr.intervalo_minutos) : "0"} disabled={somenteLeitura}
                onValueChange={(v) => setAgr({ intervalo_minutos: Number(v) || undefined })}>
                <SelectTrigger id="g-intervalo" className="h-10 w-36 rounded-lg bg-secondary/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">—</SelectItem>
                  {INTERVALOS.map((i) => <SelectItem key={i.value} value={String(i.value)}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            <Campo rotulo="ou ao juntar (documentos)" htmlFor="g-max">
              <Input id="g-max" type="number" min={1} max={1000} disabled={somenteLeitura} value={agr.max_documentos ?? ""}
                onChange={(e) => setAgr({ max_documentos: e.target.value ? Math.min(1000, Math.max(1, Number(e.target.value))) : undefined })}
                className="h-10 w-32 rounded-lg bg-secondary/40" />
            </Campo>
          </div>
        )}
        {semAgrupamento && <p className="text-xs text-rose-400" role="alert">Informe o intervalo ou a quantidade de documentos.</p>}
      </Secao>
    </div>
  );
}

export function ResultadoGatilho(p: FormNoProps) {
  const evento = eventoDoGatilho(p);
  const filtros = useMemo(() => ((p.config.filtros as Regra[]) ?? []).filter((r) => r.campo), [p.config.filtros]);
  const combinador = (p.config.combinador as Combinador) ?? "e";
  const chave = useDebounce(JSON.stringify({ filtros, combinador }), 500);
  const q = useQuery({
    queryKey: retornosKeys.docsRecentes(p.tenantId, p.empresaId, evento ?? "", chave, ""),
    queryFn: () => {
      const f = JSON.parse(chave) as { filtros: Regra[]; combinador: Combinador };
      return documentosRecentes({ tenantId: p.tenantId, empresaId: p.empresaId, evento: evento as string, filtros: f.filtros, combinador: f.combinador, limite: 20 });
    },
    enabled: !!evento,
  });

  if (!evento) return <p className="text-xs text-muted-foreground">Escolha o evento para ver quais documentos passariam.</p>;
  if (q.isLoading) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Carregando…</p>;
  if (q.error) return <p className="text-xs text-rose-400">Não foi possível testar os filtros.</p>;
  const docs = q.data ?? [];
  if (!docs.length) return <p className="text-xs text-muted-foreground">Nenhum documento recente para este evento.</p>;
  const passam = docs.filter((d) => d.passa_filtro !== false).length;
  const regraDe = (campo: string | null) => {
    const r = filtros.find((x) => x.campo === campo);
    return r ? descreverRegra(r, p.catalogo) : campo;
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border/40">
        {docs.map((d) => (
          <li key={`${d.documento_id}-${d.movimento_id ?? ""}`}>
            <button type="button" onClick={() => p.onDefinirAmostra(d)}
              className={cn("flex w-full items-start gap-2 px-1 py-2 text-left hover:bg-secondary/30 rounded", p.amostra?.documento_id === d.documento_id && "bg-secondary/40")}>
              {d.passa_filtro === false
                ? <X size={14} className="mt-0.5 shrink-0 text-rose-400" aria-hidden />
                : <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />}
              <span className="flex-1 min-w-0">
                <span className="flex justify-between gap-2 text-sm"><span className="font-mono">{d.numero}</span><span className="text-xs text-muted-foreground">{formatDateTime(d.quando)}</span></span>
                <span className={cn("block truncate text-xs", d.passa_filtro === false ? "text-rose-400" : "text-emerald-400")}>
                  {d.passa_filtro === false ? `Barrado por: ${regraDe(d.barrado_por)}` : "Passa"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="rounded-lg border border-primary/40 px-3 py-1.5 text-center text-xs text-foreground">{passam} de {docs.length} passariam pelo filtro</p>
    </div>
  );
}
