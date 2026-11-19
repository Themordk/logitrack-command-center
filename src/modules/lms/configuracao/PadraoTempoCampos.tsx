import { useState } from "react";
import { CalendarClock, Loader2, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/utils/dateTime";
import {
  ROTULO_NIVEL, descreverPadrao, ehRetroativa, formatarSegundos, formatarValor, horasPadraoSeg, sugerirPadraoLms, validarPadrao,
  type PadraoTempoConfig, type RegraSistema, type SugestaoPadrao,
} from "./lmsConfig.service";

/** Fase 10.11: campos do tempo padrão dentro do painel do tipo de tarefa (antes, diálogo próprio). */
export interface EdicaoPadrao {
  /** o gestor mexeu no tempo padrão? se não, o Salvar não envia esta parte */
  alterado: boolean;
  herdar: boolean;
  fixo: string;
  unidade: string;
  pfd: string;
  origem: "MANUAL" | "CALIBRADO";
  vigencia: string;
}

const num = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(",", ".")));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR")}%`);

function menosDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

export function edicaoPadraoInicial(p: PadraoTempoConfig | null | undefined, hoje: string): EdicaoPadrao {
  return {
    alterado: false, herdar: false, origem: "MANUAL", vigencia: hoje,
    fixo: String(p?.efetivo.tempo_fixo_seg ?? 0),
    unidade: String(p?.efetivo.tempo_unidade_seg ?? 0),
    pfd: String(p?.efetivo.pfd_pct ?? 0),
  };
}

export function partesDaEdicao(e: EdicaoPadrao) {
  return { fixo: num(e.fixo), unidade: num(e.unidade), pfd: num(e.pfd) };
}

/** Mesmas regras do banco (rpc_lms_config_salvar_padrao); null = pode salvar. */
export function validarEdicaoPadrao(e: EdicaoPadrao, o: { hoje: string; podeRetroativo: boolean; motivo: string }): string | null {
  if (!e.alterado) return null;
  const minData = o.podeRetroativo ? menosDias(o.hoje, 92) : o.hoje;
  if (!e.vigencia || e.vigencia < minData) {
    return o.podeRetroativo ? "A data de início pode voltar no máximo 92 dias." : "A data de início não pode ser no passado.";
  }
  if (ehRetroativa(e.vigencia, o.hoje) && !o.motivo.trim()) return "Informe o motivo de uma mudança com data no passado.";
  if (e.herdar) return null;
  return validarPadrao(partesDaEdicao(e));
}

interface Props {
  padrao: PadraoTempoConfig;
  edicao: EdicaoPadrao;
  onChange: (e: EdicaoPadrao) => void;
  /** motivo é compartilhado com o restante do painel; a sugestão preenche se estiver vazio */
  motivo: string;
  onMotivo: (m: string) => void;
  hoje: string;
  podeRetroativo: boolean;
  podeEditar: boolean;
  regraSistema: RegraSistema | null;
  contexto: { tenantId: string; empresaId: string; armazemId: string | null };
  /** cancela um tempo padrão agendado (data futura) deste nível */
  onExcluirAgendado?: (id: string) => void;
}

