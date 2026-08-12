// Querylaag voor "Openstaande werken".
// Dezelfde interface kan later een IndexedDB-cursor of Supabase-pagination gebruiken;
// de UI gaat er niet van uit dat alle projecten als één array in geheugen staan.
import type { ProjectIndex, ProjectRecord } from "./project-index";

export interface OpenProjectsQuery {
  search?: string;
  afdelingen?: string[];
  offset?: number;
  limit?: number;
}

export interface OpenProjectsResult<P> {
  items: P[];
  /** Alleen aanwezig wanneer het tellen goedkoop kon (scan volledig afgerond). */
  total?: number;
  hasMore: boolean;
}

export type OpenProjectsProvider<P> = (query: OpenProjectsQuery) => Promise<OpenProjectsResult<P>>;

export const OPEN_PROJECTS_LIMIT = 100;
/** Bovengrens voor de scan: nooit meer records aanraken dan nodig om de pagina te vullen. */
const SCAN_CAP = 5000;

export interface OpenProjectsOptions<P extends ProjectRecord> {
  index: ProjectIndex<P>;
  /** Goedkope zichtbaarheidscontrole (bijv. status "Afgerond" verbergt een werk). */
  isHidden: (p: P) => boolean;
  getAfdelingen: (p: P) => string[];
}

/**
 * In-memory implementatie bovenop de centrale projectindex.
 * Stopt zodra de gevraagde pagina gevuld is: er worden nooit duizenden
 * projectviewmodels vooraf opgebouwd.
 */
export function createIndexOpenProjectsProvider<P extends ProjectRecord>(
  opts: OpenProjectsOptions<P>,
): OpenProjectsProvider<P> {
  return async ({ search = "", afdelingen = [], offset = 0, limit = OPEN_PROJECTS_LIMIT }) => {
    const q = search.trim().toLowerCase();
    const order = opts.index.getOrder();
    const items: P[] = [];
    let matches = 0;
    let hasMore = false;
    let scanned = 0;
    let complete = true;

    for (const id of order) {
      const p = opts.index.getProjectById(id);
      if (!p) continue;
      if (++scanned > SCAN_CAP && items.length >= limit) {
        complete = false;
        hasMore = true;
        break;
      }
      if (opts.isHidden(p)) continue;
      if (afdelingen.length) {
        const afds = opts.getAfdelingen(p);
        if (!afds.some((a) => afdelingen.includes(a))) continue;
      }
      if (q && !opts.index.getProjectSearchText(p.id).includes(q)) continue;
      matches++;
      if (matches <= offset) continue;
      if (items.length < limit) items.push(p);
      else {
        hasMore = true;
        // Doorlopen om te kunnen tellen, maar nooit meer objecten opbouwen.
        if (matches > offset + limit + SCAN_CAP) {
          complete = false;
          break;
        }
      }
    }

    return { items, total: complete ? matches : undefined, hasMore };
  };
}
