// Helpers de validação de UUID e sanitização de IDs vindos de localStorage / queryparams.
// Evita o cenário em que `localStorage.setItem("...", null)` grava a string "null"
// e essa string é depois usada em `.eq("...", "null")`, gerando 22P02 no Postgres.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * Retorna o valor se for UUID válido, ou null caso contrário.
 * Trata: null, undefined, "", "null", "undefined", " null ", etc.
 */
export function sanitizeId(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Indica se o valor representa um filtro vazio/inválido em dropdowns:
 * null, undefined, "", "all", "null", "undefined".
 * Use para decidir se DEVE aplicar `.eq(coluna, valor)` numa query.
 */
export function isEmptyFilter(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const t = v.trim().toLowerCase();
  return t === "" || t === "all" || t === "null" || t === "undefined";
}
