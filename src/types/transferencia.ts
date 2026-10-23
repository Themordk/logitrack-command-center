export interface PickingTransferencia {
  endereco_id: string;
  endereco: string;
  situacao: string;
  utilizavel: boolean;
  tipo_picking: string | null;
  saldo: number;
  est_minimo: number;
  est_maximo: number | null;
  cabe: number | null;
  e_origem: boolean;
}

export interface PickingsTransferenciaResposta {
  sucesso: boolean;
  mensagem?: string;
  usa_picking: boolean;
  varios_pickings: boolean;
  pickings: PickingTransferencia[];
}