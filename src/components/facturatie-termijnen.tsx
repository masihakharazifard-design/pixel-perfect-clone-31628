// Termijnoverzicht per werk. Wordt zowel in ProjectDetail als in de
// Facturatie-lijst gebruikt.
//
// BELANGRIJK: wanneer `meta` als prop is meegegeven (Facturatie-lijst, één
// gebundelde batch-read per pagina) doet deze component GEEN eigen
// loadProjectMeta bij mount. Alleen in ProjectDetail, waar geen vooraf
// geladen meta beschikbaar is, blijft de individuele load bestaan.
import { useEffect, useState } from "react";
import { EMPTY_META, loadProjectMeta, saveProjectMeta, type ProjectMeta } from "@/lib/store";

const TERMIJNEN = ["Eerste termijn", "Tweede termijn", "Derde termijn", "Vierde termijn"];

export function FacturatieTermijnen({ projectId, meta }: { projectId: string; meta?: ProjectMeta | null }) {
  const [status, setStatus] = useState<Record<string, boolean>>(() => meta?.termijnen || {});

  useEffect(() => {
    if (meta !== undefined) {
      setStatus(meta?.termijnen || {});
      return;
    }
    let cancelled = false;
    loadProjectMeta(projectId)
      .then((m) => {
        if (!cancelled && m) setStatus(m.termijnen || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, meta]);

  const toggle = (key: string) => {
    setStatus((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      void loadProjectMeta(projectId)
        .then((m) => saveProjectMeta(projectId, { ...EMPTY_META, ...(m || {}), termijnen: next }))
        .catch(() => {});
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {TERMIJNEN.map((t, i) => {
        const key = `${projectId}-${i}`;
        const betaald = !!status[key];
        return (
          <div
            key={i}
            className="flex items-center gap-4 p-4 border border-[rgba(26,39,68,0.08)] rounded-xl bg-white"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${betaald ? "bg-[#0ABFB8] text-white" : "bg-[#E8EDF5] text-[#1A2744]"}`}
            >
              {i + 1}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#1A2744]">{t}</p>
              <p className="text-xs text-[#6B7A99] mt-0.5">{betaald ? "Betaald" : "Nog niet gefactureerd"}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-all border ${betaald ? "bg-[#E6F9F8] text-[#0ABFB8] border-[#0ABFB8]" : "bg-[#E8EDF5] text-[#6B7A99] border-transparent hover:border-[#6B7A99]"}`}
            >
              {betaald ? "✓ Betaald" : "Open"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default FacturatieTermijnen;
