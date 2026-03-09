export interface ReportExporter {
  exportPDF(data: any[]): void;
  exportExcel(data: any[]): void;
}

export interface ReportFilter {
  empresa_id?: string;
  armazem_id?: string;
  setor_id?: string;
  tipo_estoque_id?: string;
  tipo_endereco?: string;
  sku?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  parceiro_id?: string;
  marca?: string;
  zona_atividade_id?: string;
  data_inicio?: string;
  data_fim?: string;
  hu_id?: string;
  tipo_movimento?: number;
  usuario_id?: string;
}
