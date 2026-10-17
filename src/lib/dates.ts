// Dates are plain 'YYYY-MM-DD' strings everywhere; math is done in UTC to avoid timezone drift.

export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function parse(d: string): Date {
  return new Date(d + "T00:00:00Z");
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Same day-of-month `months` later, clamped to month end (31 Jan + 1 = 28/29 Feb). */
export function addMonths(d: string, months: number): string {
  const x = parse(d);
  const day = x.getUTCDate();
  const target = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fmt(target);
}

export function addDays(d: string, days: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + days);
  return fmt(x);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  const [y, m, day] = d.slice(0, 10).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(day)} ${months[Number(m) - 1]} ${y}`;
}

export function monthKey(d: string): string {
  return d.slice(0, 7);
}
