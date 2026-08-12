// Gedeelde Excel-parsehelpers en importtypen.
// Wordt zowel door de UI als door de import-worker gebruikt; bevat geen DOM-code.

export type Afdeling = "Stoffering" | "Schilderwerk" | "Zonwering";
export type ImportAvailStatus =
  | "Beschikbaar"
  | "Ingepland"
  | "Bezet"
  | "Niet beschikbaar"
  | "Vakantie"
  | "Ziek"
  | "Vrij";

/** Eén voorbereide projectregel uit het Excelbestand. */
export interface ImportRow {
  projectnr: string;
  projectnaam: string;
  opdrachtgever: string;
  contactpersoon: string;
  projectleider: string; // kolom K, letterlijke tekst
  startdatum: string;
  einddatum: string;
  datumOpdracht: string;
  werknummer: string;
  werkzaamheden: string; // kolom J, letterlijke tekst
  rawDept: string;
  afdelingen: Afdeling[];
  turnkey: boolean;
  rowIndex: number;
  invalidReason: string;
}

/** Ruwe beschikbaarheidsregel; medewerkermatching gebeurt in de UI. */
export interface VacBaseRow {
  rowIndex: number;
  rawName: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  hasExplicitTimes: boolean;
  status: ImportAvailStatus;
  note: string;
  invalidReason: string;
}

/** Vaste kolomposities in het projectimportbestand. */
export const COL_WERKZAAMHEDEN = 9; // Excel kolom J
export const COL_PROJECTLEIDER = 10; // Excel kolom K

export function normalizeProjectnr(v: unknown): string {
  return String(v ?? "").trim();
}

export function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function fmtHM(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function resolveDept(raw: string): { afdelingen: Afdeling[]; turnkey: boolean } {
  const s = raw.toLowerCase().trim();
  if (!s) return { afdelingen: ["Stoffering"], turnkey: false };
  if (s === "turnkey") return { afdelingen: ["Stoffering", "Schilderwerk", "Zonwering"], turnkey: true };
  if (s.includes("combinatie") || s.includes("combi")) {
    const out: Afdeling[] = [];
    if (s.includes("stof")) out.push("Stoffering");
    if (s.includes("schild")) out.push("Schilderwerk");
    if (s.includes("zon")) out.push("Zonwering");
    return { afdelingen: out.length ? out : ["Stoffering", "Schilderwerk", "Zonwering"], turnkey: false };
  }
  if (s.includes("schild")) return { afdelingen: ["Schilderwerk"], turnkey: false };
  if (s.includes("stof")) return { afdelingen: ["Stoffering"], turnkey: false };
  if (s.includes("zon")) return { afdelingen: ["Zonwering"], turnkey: false };
  return { afdelingen: ["Stoffering"], turnkey: false };
}

export function parseXlDate(raw: string | number | null | undefined): string {
  if (raw == null || raw === "") return "";
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!isNaN(n) && n > 1 && n < 200000) {
    const d = new Date(Math.round((n - 25569) * 86400000));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const s = String(raw).trim();
  if (!s) return "";
  const dm = /^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})$/.exec(s);
  if (dm) {
    const [, d, m, y] = dm;
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const dt = new Date(year, parseInt(m) - 1, parseInt(d));
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString();
  return "";
}

export function parseXlTime(raw: unknown): { h: number; m: number } | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    const frac = raw - Math.floor(raw);
    if ((raw > 0 && raw < 1) || frac > 0) {
      const mins = Math.round(frac * 24 * 60);
      return { h: Math.floor(mins / 60) % 24, m: mins % 60 };
    }
    if (raw >= 0 && raw <= 23) return { h: Math.round(raw), m: 0 };
    return null;
  }
  const s = String(raw).trim();
  const m = /^(\d{1,2})[:.\uff1a]?(\d{2})?$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1]);
  const mi = m[2] ? parseInt(m[2]) : 0;
  if (isNaN(h) || h > 23 || mi > 59) return null;
  return { h, m: mi };
}

export function combineDT(iso: string, time: { h: number; m: number } | null, defH: number, defM = 0): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  d.setHours(time ? time.h : defH, time ? time.m : defM, 0, 0);
  return d.toISOString();
}

export function parseTimeCell(raw: unknown): string {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const n = Number(s.replace(",", "."));
  if (!isNaN(n) && n > 0 && n < 1) {
    const totalMin = Math.round(n * 1440);
    return fmtHM(Math.floor(totalMin / 60), totalMin % 60);
  }
  const m = /^(\d{1,2})[:\.](\d{2})/.exec(s);
  if (m) return fmtHM(parseInt(m[1]), parseInt(m[2]));
  return "";
}

export function mapVacStatus(raw: string): ImportAvailStatus {
  const s = raw.toLowerCase().trim();
  if (!s) return "Beschikbaar";
  if (s.includes("niet beschikbaar") || s.includes("unavail") || s.includes("afwezig")) return "Niet beschikbaar";
  if (s.includes("ingepland") || s.includes("planned") || s.includes("gepland")) return "Ingepland";
  if (s.includes("beschikbaar") || s.includes("available")) return "Beschikbaar";
  if (s.includes("vakantie") || s.includes("holiday") || s.includes("leave") || s.includes("verlof")) return "Vakantie";
  if (s.includes("ziek") || s.includes("sick") || s.includes("ill") || s.includes("arbeidsongeschikt")) return "Ziek";
  if (s.includes("vrij") || s.includes("free") || s.includes("rtvz")) return "Vrij";
  return "Vakantie";
}

// ===== Berichten tussen UI en import-worker =====
export type ImportWorkerRequest =
  | { mode: "projects"; buffer: ArrayBuffer; existingProjectNumbers: string[] }
  | { mode: "avail"; buffer: ArrayBuffer };

export type ImportWorkerResponse =
  | { type: "progress"; pct: number }
  | { type: "error"; message: string }
  | {
      type: "projects";
      nieuw: ImportRow[];
      bestaand: ImportRow[];
      ongeldig: ImportRow[];
      total: number;
      duplicaten: number;
      warning: string;
    }
  | { type: "avail"; rows: VacBaseRow[]; total: number; warning: string };

/** Boven deze hoeveelheid regels waarschuwen we, maar verwerken we gewoon door. */
export const LARGE_FILE_WARN = 20000;