export function PadraoTempoCampos({
  padrao, edicao, onChange, motivo, onMotivo, hoje, podeRetroativo, podeEditar, regraSistema, contexto, onExcluirAgendado,
}: Props) {
  const [sugestao, setSugestao] = useState<SugestaoPadrao | null>(null);
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);

  const partes = partesDaEdicao(edicao);
  const un = "un"; // a parte variável conta a quantidade registrada na tarefa (Fase 10.12)
  const retro = ehRetroativa(edicao.vigencia, hoje);
  const minData = podeRetroativo ? menosDias(hoje, 92) : hoje;
  const mudar = (p: Partial<EdicaoPadrao>) => onChange({ ...edicao, alterado: true, ...p });
  const editarNumero = (campo: "fixo" | "unidade" | "pfd") => (v: string) => mudar({ [campo]: v, origem: "MANUAL" });

  async function sugerir() {
    setSugerindo(true);
    setErroSugestao(null);
    try {
      setSugestao(await sugerirPadraoLms({ ...contexto, tipoTarefaId: padrao.tipo_tarefa_id, pfd: Number.isFinite(partes.pfd) ? partes.pfd : null }));
    } catch (e) {
      setErroSugestao(e instanceof Error ? e.message : "Não foi possível calcular a sugestão.");
    } finally {
      setSugerindo(false);
    }
  }

  function usarSugestao() {
    if (!sugestao?.sugestao) return;
    const s = sugestao.sugestao;
    mudar({ herdar: false, fixo: String(s.tempo_fixo_seg), unidade: String(s.tempo_unidade_seg), pfd: String(s.pfd_pct), origem: "CALIBRADO" });
    if (!motivo.trim()) onMotivo(`Sugerido pelo histórico: ${sugestao.amostra.usadas} execuções reais em ${sugestao.amostra.dias} dias`);
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3">
        <div>
          <p className="text-xs text-muted-foreground">Valendo hoje</p>
          <p className="font-semibold text-foreground">{descreverPadrao(padrao.efetivo, padrao.unidade_medida)}</p>
          <p className="text-[11px] text-muted-foreground">{ROTULO_NIVEL[padrao.efetivo.nivel]}{padrao.efetivo.origem === "CALIBRADO" ? " · calibrado pelo histórico" : ""}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sem regra neste nível</p>
          <p className="font-semibold text-foreground">{descreverPadrao(padrao.herdado, padrao.unidade_medida)}</p>
          <p className="text-[11px] text-muted-foreground">{ROTULO_NIVEL[padrao.herdado.nivel]}</p>
        </div>
      </div>

      {padrao.agendados.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="lms-padrao-agendados">
          {padrao.agendados.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
              <CalendarClock size={11} />
              {a.tempo_fixo_seg === null ? "volta a herdar" : descreverPadrao({ ...a, tempo_fixo_seg: a.tempo_fixo_seg }, padrao.unidade_medida)} em {formatDate(a.vigente_desde)}
              {podeEditar && onExcluirAgendado && (
                <button type="button" aria-label="Cancelar agendamento" onClick={() => onExcluirAgendado(a.id)} className="hover:text-destructive">
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {podeEditar && (
        <>
          <div className="flex items-center gap-2">
            <Checkbox id="lms-padrao-herdar" checked={edicao.herdar} onCheckedChange={(c) => mudar({ herdar: c === true })} />
            <Label htmlFor="lms-padrao-herdar" className="font-normal">
              Voltar a herdar ({descreverPadrao(padrao.herdado, padrao.unidade_medida)})
            </Label>
          </div>

          {!edicao.herdar && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lms-fixo">Por tarefa (s)</Label>
                  <Input id="lms-fixo" inputMode="decimal" value={edicao.fixo} onChange={(e) => editarNumero("fixo")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lms-unidade">Por {un} (s)</Label>
                  <Input id="lms-unidade" inputMode="decimal" value={edicao.unidade} onChange={(e) => editarNumero("unidade")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lms-pfd">Folga PFD (%)</Label>
                  <Input id="lms-pfd" inputMode="decimal" value={edicao.pfd} onChange={(e) => editarNumero("pfd")(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <b>Por tarefa</b>: tempo de deslocar, ler e confirmar, igual em toda tarefa. <b>Por {un}</b>: quanto cada {un} a mais acrescenta
                (deixe 0 se a quantidade não muda o tempo). <b>Folga</b>: necessidades pessoais, fadiga e pequenas esperas (o mercado usa de 10% a 18%).
              </p>
              {!validarPadrao(partes) && (
                <div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground" data-testid="lms-padrao-previa">
                  Uma tarefa completa leva no padrão:{" "}
                  {[1, 10, 50].map((q, i) => (
                    <span key={q}>
                      {i > 0 && " · "}
                      <b className="text-foreground">{q} {un}</b> = {formatarSegundos(horasPadraoSeg({ tempo_fixo_seg: partes.fixo, tempo_unidade_seg: partes.unidade, pfd_pct: partes.pfd }, q))}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="lms-sugestao">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-foreground">
                <b>Sugerir pelo histórico</b>: analisa as execuções com início real registrado no coletor e propõe o padrão que deixa a execução típica em 100%.
              </p>
              <Button size="sm" variant="outline" onClick={sugerir} disabled={sugerindo}>
                {sugerindo ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />} Sugerir
              </Button>
            </div>
            {erroSugestao && <p className="text-xs text-destructive">{erroSugestao}</p>}
            {sugestao && !sugestao.suficiente && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400" role="status">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {sugestao.mensagem}
              </p>
            )}
            {sugestao?.sugestao && (
              <div className="space-y-1.5 text-xs">
                <p className="text-muted-foreground">{sugestao.mensagem}{sugestao.amostra.descartadas > 0 ? ` ${sugestao.amostra.descartadas} execução(ões) fora do comum foram descartadas.` : ""}</p>
                {sugestao.observado && (
                  <p className="text-muted-foreground">
                    Duração observada: mediana {formatarSegundos(sugestao.observado.mediana_seg)} (metade fica entre {formatarSegundos(sugestao.observado.p25_seg)} e {formatarSegundos(sugestao.observado.p75_seg)}).
                  </p>
                )}
                <p className="text-foreground">
                  Sugestão: <b>{descreverPadrao(sugestao.sugestao, padrao.unidade_medida)}</b>
                  {sugestao.sugestao.modelo === "FIXO_MAIS_UNIDADE"
                    ? ` — a quantidade explica bem a duração${sugestao.sugestao.r2 !== null ? ` (ajuste ${Math.round(sugestao.sugestao.r2 * 100)}%)` : ""}.`
                    : " — a quantidade quase não muda a duração, então o padrão fica só por tarefa."}
                </p>
                {sugestao.impacto && (
                  <p className="text-foreground">
                    Performance típica dessas execuções: <b>{pct(sugestao.impacto.atual.performance_mediana_pct)}</b> com o padrão atual →{" "}
                    <b>{pct(sugestao.impacto.sugerido.performance_mediana_pct)}</b> com a sugestão.
                  </p>
                )}
                <Button size="sm" onClick={usarSugestao}>Usar sugestão</Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lms-padrao-vigencia">Vale a partir de</Label>
            <Input id="lms-padrao-vigencia" type="date" value={edicao.vigencia} min={minData} onChange={(e) => mudar({ vigencia: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              {retro
                ? `Data no passado: depois de salvar, reprocesse a partir de ${formatDate(edicao.vigencia)} para os números mudarem (motivo obrigatório).`
                : edicao.vigencia > hoje ? `Fica agendado e passa a valer em ${formatDate(edicao.vigencia)}.` : "Vale a partir de hoje. Os dias anteriores não mudam."}
            </p>
          </div>
          {edicao.alterado && edicao.origem === "CALIBRADO" && !edicao.herdar && (
            <p className="text-xs text-muted-foreground">Será gravado como padrão <b>calibrado pelo histórico</b>.</p>
          )}
        </>
      )}

      {regraSistema && (
        <div className="rounded-md border border-border p-3 text-xs text-muted-foreground" data-testid="lms-regra-sistema">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground"><ShieldCheck size={13} /> Captura de tempo (regra do sistema, só leitura)</p>
          <p>
            Captura {regraSistema.captura_ativa ? "ativa" : "desligada"} · teto de ciclo {formatarValor(regraSistema.teto_ciclo_seg, "SEGUNDOS")}
            {regraSistema.observacao ? ` · ${regraSistema.observacao}` : ""}
          </p>
          <p className="mt-1">O teto de ciclo só é usado quando uma execução não tem início registrado.</p>
        </div>
      )}
    </div>
  );
}
