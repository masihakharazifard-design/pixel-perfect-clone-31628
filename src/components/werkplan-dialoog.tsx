import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { DEMO_MODE } from "@/lib/demo-mode";
import { useAuth } from "@/components/auth-gate";
import { uploadWerkplanPdf } from "@/lib/store";
import { downloadBlob, logoDataUrl, maakWerkplanPdf, werkplanBestandsnaam, type WerkplanWerk } from "@/lib/werkplan-pdf";
import maasmondLogo from "@/assets/maasmond-logo.jpg";
import { stuurWerkplan } from "@/lib/werkbon.functions";

// Werkplan per medewerker voor een periode: als pdf downloaden of (met pdf-link) naar de medewerker mailen.

export interface WpMedewerker { id: string; naam: string; email?: string; afdeling?: string }
export interface WpPlanRegel { employeeId: string; date: string; startTime: string; endTime: string; status: string; projectId?: string }
export interface WpWerkInfo { werk: string; werknummer?: string; opdrachtgever?: string; adres?: string; projectleider?: string; opmerking?: string; startdatum?: string; opleverdatum?: string; omschrijving?: string }

const invoer = "px-3 py-2 text-sm border border-[rgba(15,23,42,0.15)] rounded-[10px] bg-white text-[#23272F] outline-none focus:border-[#1E3A7B]";

const vandaagDs = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dagKort = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });

/** Gegevens van één werk voor de werkbon-pdf, met de planning (wie wanneer) uit de ingeplande regels. */
export function werkbonVoorWerk(pid: string, availability: WpPlanRegel[], naamVan: (id: string) => string, info: (pid: string) => WpWerkInfo, behandeldDoor?: string): WerkplanWerk {
  const i = info(pid);
  const perDag = new Map<string, Set<string>>();
  availability.filter((a) => a.projectId === pid && a.status === "Ingepland").forEach((a) => {
    perDag.set(a.date, (perDag.get(a.date) || new Set()).add(naamVan(a.employeeId)));
  });
  const dagen = [...perDag.keys()].sort();
  const mensen = [...new Set(dagen.flatMap((d) => [...perDag.get(d)!]))].filter(Boolean);
  return {
    werknummer: i.werknummer, opdrachtgever: i.opdrachtgever, werkadres: i.adres, projectleider: i.projectleider,
    uitvoeringDoor: mensen.join(", "), startdatum: i.startdatum || dagen[0], opleverdatum: i.opleverdatum || dagen[dagen.length - 1],
    omschrijving: i.omschrijving, bijzonderheden: i.opmerking,
    planning: dagen.slice(0, 7).map((d) => `${dagKort(d)}: ${[...perDag.get(d)!].join(", ")}`).concat(dagen.length > 7 ? [`… en nog ${dagen.length - 7} dagen`] : []),
    invuldatum: vandaagDs(), behandeldDoor,
  };
}

/** De werken waarop een medewerker in de periode staat, als werkbonnen (één per werk). */
export function werkbonWerken(availability: WpPlanRegel[], employeeId: string, van: string, tot: string, info: (pid: string) => WpWerkInfo, naamVan: (id: string) => string = () => "", behandeldDoor?: string): WerkplanWerk[] {
  const pids: string[] = [];
  availability
    .filter((a) => a.employeeId === employeeId && a.status === "Ingepland" && a.projectId && a.date >= van && a.date <= tot)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((a) => { if (!pids.includes(a.projectId!)) pids.push(a.projectId!); });
  return pids.map((pid) => werkbonVoorWerk(pid, availability, naamVan, info, behandeldDoor));
}

