import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Mail, Save, X } from "lucide-react";
import { toast } from "sonner";
import { DEMO_MODE } from "@/lib/demo-mode";
import { uploadWerkplanPdf } from "@/lib/store";
import { stuurWerkbon } from "@/lib/werkbon.functions";
import type { WerkbonDag } from "@/lib/werkbon";
import { downloadBlob, logoDataUrl, maakWerkplanPdf, werkplanBestandsnaam, WERKPLAN_VELDEN, type WerkplanWerk } from "@/lib/werkplan-pdf";
import maasmondLogo from "@/assets/maasmond-logo.jpg";

// Werkplan (werkbon schilder) van één werk bewerken, opslaan bij het werk, als pdf downloaden
// of (met downloadlink) mailen naar de ingeplande medewerkers.

export interface WpIngepland { id: string; naam: string; email?: string; afdeling?: string; dagen: WerkbonDag[] }
export type WerkplanAanpassingen = Partial<Record<keyof WerkplanWerk, unknown>>;

const invoer = "w-full px-3 py-2 text-sm border border-[rgba(15,23,42,0.15)] rounded-[10px] bg-white text-[#23272F] outline-none focus:border-[#1E3A7B] focus:ring-1 focus:ring-[#1E3A7B]/40";

/** Opgeslagen aanpassingen over de automatisch ingevulde gegevens heen leggen. */
export function werkplanMetAanpassingen(basis: WerkplanWerk, aanp?: WerkplanAanpassingen | null): WerkplanWerk {
  return { ...basis, ...((aanp || {}) as Partial<WerkplanWerk>) };
}

