import type { Catalogo, Operador, Regra } from "../../retornos.types";

export const SEM_VALOR: Operador[] = ["existe", "nao_existe"];

export function descreverRegra(r: Regra, catalogo?: Catalogo): string {
  const op = catalogo?.operadores.find((o) => o.codigo === r.operador)?.nome ?? r.operador;
  if (SEM_VALOR.includes(r.operador)) return `${r.campo} ${op}`;
  const v = Array.isArray(r.valor) ? r.valor.join(", ") : String(r.valor ?? "");
  return `${r.campo} ${op} ${v}`;
}

