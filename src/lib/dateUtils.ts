/**
 * Returns the current date/time as an ISO string in Brazil timezone (America/Sao_Paulo).
 * This ensures timestamps sent to the database reflect the local Brazilian time.
 *
 * NOTE (legado): a string retornada NÃO contém offset, então o Postgres a interpreta
 * como UTC ao gravar em colunas `timestamptz`. Isso significa que os valores ficam
 * armazenados como "horário Brasília mascarado de UTC". Para exibir esses valores
 * corretamente na UI, use os helpers `formatBrasilia*` abaixo (que removem o offset
 * antes de formatar, evitando uma segunda conversão de timezone pelo navegador).
 */
export function nowBrasilia(): string {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).replace(" ", "T");
}

/**
 * Strips timezone offset (Z or ±HH:MM / ±HHMM) from an ISO-like timestamp string,
 * so the resulting Date is parsed as the browser's local time — which, by convention
 * in this project, equals the original Brasília time stored in the database.
 */
function stripOffset(s: string): string {
  return s.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, "");
}

function toNaiveDate(v: string | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const s = typeof v === "string" ? v : v.toISOString();
  const naive = stripOffset(s);
  const d = new Date(naive);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Formats a database timestamp as Brasília date+time (dd/mm/yyyy HH:mm:ss).
 * Treats the value as already-in-Brasília (no timezone reconversion).
 */
export function formatBrasiliaDateTime(v: string | Date | null | undefined): string {
  const d = toNaiveDate(v);
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Formats a database timestamp as Brasília date only (dd/mm/yyyy).
 */
export function formatBrasiliaDate(v: string | Date | null | undefined): string {
  const d = toNaiveDate(v);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formats a database timestamp as Brasília time only (HH:mm:ss).
 */
export function formatBrasiliaTime(v: string | Date | null | undefined): string {
  const d = toNaiveDate(v);
  if (!d) return "—";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Short variant: dd/mm HH:mm (used in compact tables).
 */
export function formatBrasiliaDateTimeShort(v: string | Date | null | undefined): string {
  const d = toNaiveDate(v);
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "Now" formatter for report headers (generatedAt). Uses the real browser clock
 * converted to America/Sao_Paulo — different from `formatBrasilia*`, which is for
 * values pulled from the database.
 */
export function nowBrasiliaDisplay(): string {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
