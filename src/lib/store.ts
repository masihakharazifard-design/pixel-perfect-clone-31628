// Store-facade: laadt in DEMO MODE uitsluitend de lokale demo-store en anders
// uitsluitend de Supabase-store. Geen kruiselingse fallback tussen beide paden.
import type { Taak } from "./taken";
import { DEMO_MODE } from "./demo-mode";
import type {
  LoadAllResult,
  PersonalNote,
  ProjectDocument,
  ProjectMeta,
  SettingsPathPatch,
  SyncTable,
  UrenRegel,
  UrenStatus,
  UrenSoort,
  GereedMelding,
  FeedbackItem,
  FeedbackStatus,
  WithId,
} from "./store-types";

export { EMPTY_META } from "./store-types";
export type { GeschiedenisRegel } from "./geschiedenis";
import type { GeschiedenisOpties, GeschiedenisRegel } from "./geschiedenis";
export type { PersonalNote, ProjectDocument, ProjectMeta, SettingsPathPatch, SyncTable, UrenRegel, UrenStatus, UrenSoort, GereedMelding, FeedbackItem, FeedbackStatus };
export { berekenUren } from "./store-types";

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

/** Eén gebundelde leesactie voor de zichtbare pagina; geen N individuele reads. */
export async function loadProjectMetaBatch(projectIds: string[]): Promise<Map<string, ProjectMeta>> {
  return (await impl()).loadProjectMetaBatch(projectIds);
}

export async function saveProjectMeta(projectId: string, meta: ProjectMeta): Promise<void> {
  return (await impl()).saveProjectMeta(projectId, meta);
}

/** Geschiedenis van alle veranderingen (nieuwste eerst). */
export async function loadGeschiedenis(opties?: GeschiedenisOpties): Promise<GeschiedenisRegel[]> {
  return (await impl()).loadGeschiedenis(opties);
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
  await mod.resetDemoData();
}

// ===== Taken per werk =====
export async function listTaken(projectId: string): Promise<Taak[]> {
  return (await impl()).listTaken(projectId);
}

export async function listTakenForProjects(projectIds: string[]): Promise<Map<string, Taak[]>> {
  return (await impl()).listTakenForProjects(projectIds);
}

export async function saveTaak(taak: Taak): Promise<Taak> {
  return (await impl()).saveTaak(taak);
}

export async function deleteTaak(id: string): Promise<void> {
  return (await impl()).deleteTaak(id);
}

// ===== Urenregistratie =====
export async function loadUren(van: string, tot: string): Promise<UrenRegel[]> {
  return (await impl()).loadUren(van, tot);
}
export async function saveUren(r: UrenRegel): Promise<UrenRegel> {
  return (await impl()).saveUren(r);
}
export async function deleteUren(id: string): Promise<void> {
  return (await impl()).deleteUren(id);
}
export async function zetUrenStatus(ids: string[], status: UrenStatus, door?: string): Promise<void> {
  return (await impl()).zetUrenStatus(ids, status, door);
}

// ===== Gereedmeldingen en werkplan =====
export async function loadGereed(van: string, tot: string): Promise<GereedMelding[]> {
  return (await impl()).loadGereed(van, tot);
}
export async function meldGereed(employeeId: string, projectId: string, datum: string, foto: Blob, opmerking: string): Promise<GereedMelding> {
  return (await impl()).meldGereed(employeeId, projectId, datum, foto, opmerking);
}
export async function gereedFotoUrl(pad: string): Promise<string> {
  return (await impl()).gereedFotoUrl(pad);
}
export async function intrekGereed(m: GereedMelding): Promise<void> {
  return (await impl()).intrekGereed(m);
}
export async function uploadWerkplanPdf(employeeId: string, bestandsnaam: string, pdf: Blob): Promise<string> {
  return (await impl()).uploadWerkplanPdf(employeeId, bestandsnaam, pdf);
}

// ===== Feedback =====
export async function loadFeedback(): Promise<FeedbackItem[]> {
  return (await impl()).loadFeedback();
}
export async function geefFeedback(tekst: string, pagina: string): Promise<FeedbackItem> {
  return (await impl()).geefFeedback(tekst, pagina);
}
export async function zetFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  return (await impl()).zetFeedbackStatus(id, status);
}

// ===== Gebruikersbeheer (alleen beheerder; demo: voorbeeldgebruikers) =====
export type { AdminUser, AppRoleName } from "./planning-store";
import type { AdminUser, AppRoleName } from "./planning-store";
export async function adminListUsers(): Promise<AdminUser[]> {
  return (await impl()).adminListUsers();
}
export async function adminSetUserRole(userId: string, role: AppRoleName): Promise<void> {
  return (await impl()).adminSetUserRole(userId, role);
}
export async function loadRolRechten(): Promise<import("./rechten").RechtenPerRol> {
  return (await impl()).loadRolRechten();
}
export async function slaRolRechtenOp(rol: AppRoleName, rechten: import("./rechten").Rechten): Promise<void> {
  return (await impl()).slaRolRechtenOp(rol, rechten);
}
