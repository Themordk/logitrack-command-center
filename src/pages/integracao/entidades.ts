export type Modulo = "cadastros" | "movimentos" | "retorno";

export interface EntidadeDef {
  id: string;
  label: string;
  /** Entidade é suportada pela edge function `sync-entidade`. */
  sincronizavel: boolean;
}

export interface ModuloDef {
  key: Modulo;
  label: string;
  entidades: EntidadeDef[];
}

export const MODULOS: ModuloDef[] = [
  {
    key: "cadastros",
    label: "Cadastros",
    entidades: [
      { id: "produtos", label: "Produtos", sincronizavel: true },
      { id: "parceiros", label: "Parceiros", sincronizavel: true },
      { id: "grupo_produto", label: "Grupo de Produto", sincronizavel: true },
      { id: "subgrupo_produto", label: "Subgrupo de Produto", sincronizavel: false },
      { id: "tipo_entrada", label: "Tipo de Entrada", sincronizavel: false },
      { id: "tipo_saida", label: "Tipo de Saída", sincronizavel: false },
    ],
  },
  {
    key: "movimentos",
    label: "Movimentos",
    entidades: [
      { id: "notas_entrada", label: "Notas de Entrada", sincronizavel: true },
      { id: "pedidos_saida", label: "Pedidos de Venda", sincronizavel: true },
      { id: "nf_devolucoes", label: "NFs de Devolução", sincronizavel: true },
      { id: "movimentos_entrada", label: "Movimentos de Entrada", sincronizavel: false },
      { id: "movimentos_saida", label: "Movimentos de Saída", sincronizavel: false },
    ],
  },
  {
    key: "retorno",
    label: "Retorno",
    entidades: [
      { id: "retorno_entrada", label: "Retorno de Entrada", sincronizavel: false },
      { id: "retorno_saida", label: "Retorno de Saída", sincronizavel: false },
    ],
  },
];

export const INTERVALOS: { value: number; label: string }[] = [
  { value: 1, label: "1 min" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "60 min" },
  { value: 360, label: "6h" },
  { value: 720, label: "12h" },
  { value: 1440, label: "24h" },
];

export function getEntidade(modulo: string, id: string): EntidadeDef | undefined {
  return MODULOS.find((m) => m.key === modulo)?.entidades.find((e) => e.id === id);
}

export function entidadeLabel(modulo: string, id: string): string {
  return getEntidade(modulo, id)?.label || id;
}
