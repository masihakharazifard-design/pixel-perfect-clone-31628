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

/**
 * Als shiftPlanRows, maar per medewerker worden dagen waarop hij/zij vrij is (of een feestdag) overgesprongen:
 * de planning "springt" naar de eerstvolgende beschikbare werkdag, zodat het aantal dagen gelijk blijft.
 */
export function verschuifMetSprong<T extends { date: string; employeeId: string; isFirstOfDay?: boolean; volgorde?: number }>(
  rows: T[],
  newStart: string,
  geblokkeerd: (row: T, date: string) => boolean,
): T[] {
  const moved = shiftPlanRows(rows, newStart);
  if (!moved.length) return [];
  const perMw = new Map<string, number[]>();
  rows.forEach((r, i) => perMw.set(r.employeeId, [...(perMw.get(r.employeeId) || []), i]));
  perMw.forEach((idxs) => {
    const oudeDagen = [...new Set(idxs.map((i) => rows[i].date))].sort();
    const naar = new Map<string, string>();
    let vorige = "";
    oudeDagen.forEach((oud) => {
      const i = idxs.find((k) => rows[k].date === oud)!;
      const doel = moved[i].date;
      const weekendBewust = isWeekendStr(doel);
      let d = vorige && doel <= vorige ? shiftDate(vorige, 1) : doel;
      for (let n = 0; n < 60 && ((!weekendBewust && isWeekendStr(d)) || geblokkeerd(moved[i], d)); n++) d = shiftDate(d, 1);
      naar.set(oud, d);
      vorige = d;
    });
    idxs.forEach((i) => { moved[i] = { ...moved[i], date: naar.get(rows[i].date)! }; });
  });
  return moved;
}

export interface PlanRegelBasis {
  id: string; employeeId: string; date: string; startTime: string; endTime: string;
  status: string; projectId?: string; isFirstOfDay?: boolean; volgorde?: number;
}
const overlapt = (a1: string, a2: string, b1: string, b2: string) => a1 < b2 && b1 < a2;

/**
 * Meeschuiven: komt verplaatst werk terecht op dagen waar dezelfde medewerker al ander werk heeft,
 * dan schuiven die werken (en de werken daarna, als die daardoor ook botsen) op naar de eerstvolgende
 * vrije werkdag, in dezelfde volgorde. Vrije dagen/feestdagen (geblokkeerd) en het weekend worden overgesprongen.
 * Geeft alleen de regels terug die een andere datum krijgen.
 */
export function schuifVolgendeOp<T extends PlanRegelBasis>(alle: T[], verplaatst: T[], geblokkeerd: (r: T, datum: string) => boolean): T[] {
  const ids = new Set(verplaatst.map((r) => r.id));
  const uit: T[] = [];
  const perMw = new Map<string, T[]>();
  verplaatst.forEach((r) => { if (r.status === "Ingepland") perMw.set(r.employeeId, [...(perMw.get(r.employeeId) || []), r]); });
  perMw.forEach((mijn, emp) => {
    const bezet = new Map<string, [string, string][]>();
    const zet = (d: string, s: string, e: string) => bezet.set(d, [...(bezet.get(d) || []), [s, e]]);
    mijn.forEach((r) => zet(r.date, r.startTime, r.endTime));
    const vanaf = mijn.map((r) => r.date).sort()[0];
    const eigenWerken = new Set(mijn.map((r) => r.projectId));
    const groepen = new Map<string, T[]>();
    alle.forEach((a) => {
      if (a.employeeId !== emp || ids.has(a.id) || a.status !== "Ingepland" || !a.projectId || a.date < vanaf || eigenWerken.has(a.projectId)) return;
      groepen.set(a.projectId, [...(groepen.get(a.projectId) || []), a]);
    });
    const volgorde = [...groepen.values()].map((l) => l.sort((x, y) => x.date.localeCompare(y.date) || x.startTime.localeCompare(y.startTime)))
      .sort((x, y) => x[0].date.localeCompare(y[0].date) || x[0].startTime.localeCompare(y[0].startTime));
    volgorde.forEach((regels) => {
      const dagen = [...new Set(regels.map((r) => r.date))];
      const botst = (d: string, rs: T[]) => rs.some((r) => (bezet.get(d) || []).some(([s, e]) => overlapt(s, e, r.startTime, r.endTime)));
      let geraakt = false, vorige = "";
      const naar = new Map<string, string>();
      dagen.forEach((d) => {
        const rs = regels.filter((r) => r.date === d);
        if (!geraakt && !botst(d, rs)) { naar.set(d, d); vorige = d; return; }
        geraakt = true;
        let n = d > vorige ? d : shiftDate(vorige, 1);
        for (let i = 0; i < 120 && ((!isWeekendStr(d) && isWeekendStr(n)) || rs.some((r) => geblokkeerd(r, n)) || botst(n, rs)); i++) n = shiftDate(n, 1);
        naar.set(d, n);
        vorige = n;
      });
      regels.forEach((r) => {
        const nd = naar.get(r.date)!;
        zet(nd, r.startTime, r.endTime);
        if (nd !== r.date) uit.push({ ...r, date: nd, isFirstOfDay: false, volgorde: undefined });
      });
    });
  });
  return uit;
}
