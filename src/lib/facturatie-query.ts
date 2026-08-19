// Querylaag voor Facturatie.
// De UI krijgt nooit de volledige projectenlijst: filters en sortering worden
// globaal over de dataset toegepast en pas daarna wordt een pagina (max 50)
// afgesneden. Er is bewust GEEN scan-cap: elk opgeslagen werk blijft vindbaar,
// filterbaar en sorteerbaar. Dezelfde interface kan later een IndexedDB-cursor
// of Supabase-pagination gebruiken.
import type { ProjectIndex, ProjectRecord } from "./project-index";

export type FacturatieSortField = "werknummer" | "projectnaam" | "opdrachtgever" | "status";
export type SortDirection = "asc" | "desc";

export interface FacturatieItem {
  id: string;
  werknummer: string;
  projectnr: string;
  projectnaam: string;
  opdrachtgever: string;
  calculator: string;
  afdeling: string;
  status: string;
}

export interface FacturatieQuery {
  search?: string;
  status?: string;
  sortField?: FacturatieSortField;
  sortDirection?: SortDirection;
  offset?: number;
  limit?: number;
}

export interface FacturatieSummary {
  /** Aantal werken dat aan de huidige filters voldoet. */
  aantal: number;
  /** Aantal werken per status (één lineaire pass, geen aparte scans). */
  perStatus: Record<string, number>;
  /** Nog te factureren = alles wat niet de status "Gefactureerd" heeft. */
  teFactureren: number;
  gefactureerd: number;
}

export interface FacturatieResult {
  items: FacturatieItem[];
  total: number;
  hasMore: boolean;
  summary: FacturatieSummary;
}

export type FacturatieProvider = (query: FacturatieQuery) => Promise<FacturatieResult>;

export const FACTURATIE_PAGE_SIZE = 50;

export interface FacturatieProviderOptions<P extends ProjectRecord> {
  index: ProjectIndex<P>;
  toItem: (p: P) => FacturatieItem;
}

const collator = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });

function sortValue(item: FacturatieItem, field: FacturatieSortField): string {
  switch (field) {
    case "projectnaam":
      return item.projectnaam || "";
    case "opdrachtgever":
      return item.opdrachtgever || "";
    case "status":
      return item.status || "";
    default:
      return item.werknummer || item.projectnr || "";
  }
}

/**
 * In-memory implementatie bovenop de centrale projectindex.
 * Resultaten worden gecached op (indexversie + filters + sortering), zodat
 * bladeren, hoveren of een modal openen géén nieuwe scan of sortering start.
 */
export function createIndexFacturatieProvider<P extends ProjectRecord>(
  opts: FacturatieProviderOptions<P>,
): FacturatieProvider {
  let cacheKey = "";
  let cached: { rows: FacturatieItem[]; summary: FacturatieSummary } | null = null;

  const build = (search: string, status: string, sortField: FacturatieSortField, dir: SortDirection) => {
    const rows: FacturatieItem[] = [];
    const perStatus: Record<string, number> = {};
    let gefactureerd = 0;
    // Eén lineaire pass: filteren én alle totalen tegelijk bepalen.
    for (const id of opts.index.getOrder()) {
      const p = opts.index.getProjectById(id);
      if (!p) continue;
      if (status && String(p.status || "") !== status) continue;
      if (search && !opts.index.getProjectSearchText(id).includes(search)) continue;
      const item = opts.toItem(p);
      rows.push(item);
      const st = item.status || "Onbekend";
      perStatus[st] = (perStatus[st] || 0) + 1;
      if (st === "Gefactureerd") gefactureerd++;
    }
    rows.sort((a, b) => {
      const r = collator.compare(sortValue(a, sortField), sortValue(b, sortField));
      return dir === "desc" ? -r : r;
    });
    return {
      rows,
      summary: { aantal: rows.length, perStatus, teFactureren: rows.length - gefactureerd, gefactureerd },
    };
  };

  return async ({
    search = "",
    status = "",
    sortField = "werknummer",
    sortDirection = "asc",
    offset = 0,
    limit = FACTURATIE_PAGE_SIZE,
  }) => {
    const q = search.trim().toLowerCase();
    const key = [opts.index.getVersion(), q, status, sortField, sortDirection].join("|");
    if (key !== cacheKey || !cached) {
      cached = build(q, status, sortField, sortDirection);
      cacheKey = key;
    }
    const { rows, summary } = cached;
    const start = Math.max(0, offset);
    // Alleen de zichtbare pagina gaat naar React.
    const items = rows.slice(start, start + limit);
    return { items, total: rows.length, hasMore: start + items.length < rows.length, summary };
  };
}
