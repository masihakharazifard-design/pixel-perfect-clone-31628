// DEMO MODE datalaag.
// Projecten staan altijd in IndexedDB (één record per project); de overige,
// kleine demo-data staat in localStorage. Geen enkel netwerkverzoek.
import { sorteerTaken, type Taak } from "./taken";
import { makeDemoSeed, DEMO_DATA_VERSION, type DemoData } from "./demo-seed";
import { verschil, hoortBijWerk, type GeschiedenisOpties, type GeschiedenisRegel } from "./geschiedenis";
import {
  deleteDemoProjects,
  getDemoProject,
  loadDemoProjects,
  putDemoProjects,
  resetDemoProjects,
} from "./demo-idb";
import {
  EMPTY_META,
  type LoadAllResult,
  type PersonalNote,
  type ProjectDocument,
  type ProjectMeta,
  type SettingsPathPatch,
  type SyncTable,
  type WithId,
} from "./store-types";

type Rec = { id: string } & Record<string, unknown>;

// Geschiedenis in de demo: zelfde vorm als het echte log, max. 500 regels
const DEMO_WIE = "demo@maasmond.nl";
function logDemo(d: DemoData, r: Omit<GeschiedenisRegel, "id" | "tijd" | "wie">): void {
  (d.audit as unknown[]).unshift({ ...r, id: "log-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), tijd: new Date().toISOString(), wie: DEMO_WIE });
  d.audit = (d.audit as unknown[]).slice(0, 500);
}
const context = (x: Rec | null | undefined) => ({ werknummer: x?.werknummer, projectnaam: x?.projectnaam, naam: x?.naam });
function logWijziging(d: DemoData, tabel: string, oud: Rec | null | undefined, nieuw: Rec | null | undefined): void {
  const id = String(nieuw?.id ?? oud?.id ?? "");
  if (!oud && nieuw) { logDemo(d, { actie: "aangemaakt", tabel, recordId: id, oud: null, nieuw: { ...nieuw, _context: context(nieuw) } }); return; }
  if (oud && !nieuw) { logDemo(d, { actie: "verwijderd", tabel, recordId: id, oud, nieuw: null }); return; }
  const v = verschil(oud, nieuw);
  const keys = Object.keys(v.nieuw);
  if (!keys.length || (tabel === "projects" && keys.length === 1 && keys[0] === "status")) return;
  logDemo(d, { actie: "gewijzigd", tabel, recordId: id, oud: v.oud, nieuw: { ...v.nieuw, _context: context(nieuw) } });
}
type DemoDataV2 = DemoData & { projectsInIdb?: boolean };


const KEY = "maasmond-demo-data";

function read(): DemoData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoData;
      if (parsed && parsed.version === DEMO_DATA_VERSION) return parsed;
    }
  } catch {
    /* beschadigde demo-data: terugvallen op de seed */
  }
  const seed = makeDemoSeed();
  try {
    write(seed);
  } catch {
    /* opslag vol bij initialisatie: demo draait dan in het geheugen */
  }
  return seed;
}

export class DemoStorageFullError extends Error {
  constructor() {
    super("De Excel-import kon niet worden opgeslagen omdat de lokale demo-opslag vol is.");
    this.name = "DemoStorageFullError";
  }
}

function write(data: DemoData): void {
  // Eerst wegschrijven; mislukt dit (opslag vol), dan blijft de bestaande
  // dataset ongewijzigd en gaat de fout naar de aanroeper.
  localStorage.setItem(KEY, JSON.stringify(data));
}

function mutate(fn: (d: DemoData) => void): DemoData {
  const d = read();
  fn(d);
  try {
    write(d);
  } catch {
    throw new DemoStorageFullError();
  }
  return d;
}


// ===== Projecten: altijd IndexedDB =====
let migrated = false;

/**
 * Zet eenmalig de oude localStorage-projectenlijst om naar IndexedDB.
 * De oude array verdwijnt pas nadat de transactie is afgerond; mislukt de
 * migratie, dan blijft de oude data volledig onaangeroerd.
 */
