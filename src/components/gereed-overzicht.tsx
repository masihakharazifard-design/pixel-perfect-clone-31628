import { useEffect, useState } from "react";
import { Camera, Flag, Loader2 } from "lucide-react";
import { gereedFotoUrl, intrekGereed, loadGereed, type GereedMelding } from "@/lib/store";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-gate";

// Dashboard: dagfoto's en gereedmeldingen (hele werk klaar) van de afgelopen twee weken.
// De database geeft alleen meldingen van werken waar je projectleider van bent (de beheerder ziet alles).
const pad = (n: number) => String(n).padStart(2, "0");
const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function GereedOverzicht({ werkNaam, naamVan }: { werkNaam: (id: string) => string; naamVan: (id: string) => string }) {
  const [lijst, setLijst] = useState<(GereedMelding & { url?: string })[] | null>(null);
  const { roles, rechten } = useAuth();
  // Gereedmelding intrekken (bijv. als er toch nog werk moet gebeuren); de schilder kan daarna opnieuw gereed melden
  const trekIn = async (g: GereedMelding) => {
    if (!window.confirm(`Gereedmelding van ${werkNaam(g.projectId) || "dit werk"} intrekken?`)) return;
    try { await intrekGereed(g); setLijst((l) => (l || []).filter((x) => x.id !== g.id)); }
    catch (e) { toast.error(`Intrekken lukte niet: ${e instanceof Error ? e.message : String(e)}`); }
  };
  useEffect(() => {
    let weg = false;
    const tot = ds(new Date()), d = new Date(); d.setDate(d.getDate() - 14);
    loadGereed(ds(d), tot)
      .then(async (l) => {
        const eerste = [...l.filter((g) => g.soort === "gereed"), ...l.filter((g) => g.soort !== "gereed")].slice(0, 24);
        const urls = await Promise.all(eerste.map((g) => (g.fotoPad ? gereedFotoUrl(g.fotoPad).catch(() => "") : Promise.resolve(""))));
        if (!weg) setLijst(eerste.map((g, i) => ({ ...g, url: urls[i] || undefined })));
      })
      .catch(() => { if (!weg) setLijst([]); });
    return () => { weg = true; };
  }, []);

  if (lijst && lijst.length === 0) return null;
  return <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
    <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(15,23,42,0.06)]">
      <h3 className="text-base leading-[22px] font-semibold text-[#23272F]">Dagfoto's en gereedmeldingen{lijst ? <span className="ml-1.5 text-xs font-medium text-[#5F6673]">({lijst.length})</span> : null}</h3>
      <p className="text-xs text-[#5F6673] mt-0.5">{roles.includes("beheerder") ? "Van alle werken (je bent beheerder)." : "Van de werken waar jij projectleider bent."}</p>
    </div>
    {!lijst ? <p className="px-5 py-6 flex items-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Laden…</p>
      : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
        {lijst.map((g) => <a key={g.id} href={g.url || undefined} target="_blank" rel="noopener noreferrer" className={`block rounded-[12px] overflow-hidden border ${g.soort === "gereed" ? "border-[#16774A] ring-1 ring-[#16774A]/40" : "border-[rgba(15,23,42,0.08)] hover:border-[#1E3A7B]"}`}>
          {g.url ? <img src={g.url} alt={`Foto van ${werkNaam(g.projectId)}`} loading="lazy" className="w-full aspect-[4/3] object-cover bg-[#F4F6F9]" />
            : <div className="w-full aspect-[4/3] bg-[#D9F4E5] flex flex-col items-center justify-center gap-1 text-[#16774A]"><Flag className="w-6 h-6" /><span className="text-sm font-semibold">Werk gereed</span></div>}
          <div className="px-2.5 py-2">
            <p className="text-xs font-semibold text-[#23272F] truncate">{werkNaam(g.projectId) || "Werk"}</p>
            <p className="text-xs text-[#5F6673] truncate flex items-center gap-1">{g.soort === "gereed" ? <Flag className="w-3.5 h-3.5 text-[#16774A] shrink-0" aria-label="Werk gereed" /> : <Camera className="w-3.5 h-3.5 text-[#5F6673] shrink-0" aria-label="Dagfoto" />}{naamVan(g.employeeId)} · {new Date(g.datum + "T12:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</p>
            {g.opmerking && <p className="text-xs text-[#5F6673] truncate">{g.opmerking}</p>}
            {g.soort === "gereed" && rechten.plannen && <button onClick={(e) => { e.preventDefault(); void trekIn(g); }} className="mt-1 text-xs font-semibold text-[#A42A1E] hover:underline">Intrekken</button>}
          </div>
        </a>)}
      </div>}
  </div>;
}
