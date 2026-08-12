// DEMO MODE: projecten staan altijd in IndexedDB, één record per project.
// De verbinding wordt één keer geopend en hergebruikt.
const DB_NAME = "maasmond-demo";
const DB_VERSION = 1;
const STORE = "projects";

export class DemoDbError extends Error {
  constructor(message = "De demo-opslag kon niet worden bijgewerkt.") {
    super(message);
    this.name = "DemoDbError";
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDemoDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new DemoDbError("IndexedDB is niet beschikbaar in deze browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("projectnr", "projectnr", { unique: false });
        store.createIndex("werknummer", "werknummer", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new DemoDbError());
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

type Row = { id: string } & Record<string, unknown>;

/** Eén transactie afronden; resolve pas bij complete, reject bij abort/error. */
function runTx(db: IDBDatabase, work: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
    } catch {
      reject(new DemoDbError());
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new DemoDbError());
    tx.onerror = () => reject(new DemoDbError());
    try {
      // Alle requests worden binnen dezelfde transactie gequeued, zonder yields.
      work(tx.objectStore(STORE));
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* transactie al beëindigd */
      }
      reject(e instanceof DemoDbError ? e : new DemoDbError());
    }
  });
}

/** Volledige projectdataset in één getAll(). */
export async function loadDemoProjects<T extends { id: string }>(): Promise<T[]> {
  const db = await openDemoDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(new DemoDbError());
  });
}

export async function getDemoProject<T extends { id: string }>(id: string): Promise<T | null> {
  const db = await openDemoDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(new DemoDbError());
  });
}

/** Alleen nieuwe/gewijzigde projecten schrijven; één put per record, één transactie. */
export async function putDemoProjects(items: Row[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDemoDb();
  await runTx(db, (store) => {
    for (const item of items) store.put(item);
  });
}

export async function deleteDemoProjects(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDemoDb();
  await runTx(db, (store) => {
    for (const id of ids) store.delete(id);
  });
}

/** Alleen voor "Demo resetten": volledige dataset in één transactie vervangen. */
export async function resetDemoProjects(seed: Row[]): Promise<void> {
  const db = await openDemoDb();
  await runTx(db, (store) => {
    store.clear();
    for (const item of seed) store.put(item);
  });
}