async function ensureProjectsInIdb(): Promise<void> {
  if (migrated) return;
  const d = read() as DemoDataV2;
  if (!d.projectsInIdb) {
    const legacy = (d.projects ?? []) as Rec[];
    if (legacy.length) await putDemoProjects(legacy);
    mutate((data) => {
      (data as DemoDataV2).projects = [] as DemoData["projects"];
      (data as DemoDataV2).projectsInIdb = true;
    });
  }
  migrated = true;
}

export async function resetDemoData(): Promise<void> {
  const seed = makeDemoSeed() as DemoDataV2;
  await resetDemoProjects(seed.projects as Rec[]);
  seed.projects = [] as DemoData["projects"];
  seed.projectsInIdb = true;
  write(seed);
  migrated = true;
}

export async function loadAll<P extends WithId, E extends WithId, A extends WithId, S>(): Promise<
  LoadAllResult<P, E, A, S>
> {
  await ensureProjectsInIdb();
  const d = read();
  const projects = await loadDemoProjects<P & { id: string }>();
  return {
    projects: projects as unknown as P[],
    employees: d.employees as unknown as E[],
    availability: d.availability as unknown as A[],
    settings: (d.settings as S) ?? null,
    settingsUpdatedAt: d.settingsUpdatedAt ?? null,
    empty: projects.length === 0 && d.employees.length === 0 && d.availability.length === 0,
  };
}

function listOf(d: DemoData, table: SyncTable): { id: string }[] {
  if (table === "projects") return d.projects;
  if (table === "employees") return d.employees;
  return d.availability;
}

export async function upsertRows<T extends WithId>(table: SyncTable, items: T[]): Promise<T[]> {
  if (items.length === 0) return [];
  if (table === "projects") {
    await ensureProjectsInIdb();
    const oud = items.length <= 50 ? await Promise.all(items.map((i) => getDemoProject<Rec>(i.id))) : [];
    await putDemoProjects(items.map((i) => ({ ...(i as unknown as Record<string, unknown>), id: i.id })));
    if (oud.length) mutate((d) => items.forEach((i, k) => logWijziging(d, "projects", oud[k], i as unknown as Rec)));
    return items;
  }
  mutate((d) => {
    const list = listOf(d, table);
    if (table === "employees") items.forEach((i) => logWijziging(d, "employees", list.find((r) => r.id === i.id) as Rec | undefined, i as unknown as Rec));
    // Index vooraf opbouwen: O(1) per rij i.p.v. de hele lijst doorzoeken.
    const idxById = new Map<string, number>();
    list.forEach((r, i) => idxById.set(r.id, i));
    items.forEach((item) => {
      const row = { ...(item as unknown as Record<string, unknown>), id: item.id } as { id: string };
      const i = idxById.get(item.id);
      if (i !== undefined) list[i] = row;
      else {
        list.push(row);
        idxById.set(item.id, list.length - 1);
      }
    });
  });
  return items;
}

export async function upsertRow<T extends WithId>(table: SyncTable, item: T): Promise<T> {
  await upsertRows(table, [item]);
  return item;
}

export async function deleteRows(table: SyncTable, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (table === "projects") {
    await ensureProjectsInIdb();
    const oud = ids.length <= 50 ? await Promise.all(ids.map((id) => getDemoProject<Rec>(id))) : [];
    await deleteDemoProjects(ids);
    if (oud.length) mutate((d) => oud.forEach((p) => p && logWijziging(d, "projects", p, null)));
    return;
  }
  mutate((d) => {
    if (table === "employees") listOf(d, table).filter((r) => ids.includes(r.id)).forEach((r) => logWijziging(d, "employees", r as Rec, null));
    const keep = listOf(d, table).filter((r) => !ids.includes(r.id));
    if (table === "employees") d.employees = keep as DemoData["employees"];
    else d.availability = keep as DemoData["availability"];
  });
}


export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  await deleteRows(table, [id]);
}

