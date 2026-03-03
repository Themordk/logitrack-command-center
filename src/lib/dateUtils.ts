/**
 * Returns the current date/time as an ISO string in Brazil timezone (America/Sao_Paulo).
 * This ensures timestamps sent to the database reflect the local Brazilian time.
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
