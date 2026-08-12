// Store-facade: laadt in DEMO MODE uitsluitend de lokale demo-store en anders
// uitsluitend de Supabase-store. Geen kruiselingse fallback tussen beide paden.
import { DEMO_MODE } from "./demo-mode";
import type {
  LoadAllResult,
  PersonalNote,
  ProjectDocument,
  ProjectMeta,
  SettingsPathPatch,
  SyncTable,
  WithId,
} from "./store-types";

export { EMPTY_META } from "./store-types";
export type { PersonalNote, ProjectDocument, ProjectMeta, SettingsPathPatch, SyncTable };

type Impl = typeof import("./planning-store");

let cache: Promise<Impl> | null = null;
function impl(): Promise<Impl> {
  if (!cache) {
    cache = DEMO_MODE
      ? (import("./demo-planning-store") as unknown as Promise<Impl>)
      : (import("./planning-store") as Promise<Impl>);
  }
  return cache;
}

export async function loadAll<P extends WithId, E extends WithId, A extends WithId, S>(): Promise<
  LoadAllResult<P, E, A, S>
> {
  return (await impl()).loadAll<P, E, A, S>();
}

export async function upsertRows<T extends WithId>(table: SyncTable, items: T[]): Promise<T[]> {
  return (await impl()).upsertRows(table, items);
}

export async function upsertRow<T extends WithId>(table: SyncTable, item: T): Promise<T> {
  return (await impl()).upsertRow(table, item);
}

export async function deleteRows(table: SyncTable, ids: string[]): Promise<void> {
  return (await impl()).deleteRows(table, ids);
}

export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  return (await impl()).deleteRow(table, id);
}

export async function savePlanningRows<A extends WithId>(
  upserts: A[],
  deleteIds: string[] = [],
  actie = "planning_gewijzigd",
): Promise<void> {
  return (await impl()).savePlanningRows(upserts, deleteIds, actie);
}

export async function setProjectStatusDb(projectId: string, status: string): Promise<void> {
  return (await impl()).setProjectStatusDb(projectId, status);
}

export async function archiveRecord(
  table: "projects" | "employees",
  recordId: string,
  archive: boolean,
): Promise<void> {
  return (await impl()).archiveRecord(table, recordId, archive);
}

export async function bootstrapMyRole(): Promise<string | null> {
  return (await impl()).bootstrapMyRole();
}

export async function patchSettings(
  changes: Record<string, unknown> = {},
  paths: SettingsPathPatch[] = [],
  expectedUpdatedAt?: string | null,
): Promise<Record<string, unknown> | null> {
  return (await impl()).patchSettings(changes, paths, expectedUpdatedAt);
}

export async function loadProjectMeta(projectId: string): Promise<ProjectMeta | null> {
  return (await impl()).loadProjectMeta(projectId);
}

export async function saveProjectMeta(projectId: string, meta: ProjectMeta): Promise<void> {
  return (await impl()).saveProjectMeta(projectId, meta);
}

export async function listProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  return (await impl()).listProjectDocuments(projectId);
}

export async function uploadProjectDocument(projectId: string, file: File): Promise<ProjectDocument> {
  return (await impl()).uploadProjectDocument(projectId, file);
}

export async function projectDocumentUrl(pad: string): Promise<string> {
  return (await impl()).projectDocumentUrl(pad);
}

export async function deleteProjectDocument(doc: ProjectDocument): Promise<void> {
  return (await impl()).deleteProjectDocument(doc);
}

export async function loadPersonalNotes(): Promise<PersonalNote[]> {
  return (await impl()).loadPersonalNotes();
}

export async function savePersonalNote(
  ownerId: string,
  datum: string,
  tekst: string,
  id?: string,
): Promise<PersonalNote> {
  return (await impl()).savePersonalNote(ownerId, datum, tekst, id);
}

export async function deletePersonalNote(id: string): Promise<void> {
  return (await impl()).deletePersonalNote(id);
}

/** Alleen in DEMO MODE: lokale demo-data wissen en opnieuw vullen met de seed. */
export async function resetDemoData(): Promise<void> {
  if (!DEMO_MODE) return;
  const mod = await import("./demo-planning-store");
  mod.resetDemoData();
}
