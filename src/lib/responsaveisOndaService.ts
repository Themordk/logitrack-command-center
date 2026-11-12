import { supabase } from "@/integrations/supabase/client";
import type {
  AcaoEtapaResult,
  AlteracaoEtapa,
  EtapaColetor,
  EtapaOnda,
  OperadorElegivel,
  ResponsaveisOnda,
  ResumoAlteracaoEtapa,
  ResumoEtapaColetor,
  SalvarResponsaveisResult,
} from "@/lib/responsaveisOnda.types";

/** As RPCs devolvem jsonb; o PostgREST pode entregar objeto ou string. */
function lerJson<T>(data: unknown): T {
  if (typeof data === "string") return JSON.parse(data) as T;
  return data as T;
}

/* =========================================================================
 * Web — tela "Responsáveis da onda" (convocação manual pelo gestor)
 * ========================================================================= */

export async function obterResponsaveisOnda(movimentoSaidaId: string): Promise<ResponsaveisOnda> {
  const { data, error } = await supabase.rpc("rpc_onda_responsaveis_obter", {
    p_movimento_saida_id: movimentoSaidaId,
  });
  if (error) throw error;
  return lerJson<ResponsaveisOnda>(data);
}

export async function listarOperadoresElegiveis(
  movimentoSaidaId: string,
  tipoTarefaId: string,
  busca?: string,
): Promise<OperadorElegivel[]> {
  const { data, error } = await supabase.rpc("rpc_onda_operadores_elegiveis", {
    p_movimento_saida_id: movimentoSaidaId,
    p_tipo_tarefa_id: tipoTarefaId,
    p_busca: busca?.trim() || null,
  });
  if (error) throw error;
  return lerJson<OperadorElegivel[]>(data) ?? [];
}

export async function salvarResponsaveisOnda(params: {
  movimentoSaidaId: string;
  alteracoes: AlteracaoEtapa[];
  confirmarProgresso?: boolean;
  motivo?: string | null;
  simular?: boolean;
}): Promise<SalvarResponsaveisResult> {
  const { data, error } = await supabase.rpc("rpc_onda_responsaveis_salvar", {
    p_movimento_saida_id: params.movimentoSaidaId,
    p_alteracoes: params.alteracoes as unknown as never,
    p_confirmar_progresso: params.confirmarProgresso ?? false,
    p_motivo: params.motivo?.trim() || null,
    p_simular: params.simular ?? false,
  });
  if (error) throw error;
  return lerJson<SalvarResponsaveisResult>(data);
}

/* =========================================================================
 * Coletor — autoconvocação (resumo sem reserva, assumir, sair)
 * ========================================================================= */

interface ContextoColetor {
  tenantId: string;
  empresaId: string;
  usuarioId: string;
  movimentoSaidaId: string;
  etapa: EtapaColetor;
}

function argsColetor(c: ContextoColetor) {
  return {
    p_tenant_id: c.tenantId,
    p_empresa_id: c.empresaId,
    p_usuario_id: c.usuarioId,
    p_movimento_saida_id: c.movimentoSaidaId,
    p_etapa: c.etapa,
  };
}

export async function resumoEtapaColetor(c: ContextoColetor): Promise<ResumoEtapaColetor> {
  const { data, error } = await supabase.rpc("rpc_coletor_onda_resumo", argsColetor(c));
  if (error) throw error;
  return lerJson<ResumoEtapaColetor>(data);
}

export async function assumirEtapaColetor(c: ContextoColetor): Promise<AcaoEtapaResult> {
  const { data, error } = await supabase.rpc("rpc_coletor_assumir_etapa", argsColetor(c));
  if (error) throw error;
  return lerJson<AcaoEtapaResult>(data);
}

export async function sairEtapaColetor(c: ContextoColetor): Promise<AcaoEtapaResult> {
  const { data, error } = await supabase.rpc("rpc_coletor_sair_etapa", argsColetor(c));
  if (error) throw error;
  return lerJson<AcaoEtapaResult>(data);
}

/* =========================================================================
 * Helpers puros (testáveis) — só apresentação; nenhuma regra de negócio
 * ========================================================================= */

