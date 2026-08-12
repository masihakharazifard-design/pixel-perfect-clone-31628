// Centrale projectindex: incrementeel bij te werken én observeerbaar voor React.
// De index leeft op applicatieniveau en wordt NIET opnieuw opgebouwd wanneer een
// scherm (bijv. Personeelsplanning) wordt geopend.
import { useSyncExternalStore } from "react";

export interface ProjectRecord {
  id: string;
  werknummer?: string;
  projectnr?: string;
  projectnaam?: string;
  werkzaamheden?: string;
  projectleider?: string;
  opdrachtgever?: string;
  status?: string;
}

/** Eén genormaliseerde zoektekst per project (wordt nooit tijdens het typen opnieuw gebouwd). */
function searchTextOf(p: ProjectRecord): string {
  return [p.werknummer, p.projectnr, p.projectnaam, p.werkzaamheden, p.projectleider, p.opdrachtgever]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export interface ProjectIndex<P extends ProjectRecord> {
  getProjectById(id: string | undefined | null): P | undefined;
  getProjectByProjectNr(nr: string | undefined | null): P | undefined;
  /** Werknummer is GEEN unieke sleutel: dit kan meerdere werken opleveren. */
  getProjectsByWerknummer(wn: string | undefined | null): P[];
  getProjectSearchText(id: string): string;
  /** Stabiele basisvolgorde (invoegvolgorde); wordt nooit per render opnieuw gesorteerd. */
  getOrder(): readonly string[];
  count(): number;
  updateProjectIndex(project: P): void;
  removeProjectFromIndex(id: string): void;
  /** Alleen na bulkacties (eerste load, Excel-import): één herindexering + één notificatie. */
  rebuildProjectIndex(projects: P[]): void;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
}

export function createProjectIndex<P extends ProjectRecord>(): ProjectIndex<P> {
  const byId = new Map<string, P>();
  const byNr = new Map<string, P>();
  const byWerknummer = new Map<string, string[]>();
  const searchIndex = new Map<string, string>();
  let order: string[] = [];
  let version = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    version++;
    listeners.forEach((l) => l());
  };
  const nrKey = (nr?: string | null) => (nr ? String(nr).trim().toLowerCase() : "");
  const wnKey = (wn?: string | null) => (wn ? String(wn).trim().toLowerCase() : "");
  const dropWerknummer = (wn: string | undefined, id: string) => {
    const key = wnKey(wn);
    if (!key) return;
    const list = byWerknummer.get(key);
    if (!list) return;
    const next = list.filter((x) => x !== id);
    if (next.length) byWerknummer.set(key, next);
    else byWerknummer.delete(key);
  };

  const setEntry = (p: P) => {
    const prev = byId.get(p.id);
    if (prev) {
      const prevNr = nrKey(prev.projectnr);
      if (prevNr && byNr.get(prevNr)?.id === p.id) byNr.delete(prevNr);
      dropWerknummer(prev.werknummer, p.id);
    } else {
      order.push(p.id);
    }
    byId.set(p.id, p);
    const nr = nrKey(p.projectnr);
    if (nr) byNr.set(nr, p);
    const wn = wnKey(p.werknummer);
    if (wn) {
      const list = byWerknummer.get(wn);
      if (list) { if (!list.includes(p.id)) list.push(p.id); }
      else byWerknummer.set(wn, [p.id]);
    }
    searchIndex.set(p.id, searchTextOf(p));
  };

  return {
    getProjectById: (id) => (id ? byId.get(id) : undefined),
    getProjectByProjectNr: (nr) => {
      const key = nrKey(nr);
      return key ? byNr.get(key) : undefined;
    },
    getProjectsByWerknummer(wn) {
      const key = wnKey(wn);
      if (!key) return [];
      return (byWerknummer.get(key) ?? []).map((id) => byId.get(id)).filter((p): p is P => !!p);
    },
    getProjectSearchText: (id) => searchIndex.get(id) ?? "",
    getOrder: () => order,
    count: () => byId.size,
    updateProjectIndex(project) {
      setEntry(project);
      notify();
    },
    removeProjectFromIndex(id) {
      const prev = byId.get(id);
      if (!prev) return;
      const nr = nrKey(prev.projectnr);
      if (nr && byNr.get(nr)?.id === id) byNr.delete(nr);
      dropWerknummer(prev.werknummer, id);
      byId.delete(id);
      searchIndex.delete(id);
      order = order.filter((x) => x !== id);
      notify();
    },
    rebuildProjectIndex(projects) {
      byId.clear();
      byNr.clear();
      byWerknummer.clear();
      searchIndex.clear();
      order = [];
      projects.forEach(setEntry);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}

/** React-safe lezen: componenten hertekenen alleen na een echte indexwijziging. */
export function useProjectIndexVersion<P extends ProjectRecord>(index: ProjectIndex<P>): number {
  return useSyncExternalStore(index.subscribe, index.getVersion, index.getVersion);
}
