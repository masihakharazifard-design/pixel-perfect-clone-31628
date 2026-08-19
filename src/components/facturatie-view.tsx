// Facturatie: volledig querygebaseerd en losgekoppeld van de globale render.
// - maximaal 50 rijen tegelijk in de DOM;
// - filters/sortering globaal in de querylaag, vóór paginering;
// - één gebundelde meta-read per pagina;
// - eigen lokale state (zoeken, filter, sortering, pagina);
// - verouderde async resultaten worden genegeerd (request-id).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadProjectMetaBatch, type ProjectMeta } from "@/lib/store";
import { FacturatieTermijnen } from "@/components/facturatie-termijnen";
import {
  FACTURATIE_PAGE_SIZE,
  type FacturatieItem,
  type FacturatieProvider,
  type FacturatieSortField,
  type FacturatieSummary,
  type SortDirection,
} from "@/lib/facturatie-query";

const DEV = import.meta.env.DEV;
const mark = (label: string, t0: number) => {
  if (DEV) console.info(`${label}: ${(performance.now() - t0).toFixed(1)}ms`);
};

const STATUSSEN = ["", "Offerte", "Bevestigd", "In uitvoering", "Afgerond", "Gefactureerd"];
const SORTS: { field: FacturatieSortField; label: string }[] = [
  { field: "werknummer", label: "Werknummer" },
  { field: "projectnaam", label: "Projectnaam" },
  { field: "opdrachtgever", label: "Opdrachtgever" },
  { field: "status", label: "Status" },
];

