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
