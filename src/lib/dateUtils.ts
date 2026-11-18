/**
 * Legacy writing helper.
 *
 * Returns the current date/time as an ISO-like string (no offset) in Brasília
 * time. Because Postgres receives it without offset, the value is stored
 * "Brasília masked as UTC" in `timestamptz` columns.
 *
 * THIS IS LEGACY (Fase 2 debt). Display of database values must NOT depend on
 * this masking — use `src/utils/dateTime.ts` for all UI formatting, which
 * treats stored values as real UTC and converts to America/Fortaleza.
 *
 * Fase 2 will:
 *  - Replace `nowBrasilia()` with `new Date().toISOString()` everywhere
 *    (true UTC writes).
 *  - Migrate historical data written by this helper (subtract 3h on the
 *    affected columns).
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
 * Data (yyyy-MM-dd) no fuso local do aparelho. Use no lugar de
 * `new Date().toISOString().slice(0, 10)`, que devolve a data em UTC
 * (depois das 21h em Brasília/Fortaleza já vira o dia seguinte).
 */
export function dataLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