// Lichte rij: krijgt uitsluitend de gegevens die hij toont.
const FacturatieRow = memo(function FacturatieRow({
  item,
  accent,
  statusClass,
  meta,
  onOpen,
}: {
  item: FacturatieItem;
  accent: string;
  statusClass: string;
  meta: ProjectMeta | null;
  onOpen?: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
      <button
        type="button"
        onClick={() => onOpen?.(item.id)}
        className="w-full text-left flex items-center gap-2 px-4 md:px-5 py-3 md:py-3.5 border-b border-[rgba(26,39,68,0.06)] hover:bg-[#F7F9FC] transition-colors"
        style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
      >
        <span className="font-mono text-xs text-[#6B7A99] hidden sm:inline">{item.werknummer}</span>
        <span className="font-semibold text-[#1A2744] text-sm truncate flex-1">{item.projectnaam}</span>
        <span className="text-[#6B7A99] text-xs hidden md:inline">— {item.opdrachtgever}</span>
        <span
          className={`ml-auto flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}
        >
          {item.status}
        </span>
      </button>
      <FacturatieTermijnen projectId={item.id} meta={meta} />
    </div>
  );
});

export function FacturatieView({
  provider,
  accentOf,
  statusClassOf,
  onOpenProject,
  dataVersion = 0,
}: {
  provider: FacturatieProvider;
  accentOf: (afdeling: string) => string;
  statusClassOf: (status: string) => string;
  onOpenProject?: (id: string) => void;
  /** Verandert alleen bij een echte projectdatawijziging. */
  dataVersion?: number;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortField, setSortField] = useState<FacturatieSortField>("werknummer");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FacturatieItem[]>([]);
  const [metaMap, setMetaMap] = useState<Map<string, ProjectMeta>>(() => new Map());
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<FacturatieSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!DEV) return;
    const t0 = performance.now();
    return () => mark("Facturatie mount", t0);
  }, []);

  // Zoeken: 200 ms debounce, altijd terug naar pagina 1.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 200);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    const reqId = ++reqRef.current;
    setLoading(true);
    const t0 = performance.now();
    void (async () => {
      try {
        const res = await provider({
          search,
          status,
          sortField,
          sortDirection,
          offset: (page - 1) * FACTURATIE_PAGE_SIZE,
          limit: FACTURATIE_PAGE_SIZE,
        });
        mark("Facturatie filtering+sorting", t0);
        // Eén gebundelde meta-read voor maximaal 50 zichtbare projecten.
        const tMeta = performance.now();
        const metas = await loadProjectMetaBatch(res.items.map((i) => i.id));
        mark("Facturatie meta batch", tMeta);
        // Verouderd resultaat mag een nieuwer nooit overschrijven.
        if (cancelled || reqId !== reqRef.current) return;
        setItems(res.items);
        setMetaMap(metas);
        setTotal(res.total);
        setSummary(res.summary);
      } catch {
        if (!cancelled && reqId === reqRef.current) {
          setItems([]);
          setMetaMap(new Map());
          setTotal(0);
        }
      } finally {
        if (!cancelled && reqId === reqRef.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, search, status, sortField, sortDirection, page, dataVersion]);

  const pageCount = Math.max(1, Math.ceil(total / FACTURATIE_PAGE_SIZE));
  const curPage = Math.min(page, pageCount);

  const rows = useMemo(() => {
    const t0 = performance.now();
    const out = items.map((item) => ({
      item,
      accent: accentOf(item.afdeling),
      statusClass: statusClassOf(item.status),
      meta: metaMap.get(item.id) ?? null,
    }));
    mark("Facturatie render prep", t0);
    return out;
  }, [items, metaMap, accentOf, statusClassOf]);

  const setFilter = useCallback((s: string) => {
    setStatus(s);
    setPage(1);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Facturatie</h1>
        <p className="text-[#6B7A99] text-xs md:text-sm">Termijnoverzicht per werk</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Werken", value: summary.aantal },
            { label: "Nog te factureren", value: summary.teFactureren },
            { label: "Gefactureerd", value: summary.gefactureerd },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-[rgba(26,39,68,0.06)] px-4 py-3">
              <p className="text-xs text-[#6B7A99]">{s.label}</p>
              <p className="text-lg font-bold text-[#1A2744]">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Zoek op werknummer, projectnaam, opdrachtgever..."
          className="flex-1 px-3 py-2 rounded-lg border border-[rgba(26,39,68,0.12)] text-sm bg-white focus:outline-none focus:border-[#0ABFB8]"
        />
        <div className="flex items-center gap-2">
          <select
            value={sortField}
            onChange={(e) => {
              setSortField(e.target.value as FacturatieSortField);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-[rgba(26,39,68,0.12)] text-sm bg-white"
          >
            {SORTS.map((s) => (
              <option key={s.field} value={s.field}>
                Sorteer op {s.label.toLowerCase()}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-[rgba(26,39,68,0.12)] text-sm bg-white text-[#1A2744]"
          >
            {sortDirection === "asc" ? "A→Z" : "Z→A"}
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {STATUSSEN.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${status === s ? "bg-[#1A2744] text-white" : "bg-white border border-[rgba(26,39,68,0.1)] text-[#6B7A99] hover:bg-[#F0F3F8]"}`}
          >
            {s || "Alle"}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {rows.map((r) => (
          <FacturatieRow
            key={r.item.id}
            item={r.item}
            accent={r.accent}
            statusClass={r.statusClass}
            meta={r.meta}
            onOpen={onOpenProject}
          />
        ))}
        {!loading && rows.length === 0 && <p className="text-center text-[#6B7A99] py-12">Geen werken gevonden</p>}
      </div>

      {total > FACTURATIE_PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 py-2">
          <button
            onClick={() => setPage(Math.max(1, curPage - 1))}
            disabled={curPage <= 1}
            className="px-3 py-1.5 rounded-lg border border-[rgba(26,39,68,0.15)] bg-white text-sm text-[#1A2744] disabled:opacity-40"
          >
            Vorige
          </button>
          <span className="text-xs text-[#6B7A99]">
            Pagina {curPage} van {pageCount} · {total} werken
          </span>
          <button
            onClick={() => setPage(Math.min(pageCount, curPage + 1))}
            disabled={curPage >= pageCount}
            className="px-3 py-1.5 rounded-lg border border-[rgba(26,39,68,0.15)] bg-white text-sm text-[#1A2744] disabled:opacity-40"
          >
            Volgende
          </button>
        </div>
      )}
    </div>
  );
}

export default FacturatieView;
