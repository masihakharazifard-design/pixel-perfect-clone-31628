// Supabase-vrije typen en constanten die zowel de echte store als de demo-store gebruiken.
export type WithId = { id: string };

export const SYNC_TABLES = ["projects", "employees", "availability"] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface SettingsPathPatch {
  /** Pad binnen de instellingen, bijv. ["projectColors","proj-1"] */
  path: string[];
  value?: unknown;
  remove?: boolean;
}

export interface ProjectMeta {
  docs: string[];
  termijnen: Record<string, boolean>;
  notities: string;
}

export const EMPTY_META: ProjectMeta = { docs: [], termijnen: {}, notities: "" };

export interface ProjectDocument {
  id: string;
  project_id: string;
  bestandsnaam: string;
  pad: string;
  mimetype: string | null;
  grootte: number | null;
  created_at: string;
}

export interface PersonalNote {
  id: string;
  datum: string;
  tekst: string;
}

export interface LoadAllResult<P, E, A, S> {
  projects: P[];
  employees: E[];
  availability: A[];
  settings: S | null;
  settingsUpdatedAt: string | null;
  empty: boolean;
}

/** Gewerkte uren van een medewerker op een dag (urenregistratie). */
export interface UrenRegel {
  id: string;
  employeeId: string;
  projectId: string | null;
  datum: string; // JJJJ-MM-DD
  start: string; // UU:MM
  eind: string; // UU:MM
  pauze: number; // minuten
  uren: number;
  opmerking: string;
  /** werk (op een werknummer), reisuren of werkplaats/overig */
  soort?: UrenSoort;
  /** concept → ingediend → goedgekeurd (of afgekeurd, dan weer aan te passen) */
  status?: UrenStatus;
  beoordeeldDoor?: string;
  beoordeeldOp?: string;
}
export type UrenSoort = "werk" | "reisuren" | "werkplaats";
export type UrenStatus = "concept" | "ingediend" | "goedgekeurd" | "afgekeurd";

/** Netto uren: eindtijd min begintijd min pauze, afgerond op een kwartier. */
export function berekenUren(start: string, eind: string, pauze: number): number {
  const m = (t: string) => { const [h, mi] = t.split(":").map(Number); return (h || 0) * 60 + (mi || 0); };
  const netto = m(eind) - m(start) - (pauze || 0);
  if (!(netto > 0)) return 0;
  return Math.min(24, Math.round(netto / 15) / 4);
}

/** Gereedmelding van een medewerker voor een werk op een dag, met foto. */
export interface GereedMelding {
  id: string;
  employeeId: string;
  projectId: string;
  datum: string; // JJJJ-MM-DD
  fotoPad: string;
  opmerking: string;
  tijd: string; // ISO-tijdstip van melden
}
