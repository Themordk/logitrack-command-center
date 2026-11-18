import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Smartphone, UserCog, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { parseError } from "@/lib/errorMapper";
import {
  FONTE_ONDA,
  STATUS_ETAPA_LABEL,
  descreverPreviaOperadores,
  descreverResumo,
  listarOperadoresElegiveis,
  montarAlteracoes,
  obterResponsaveisOnda,
  rotuloModo,
  salvarResponsaveisOnda,
  type FonteResponsaveis,
} from "@/lib/responsaveisOndaService";
import type { EtapaOnda } from "@/lib/responsaveisOnda.types";
import { SeletorConvocados } from "./SeletorConvocados";

interface Props {
  open: boolean;
  /** Id do documento (onda de saída ou, com fonte de entrada, movimento de entrada). */
  movimentoSaidaId: string | null;
  numeroOnda: number | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Fase 5.1: de onde ler/gravar. Padrão: onda de saída. */
  fonte?: FonteResponsaveis;
}

const STATUS_COR: Record<EtapaOnda["status"], string> = {
  NAO_SE_APLICA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  NAO_GERADA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  AGUARDANDO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  EM_ANDAMENTO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  CONCLUIDA: "bg-green-500/15 text-green-400 border-green-500/30",
};

/** Fonte padrão (onda) montada com as funções importadas aqui, para valer o mesmo serviço da tela. */
const FONTE_PADRAO: FonteResponsaveis = {
  ...FONTE_ONDA,
  obter: (id) => obterResponsaveisOnda(id),
  listarElegiveis: (id, tipo, busca) => listarOperadoresElegiveis(id, tipo, busca),
  salvar: ({ id, ...r }) => salvarResponsaveisOnda({ movimentoSaidaId: id, ...r }),
};

/** Atraso para simular no banco depois que o gestor para de mexer. */
const ATRASO_SIMULACAO_MS = 350;

/**
 * "Responsáveis da onda" — convocação manual pelo gestor, por etapa.
 * Convocação híbrida: etapa sem convocado fica livre para autoconvocação no coletor.
 * Toda regra (modo da etapa, elegibilidade, R9, progresso) é decidida pelas RPCs;
 * a tela mostra a prévia calculada pelo banco (modo simular) antes de aplicar.
 */
