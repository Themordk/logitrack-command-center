import type { CampoEtiqueta, TipoEtiquetaConfig } from "@/hooks/useEtiquetaTemplate";

export type GrupoVariavel =
  | "Identificação" | "Classificação" | "Localização" | "Dimensões e capacidade"
  | "Pedido e cliente" | "Remetente" | "Nota fiscal" | "Transporte" | "Conteúdo" | "Origem" | "Sistema";

export interface VariavelEtiqueta {
  chave: string;
  label: string;
  grupo: GrupoVariavel;
  exemplo: string;
  descricao?: string;
}

export const GRUPOS_ORDEM: GrupoVariavel[] = [
  "Identificação", "Classificação", "Localização", "Dimensões e capacidade",
  "Pedido e cliente", "Remetente", "Nota fiscal", "Transporte", "Conteúdo", "Origem", "Sistema",
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

/**
 * Etiqueta de volume de expedição. As chaves são exatamente as que o servidor
 * preenche no job (_fn_etiqueta_volume_dados): o que está aqui sai impresso.
 * Campos de NF ficam vazios até a NF do pedido ser autorizada.
 */
export const VARIAVEIS_VOLUME: VariavelEtiqueta[] = [
  v("codigo_volume", "Código do Volume", "Identificação", "VOL-000123", "Ideal para código de barras"),
  v("numero_volume", "Nº do Volume", "Identificação", "01", "Sequência dentro do pedido"),
  v("total_volumes", "Total de Volumes do Pedido", "Identificação", "03"),
  v("identificacao_volume", "Volume / Total", "Identificação", "01/03"),
  v("numero_onda", "Nº da Onda", "Identificação", "1612"),
  v("peso", "Peso do Volume (kg)", "Identificação", "12.500"),
  v("pedido", "Nº do Pedido", "Pedido e cliente", "2000000069"),
  v("parceiro_nome", "Cliente (Razão Social)", "Pedido e cliente", "DISTRIBUIDORA CENTRAL LTDA"),
  v("cidade_uf", "Cidade / UF do Cliente", "Pedido e cliente", "SOBRAL / CE"),
  v("destino_carga", "Destino da Onda", "Pedido e cliente", "ROTA NORTE", "Texto da onda; para o endereço do cliente use Cidade / UF"),
  v("observacao", "Observação do Pedido", "Pedido e cliente", "Entregar pela manhã"),
  v("remetente_nome", "Remetente (Razão Social)", "Remetente", "FJG DISTRIBUIDORA", "Empresa que fatura o pedido"),
  v("remetente_cnpj", "CNPJ do Remetente", "Remetente", "12.345.678/0001-90", "Vazio se o CNPJ da empresa não tiver 14 dígitos"),
  v("remetente", "Remetente (Razão Social - CNPJ)", "Remetente", "FJG DISTRIBUIDORA - 12.345.678/0001-90", "Nome e CNPJ numa linha só"),
  v("nota_fiscal", "NF (número-série)", "Nota fiscal", "9901-1", "Vazio até a NF ser autorizada"),
  v("nf_numero", "Nº da NF", "Nota fiscal", "9901"),
  v("nf_serie", "Série da NF", "Nota fiscal", "1"),
  v("nf_chave", "Chave de Acesso da NF-e", "Nota fiscal", "23261100000000000000550010000099011000000001", "44 dígitos; ideal para código de barras"),
  v("nf_data_emissao", "Data de Emissão da NF", "Nota fiscal", "15/11/2026"),
  v("nf_qtd_volumes", "Qtd. de Volumes na NF", "Nota fiscal", "3"),
  v("nf_especie_volumes", "Espécie dos Volumes (NF)", "Nota fiscal", "CAIXA"),
  v("nf_peso_bruto", "Peso Bruto da NF (kg)", "Nota fiscal", "37.500"),
  v("transportadora", "Transportadora", "Transporte", "TRANSPORTES RAPIDO LTDA", "Da carga; se não houver, a do pedido"),
  v("numero_carga", "Nº da Carga", "Transporte", "26", "Preenchido quando o volume está numa carga"),
  v("data_hora", "Data/Hora de Criação do Volume", "Sistema", "15/11/2026 10:47"),
  v("usuario", "Usuário que Gerou o Volume", "Sistema", "LEONARDO SENA"),
];

/**
 * Etiqueta de HU (Plano HU — H4). As chaves são exatamente as que o servidor preenche no job
 * (_fn_etiqueta_hu_dados, aplicado pelo gatilho de fila_impressao): o que está aqui sai impresso.
 * NFs e fornecedores são todos os do recebimento da HU; conteúdo vem dos itens conferidos na HU.
 */
export const VARIAVEIS_HU: VariavelEtiqueta[] = [
  v("codigo_hu", "Código da HU", "Identificação", "HU-000000123", "Ideal para código de barras ou QR Code"),
  v("tipo_hu", "Tipo da HU", "Identificação", "PALLET"),
  v("tamanho", "Tamanho", "Identificação", "M"),
  v("status", "Status da HU", "Identificação", "FECHADA"),
  v("sku", "SKU", "Conteúdo", "SKU-001234", "SKU do produto; VÁRIOS quando a HU tem mais de um"),
  v("descricao_produto", "Descrição do Produto", "Conteúdo", "PARAFUSO SEXTAVADO 10X25MM", "VÁRIOS PRODUTOS (n) quando tem mais de um"),
  v("total_itens", "Qtd. de SKUs", "Conteúdo", "1"),
  v("total_quantidade", "Quantidade Total", "Conteúdo", "150"),
  v("lote_principal", "Lote Principal", "Conteúdo", "L2026-A", "Lote com mais unidades na HU"),
  v("lote", "Lote", "Conteúdo", "L2026-A", "Mesmo que Lote Principal"),
  v("validade_proxima", "Validade mais Próxima", "Conteúdo", "15/12/2026"),
  v("validade", "Validade", "Conteúdo", "15/12/2026", "Mesmo que Validade mais Próxima"),
  v("numero_movimento", "Nº do Recebimento", "Origem", "131"),
  v("numero_nota", "NF(s) de Entrada", "Origem", "250, 251", "Todas as NFs do recebimento"),
  v("qtd_notas", "Qtd. de NFs", "Origem", "2"),
  v("parceiro_nome", "Fornecedor(es)", "Origem", "FORNECEDOR EXEMPLO LTDA", "Todos do recebimento, separados por /"),
  v("data_entrada", "Data do Recebimento", "Origem", "21/07/2026"),
  v("data_entrada_hora", "Data/Hora do Recebimento", "Origem", "21/07/2026 08:15"),
  v("empresa", "Empresa", "Origem", "FJG DISTRIBUIDORA"),
  v("armazem", "Armazém", "Localização", "ARMAZEM PRINCIPAL"),
  v("endereco", "Endereço", "Localização", "R05-P01-N01-A01", "Vazio até a HU ser armazenada"),
  v("peso_bruto", "Peso Bruto (kg)", "Dimensões e capacidade", "45.5"),
  v("m3", "Cubagem (m³)", "Dimensões e capacidade", "1.2"),
  v("altura", "Altura", "Dimensões e capacidade", "1.6"),
  v("criado_em", "Data/Hora de Criação da HU", "Sistema", "21/07/2026 08:10"),
  v("usuario", "Usuário que Criou a HU", "Sistema", "LEONARDO SENA"),
];

/** Catálogo por tipo. ENDERECO, VOLUME e HU usam o catálogo; os demais retornam null. */
export function variaveisPorTipo(tipo: TipoEtiquetaConfig | string): VariavelEtiqueta[] | null {
  if (tipo === "ENDERECO") return VARIAVEIS_ENDERECO;
  if (tipo === "VOLUME") return VARIAVEIS_VOLUME;
  if (tipo === "HU") return VARIAVEIS_HU;
  return null;
}

/** Variáveis {{chave}} usadas no código do template que não existem no catálogo do tipo (sem repetição). */
export function variaveisDesconhecidas(codigo: string | null | undefined, tipo: string): string[] {
  const cat = variaveisPorTipo(tipo);
  if (!cat || !codigo) return [];
  const conhecidas = new Set(cat.map((x) => x.chave));
  const out = new Set<string>();
  for (const m of codigo.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!conhecidas.has(m[1])) out.add(m[1]);
  }
  return [...out];
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
