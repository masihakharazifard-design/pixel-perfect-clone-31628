// Rekenen met datums en werkdagen (zaterdag/zondag worden nooit automatisch ingepland).
// Datums zijn tekst in de vorm JJJJ-MM-DD.

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const shiftDate = (ds: string, days: number): string => {
  const d = new Date(ds + "T12:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
};
/** 0 = maandag … 6 = zondag */
export function weekdayIdx(ds: string): number {
  return (new Date(ds + "T12:00").getDay() + 6) % 7;
}
export const isWeekendStr = (ds: string): boolean => weekdayIdx(ds) >= 5;

export function addWorkdays(ds: string, n: number): string {
  let d = ds;
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    d = shiftDate(d, step);
    if (!isWeekendStr(d)) left--;
  }
  return d;
}

export function workdayDiff(from: string, to: string): number {
  if (from === to) return 0;
  const step = to > from ? 1 : -1;
  let d = from, n = 0;
  while (d !== to) {
    d = shiftDate(d, step);
    if (!isWeekendStr(d)) n += step;
  }
  return n;
}

/**
 * Planningregels van één werk verschuiven naar een nieuwe startdag. Doelt de gebruiker op een werkdag,
 * dan schuiven werkdagen over werkdagen (weekend blijft leeg); expliciet op een weekenddag = kalenderdagen.
 */
export function shiftPlanRows<T extends { date: string; isFirstOfDay?: boolean; volgorde?: number }>(rows: T[], newStart: string): T[] {
  if (!rows.length) return [];
  const oldStart = rows.map((r) => r.date).sort()[0];
  if (oldStart === newStart) return [];
  const cal = Math.round((new Date(newStart + "T12:00").getTime() - new Date(oldStart + "T12:00").getTime()) / 86400000);
  const useWork = !isWeekendStr(newStart) && !isWeekendStr(oldStart);
  const wd = useWork ? workdayDiff(oldStart, newStart) : 0;
  return rows.map((r) => ({
    ...r,
    date: useWork && !isWeekendStr(r.date) ? addWorkdays(r.date, wd) : shiftDate(r.date, cal),
    isFirstOfDay: false,
    volgorde: undefined,
  }));
}
