// Taken per werk: datamodel, vaste typelijst met kleuren en datumhelpers.
export interface Taak {
  id: string;
  projectId: string;
  taaknaam: string;
  type: string;
  /** "YYYY-MM-DD" of leeg */
  start: string;
  /** aantal kalenderdagen */
  duur: number;
}

/** Taken op startdatum (vroegste eerst); taken zonder datum achteraan. */
export function sorteerTaken<T extends { start: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
}

export const TAAK_TYPES = [
  "Stoffering",
  "Slopen stoelen",
  "Timmerwerk",
  "Electra",
  "Aanbrengen LED",
  "DALI programmering",
  "Schoonmaak en testing",
  "Opening",
  "Schilderwerk",
  "Wandbespanning en plint",
] as const;

export type TaakType = (typeof TAAK_TYPES)[number];

export const TAAK_KLEUREN: Record<string, string> = {
  "Stoffering": "#2E6FD9",
  "Slopen stoelen": "#F2D024",
  "Timmerwerk": "#8DD86B",
  "Electra": "#9A9A24",
  "Aanbrengen LED": "#1F7A3F",
  "DALI programmering": "#8E6E7E",
  "Schoonmaak en testing": "#F08A24",
  "Opening": "#D93025",
  "Schilderwerk": "#7FC4E8",
  "Wandbespanning en plint": "#A6A6A6",
};

export function taakKleur(type: string): string {
  return TAAK_KLEUREN[type] || "#B8C3D9";
}

/** Lokale datum zonder tijdzoneverschuiving. */
export function parseDay(ds: string): Date | null {
  if (!ds) return null;
  const d = new Date(`${ds.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function toDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

export function addDays(ds: string, n: number): string {
  const d = parseDay(ds);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return toDay(d);
}

function isWeekendDate(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

/** Einddatum = start + duur werkdagen (ma t/m vr), inclusief startdag; weekend telt niet mee. */
export function taakEind(t: Pick<Taak, "start" | "duur">): string {
  if (!t.start) return "";
  const d = parseDay(t.start);
  if (!d) return "";
  let resterend = Math.max(1, Math.floor(Number(t.duur) || 1));
  // Start op een weekenddag: schuif naar de eerstvolgende werkdag.
  while (isWeekendDate(d)) d.setDate(d.getDate() + 1);
  let guard = 0;
  while (resterend > 1 && guard++ < 4000) {
    d.setDate(d.getDate() + 1);
    if (!isWeekendDate(d)) resterend--;
  }
  return toDay(d);
}

export function fmtDay(ds: string): string {
  const d = parseDay(ds);
  if (!d) return "-";
  return `${`${d.getDate()}`.padStart(2, "0")}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${d.getFullYear()}`;
}

/** ISO-weeknummer. */
export function weekNr(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7);
}