export async function savePlanningRows<A extends WithId>(
  upserts: A[],
  deleteIds: string[] = [],
  actie = "planning_gewijzigd",
): Promise<void> {
  mutate((d) => {
    const weg = deleteIds.length ? d.availability.filter((r) => deleteIds.includes(r.id)).map((r) => ({ id: r.id, data: r })) : null;
    if (deleteIds.length) {
      d.availability = d.availability.filter((r) => !deleteIds.includes(r.id)) as DemoData["availability"];
    }
    upserts.forEach((item) => {
      const row = { ...(item as unknown as Record<string, unknown>), id: item.id } as { id: string };
      const i = d.availability.findIndex((r) => r.id === item.id);
      if (i >= 0) d.availability[i] = row;
      else d.availability.push(row);
    });
    logDemo(d, { actie, tabel: "availability", recordId: null, oud: weg, nieuw: upserts.map((u) => ({ id: u.id, data: u })) });
  });
}

export async function setProjectStatusDb(projectId: string, status: string): Promise<void> {
  await ensureProjectsInIdb();
  const p = await getDemoProject<Rec>(projectId);
  if (p) await putDemoProjects([{ ...p, status }]);
  mutate((d) => {
    logDemo(d, { actie: "status_gewijzigd", tabel: "projects", recordId: projectId, oud: { status: p?.status }, nieuw: { status } });
  });
}

export async function archiveRecord(
  table: "projects" | "employees",
  recordId: string,
  archive: boolean,
): Promise<void> {
  const stamp = archive ? new Date().toISOString() : null;
  if (table === "projects") {
    await ensureProjectsInIdb();
    const p = await getDemoProject<Rec>(recordId);
    if (p) await putDemoProjects([{ ...p, archived_at: stamp }]);
    return;
  }
  mutate((d) => {
    const rec = listOf(d, table).find((r) => r.id === recordId) as Record<string, unknown> | undefined;
    if (rec) rec.archived_at = stamp;
  });
}


export async function bootstrapMyRole(): Promise<string | null> {
  return "beheerder";
}

export async function patchSettings(
  changes: Record<string, unknown> = {},
  paths: SettingsPathPatch[] = [],
): Promise<Record<string, unknown> | null> {
  const d = mutate((data) => {
    const s: Record<string, unknown> = { ...((data.settings as Record<string, unknown>) ?? {}) };
    Object.entries(changes).forEach(([k, v]) => {
      s[k] = v;
    });
    paths.forEach((p) => {
      if (!p.path.length) return;
      let node = s;
      for (let i = 0; i < p.path.length - 1; i++) {
        const key = p.path[i];
        const next = node[key];
        node[key] = next && typeof next === "object" && !Array.isArray(next) ? { ...(next as object) } : {};
        node = node[key] as Record<string, unknown>;
      }
      const last = p.path[p.path.length - 1];
      if (p.remove) delete node[last];
      else node[last] = p.value;
    });
    data.settings = s;
    data.settingsUpdatedAt = new Date().toISOString();
  });
  return (d.settings as Record<string, unknown>) ?? null;
}

export async function loadProjectMeta(projectId: string): Promise<ProjectMeta | null> {
  const d = read();
  return ((d.projectMeta as Record<string, ProjectMeta>)[projectId] as ProjectMeta) ?? null;
}

/**
 * Eén gebundelde leesactie voor meerdere projecten (max. één pagina).
 * Bewust GEEN Promise.all over loadProjectMeta: de volledige demo-opslag
 * wordt één keer gelezen en daaruit wordt één Map opgebouwd.
 */
export async function loadProjectMetaBatch(projectIds: string[]): Promise<Map<string, ProjectMeta>> {
  const out = new Map<string, ProjectMeta>();
  if (!projectIds.length) return out;
  const all = (read().projectMeta as Record<string, ProjectMeta>) ?? {};
  for (const id of projectIds) {
    const m = all[id];
    if (m) out.set(id, m);
  }
  return out;
}