export default function WerkplanDialoog({ employees, availability, info, van: van0, tot: tot0, onSluit }: {
  employees: WpMedewerker[]; availability: WpPlanRegel[]; info: (pid: string) => WpWerkInfo;
  van: string; tot: string; bedrijf?: string; onSluit: () => void;
}) {
  const [van, setVan] = useState(van0);
  const [tot, setTot] = useState(tot0);
  const metPlanning = useMemo(() => {
    const ids = new Set(availability.filter((a) => a.status === "Ingepland" && a.projectId && a.date >= van && a.date <= tot).map((a) => a.employeeId));
    return employees.filter((e) => ids.has(e.id)).sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  }, [employees, availability, van, tot]);
  const [gekozen, setGekozen] = useState<Set<string>>(() => new Set());
  const [bezig, setBezig] = useState<"" | "pdf" | "mail">("");
  const [logo, setLogo] = useState<string>();
  useEffect(() => { void logoDataUrl(maasmondLogo).then(setLogo); }, []);
  const lijst = metPlanning.filter((e) => gekozen.has(e.id));
  const wissel = (id: string) => setGekozen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const { user } = useAuth();
  const naamVan = (id: string) => employees.find((x) => x.id === id)?.naam || "";
  const pdfVan = (e: WpMedewerker) => maakWerkplanPdf(werkbonWerken(availability, e.id, van, tot, info, naamVan, String(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "")), logo);

  const downloaden = () => {
    setBezig("pdf");
    try { lijst.forEach((e) => downloadBlob(pdfVan(e), werkplanBestandsnaam(e.naam, van, tot))); }
    finally { setBezig(""); }
  };
  const mailen = async () => {
    setBezig("mail");
    const fouten: string[] = []; let ok = 0;
    for (const e of lijst) {
      if (!e.email) { fouten.push(`${e.naam}: geen e-mailadres`); continue; }
      if (DEMO_MODE) { ok++; continue; }
      try {
        let pdfUrl = "";
        try { pdfUrl = await uploadWerkplanPdf(e.id, werkplanBestandsnaam(e.naam, van, tot), pdfVan(e)); } catch { /* mail dan zonder pdf-link */ }
        await stuurWerkplan({ data: { employeeId: e.id, van, tot, pdfUrl: pdfUrl || undefined } });
        ok++;
      } catch (err) { fouten.push(`${e.naam}: ${err instanceof Error ? err.message : String(err)}`); }
    }
    setBezig("");
    if (fouten.length) toast.error(`Niet verstuurd – ${fouten.slice(0, 3).join("; ")}`, { duration: 10000 });
    if (ok) { toast.success(DEMO_MODE ? `Demo: ${ok} werkplan${ok === 1 ? "" : "nen"} zou${ok === 1 ? "" : "den"} nu gemaild worden.` : `${ok} werkplan${ok === 1 ? "" : "nen"} gemaild.`); onSluit(); }
  };

  return <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center" onClick={onSluit}>
    <div role="dialog" aria-label="Werkplan" onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-lg p-4 md:p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#23272F]">Werkplan</h2>
        <button onClick={onSluit} className="p-1 text-[#5F6673] hover:text-[#23272F]" aria-label="Sluiten"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-[#5F6673]">Van<input type="date" value={van} onChange={(e) => setVan(e.target.value)} className={`${invoer} w-full mt-1`} /></label>
        <label className="text-sm text-[#5F6673]">Tot en met<input type="date" value={tot} onChange={(e) => setTot(e.target.value)} className={`${invoer} w-full mt-1`} /></label>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#23272F]">Medewerkers met planning ({metPlanning.length})</p>
        {metPlanning.length > 0 && <button onClick={() => setGekozen(gekozen.size === metPlanning.length ? new Set() : new Set(metPlanning.map((e) => e.id)))} className="text-xs text-[#1E3A7B] font-semibold">{gekozen.size === metPlanning.length ? "Niemand" : "Iedereen"}</button>}
      </div>
      <div className="border border-[rgba(15,23,42,0.1)] rounded-[10px] divide-y divide-[rgba(15,23,42,0.05)] max-h-64 overflow-y-auto">
        {metPlanning.map((e) => <label key={e.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[#F4F6F9]">
          <input type="checkbox" checked={gekozen.has(e.id)} onChange={() => wissel(e.id)} className="accent-[#1E3A7B]" />
          <span className="flex-1 min-w-0"><span className="block text-sm text-[#23272F] truncate">{e.naam}</span>
            <span className={`block text-xs truncate ${e.email ? "text-[#5F6673]" : "text-[#A42A1E]"}`}>{e.email || "Geen e-mailadres"}</span></span>
        </label>)}
        {metPlanning.length === 0 && <p className="px-3 py-4 text-sm text-[#5F6673]">Niemand is in deze periode ingepland.</p>}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button disabled={!lijst.length || !!bezig} onClick={downloaden} className="px-3 py-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] text-[#23272F] hover:bg-[#F4F6F9] disabled:opacity-50 flex items-center gap-1.5"><Download className="w-4 h-4" />Pdf downloaden</button>
        <button disabled={!lijst.length || !!bezig} onClick={() => void mailen()} className="px-3 py-2 text-sm rounded-[10px] bg-[#1E3A7B] text-white hover:bg-[#172E63] disabled:opacity-50 flex items-center gap-1.5">{bezig === "mail" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}Mailen</button>
      </div>
    </div>
  </div>;
}
