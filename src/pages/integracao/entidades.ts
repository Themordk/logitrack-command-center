export type Modulo = "cadastros" | "movimentos" | "retorno";

export interface EntidadeDef {
  id: string;
  label: string;
  fn: string | null;
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
      { id: "produtos", label: "Produtos", fn: "sync-produtos" },
      { id: "parceiros", label: "Parceiros", fn: "sync-parceiros" },
      { id: "grupo_produto", label: "Grupo de Produto", fn: "sync-grupo-produto" },
      { id: "subgrupo_produto", label: "Subgrupo de Produto", fn: null },
      { id: "tipo_entrada", label: "Tipo de Entrada", fn: null },
      { id: "tipo_saida", label: "Tipo de Saída", fn: null },
    ],
  },
  {
    key: "movimentos",
    label: "Movimentos",
    entidades: [
      { id: "movimentos_entrada", label: "Movimentos de Entrada", fn: "sync-recebimentos" },
      { id: "notas_entrada", label: "Notas de Entrada", fn: "sync-notas-entrada" },
      { id: "movimentos_saida", label: "Movimentos de Saída", fn: null },
    ],
  },
  {
    key: "retorno",
    label: "Retorno",
    entidades: [
      { id: "retorno_entrada", label: "Retorno de Entrada", fn: null },
      { id: "retorno_saida", label: "Retorno de Saída", fn: null },
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

// Helper Supabase middleware schema
import { supabase } from "@/integrations/supabase/client";
export const mw = (supabase as any).schema("middleware");