export async function saveProjectMeta(projectId: string, meta: ProjectMeta): Promise<void> {
  mutate((d) => {
    const all = d.projectMeta as Record<string, ProjectMeta>;
    const oud = all[projectId];
    const nieuw = { ...EMPTY_META, ...meta };
    if (oud || nieuw.notities || nieuw.docs.length || Object.keys(nieuw.termijnen).length) {
      logWijziging(d, "project_meta", oud ? { ...oud, id: projectId } : null, { ...nieuw, id: projectId });
    }
    all[projectId] = nieuw;
  });
}

export async function loadGeschiedenis(opties: GeschiedenisOpties = {}): Promise<GeschiedenisRegel[]> {
  // Oude demo-regels (zonder tabel) overslaan
  let regels = (read().audit as GeschiedenisRegel[]).filter((r) => r && typeof r.tabel === "string");
  if (opties.voor) regels = regels.filter((r) => r.tijd < opties.voor!);
  if (opties.recordId) regels = regels.filter((r) => hoortBijWerk(r, opties.recordId!));
  return regels.slice(0, opties.limit ?? 300);
}

const DEMO_DOC_MSG = "Documentupload is niet beschikbaar in de demo-omgeving.";

export async function listProjectDocuments(_projectId: string): Promise<ProjectDocument[]> {
  return [];
}

export async function uploadProjectDocument(_projectId: string, _file: File): Promise<ProjectDocument> {
  throw new Error(DEMO_DOC_MSG);
}

export async function projectDocumentUrl(_pad: string): Promise<string> {
  throw new Error(DEMO_DOC_MSG);
}

export async function deleteProjectDocument(_doc: ProjectDocument): Promise<void> {
  throw new Error(DEMO_DOC_MSG);
}

export async function loadPersonalNotes(): Promise<PersonalNote[]> {
  const d = read();
  return [...(d.notes as PersonalNote[])].sort((a, b) => (a.datum < b.datum ? 1 : -1));
}

export async function savePersonalNote(
  _ownerId: string,
  datum: string,
  tekst: string,
  id?: string,
): Promise<PersonalNote> {
  const note: PersonalNote = { id: id ?? `note-${Date.now()}-${Math.round(Math.random() * 1e6)}`, datum, tekst };
  mutate((d) => {
    const notes = d.notes as PersonalNote[];
    const i = notes.findIndex((n) => n.id === note.id);
    if (i >= 0) notes[i] = note;
    else notes.unshift(note);
  });
  return note;
}

export async function deletePersonalNote(id: string): Promise<void> {
  mutate((d) => {
    d.notes = (d.notes as PersonalNote[]).filter((n) => n.id !== id);
  });
}

// ===== Taken per werk (demo: lokale opslag) =====
const TAKEN_KEY = "maasmond-demo-taken";

function readTaken(): Taak[] {
  try {
    const raw = localStorage.getItem(TAKEN_KEY);
    return raw ? (JSON.parse(raw) as Taak[]) : [];
  } catch {
    return [];
  }
}
function writeTaken(list: Taak[]) {
  try { localStorage.setItem(TAKEN_KEY, JSON.stringify(list)); } catch { /* opslag vol */ }
}

export async function listTaken(projectId: string): Promise<Taak[]> {
  return sorteerTaken(readTaken().filter((t) => t.projectId === projectId));
}

export async function listTakenForProjects(projectIds: string[]): Promise<Map<string, Taak[]>> {
  const out = new Map<string, Taak[]>();
  if (!projectIds.length) return out;
  const wanted = new Set(projectIds);
  sorteerTaken(readTaken()).forEach((t) => {
    if (!wanted.has(t.projectId)) return;
    const list = out.get(t.projectId);
    if (list) list.push(t);
    else out.set(t.projectId, [t]);
  });
  return out;
}

export async function saveTaak(taak: Taak): Promise<Taak> {
  const saved: Taak = { ...taak, id: taak.id || `taak-${Date.now()}-${Math.round(Math.random() * 1e6)}` };
  const list = readTaken();
  const i = list.findIndex((t) => t.id === saved.id);
  if (i >= 0) list[i] = saved; else list.push(saved);
  writeTaken(list);
  return saved;
}

export async function deleteTaak(id: string): Promise<void> {
  writeTaken(readTaken().filter((t) => t.id !== id));
}
