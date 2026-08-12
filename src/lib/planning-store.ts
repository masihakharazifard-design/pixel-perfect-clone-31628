import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { EMPTY_META, type PersonalNote, type ProjectDocument, type ProjectMeta, type SettingsPathPatch, type SyncTable, type WithId } from "@/lib/store-types";

type Row = { id: string; data: unknown };

export { EMPTY_META };
export type { PersonalNote, ProjectDocument, ProjectMeta, SettingsPathPatch, SyncTable };

const SETTINGS_ID = "default";


async function fetchTable<T extends WithId>(table: SyncTable): Promise<T[]> {
  const query = supabase.from(table).select("id, data");
  const { data, error } =
    table === "availability" ? await query : await query.is("archived_at", null);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({ ...(r.data as T), id: r.id }));
}

export async function loadAll<P extends WithId, E extends WithId, A extends WithId, S>(): Promise<{
  projects: P[];
  employees: E[];
  availability: A[];
  settings: S | null;
  settingsUpdatedAt: string | null;
  empty: boolean;
}> {
  const [projects, employees, availability, settingsRes] = await Promise.all([
    fetchTable<P>("projects"),
    fetchTable<E>("employees"),
    fetchTable<A>("availability"),
    supabase.from("app_settings").select("data, updated_at").eq("id", SETTINGS_ID).maybeSingle(),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  return {
    projects,
    employees,
    availability,
    settings: (settingsRes.data?.data as S) ?? null,
    settingsUpdatedAt: settingsRes.data?.updated_at ?? null,
    empty: projects.length === 0 && employees.length === 0 && availability.length === 0,
  };
}

// ===== Rijgerichte opslag: alleen de echt gewijzigde regels =====
export async function upsertRows<T extends WithId>(table: SyncTable, items: T[]): Promise<T[]> {
  if (items.length === 0) return [];
  const rows = items.map((item) => ({
    id: item.id,
    data: item as unknown as Json,
    updated_at: new Date().toISOString(),
  }));
  const { data, error } = await supabase.from(table).upsert(rows).select("id, data");
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({ ...(r.data as T), id: r.id }));
}

export async function upsertRow<T extends WithId>(table: SyncTable, item: T): Promise<T> {
  const [row] = await upsertRows(table, [item]);
  return row ?? item;
}

export async function deleteRows(table: SyncTable, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw error;
}

export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  await deleteRows(table, [id]);
}

// ===== Planning: transactioneel met conflictcontrole en auditlog =====
export async function savePlanningRows<A extends WithId>(
  upserts: A[],
  deleteIds: string[] = [],
  actie = "planning_gewijzigd",
): Promise<void> {
  const { error } = await supabase.rpc("save_planning_rows", {
    _upserts: upserts.map((a) => ({ id: a.id, data: a as unknown as Json })) as unknown as Json,
    _delete_ids: deleteIds,
    _actie: actie,
  });
  if (error) throw error;
}

export async function setProjectStatusDb(projectId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc("set_project_status", { _project_id: projectId, _status: status });
  if (error) throw error;
}

export async function archiveRecord(
  table: "projects" | "employees",
  recordId: string,
  archive: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("archive_record", {
    _tabel: table,
    _record_id: recordId,
    _archiveren: archive,
  });
  if (error) throw error;
}

export async function bootstrapMyRole(): Promise<string | null> {
  const { data, error } = await supabase.rpc("bootstrap_my_role");
  if (error) throw error;
  return (data as string | null) ?? null;
}

// ===== Instellingen: atomair patchen, ook binnen geneste objecten =====
export interface SettingsPathPatch {
  /** Pad binnen de instellingen, bijv. ["projectColors","proj-1"] */
  path: string[];
  value?: unknown;
  remove?: boolean;
}

export async function patchSettings(
  changes: Record<string, unknown> = {},
  paths: SettingsPathPatch[] = [],
  expectedUpdatedAt?: string | null,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc("patch_app_settings", {
    _changes: changes as unknown as Json,
    _paths: paths as unknown as Json,
    _expected_updated_at: expectedUpdatedAt ?? undefined,
  });
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

// ===== Projectgegevens (facturatietermijnen, notities) =====
export interface ProjectMeta {
  docs: string[];
  termijnen: Record<string, boolean>;
  notities: string;
}

export const EMPTY_META: ProjectMeta = { docs: [], termijnen: {}, notities: "" };

export async function loadProjectMeta(projectId: string): Promise<ProjectMeta | null> {
  const { data, error } = await supabase
    .from("project_meta")
    .select("data")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as unknown as ProjectMeta) ?? null;
}

export async function saveProjectMeta(projectId: string, meta: ProjectMeta): Promise<void> {
  const { error } = await supabase
    .from("project_meta")
    .upsert({ id: projectId, data: meta as unknown as Json, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ===== Documenten per werk (echte bestandsopslag) =====
const DOC_BUCKET = "project-documents";

export interface ProjectDocument {
  id: string;
  project_id: string;
  bestandsnaam: string;
  pad: string;
  mimetype: string | null;
  grootte: number | null;
  created_at: string;
}

export async function listProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  const { data, error } = await supabase
    .from("project_documents")
    .select("id, project_id, bestandsnaam, pad, mimetype, grootte, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectDocument[];
}

export async function uploadProjectDocument(projectId: string, file: File): Promise<ProjectDocument> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Niet ingelogd");
  const path = `${projectId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const up = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from("project_documents")
    .insert({
      project_id: projectId,
      bestandsnaam: file.name,
      pad: path,
      mimetype: file.type || null,
      grootte: file.size,
      uploader_id: uid,
    })
    .select("id, project_id, bestandsnaam, pad, mimetype, grootte, created_at")
    .single();
  if (error) {
    // registratie mislukt: bestand weer opruimen
    await supabase.storage.from(DOC_BUCKET).remove([path]);
    throw error;
  }
  return data as ProjectDocument;
}

export async function projectDocumentUrl(pad: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(pad, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteProjectDocument(doc: ProjectDocument): Promise<void> {
  const { error } = await supabase.from("project_documents").delete().eq("id", doc.id);
  if (error) throw error;
  await supabase.storage.from(DOC_BUCKET).remove([doc.pad]);
}

// ===== Persoonlijke notities (privé per ingelogde gebruiker) =====
export interface PersonalNote {
  id: string;
  datum: string;
  tekst: string;
}

export async function loadPersonalNotes(): Promise<PersonalNote[]> {
  const { data, error } = await supabase
    .from("personal_notes")
    .select("id, datum, tekst")
    .order("datum", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PersonalNote[];
}

export async function savePersonalNote(ownerId: string, datum: string, tekst: string, id?: string): Promise<PersonalNote> {
  if (id) {
    const { data, error } = await supabase
      .from("personal_notes")
      .update({ datum, tekst })
      .eq("id", id)
      .select("id, datum, tekst")
      .single();
    if (error) throw error;
    return data as PersonalNote;
  }
  const { data, error } = await supabase
    .from("personal_notes")
    .insert({ owner_id: ownerId, datum, tekst })
    .select("id, datum, tekst")
    .single();
  if (error) throw error;
  return data as PersonalNote;
}

export async function deletePersonalNote(id: string): Promise<void> {
  const { error } = await supabase.from("personal_notes").delete().eq("id", id);
  if (error) throw error;
}
