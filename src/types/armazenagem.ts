export type DestinoRecomendado = "PICKING" | "DIVIDIR" | "PULMAO" | "SEM_PICKING" | "SEM_DESTINO";

export type StatusPicking = "SEM_LIMITE" | "ABAIXO_MINIMO" | "NORMAL" | "CHEIO" | "ACIMA_MAXIMO";

export interface PickingDestino {
  endereco_id: string;
  endereco: string;
  situacao: string;
  saldo: number;
  est_minimo: number;
  est_maximo: number | null;
  cabe: number | null;
  status: StatusPicking;
}

export type DestinoArmazenagem = {
  sucesso: boolean;
  codigo?: "PARAMETRO_OBRIGATORIO" | "PRODUTO_NAO_ENCONTRADO" | "TAREFA_NAO_ENCONTRADA";
  mensagem?: string;
  produto: { produto_id: string; sku: string; descricao: string; usa_picking: boolean; varios_pickings: boolean; fator_caixa: number };
  tarefa: { tarefa_id: string; requerida: number; executada: number; restante: number } | null;
  quantidade: number;
  pickings: PickingDestino[];
  pulmao: { saldo: number; enderecos: number; habilitado: boolean; enderecos_disponiveis: number };
  recomendacao: {
    destino: DestinoRecomendado;
    endereco_id: string | null;
    endereco: string | null;
    quantidade_picking: number;
    quantidade_pulmao: number;
    quantidade_sem_destino: number;
    motivo: string;
  };
};
