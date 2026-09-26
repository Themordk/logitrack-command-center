import { z } from "zod";

export type ModoPadrao = "SEMPRE" | "SE_VAZIO" | "SOMENTE_CRIACAO";
export type ValorPadrao = boolean | number | string;

export interface RegraPadraoProduto {
  campo: string;
  valor: ValorPadrao;
  modo: ModoPadrao;
  ativo: boolean;
  observacao: string | null;
  updated_at: string;
  atualizado_por: string | null;
}

export type RpcResultado<T = Record<string, unknown>> =
  | ({ sucesso: true; codigo?: string; mensagem?: string } & T)
  | { sucesso: false; codigo?: string; mensagem?: string };

export interface SimulacaoCampo {
  campo: string;
  modo: ModoPadrao;
  valor: ValorPadrao;
  produtos_afetados: number;
  ignorados_com_estoque?: number;
  observacao?: string;
}

export interface ResultadoAplicar {
  simulacao: boolean;
  total_produtos: number;
  campos: SimulacaoCampo[];
}

export type SecaoPadrao = "Controle de Estoque" | "Controle de Vencimento" | "Empilhamento" | "Expedição";
export type TipoCampoPadrao = "enum" | "boolean" | "decimal" | "inteiro";

export interface CampoPadraoDef {
  chave: string;
  rotulo: string;
  secao: SecaoPadrao;
  tipo: TipoCampoPadrao;
  opcoes?: string[];
  schema: z.ZodTypeAny;
  impactoOperacional?: boolean;
}

const decimalMin0 = z.number({ invalid_type_error: "Informe um número" }).min(0, "Deve ser maior ou igual a zero");
const intMin0 = z.number({ invalid_type_error: "Informe um número" }).int("Deve ser inteiro").min(0, "Deve ser maior ou igual a zero");
const intPos = z.number({ invalid_type_error: "Informe um número" }).int("Deve ser inteiro").gt(0, "Deve ser maior que zero");

export const SECOES_PADRAO: SecaoPadrao[] = ["Controle de Estoque", "Controle de Vencimento", "Empilhamento", "Expedição"];

const TIPOS_CONTROLE = ["UNIDADE", "LOTE", "VALIDADE", "SERIE", "METROS"];
const TIPOS_SEPARACAO = ["FRACIONADO", "EMBALAGEM_TOTAL", "CAIXARIA"];

export const CAMPOS_PADRAO_PRODUTO: CampoPadraoDef[] = [
  { chave: "tipo_controle", rotulo: "Tipo de controle", secao: "Controle de Estoque", tipo: "enum", opcoes: TIPOS_CONTROLE, schema: z.enum(TIPOS_CONTROLE as [string, ...string[]]), impactoOperacional: true },
  { chave: "peso_variavel", rotulo: "Peso variável", secao: "Controle de Estoque", tipo: "boolean", schema: z.boolean() },
  { chave: "tolerancia", rotulo: "Tolerância", secao: "Controle de Estoque", tipo: "decimal", schema: decimalMin0 },
  { chave: "dias_shelf", rotulo: "Dias shelf", secao: "Controle de Vencimento", tipo: "inteiro", schema: intMin0 },
  { chave: "shelf_entrada", rotulo: "Shelf entrada", secao: "Controle de Vencimento", tipo: "decimal", schema: decimalMin0 },
  { chave: "shelf_devolucao", rotulo: "Shelf devolução", secao: "Controle de Vencimento", tipo: "decimal", schema: decimalMin0 },
  { chave: "lastro", rotulo: "Lastro", secao: "Empilhamento", tipo: "inteiro", schema: intPos },
  { chave: "camada", rotulo: "Camada", secao: "Empilhamento", tipo: "inteiro", schema: intPos },
  { chave: "fator_caixa", rotulo: "Fator caixa", secao: "Empilhamento", tipo: "inteiro", schema: intPos },
  { chave: "usa_picking", rotulo: "Usa picking", secao: "Expedição", tipo: "boolean", schema: z.boolean(), impactoOperacional: true },
  { chave: "tipo_separacao", rotulo: "Tipo de separação", secao: "Expedição", tipo: "enum", opcoes: TIPOS_SEPARACAO, schema: z.enum(TIPOS_SEPARACAO as [string, ...string[]]), impactoOperacional: true },
  { chave: "varios_pickings", rotulo: "Vários pickings", secao: "Expedição", tipo: "boolean", schema: z.boolean(), impactoOperacional: true },
];

export const MODOS_PADRAO: { value: ModoPadrao; label: string; ajuda: string }[] = [
  { value: "SEMPRE", label: "Sempre", ajuda: "O padrão sempre vence, inclusive sobre o ERP. Edições manuais são sobrescritas na próxima sincronização." },
  { value: "SE_VAZIO", label: "Se vazio", ajuda: "Usa o valor do ERP ou do cadastro. O padrão só entra quando o campo não foi informado." },
  { value: "SOMENTE_CRIACAO", label: "Só na criação", ajuda: "Aplicado só quando a integração cria o produto. Depois, edições manuais ficam preservadas." },
];

export const labelModo = (m: ModoPadrao) => MODOS_PADRAO.find((x) => x.value === m)?.label ?? m;
export const campoDef = (chave: string) => CAMPOS_PADRAO_PRODUTO.find((c) => c.chave === chave);

export function formatarValorPadrao(valor: ValorPadrao | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number") return valor.toLocaleString("pt-BR");
  return String(valor);
}
