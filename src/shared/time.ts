// Warehouse-local calendar helpers. Event timestamps are UTC ISO strings; "today", report windows
// and receipt dates use the warehouse's IANA timezone (Asia/Kuala_Lumpur for the demo warehouse).

const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** YYYY-MM-DD in the given timezone. */
export function localDate(at: Date | string, timeZone: string): string {
  return dateFormatter(timeZone).format(typeof at === "string" ? new Date(at) : at);
}

/** HH:MM in the given timezone (24h). */
export function localTime(at: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    typeof at === "string" ? new Date(at) : at,
  );
}
