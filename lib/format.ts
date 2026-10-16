export const nf = new Intl.NumberFormat("en-US");

export function fmtDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00Z" : "")) : d;
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function cleanDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** DataForSEO's keyword difficulty runs 0 (easy) to 100 (hard). */
export function difficultyLabel(d: number | null | undefined) {
  if (d == null) return "";
  return d < 30 ? "easy" : d < 60 ? "moderate" : "hard";
}
