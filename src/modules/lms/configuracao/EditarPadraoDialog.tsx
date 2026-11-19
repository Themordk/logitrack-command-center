import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/utils/dateTime";
import {
  ROTULO_NIVEL, descreverPadrao, ehRetroativa, formatarSegundos, horasPadraoSeg, sugerirPadraoLms, validarPadrao,
  type PadraoTempoConfig, type SugestaoPadrao,
} from "./lmsConfig.service";

export interface PartesEntrada { fixo: number; unidade: number; pfd: number }

interface Props {
  padrao: PadraoTempoConfig | null;
  nivelTela: "EMPRESA" | "ARMAZEM";
  hoje: string;
  podeRetroativo: boolean;
  salvando: boolean;
  contexto: { tenantId: string; empresaId: string; armazemId: string | null };
  onCancelar: () => void;
  onSalvar: (partes: PartesEntrada | null, origem: "MANUAL" | "CALIBRADO", vigenteDesde: string, motivo: string) => void;
}

function menosDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

const num = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(",", ".")));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR")}%`);

export function EditarPadraoDialog({ padrao, nivelTela, hoje, podeRetroativo, salvando, contexto, onCancelar, onSalvar }: Props) {
  const [fixo, setFixo] = useState("");
  const [unidade, setUnidade] = useState("");
  const [pfd, setPfd] = useState("");
  const [herdar, setHerdar] = useState(false);
  const [vigencia, setVigencia] = useState(hoje);
  const [motivo, setMotivo] = useState("");
  const [origem, setOrigem] = useState<"MANUAL" | "CALIBRADO">("MANUAL");
  const [sugestao, setSugestao] = useState<SugestaoPadrao | null>(null);
  const [sugerindo, setSugerindo] = useState(false);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);

  useEffect(() => {
    if (!padrao) return;
    setFixo(String(padrao.efetivo.tempo_fixo_seg ?? 0));
    setUnidade(String(padrao.efetivo.tempo_unidade_seg ?? 0));
    setPfd(String(padrao.efetivo.pfd_pct ?? 0));
    setHerdar(false);
    setVigencia(hoje);
    setMotivo("");
    setOrigem("MANUAL");
    setSugestao(null);
    setErroSugestao(null);
  }, [padrao, hoje]);

  const partes = { fixo: num(fixo), unidade: num(unidade), pfd: num(pfd) };
  const retro = ehRetroativa(vigencia, hoje);
  const minData = podeRetroativo ? menosDias(hoje, 92) : hoje;
  const un = (padrao?.unidade_medida || "un").toLowerCase();

  const erro = useMemo(() => {
    if (!padrao) return null;
    if (!vigencia || vigencia < minData) {
      return podeRetroativo ? "A data de início pode voltar no máximo 92 dias." : "A data de início não pode ser no passado.";
    }
    if (retro && !motivo.trim()) return "Informe o motivo de uma mudança com data no passado.";
    if (herdar) return null;
    return validarPadrao(partes);
  }, [padrao, vigencia, minData, podeRetroativo, retro, motivo, herdar, partes.fixo, partes.unidade, partes.pfd]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!padrao) return null;

  const editar = (set: (v: string) => void) => (v: string) => { set(v); setOrigem("MANUAL"); };

  async function sugerir() {
    if (!padrao) return;
    setSugerindo(true);
    setErroSugestao(null);
    try {
      setSugestao(await sugerirPadraoLms({
        ...contexto, tipoTarefaId: padrao.tipo_tarefa_id, pfd: Number.isFinite(partes.pfd) ? partes.pfd : null,
      }));
    } catch (e) {
      setErroSugestao(e instanceof Error ? e.message : "Não foi possível calcular a sugestão.");
    } finally {
      setSugerindo(false);
    }
  }

  function usarSugestao() {
    if (!sugestao?.sugestao) return;
    const s = sugestao.sugestao;
    setHerdar(false);
    setFixo(String(s.tempo_fixo_seg));
    setUnidade(String(s.tempo_unidade_seg));
    setPfd(String(s.pfd_pct));
    setOrigem("CALIBRADO");
    if (!motivo.trim()) setMotivo(`Sugerido pelo histórico: ${sugestao.amostra.usadas} execuções reais em ${sugestao.amostra.dias} dias`);
  }

  const exemplos = [1, 10, 50];

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onCancelar(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tempo padrão · {padrao.codigo} {padrao.descricao}</DialogTitle>
          <DialogDescription>
            {nivelTela === "EMPRESA" ? "Vale para todos os armazéns da empresa que não tiverem regra própria." : "Vale só para este armazém."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3">
            <div>
              <p className="text-xs text-muted-foreground">Valendo hoje</p>
              <p className="font-semibold text-foreground">{descreverPadrao(padrao.efetivo, padrao.unidade_medida)}</p>
              <p className="text-[11px] text-muted-foreground">{ROTULO_NIVEL[padrao.efetivo.nivel]}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sem regra neste nível</p>
              <p className="font-semibold text-foreground">{descreverPadrao(padrao.herdado, padrao.unidade_medida)}</p>
              <p className="text-[11px] text-muted-foreground">{ROTULO_NIVEL[padrao.herdado.nivel]}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="lms-padrao-herdar" checked={herdar} onCheckedChange={(c) => setHerdar(c === true)} />
            <Label htmlFor="lms-padrao-herdar" className="font-normal">
              Voltar a herdar ({descreverPadrao(padrao.herdado, padrao.unidade_medida)})
            </Label>
          </div>

          {!herdar && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lms-fixo">Por tarefa (s)</Label>
                  <Input id="lms-fixo" inputMode="decimal" value={fixo} onChange={(e) => editar(setFixo)(e.target.value)} autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lms-unidade">Por {un} (s)</Label>
                  <Input id="lms-unidade" inputMode="decimal" value={unidade} onChange={(e) => editar(setUnidade)(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lms-pfd">Folga PFD (%)</Label>
                  <Input id="lms-pfd" inputMode="decimal" value={pfd} onChange={(e) => editar(setPfd)(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <b>Por tarefa</b>: tempo de deslocar, ler e confirmar, igual em toda tarefa. <b>Por {un}</b>: quanto cada {un} a mais acrescenta
                (deixe 0 se a quantidade não muda o tempo). <b>Folga</b>: necessidades pessoais, fadiga e pequenas esperas (o mercado usa de 10% a 18%).
              </p>
              {!validarPadrao(partes) && (
                <div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground" data-testid="lms-padrao-previa">
                  Uma tarefa completa leva no padrão:{" "}
                  {exemplos.map((q, i) => (
                    <span key={q}>
                      {i > 0 && " · "}
                      <b className="text-foreground">{q} {un}</b> = {formatarSegundos(horasPadraoSeg({ tempo_fixo_seg: partes.fixo, tempo_unidade_seg: partes.unidade, pfd_pct: partes.pfd }, q))}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Sugestão pelo histórico */}
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
            <Input id="lms-padrao-vigencia" type="date" value={vigencia} min={minData} onChange={(e) => setVigencia(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {retro
                ? `Data no passado: depois de salvar, reprocesse a partir de ${formatDate(vigencia)} para os números mudarem.`
                : vigencia > hoje ? `Fica agendado e passa a valer em ${formatDate(vigencia)}.` : "Vale a partir de hoje. Os dias anteriores não mudam."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lms-padrao-motivo">Motivo {retro ? "(obrigatório)" : "(opcional)"}</Label>
            <Textarea id="lms-padrao-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: estudo de tempos de outubro" />
          </div>

          {origem === "CALIBRADO" && !herdar && <p className="text-xs text-muted-foreground">Será gravado como padrão <b>calibrado pelo histórico</b>.</p>}
          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => onSalvar(herdar ? null : partes, origem, vigencia, motivo)} disabled={!!erro || salvando}>
            {salvando && <Loader2 size={14} className="mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
