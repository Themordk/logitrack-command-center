import type { CampoEtiqueta, TipoEtiquetaConfig } from "@/hooks/useEtiquetaTemplate";

export type GrupoVariavel =
  | "Identificação" | "Classificação" | "Localização" | "Dimensões e capacidade" | "Sistema";

export interface VariavelEtiqueta {
  chave: string;
  label: string;
  grupo: GrupoVariavel;
  exemplo: string;
  descricao?: string;
}

export const GRUPOS_ORDEM: GrupoVariavel[] = [
  "Identificação", "Classificação", "Localização", "Dimensões e capacidade", "Sistema",
];

const v = (chave: string, label: string, grupo: GrupoVariavel, exemplo: string, descricao?: string): VariavelEtiqueta =>
  descricao ? { chave, label, grupo, exemplo, descricao } : { chave, label, grupo, exemplo };

export const VARIAVEIS_ENDERECO: VariavelEtiqueta[] = [
  v("codigo_endereco", "Código do Endereço", "Identificação", "100502", "Código numérico do endereço"),
  v("descricao", "Descrição (R-P-N-A)", "Identificação", "R01-P02-N01-A101", "Descrição cadastrada"),
  v("tipo_endereco", "Tipo de Endereço", "Classificação", "PICKING", "PICKING ou PULMAO"),
  v("curva_acesso", "Curva de Acesso", "Classificação", "A", "Curva ABC(D)"),
  v("setor", "Setor", "Classificação", "SETOR PADRÃO", "Nome do setor"),
  v("direcao_seta", "Seta Direcional", "Sistema", "DIREITA", "CIMA, BAIXO, ESQUERDA, DIREITA, NENHUMA"),
  v("seta_simbolo", "Símbolo da Seta", "Sistema", "→", "Caractere da seta escolhida"),
  v("endereco_id", "ID do Endereço (UUID)", "Identificação", "7c38d99d-6fc3-4e49-834d-f9f996524826", "Ideal para QR Code"),
  v("endereco_formatado", "Endereço Formatado", "Identificação", "R01-P02-N01-A101", "R-P-N-A com zero à esquerda"),
  v("rua", "Rua", "Identificação", "1"),
  v("predio", "Prédio", "Identificação", "2"),
  v("nivel", "Nível", "Identificação", "1"),
  v("apto", "Apartamento", "Identificação", "101"),
  v("rua_2d", "Rua (2 dígitos)", "Identificação", "01", "Zero à esquerda"),
  v("predio_2d", "Prédio (2 dígitos)", "Identificação", "02", "Zero à esquerda"),
  v("nivel_2d", "Nível (2 dígitos)", "Identificação", "01", "Zero à esquerda"),
  v("apto_2d", "Apto (2 dígitos)", "Identificação", "101", "Zero à esquerda, não trunca"),
  v("lado", "Lado", "Identificação", "PAR", "PAR ou IMPAR"),
  v("situacao", "Situação", "Classificação", "LIVRE", "LIVRE, OCUPADO, BLOQUEADO, BLOQUEADO_INVENTARIO"),
  v("tipo_estrutura", "Tipo de Estrutura", "Classificação", "PORTA_PALLET"),
  v("setor_tipo", "Tipo do Setor", "Classificação", "PICKING"),
  v("tipo_estoque", "Tipo de Estoque", "Classificação", "VENDAS"),
  v("tipo_estoque_sigla", "Sigla Tipo de Estoque", "Classificação", "VEND"),
  v("armazem", "Armazém", "Localização", "ARMAZEM PRINCIPAL"),
  v("armazem_codigo_erp", "Código ERP do Armazém", "Localização", "ARM-001"),
  v("armazem_cidade", "Cidade do Armazém", "Localização", "SOBRAL"),
  v("armazem_uf", "UF do Armazém", "Localização", "CE"),
  v("zonas_atividade", "Zonas de Atividade", "Localização", "ZONA A, ZONA B", "Separadas por vírgula"),
  v("altura", "Altura", "Dimensões e capacidade", "1,20"),
  v("largura", "Largura", "Dimensões e capacidade", "1,00"),
  v("comprimento", "Comprimento", "Dimensões e capacidade", "1,20"),
  v("m3", "Volume (m³)", "Dimensões e capacidade", "1,440"),
  v("peso_total", "Peso Máximo", "Dimensões e capacidade", "1000,00"),
  v("total_pallet", "Total de Pallets", "Dimensões e capacidade", "1"),
  v("capacidade_unidades", "Capacidade (unidades)", "Dimensões e capacidade", "500"),
  v("data_impressao", "Data/Hora da Impressão", "Sistema", "26/09/2026 10:47"),
  v("usuario_impressao", "Usuário que Imprimiu", "Sistema", "Leonardo Sena"),
];

/** Catálogo por tipo. Por ora só ENDERECO usa o catálogo; os demais retornam null. */
export function variaveisPorTipo(tipo: TipoEtiquetaConfig | string): VariavelEtiqueta[] | null {
  return tipo === "ENDERECO" ? VARIAVEIS_ENDERECO : null;
}

/** Dados de exemplo { chave: exemplo } a partir do catálogo. */
export function dadosExemploDoCatalogo(tipo: string): Record<string, string> {
  const cat = variaveisPorTipo(tipo);
  const out: Record<string, string> = {};
  for (const x of cat ?? []) out[x.chave] = x.exemplo;
  return out;
}

/** Mescla campos salvos com o catálogo (preserva salvos, acrescenta faltantes inativos). */
export function mesclarCamposComCatalogo(tipo: string, salvos: CampoEtiqueta[] | null | undefined): CampoEtiqueta[] {
  const base = Array.isArray(salvos) ? salvos : [];
  const cat = variaveisPorTipo(tipo);
  if (!cat) return base;
  const existentes = new Set(base.map((c) => c.chave));
  let ordem = base.reduce((m, c) => Math.max(m, Number(c.ordem) || 0), 0);
  const extras: CampoEtiqueta[] = [];
  for (const x of cat) {
    if (existentes.has(x.chave)) continue;
    ordem += 1;
    extras.push({ chave: x.chave, label: x.label, ativo: false, ordem });
  }
  return [...base, ...extras];
}