export const STATUS_ETAPA_LABEL: Record<EtapaOnda["status"], string> = {
  NAO_SE_APLICA: "Não se aplica",
  NAO_GERADA: "Aguardando etapa anterior",
  AGUARDANDO: "Aguardando operador",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

export function rotuloModo(modo: EtapaOnda["modo"]): string {
  return modo === "EXCLUSIVA" ? "Reserva total" : "Compartilhada";
}

/** Abreviação da etapa para os chips do card da onda. */
export function siglaEtapa(codigo: string | null | undefined): string | null {
  if (codigo === "SEP") return "SEP";
  if (codigo === "SEP-CONF") return "CONF";
  if (codigo === "EMB") return "EMB";
  return null;
}

/**
 * Diferença entre o que está gravado e o que o gestor escolheu.
 * Só entram etapas cuja lista de convocados mudou.
 */
export function montarAlteracoes(
  etapas: EtapaOnda[],
  selecao: Record<string, string[]>,
): AlteracaoEtapa[] {
  const alteracoes: AlteracaoEtapa[] = [];
  for (const etapa of etapas) {
    const escolhidos = selecao[etapa.tipo_tarefa_id];
    if (!escolhidos) continue;
    const atuais = etapa.convocados.map((c) => c.usuario_id).sort();
    const novos = [...new Set(escolhidos)].sort();
    const igual = atuais.length === novos.length && atuais.every((id, i) => id === novos[i]);
    if (!igual) alteracoes.push({ tipo_tarefa_id: etapa.tipo_tarefa_id, usuarios: novos });
  }
  return alteracoes;
}

/** Frases do "Resumo do que vai acontecer" a partir da simulação do banco. */
export function descreverResumo(resumo: ResumoAlteracaoEtapa[] | undefined): string[] {
  if (!resumo) return [];
  const linhas: string[] = [];
  for (const r of resumo) {
    const etapa = r.etapa ? r.etapa.charAt(0) + r.etapa.slice(1).toLowerCase() : "Etapa";
    if (r.livre) {
      linhas.push(
        r.tarefas_devolvidas
          ? `${etapa}: volta a ficar livre; ${r.tarefas_devolvidas} tarefa(s) convocada(s) pelo gestor voltam para a fila.`
          : `${etapa}: volta a ficar livre para autoconvocação.`,
      );
      continue;
    }
    const de = (r.de ?? []).map((d) => d.nome).join(", ");
    if (r.tarefas_movidas) {
      linhas.push(`${etapa}: mover ${r.tarefas_movidas} tarefa(s)${de ? ` de ${de}` : ""} para ${r.convocados}.`);
    }
    if (r.tarefas_novas) {
      linhas.push(`${etapa}: ${r.tarefas_novas} tarefa(s) livre(s) passam para ${r.convocados}.`);
    }
    if (r.tarefas_devolvidas) {
      linhas.push(`${etapa}: ${r.tarefas_devolvidas} tarefa(s)${de ? ` de ${de}` : ""} voltam para a fila (fora da equipe).`);
    }
    if (!r.tarefas_movidas && !r.tarefas_novas && !r.tarefas_devolvidas) {
      linhas.push(`${etapa}: ${r.convocados} fica convocado(a); vale para as tarefas que ainda serão geradas.`);
    }
    if (r.com_progresso) {
      linhas.push(`${r.com_progresso} tarefa(s) com progresso continuarão de onde pararam com o novo responsável.`);
    }
  }
  return linhas;
}

export type AcaoColetor =
  | { tipo: "CONTINUAR"; rotulo: string; podeSair: boolean }
  | { tipo: "ASSUMIR"; rotulo: string; podeSair: false }
  | { tipo: "BLOQUEADA"; rotulo: string; podeSair: false; mensagem: string };

/** O que o botão principal do coletor deve oferecer para a etapa selecionada. */
export function acaoColetor(resumo: ResumoEtapaColetor, verbo: "separação" | "conferência"): AcaoColetor {
  if (resumo.ja_e_meu) {
    return { tipo: "CONTINUAR", rotulo: `Continuar ${verbo}`, podeSair: !resumo.convocado_pelo_gestor };
  }
  if (resumo.pode_assumir) {
    return {
      tipo: "ASSUMIR",
      rotulo: resumo.convocado_pelo_gestor ? `Iniciar ${verbo}` : `Assumir e iniciar ${verbo}`,
      podeSair: false,
    };
  }
  return {
    tipo: "BLOQUEADA",
    rotulo: "Indisponível",
    podeSair: false,
    mensagem: resumo.mensagem || "Esta onda não está disponível para você.",
  };
}
