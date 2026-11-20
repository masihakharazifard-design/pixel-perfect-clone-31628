import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { gereedFotoUrl, loadGereed, type GereedMelding } from "@/lib/store";

// Dashboard: gereedmeldingen van de afgelopen twee weken, met de foto die de schilder heeft gemaakt.
const pad = (n: number) => String(n).padStart(2, "0");
const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function GereedOverzicht({ werkNaam, naamVan }: { werkNaam: (id: string) => string; naamVan: (id: string) => string }) {
  const [lijst, setLijst] = useState<(GereedMelding & { url?: string })[] | null>(null);
  useEffect(() => {
    let weg = false;
    const tot = ds(new Date()), d = new Date(); d.setDate(d.getDate() - 14);
    loadGereed(ds(d), tot)
      .then(async (l) => {
        const eerste = l.slice(0, 24);
        const urls = await Promise.all(eerste.map((g) => gereedFotoUrl(g.fotoPad).catch(() => "")));
        if (!weg) setLijst(eerste.map((g, i) => ({ ...g, url: urls[i] || undefined })));
      })
      .catch(() => { if (!weg) setLijst([]); });
    return () => { weg = true; };
  }, []);

  if (lijst && lijst.length === 0) return null;
  return <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
    <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(15,23,42,0.06)]">
      <h3 className="text-base leading-[22px] font-semibold text-[#23272F]">Gereed gemeld{lijst ? <span className="ml-1.5 text-xs font-medium text-[#5F6673]">({lijst.length})</span> : null}</h3>
    </div>
    {!lijst ? <p className="px-5 py-6 flex items-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Laden…</p>
      : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
        {lijst.map((g) => <a key={g.id} href={g.url} target="_blank" rel="noopener noreferrer" className="block rounded-[12px] overflow-hidden border border-[rgba(15,23,42,0.08)] hover:border-[#1E3A7B]">
          {g.url ? <img src={g.url} alt={`Foto van ${werkNaam(g.projectId)}`} loading="lazy" className="w-full aspect-[4/3] object-cover bg-[#F4F6F9]" />
            : <div className="w-full aspect-[4/3] bg-[#F4F6F9]" />}
          <div className="px-2.5 py-2">
            <p className="text-xs font-semibold text-[#23272F] truncate">{werkNaam(g.projectId) || "Werk"}</p>
            <p className="text-xs text-[#5F6673] truncate flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-[#16774A] shrink-0" />{naamVan(g.employeeId)} · {new Date(g.datum + "T12:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</p>
            {g.opmerking && <p className="text-xs text-[#5F6673] truncate">{g.opmerking}</p>}
          </div>
        </a>)}
      </div>}
  </div>;
}
