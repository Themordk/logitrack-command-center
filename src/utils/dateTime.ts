/**
 * Centralized date/time display utilities for CORE LogiTrack.
 *
 * All exhibition of date/time fields in the UI MUST go through these helpers.
 * Never use `toLocaleString`, `date-fns format` without timezone, or render a
 * raw timestamp field directly in JSX.
 *
 * Timezone: America/Fortaleza (UTC-3, no daylight saving time).
 *
 * NOTE (Fase 1 / dívida técnica): the database currently mixes "real UTC"
 * (DB defaults `now()`) with "Brasília masked as UTC" (values written by the
 * frontend via `nowBrasilia()`). Until Fase 2 corrects writes + migrates
 * historical data, legacy values written by the frontend will display 3h
 * behind. This is expected and tracked.
 */

const TIMEZONE = "America/Fortaleza";
const LOCALE = "pt-BR";
const EMPTY = "—";

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

const fmtDateTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const fmtTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtDateTimeFull = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const fmtDateTimeShort = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** dd/MM/yyyy HH:mm — ex: 25/05/2025 14:30 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  return fmtDateTime.format(d).replace(",", "");
}

/** dd/MM/yyyy — ex: 25/05/2025 */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  return fmtDate.format(d);
}

/** HH:mm — ex: 14:30 */
export function formatTime(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  return fmtTime.format(d);
}

/** dd/MM/yyyy HH:mm:ss — ex: 25/05/2025 14:30:45 */
export function formatDateTimeFull(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  return fmtDateTimeFull.format(d).replace(",", "");
}

/** dd/MM HH:mm — variante compacta para tabelas densas */
export function formatDateTimeShort(value: string | Date | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return EMPTY;
  return fmtDateTimeShort.format(d).replace(",", "");
}

/** "Agora" formatado para cabeçalhos de relatório (gera no momento da chamada). */
export function nowDisplay(): string {
  return fmtDateTimeFull.format(new Date()).replace(",", "");
}
