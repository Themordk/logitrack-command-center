export type SituacaoSaldo = "OK" | "SEM_SALDO_PICKING" | "SEM_SALDO_ENDERECO" | "SEM_PICKING_MAPEADO";
export interface CamposPendenciaPicking {
  situacao_saldo?: SituacaoSaldo;
  motivo_pendencia?: "SEM_SALDO_PICKING" | "SEM_PICKING_MAPEADO" | null;
  sem_saldo_na_liberacao?: boolean;
  saldo_pulmao?: number;
  abastecimento_pendente?: boolean;
  tipo_endereco?: "PICKING" | "PULMAO" | null;
  endereco_id?: string | null;
  saldo_endereco?: number;
}
export interface AvisoLiberacao {
  tipo: "SEM_SALDO_PICKING" | "SEM_PICKING_MAPEADO";
  nivel: "AVISO";
  produto_id: string;
  sku: string;
  descricao: string;
  qtd_faltante: number;
  saldo_pulmao: number;
  endereco_picking_id: string | null;
  endereco_picking: string | null;
  tarefa_sem_endereco: boolean;
  abastecimento_id: string | null;
}
export interface PendenciaPicking {
  movimento_saida_id: string;
  movimento_saida_item_id: string;
  tarefa_id: string;
  produto_id: string;
  sku: string;
  produto: string;
  situacao_saldo: Exclude<SituacaoSaldo, "OK">;
  motivo_pendencia: string | null;
  endereco_id: string | null;
  endereco: string | null;
  quantidade_pendente: number;
  saldo_endereco: number;
  saldo_pulmao: number;
  abastecimento_pendente: boolean;
}