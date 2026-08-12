// Openstaande werken: zelfstandige, gememoiseerde querycomponent.
// Voert zelf de query uit (search, debounce, afdelingen, offset/limit) zodat een
// wijziging in het planning-grid (hover, drag, celklik, tijd) hier niets herberekent.
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import type { OpenProjectsProvider } from "@/lib/open-projects";
import { OPEN_PROJECTS_LIMIT } from "@/lib/open-projects";
import type { ProjectRecord } from "@/lib/project-index";

export interface OpenProjectRowData {
  title: string;
  subtitle: string;
  color: string;
  badgeStyle: React.CSSProperties;
  statusLabel: string;
  countLabel: string;
}

export interface OpenProjectsPanelProps<P extends ProjectRecord> {
  openProjectsProvider: OpenProjectsProvider<P>;
  /** Stabiele sleutel van de actieve afdelingsfilters (leeg = geen filter). */
  afdelingenKey: string;
  /** Versie van de centrale projectindex; wijzigt alleen bij echte projectwijzigingen. */
  projectVersion: number;
  /** Versie van de planningregels; wijzigt alleen bij een opgeslagen planningwijziging. */
  planningVersion: number;
  /** Zware renderdata: wordt uitsluitend voor de zichtbare resultaten opgebouwd. */
  getRowData: (project: P) => OpenProjectRowData;
  onOpen: (project: P) => void;
  onPlan: (project: P) => void;
  onDragStartProject: (id: string) => void;
  onDragEndProject: () => void;
}

const DEBOUNCE_MS = 200;

function OpenProjectsPanelInner<P extends ProjectRecord>({
  openProjectsProvider, afdelingenKey, projectVersion, planningVersion,
  getRowData, onOpen, onPlan, onDragStartProject, onDragEndProject,
}: OpenProjectsPanelProps<P>) {
  const [zoek, setZoek] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<P[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(zoek), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [zoek]);

  const afdelingen = useMemo(() => (afdelingenKey ? afdelingenKey.split("|") : []), [afdelingenKey]);

  useEffect(() => {
    const id = ++reqRef.current;
    let cancelled = false;
    void (async () => {
      const res = await openProjectsProvider({ search: query, afdelingen, offset: 0, limit: OPEN_PROJECTS_LIMIT });
      if (cancelled || id !== reqRef.current) return;
      setItems(res.items);
      setTotal(res.total);
      setHasMore(res.hasMore);
    })();
    return () => { cancelled = true; };
  }, [openProjectsProvider, query, afdelingen, projectVersion, planningVersion]);

  const countLabel = total !== undefined
    ? `${total} werk${total !== 1 ? "en" : ""} · sleep naar een cel`
    : `${OPEN_PROJECTS_LIMIT}+ werken · sleep naar een cel`;

  return <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
    <div className="px-4 py-3 border-b border-[rgba(26,39,68,0.06)] flex items-center justify-between gap-3 flex-wrap">
      <h2 className="font-bold text-[#1A2744] text-sm">Openstaande werken</h2>
      <div className="flex items-center gap-3">
        <input value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoek werk…"
          className="py-1.5 px-2.5 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg text-[#1A2744] bg-white focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50"/>
        <span className="text-xs text-[#6B7A99]">{countLabel}</span>
      </div>
    </div>
    {items.length === 0
      ? <p className="px-4 py-3 text-xs text-[#B8C3D9]">Geen openstaande werken.</p>
      : <div className="divide-y divide-[rgba(26,39,68,0.05)] max-h-80 overflow-y-auto">
        {items.map(p => {
          const row = getRowData(p);
          return <div key={p.id} draggable
            onDragStart={() => { setDragId(p.id); onDragStartProject(p.id); }}
            onDragEnd={() => { setDragId(null); onDragEndProject(); }}
            className={`flex items-center gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:bg-[#F8F9FC] ${dragId === p.id ? "opacity-50" : ""}`}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }}/>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1A2744] truncate">{row.title}</p>
              <p className="text-xs text-[#6B7A99] truncate">{row.subtitle}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0" style={row.badgeStyle}>{row.statusLabel}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0" style={row.badgeStyle}>{row.countLabel}</span>
            <button onClick={() => onOpen(p)} className="text-xs text-[#0ABFB8] font-semibold flex-shrink-0">Openen</button>
            <button onClick={() => onPlan(p)} className="text-xs text-[#6B7A99] font-semibold flex-shrink-0">Inplannen</button>
          </div>;
        })}
        {hasMore && <p className="px-4 py-2 text-xs text-[#6B7A99]">Meer dan {OPEN_PROJECTS_LIMIT} resultaten. Verfijn je zoekopdracht.</p>}
      </div>}
  </div>;
}

export const OpenProjectsPanel = memo(OpenProjectsPanelInner) as typeof OpenProjectsPanelInner;
