/**
 * Contratos das RPCs de convocação híbrida da expedição
 * (migrations 20261111150300..150500).
 *
 * Convocação híbrida = autoconvocação pelo operador (coletor) +
 * convocação manual pelo gestor (tela "Responsáveis da onda").
 * Toda a regra mora no banco; a tela só exibe e envia a escolha.
 */

export type ModoEtapa = "EXCLUSIVA" | "COMPARTILHADA";

export type StatusEtapa = "NAO_SE_APLICA" | "NAO_GERADA" | "AGUARDANDO" | "EM_ANDAMENTO" | "CONCLUIDA";

export type OrigemAtribuicao = "GESTOR" | "COLETOR";

export interface ConvocadoEtapa {
  usuario_id: string;
  nome: string;
  definido_por: string | null;
  definido_em: string;
}

export interface OperadorEtapa {
  usuario_id: string;
  nome: string;
  tarefas: number;
  com_progresso: number;
  origem: OrigemAtribuicao;
}

export interface TotaisEtapa {
  total: number;
  concluidas: number;
  abertas: number;
  livres: number;
  com_dono: number;
  com_progresso: number;
  qtd_requerida: number;
  qtd_executada: number;
}

export interface EtapaOnda {
  tipo_tarefa_id: string;
  codigo: string;
  nome: string;
  ordem: number;
  modo: ModoEtapa;
  ativa: boolean;
  por_zona: boolean;
  permite_mesmo_operador: boolean;
  status: StatusEtapa;
  travada: boolean;
  totais: TotaisEtapa;
  convocados: ConvocadoEtapa[];
  operadores: OperadorEtapa[];
}

export interface ResponsaveisOnda {
  sucesso: boolean;
  codigo?: string;
  mensagem?: string;
  onda?: { id: string; numero_onda: number; status: string; editavel: boolean };
  pode_convocar?: boolean;
  etapas?: EtapaOnda[];
}

export interface OperadorElegivel {
  usuario_id: string;
  nome: string;
  login: string;
  funcao_principal: string | null;
  funcao_igual_etapa: boolean;
  zona: string | null;
  logado: boolean;
  tarefas_abertas: number;
  convocado: boolean;
  elegivel: boolean;
  motivo: string;
  mensagem: string | null;
}

export interface AlteracaoEtapa {
  tipo_tarefa_id: string;
  /** Vazio = etapa livre (autoconvocação). */
  usuarios: string[];
}

export interface ResumoAlteracaoEtapa {
  tipo_tarefa_id: string;
  etapa: string;
  codigo_etapa: string;
  ordem: number;
  convocados: string;
  aplicado: boolean;
  livre?: boolean;
  modo?: ModoEtapa;
  tarefas_movidas?: number;
  tarefas_novas?: number;
  tarefas_devolvidas?: number;
  com_progresso?: number;
  bloqueadas_por_progresso?: number;
  de?: Array<{ usuario_id: string; nome: string; tarefas: number }>;
}

export interface SalvarResponsaveisResult {
  sucesso: boolean;
  codigo: string;
  mensagem: string;
  simulado?: boolean;
  com_progresso?: number;
  resumo?: ResumoAlteracaoEtapa[];
  erros?: Array<{ tipo_tarefa_id?: string; usuario_id?: string; codigo: string; mensagem: string }>;
}

/* ===== Coletor ===== */

export type EtapaColetor = "SEP" | "SEP-CONF";

export interface ResumoEtapaColetor {
  sucesso: boolean;
  codigo?: string;
  mensagem?: string;
  onda?: { id: string; numero_onda: number; status: string; pedidos: string | null };
  etapa?: { codigo: EtapaColetor; modo: ModoEtapa };
  pode_assumir?: boolean;
  ja_e_meu?: boolean;
  convocado_pelo_gestor?: boolean;
  totais?: {
    tarefas_abertas: number;
    tarefas_livres: number;
    minhas_tarefas: number;
    itens: number;
    enderecos: number;
    quantidade_pendente: number;
  };
  operadores?: Array<{ nome: string; tarefas: number; origem: OrigemAtribuicao }>;
  /** F5.4: grupos de separação (SEP) ou unidades de conferência (SEP-CONF) da onda. */
  unidades?: import("@/lib/unidadeConferencia").ResumoUnidades;
}

export interface AcaoEtapaResult {
  sucesso: boolean;
  codigo: string;
  mensagem: string;
  modo?: ModoEtapa;
  tarefas_atribuidas?: number;
  minhas_tarefas?: number;
  tarefas_devolvidas?: number;
}
