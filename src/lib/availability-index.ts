// Availability-indexen: één keer opbouwen per wijziging van de planningregels.
// Bevat uitsluitend availability-gegevens; projectdata zit in de centrale projectindex.
import { useMemo } from "react";

export interface AvailLike {
  id: string;
  employeeId: string;
  date: string;
  status: string;
  projectId?: string;
  periodeId?: string;
  reeksId?: string;
}

export interface AvailabilityIndexes<A extends AvailLike> {
  all: A[];
  byDate: Map<string, A[]>;
  /** key = `employeeId|YYYY-MM-DD` */
  byEmployeeDate: Map<string, A[]>;
  byEmployeeId: Map<string, A[]>;
  byProjectId: Map<string, A[]>;
  byPeriodeId: Map<string, A[]>;
  byReeksId: Map<string, A[]>;
  /** Alleen planningregels (projectId + status "Ingepland") */
  planByProjectId: Map<string, A[]>;
  plannedEmployeeIdsByProject: Map<string, string[]>;
  plannedCountByProject: Map<string, number>;
  /** Regels van één medewerker op één dag, O(1). */
  forEmployeeDate(employeeId: string, date: string): A[];
  forDate(date: string): A[];
  /** Alleen de zichtbare periode samenstellen via directe lookups. */
  forDates(dates: string[]): A[];
}

export const empDateKey = (employeeId: string, date: string) => employeeId + "|" + date;

const push = <T,>(map: Map<string, T[]>, key: string, value: T) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

const EMPTY: never[] = [];

export function buildAvailabilityIndexes<A extends AvailLike>(all: A[]): AvailabilityIndexes<A> {
  const byDate = new Map<string, A[]>();
  const byEmployeeDate = new Map<string, A[]>();
  const byEmployeeId = new Map<string, A[]>();
  const byProjectId = new Map<string, A[]>();
  const byPeriodeId = new Map<string, A[]>();
  const byReeksId = new Map<string, A[]>();
  const planByProjectId = new Map<string, A[]>();
  const plannedEmpSets = new Map<string, Set<string>>();

  for (const a of all) {
    push(byDate, a.date, a);
    push(byEmployeeDate, empDateKey(a.employeeId, a.date), a);
    push(byEmployeeId, a.employeeId, a);
    if (a.projectId) push(byProjectId, a.projectId, a);
    if (a.periodeId) push(byPeriodeId, a.periodeId, a);
    if (a.reeksId) push(byReeksId, a.reeksId, a);
    if (a.projectId && a.status === "Ingepland") {
      push(planByProjectId, a.projectId, a);
      const set = plannedEmpSets.get(a.projectId);
      if (set) set.add(a.employeeId);
      else plannedEmpSets.set(a.projectId, new Set([a.employeeId]));
    }
  }

  const plannedEmployeeIdsByProject = new Map<string, string[]>();
  const plannedCountByProject = new Map<string, number>();
  plannedEmpSets.forEach((set, pid) => {
    plannedEmployeeIdsByProject.set(pid, [...set]);
    plannedCountByProject.set(pid, set.size);
  });

  return {
    all,
    byDate,
    byEmployeeDate,
    byEmployeeId,
    byProjectId,
    byPeriodeId,
    byReeksId,
    planByProjectId,
    plannedEmployeeIdsByProject,
    plannedCountByProject,
    forEmployeeDate: (employeeId, date) => byEmployeeDate.get(empDateKey(employeeId, date)) ?? (EMPTY as A[]),
    forDate: (date) => byDate.get(date) ?? (EMPTY as A[]),
    forDates: (dates) => {
      const out: A[] = [];
      for (const d of dates) {
        const rows = byDate.get(d);
        if (rows) out.push(...rows);
      }
      return out;
    },
  };
}

export function useAvailabilityIndexes<A extends AvailLike>(all: A[]): AvailabilityIndexes<A> {
  return useMemo(() => buildAvailabilityIndexes(all), [all]);
}