export function ResponsaveisOndaModal({ open, movimentoSaidaId, numeroOnda, onClose, onSuccess, fonte = FONTE_PADRAO }: Props) {
  const [selecao, setSelecao] = useState<Record<string, string[]>>({});
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [confirmaProgresso, setConfirmaProgresso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const dadosQuery = useQuery({
    queryKey: [`${fonte.chave}-responsaveis`, movimentoSaidaId],
    queryFn: () => fonte.obter(movimentoSaidaId!),
    enabled: open && !!movimentoSaidaId,
    staleTime: 0,
  });
  const dados = dadosQuery.data;
  const etapas = useMemo(() => (dados?.etapas ?? []).filter((e) => e.ativa), [dados]);

  // Reinicia a escolha a cada abertura / recarga com o que está gravado
  useEffect(() => {
    if (!open || !dados?.etapas) return;
    const inicial: Record<string, string[]> = {};
    const conhecidos: Record<string, string> = {};
    dados.etapas.forEach((e) => {
      inicial[e.tipo_tarefa_id] = e.convocados.map((c) => c.usuario_id);
      e.convocados.forEach((c) => { conhecidos[c.usuario_id] = c.nome; });
    });
    setSelecao(inicial);
    setNomes(conhecidos);
    setConfirmaProgresso(false);
  }, [open, dados]);

  useEffect(() => {
    if (!open) { setMotivo(""); setConfirmaProgresso(false); }
  }, [open]);

  const alteracoes = useMemo(() => montarAlteracoes(etapas, selecao), [etapas, selecao]);
  const chaveAlteracoes = JSON.stringify(alteracoes);

  const [chaveSimulada, setChaveSimulada] = useState(chaveAlteracoes);
  useEffect(() => {
    const t = setTimeout(() => setChaveSimulada(chaveAlteracoes), ATRASO_SIMULACAO_MS);
    return () => clearTimeout(t);
  }, [chaveAlteracoes]);

  const simulacaoQuery = useQuery({
    queryKey: [`${fonte.chave}-responsaveis-simular`, movimentoSaidaId, chaveSimulada],
    queryFn: () =>
      fonte.salvar({
        id: movimentoSaidaId!,
        alteracoes: JSON.parse(chaveSimulada),
        confirmarProgresso: true,
        simular: true,
      }),
    enabled: open && !!movimentoSaidaId && chaveSimulada !== "[]",
    staleTime: 0,
  });
  const simulacao = chaveSimulada === chaveAlteracoes && alteracoes.length > 0 ? simulacaoQuery.data : undefined;
  const simulando = alteracoes.length > 0 && (chaveSimulada !== chaveAlteracoes || simulacaoQuery.isFetching);
  const comProgresso = simulacao?.sucesso ? simulacao.com_progresso ?? 0 : 0;
  const emExecucao = simulacao?.sucesso ? simulacao.em_execucao ?? 0 : 0;
  const sensiveis = comProgresso + emExecucao;
  const motivoObrigatorio = !!simulacao?.sucesso && (simulacao.motivo_obrigatorio ?? sensiveis > 0);
  const linhasResumo = simulacao?.sucesso ? descreverResumo(simulacao.resumo) : [];
  const linhasPrevia = simulacao?.sucesso ? descreverPreviaOperadores(simulacao.resumo) : [];

  useEffect(() => { setConfirmaProgresso(false); }, [chaveAlteracoes]);

  const podeAplicar =
    !!dados?.pode_convocar &&
    !!dados?.onda?.editavel &&
    alteracoes.length > 0 &&
    !simulando &&
    !!simulacao?.sucesso &&
    (sensiveis === 0 || confirmaProgresso) &&
    (!motivoObrigatorio || motivo.trim().length > 0);

  const aplicar = async () => {
    if (!movimentoSaidaId || !podeAplicar) return;
    setSalvando(true);
    try {
      const r = await fonte.salvar({
        id: movimentoSaidaId,
        alteracoes,
        confirmarProgresso: confirmaProgresso,
        motivo,
      });
      if (!r.sucesso) {
        toast.error(parseError(r, "responsaveis-onda").title, { description: r.mensagem });
        void dadosQuery.refetch();
        return;
      }
      toast.success(`${fonte.titulo} #${numeroOnda ?? ""} atualizados.`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(parseError(err, "responsaveis-onda").title);
    } finally {
      setSalvando(false);
    }
  };

  const erroCarga = dadosQuery.error || (dados && !dados.sucesso ? dados : null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog size={18} className="text-primary" />
            {fonte.titulo}{numeroOnda ? ` #${numeroOnda}` : ""}
          </DialogTitle>
          <DialogDescription>{fonte.descricao}</DialogDescription>
        </DialogHeader>

        {dadosQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : erroCarga ? (
          <p className="text-sm text-destructive text-center py-6">{parseError(erroCarga, "responsaveis-onda").title}</p>
        ) : etapas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <UsersRound size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma etapa configurada para esta onda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {!dados?.pode_convocar && (
              <p className="text-xs px-3 py-2 rounded-md border border-orange-500/30 bg-orange-500/10 text-orange-300 flex items-center gap-2">
                <Lock size={13} /> Você pode ver, mas não tem permissão para convocar operadores nesta onda.
              </p>
            )}

            {etapas.map((etapa, idx) => {
              const pct = etapa.totais.qtd_requerida > 0
                ? Math.min(100, (etapa.totais.qtd_executada / etapa.totais.qtd_requerida) * 100)
                : 0;
              const alterada = alteracoes.some((a) => a.tipo_tarefa_id === etapa.tipo_tarefa_id);
              return (
                <div
                  key={etapa.tipo_tarefa_id}
                  className={cn(
                    "rounded-lg border p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_220px] gap-3 items-center",
                    alterada ? "border-primary/60 bg-primary/5" : "border-border",
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="h-6 w-6 shrink-0 rounded-full border border-border text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize">{etapa.nome.toLowerCase()}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                          {rotuloModo(etapa.modo)}
                        </span>
                        {etapa.por_zona && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">Por zona</span>
                        )}
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", STATUS_COR[etapa.status])}>
                          {STATUS_ETAPA_LABEL[etapa.status]}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    {etapa.operadores.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum operador com tarefa aberta</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {etapa.operadores.map((op) => (
                          <span
                            key={op.usuario_id}
                            title={op.origem === "GESTOR" ? "Convocado pelo gestor" : "Assumiu pelo coletor"}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-foreground flex items-center gap-1"
                          >
                            {op.origem === "GESTOR" ? <UserCog size={10} /> : <Smartphone size={10} />}
                            {op.nome} · {op.tarefas}
                            {(op.em_execucao ?? 0) > 0 && <span className="text-orange-400">({op.em_execucao} executando agora)</span>}
                            {op.com_progresso > 0 && <span className="text-yellow-400">({op.com_progresso} com progresso)</span>}
                          </span>
                        ))}
                      </div>
                    )}
                    {etapa.totais.total > 0 && (
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-1.5" aria-label={`Progresso da etapa ${etapa.nome}`} />
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {etapa.totais.concluidas}/{etapa.totais.total}
                        </span>
                      </div>
                    )}
                    {etapa.status === "NAO_GERADA" && etapa.convocados.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">Será aplicado quando as tarefas desta etapa forem geradas.</p>
                    )}
                  </div>

                  <div>
                    {etapa.travada ? (
                      <div className="h-10 px-3 rounded-lg border border-border bg-muted/40 text-sm text-muted-foreground flex items-center gap-2">
                        <Lock size={13} /> Etapa travada
                      </div>
                    ) : (
                      <SeletorConvocados
                        listar={fonte.listarElegiveis}
                        chaveFonte={fonte.chave}
                        movimentoSaidaId={movimentoSaidaId!}
                        etapa={etapa}
                        selecionados={selecao[etapa.tipo_tarefa_id] ?? []}
                        nomesConhecidos={nomes}
                        disabled={!dados?.pode_convocar || salvando}
                        onChange={(usuarios, novosNomes) => {
                          setNomes((n) => ({ ...n, ...novosNomes }));
                          setSelecao((s) => ({ ...s, [etapa.tipo_tarefa_id]: usuarios }));
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {alteracoes.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-semibold">Resumo do que vai acontecer</p>
                {simulando ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> Calculando...
                  </p>
                ) : simulacao && !simulacao.sucesso ? (
                  <ul className="space-y-1">
                    {(simulacao.erros?.length ? simulacao.erros : [{ codigo: simulacao.codigo, mensagem: simulacao.mensagem }]).map((e, i) => (
                      <li key={i} className="text-xs text-destructive flex items-start gap-1.5">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {e.mensagem}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-1">
                    {linhasResumo.map((l, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                        <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-primary" /> {l}
                      </li>
                    ))}
                  </ul>
                )}

                {linhasPrevia.length > 0 && !simulando && (
                  <ul className="space-y-1 rounded-md border border-border p-2" aria-label="Quem perde tarefas">
                    {linhasPrevia.map((l, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-orange-400" /> {l}
                      </li>
                    ))}
                  </ul>
                )}

                {sensiveis > 0 && !simulando && (
                  <label className="flex items-start gap-2 p-2 rounded-md bg-orange-500/10 border border-orange-500/30 cursor-pointer">
                    <Checkbox checked={confirmaProgresso} onCheckedChange={(v) => setConfirmaProgresso(!!v)} className="mt-0.5" />
                    <span className="text-xs text-orange-300">
                      Confirmo:{emExecucao > 0 && <> <strong>{emExecucao}</strong> tarefa(s) em execução agora serão interrompidas (o tempo conta como indireto de quem sai)</>}
                      {emExecucao > 0 && comProgresso > 0 && " e"}
                      {comProgresso > 0 && <> <strong>{comProgresso}</strong> tarefa(s) com progresso mudarão de dono e o novo responsável continua de onde parou</>}.
                      Nada é zerado. O operador que sai é avisado no coletor ao confirmar.
                    </span>
                  </label>
                )}

                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={motivoObrigatorio ? "Motivo (obrigatório)" : "Motivo (opcional)"}
                  aria-required={motivoObrigatorio}
                  aria-label="Motivo da alteração"
                  maxLength={200}
                  className="w-full h-9 px-3 rounded-md border border-border bg-secondary/40 text-sm outline-none focus:border-primary"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={aplicar} disabled={!podeAplicar || salvando}>
            {salvando && <Loader2 size={14} className="animate-spin mr-1" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