export default function WerkplanVenster({ projectId, titel, basis, opgeslagen, ingepland, projectleider, onOpslaan, onSluit }: {
  projectId: string;
  titel: string;
  basis: WerkplanWerk;
  opgeslagen?: WerkplanAanpassingen | null;
  ingepland: WpIngepland[];
  projectleider?: string;
  onOpslaan: (aanp: WerkplanAanpassingen) => Promise<void>;
  onSluit: () => void;
}) {
  const [f, setF] = useState<WerkplanWerk>(() => werkplanMetAanpassingen(basis, opgeslagen));
  const [planningTekst, setPlanningTekst] = useState(() => (werkplanMetAanpassingen(basis, opgeslagen).planning || []).join("\n"));
  const [onder, setOnder] = useState(() => {
    const l = [...(werkplanMetAanpassingen(basis, opgeslagen).onderaannemers || [])];
    while (l.length < 5) l.push({});
    return l.slice(0, 5);
  });
  const [bezig, setBezig] = useState<"" | "opslaan" | "pdf" | "mail">("");
  const [logo, setLogo] = useState<string>();
  useEffect(() => { void logoDataUrl(maasmondLogo).then(setLogo); }, []);
  const [gekozen, setGekozen] = useState<Set<string>>(() => new Set(ingepland.filter((m) => m.email && (m.afdeling ? m.afdeling === "Schilderwerk" : true)).map((m) => m.id)));
  const zet = (k: keyof WerkplanWerk, v: string) => setF((p) => ({ ...p, [k]: v }));

  const huidig = useMemo<WerkplanWerk>(() => ({
    ...f,
    planning: planningTekst.split("\n").map((s) => s.trimEnd()).filter(Boolean),
    onderaannemers: onder.filter((o) => o.bedrijf || o.contact || o.telefoon),
  }), [f, planningTekst, onder]);

  // Alleen bewaren wat afwijkt van wat de app zelf invult (dan blijft de rest automatisch actueel)
  const aanpassingen = (): WerkplanAanpassingen => {
    const a: WerkplanAanpassingen = {};
    (Object.keys(huidig) as (keyof WerkplanWerk)[]).forEach((k) => {
      if (k === "invuldatum") return;
      if (JSON.stringify(huidig[k] ?? "") !== JSON.stringify(basis[k] ?? "") && !(k === "onderaannemers" && !(huidig.onderaannemers || []).length && !basis.onderaannemers)) a[k] = huidig[k];
    });
    return a;
  };
  const opslaan = async (stil = false) => {
    setBezig("opslaan");
    try { await onOpslaan(aanpassingen()); if (!stil) toast.success("Werkplan opgeslagen."); return true; }
    catch (e) { toast.error(`Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}`); return false; }
    finally { setBezig(""); }
  };
  const pdf = () => maakWerkplanPdf([huidig], logo);
  const naam = werkplanBestandsnaam(huidig.werknummer || titel || "werk");
  const downloaden = async () => {
    if (!(await opslaan(true))) return;
    downloadBlob(pdf(), naam);
  };
  const mailen = async () => {
    const lijst = ingepland.filter((m) => gekozen.has(m.id));
    if (!lijst.length) return;
    if (!(await opslaan(true))) return;
    setBezig("mail");
    let ok = 0; const fouten: string[] = [];
    let pdfUrl = "";
    if (!DEMO_MODE) {
      try { pdfUrl = await uploadWerkplanPdf(projectId, naam, pdf()); } catch { /* dan zonder downloadlink */ }
    }
    for (const m of lijst) {
      if (!m.email) { fouten.push(`${m.naam}: geen e-mailadres`); continue; }
      if (DEMO_MODE) { ok++; continue; }
      try { await stuurWerkbon({ data: { employeeId: m.id, projectId, dagen: m.dagen, projectleider, pdfUrl: pdfUrl || undefined } }); ok++; }
      catch (e) { fouten.push(`${m.naam}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    setBezig("");
    if (fouten.length) toast.error(`Niet verstuurd – ${fouten.slice(0, 3).join("; ")}`, { duration: 10000 });
    if (ok) toast.success(DEMO_MODE ? `Demo: het werkplan zou nu naar ${ok} medewerker${ok === 1 ? "" : "s"} gemaild worden.` : `Werkplan gemaild naar ${ok} medewerker${ok === 1 ? "" : "s"}.`);
  };

  return <div className="fixed inset-0 z-[60] bg-black/30 flex items-end sm:items-center justify-center" onClick={() => !bezig && onSluit()}>
    <div role="dialog" aria-label="Werkplan" onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-lg max-h-[94vh] flex flex-col">
      <div className="px-4 md:px-5 py-3 border-b border-[rgba(15,23,42,0.08)] flex items-center justify-between gap-3">
        <div className="min-w-0"><h2 className="text-lg font-semibold text-[#23272F]">Werkplan</h2><p className="text-xs text-[#5F6673] truncate">{titel}</p></div>
        <button onClick={onSluit} className="p-1 text-[#5F6673] hover:text-[#23272F]" aria-label="Sluiten"><X className="w-5 h-5" /></button>
      </div>
      <div className="overflow-y-auto px-4 md:px-5 py-4 space-y-4">
        <p className="text-xs text-[#5F6673]">Wat de app weet staat al ingevuld. Pas aan of vul aan wat je wilt; checklists, klachten, meerwerk en oplevering blijven leeg om op locatie in te vullen.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {WERKPLAN_VELDEN.filter(([, , s]) => s !== "lang").map(([k, l, s]) => <label key={k} className="block text-sm text-[#5F6673]">{l}
            <input type={s === "datum" ? "date" : "text"} value={String(f[k] ?? "")} onChange={(e) => zet(k, e.target.value)} className={`${invoer} mt-1`} />
          </label>)}
        </div>
        {WERKPLAN_VELDEN.filter(([, , s]) => s === "lang").map(([k, l]) => <label key={k} className="block text-sm text-[#5F6673]">{l}
          <textarea rows={3} value={String(f[k] ?? "")} onChange={(e) => zet(k, e.target.value)} className={`${invoer} mt-1 resize-y`} />
        </label>)}
        <label className="block text-sm text-[#5F6673]">Planning (één regel per dag)
          <textarea rows={4} value={planningTekst} onChange={(e) => setPlanningTekst(e.target.value)} className={`${invoer} mt-1 resize-y`} />
        </label>
        <div className="space-y-1.5">
          <p className="text-sm text-[#5F6673]">Onderaannemers</p>
          {onder.map((o, i) => <div key={i} className="grid grid-cols-3 gap-2">
            {(["bedrijf", "contact", "telefoon"] as const).map((k) => <input key={k} value={o[k] || ""} placeholder={k === "bedrijf" ? "Bedrijf" : k === "contact" ? "Contactpersoon" : "Telefoon"}
              onChange={(e) => setOnder((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} className={invoer} />)}
          </div>)}
        </div>
        <div className="space-y-1.5 border-t border-[rgba(15,23,42,0.08)] pt-3">
          <p className="text-sm font-semibold text-[#23272F]">Mailen naar ingeplande medewerkers</p>
          {ingepland.length === 0 && <p className="text-sm text-[#5F6673]">Op dit werk is nog niemand ingepland.</p>}
          {ingepland.map((m) => <label key={m.id} className="flex items-center gap-3 py-1 cursor-pointer">
            <input type="checkbox" checked={gekozen.has(m.id)} disabled={!m.email} onChange={() => setGekozen((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} className="accent-[#1E3A7B]" />
            <span className="flex-1 min-w-0 text-sm text-[#23272F] truncate">{m.naam}{m.afdeling ? <span className="text-[#5F6673]"> · {m.afdeling}</span> : null}</span>
            <span className={`text-xs truncate ${m.email ? "text-[#5F6673]" : "text-[#A42A1E]"}`}>{m.email || "geen e-mailadres"}</span>
          </label>)}
        </div>
      </div>
      <div className="px-4 md:px-5 py-3 border-t border-[rgba(15,23,42,0.08)] flex flex-wrap justify-end gap-2">
        <button disabled={!!bezig} onClick={() => void opslaan()} className="px-3 py-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] text-[#23272F] hover:bg-[#F4F6F9] disabled:opacity-50 flex items-center gap-1.5">{bezig === "opslaan" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Opslaan</button>
        <button disabled={!!bezig} onClick={() => void downloaden()} className="px-3 py-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] text-[#23272F] hover:bg-[#F4F6F9] disabled:opacity-50 flex items-center gap-1.5"><Download className="w-4 h-4" />Pdf downloaden</button>
        <button disabled={!!bezig || !gekozen.size} onClick={() => void mailen()} className="px-3 py-2 text-sm rounded-[10px] bg-[#1E3A7B] text-white hover:bg-[#172E63] disabled:opacity-50 flex items-center gap-1.5">{bezig === "mail" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}Mailen{gekozen.size ? ` (${gekozen.size})` : ""}</button>
      </div>
    </div>
  </div>;
}
