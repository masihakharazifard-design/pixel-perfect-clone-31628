import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type Row = { id: string; data: unknown };
type WithId = { id: string };

const TABLES = ["projects", "employees", "availability"] as const;
export type SyncTable = (typeof TABLES)[number];

const SETTINGS_ID = "default";

async function fetchTable<T extends WithId>(table: SyncTable): Promise<T[]> {
  const { data, error } = await supabase.from(table).select("id, data");
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({ ...(r.data as T), id: r.id }));
}

export async function loadAll<P extends WithId, E extends WithId, A extends WithId, S>(): Promise<{
  projects: P[];
  employees: E[];
  availability: A[];
  settings: S | null;
  empty: boolean;
}> {
  const [projects, employees, availability, settingsRes] = await Promise.all([
    fetchTable<P>("projects"),
    fetchTable<E>("employees"),
    fetchTable<A>("availability"),
    supabase.from("app_settings").select("data").eq("id", SETTINGS_ID).maybeSingle(),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  return {
    projects,
    employees,
    availability,
    settings: (settingsRes.data?.data as S) ?? null,
    empty: projects.length === 0 && employees.length === 0 && availability.length === 0,
  };
}

// Mirrors the in-memory list into the table: upserts every row and removes
// rows that no longer exist locally.
export async function syncTable(table: SyncTable, items: WithId[]): Promise<void> {
  const ids = items.map((i) => i.id);

  if (ids.length === 0) {
    const { error } = await supabase.from(table).delete().neq("id", "");
    if (error) throw error;
    return;
  }

  const rows = items.map((item) => ({ id: item.id, data: item as unknown as Json, updated_at: new Date().toISOString() }));
  const { error: upsertError } = await supabase.from(table).upsert(rows);
  if (upsertError) throw upsertError;

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .not("id", "in", `(${ids.map((id) => `"${id.replace(/"/g, '""')}"`).join(",")})`);
  if (deleteError) throw deleteError;
}

export async function syncSettings(settings: unknown): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ id: SETTINGS_ID, data: settings as Json, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ===== Projectgegevens (documenten, facturatietermijnen, notities) =====
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

