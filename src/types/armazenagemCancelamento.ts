import type { StatusPrazo } from "@/lib/armazenagemOrigem";
export interface DashboardCancelamento {
  habilitado: boolean; endereco: string | null; prazo_horas: number;
  tarefas_pendentes: number; produtos_pendentes: number; total_a_armazenar: number;
  total_armazenado: number; percentual_concluido: number; vencidos: number; atencao: number; mais_antigo_horas: number;
}
export interface CamposCancelamento {
  hu_id?: string | null; armazem_id?: string; endereco_origem_id?: string; endereco_origem_desc?: string;
  saldo_origem?: number; entrada_em?: string; horas_parado?: number; prazo_horas?: number;
  status_prazo?: StatusPrazo; prioridade_tarefa?: string; ordem?: number;
}
export interface RespostaArmazenagemCancelamento {
  sucesso: boolean; resultado?: string; codigo?: string; mensagem?: string;
  picking_registrado?: boolean; quantidade_executada?: number; restante?: number;
  dados?: Record<string, unknown>;
}