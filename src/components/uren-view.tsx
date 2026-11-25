import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-gate";
import { feestdagOp } from "@/lib/feestdagen";
import { berekenUren, deleteUren, loadUren, saveUren, zetUrenStatus, type UrenRegel, type UrenSoort, type UrenStatus } from "@/lib/store";

// Uren als weekstaat: per werk (werknummer) of soort een regel, per dag een vakje.
// Ingeplande uren staan gestippeld klaar en worden met één klik overgenomen. Een week gaat van
// concept → ingediend → goedgekeurd; kantoor keurt goed op het tabblad Accorderen.

export interface UrenMedewerker { id: string; naam: string; afdeling: string; contractUren?: number }
export interface UrenPlanRegel { id: string; employeeId: string; date: string; startTime: string; endTime: string; status: string; projectId?: string }
export interface UrenWerk { id: string; label: string }

const pad = (n: number) => String(n).padStart(2, "0");
const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const vandaag = () => ds(new Date());
const plus = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ds(d); };
const maandagVan = (s: string) => { const d = new Date(s + "T12:00:00"); return plus(s, -((d.getDay() + 6) % 7)); };
function weekNr(s: string): number {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
const fmt = (u: number) => u.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
/** "8", "8,5", "8.25" of "7:30" → uren (op een kwartier); leeg → 0; ongeldig → null */
export function leesUren(t: string): number | null {
  const s = t.trim().replace(",", ".");
  if (!s || s === "-") return 0;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  const v = m ? Number(m[1]) + Number(m[2]) / 60 : Number(s);
  if (!Number.isFinite(v) || v < 0 || v > 24) return null;
  return Math.round(v * 4) / 4;
}

const AFWEZIG: Record<string, string> = { Vrij: "vrij", Vakantie: "vakantie", Ziek: "ziek", "Niet beschikbaar": "afwezig" };
const SOORT_LABEL: Record<Exclude<UrenSoort, "werk">, string> = { reisuren: "Reisuren", werkplaats: "Werkplaats, overig" };
const STATUS_STIJL: Record<UrenStatus | "leeg", string> = {
  leeg: "bg-[#ECEFF4] text-[#5F6673]", concept: "bg-[#ECEFF4] text-[#475569]", ingediend: "bg-[#FDEFD3] text-[#8A5300]",
  goedgekeurd: "bg-[#D9F4E5] text-[#16774A]", afgekeurd: "bg-[#FCE1DC] text-[#A42A1E]",
};
const rijSleutel = (r: Pick<UrenRegel, "soort" | "projectId">) => (r.soort && r.soort !== "werk" ? r.soort : `werk:${r.projectId || ""}`);
function weekStatus(l: UrenRegel[]): UrenStatus | "leeg" {
  if (!l.length) return "leeg";
  const s = new Set(l.map((r) => r.status || "concept"));
  if (s.has("afgekeurd")) return "afgekeurd";
  if (s.has("concept")) return "concept";
  if ([...s].every((x) => x === "goedgekeurd")) return "goedgekeurd";
  return "ingediend";
}

export default function UrenView({ employees, availability, werkNaam, zoekWerken, eigen = false }: {
  employees: UrenMedewerker[];
  availability: UrenPlanRegel[];
  werkNaam: (id?: string | null) => string;
  zoekWerken: (q: string) => UrenWerk[];
  /** Schildersomgeving: alleen de eigen uren, geen Accorderen */
  eigen?: boolean;
}) {
  const { rechten, user } = useAuth();
  const kantoor = !eigen && rechten.kantoor;
  const magAccorderen = kantoor && rechten.urenAccorderen;
  const [tab, setTab] = useState<"uren" | "accorderen">("uren");
  const [week, setWeek] = useState(() => maandagVan(vandaag()));
  const mensen = useMemo(() => [...employees].sort((a, b) => a.naam.localeCompare(b.naam, "nl")), [employees]);
  const [mwId, setMwId] = useState(() => mensen.find((m) => m.afdeling === "Schilderwerk")?.id || mensen[0]?.id || "");
  const mw = mensen.find((m) => m.id === mwId) || mensen[0];
  const [regels, setRegels] = useState<UrenRegel[]>([]);
  const [laden, setLaden] = useState(true);
  const [concept, setConcept] = useState<Record<string, string>>({});
  const [extraRijen, setExtraRijen] = useState<string[]>([]);
  const [zoek, setZoek] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const zondag = plus(week, 6);
  const laadVan = plus(week, -28);

  const herlaad = useCallback(async () => {
    setLaden(true);
    try { setRegels(await loadUren(laadVan, zondag)); }
    catch (e) { toast.error(`Uren konden niet worden geladen: ${e instanceof Error ? e.message : String(e)}`); setRegels([]); }
    finally { setLaden(false); }
  }, [laadVan, zondag]);
  // Ook opnieuw laden bij terugkeren van Accorderen (statussen kunnen veranderd zijn)
  useEffect(() => { if (tab === "uren") void herlaad(); }, [herlaad, tab]);
  useEffect(() => { setConcept({}); setExtraRijen([]); setZoek(null); }, [week, mwId]);

  const mijnWeek = useMemo(() => regels.filter((r) => r.employeeId === mw?.id && r.datum >= week && r.datum <= zondag), [regels, mw, week, zondag]);
  const status = weekStatus(mijnWeek);
  const vergrendeld = !kantoor && (status === "ingediend" || status === "goedgekeurd");
  const plan = useMemo(() => availability.filter((a) => a.employeeId === mw?.id && a.date >= week && a.date <= zondag), [availability, mw, week, zondag]);
  const dagen = useMemo(() => {
    const alle = Array.from({ length: 7 }, (_, i) => plus(week, i));
    return alle.filter((d, i) => i < 5 || plan.some((a) => a.date === d && a.status === "Ingepland") || mijnWeek.some((r) => r.datum === d));
  }, [week, plan, mijnWeek]);

  // Ingeplande uren per werk en dag (eindtijd − begintijd − 30 min pauze)
  const gepland = useMemo(() => {
    const m = new Map<string, number>();
    plan.filter((a) => a.status === "Ingepland" && a.projectId).forEach((a) => {
      const k = `werk:${a.projectId}|${a.date}`;
      m.set(k, (m.get(k) || 0) + berekenUren(a.startTime, a.endTime, 30));
    });
    return m;
  }, [plan]);
  const afwezig = useCallback((d: string) => {
    const r = plan.find((x) => x.date === d && !x.projectId && AFWEZIG[x.status]);
    return r ? AFWEZIG[r.status] : feestdagOp(d) ? "feestdag" : "";
  }, [plan]);

  const rijen = useMemo(() => {
    const werk = new Set<string>();
    plan.forEach((a) => { if (a.status === "Ingepland" && a.projectId) werk.add(`werk:${a.projectId}`); });
    mijnWeek.forEach((r) => { if (rijSleutel(r).startsWith("werk:")) werk.add(rijSleutel(r)); });
    extraRijen.forEach((k) => werk.add(k));
    return [...werk, "reisuren", "werkplaats"];
  }, [plan, mijnWeek, extraRijen]);

  const bestaand = useCallback((rij: string, d: string) => mijnWeek.find((r) => rijSleutel(r) === rij && r.datum === d), [mijnWeek]);
  const waarde = (rij: string, d: string): string => {
    const k = `${rij}|${d}`;
    if (k in concept) return concept[k];
    const b = bestaand(rij, d);
    return b && b.uren ? fmt(b.uren) : "";
  };
  const getal = (rij: string, d: string) => leesUren(waarde(rij, d)) ?? 0;
  const rijTotaal = (rij: string) => dagen.reduce((s, d) => s + getal(rij, d), 0);
  const dagTotaal = (d: string) => rijen.reduce((s, r) => s + getal(r, d), 0);
  const weekTotaal = dagen.reduce((s, d) => s + dagTotaal(d), 0);
  const gewijzigd = Object.keys(concept).length > 0;
  const ongeldig = Object.values(concept).some((v) => leesUren(v) === null);
  const zet = (rij: string, d: string, v: string) => setConcept((c) => ({ ...c, [`${rij}|${d}`]: v }));
  const neemPlanningOver = () => {
    const n: Record<string, string> = {};
    gepland.forEach((u, k) => { const [rij, d] = k.split("|"); if (!waarde(rij, d) && d <= vandaag()) n[k] = fmt(u); });
    if (!Object.keys(n).length) { toast("Er staat geen ingeplande dag (tot en met vandaag) meer open."); return; }
    setConcept((c) => ({ ...c, ...n }));
  };

  // Opslaan: gewijzigde vakjes aanmaken, bijwerken of (leeg) verwijderen
  const opslaan = async (): Promise<UrenRegel[] | null> => {
    if (!mw) return null;
    if (ongeldig) { toast.error("Een of meer vakjes bevatten geen geldig aantal uren (bijv. 8 of 7,5)."); return null; }
    setBezig(true);
    let nu = [...regels];
    try {
      for (const [k, v] of Object.entries(concept)) {
        const [rij, d] = k.split("|");
        const u = leesUren(v) ?? 0;
        const b = nu.find((r) => r.employeeId === mw.id && rijSleutel(r) === rij && r.datum === d);
        if (u <= 0) { if (b) { await deleteUren(b.id); nu = nu.filter((r) => r.id !== b.id); } continue; }
        if (b && b.uren === u) continue;
        const soort: UrenSoort = rij.startsWith("werk:") ? "werk" : (rij as UrenSoort);
        const n = await saveUren(b
          ? { ...b, uren: u, status: b.status === "afgekeurd" ? "concept" : b.status }
          : { id: "", employeeId: mw.id, projectId: soort === "werk" ? rij.slice(5) : null, datum: d, start: "", eind: "", pauze: 0, uren: u, opmerking: "", soort, status: "concept" });
        nu = [...nu.filter((r) => r.id !== n.id), n];
      }
      setRegels(nu);
      setConcept({});
      return nu;
    } catch (e) {
      toast.error(`Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}`);
      setRegels(nu);
      return null;
    } finally { setBezig(false); }
  };
  const indienen = async () => {
    const nu = await opslaan();
    if (!nu || !mw) return;
    const ids = nu.filter((r) => r.employeeId === mw.id && r.datum >= week && r.datum <= zondag && (r.status === "concept" || r.status === "afgekeurd" || !r.status)).map((r) => r.id);
    if (!ids.length) { toast("Er zijn deze week geen uren om in te dienen."); return; }
    setBezig(true);
    try { await zetUrenStatus(ids, "ingediend"); setRegels((c) => c.map((r) => (ids.includes(r.id) ? { ...r, status: "ingediend" } : r))); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBezig(false); }
  };

  // Overzicht van de afgelopen weken (rechts)
  const weken = useMemo(() => [0, 1, 2, 3].map((i) => {
    const m = plus(week, -7 * i), z = plus(m, 6);
    const l = regels.filter((r) => r.employeeId === mw?.id && r.datum >= m && r.datum <= z);
    return { m, totaal: l.reduce((s, r) => s + r.uren, 0), status: weekStatus(l), door: l.find((r) => r.beoordeeldDoor)?.beoordeeldDoor };
  }), [regels, mw, week]);

  const exporteer = () => {
    const l = regels.filter((r) => r.datum >= week && r.datum <= zondag);
    const naam = (id: string) => employees.find((e) => e.id === id)?.naam || id;
    const rows = [["Datum", "Medewerker", "Werk of soort", "Uren", "Status"], ...l.map((r) => [r.datum, naam(r.employeeId), r.soort && r.soort !== "werk" ? SOORT_LABEL[r.soort] : werkNaam(r.projectId), fmt(r.uren), r.status || "concept"])];
    const csv = rows.map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `uren-week-${weekNr(week)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!mw) return <p className="p-6 text-sm text-[#5F6673]">Er zijn nog geen medewerkers.</p>;
  const contract = mw.contractUren || 40;
  const kopDag = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "short" }).replace(".", "");

  return <div className={`${eigen ? "p-0" : "p-4 md:p-6"} space-y-4 max-w-6xl`}>
    {!eigen && <div className="flex items-center justify-between gap-3 flex-wrap">
      <h1 className="text-xl md:text-2xl font-semibold text-[#23272F]">Uren</h1>
      {kantoor && <button onClick={exporteer} className="px-3 py-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F] hover:bg-[#F4F6F9] flex items-center gap-1.5"><Download className="w-4 h-4" />Exporteren</button>}
    </div>}
    {kantoor && <div className="flex gap-5 border-b border-[rgba(15,23,42,0.08)]">
      {(magAccorderen ? (["uren", "accorderen"] as const) : (["uren"] as const)).map((t) => <button key={t} onClick={() => setTab(t)}
        className={`pb-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? "border-[#E0402F] text-[#23272F]" : "border-transparent text-[#5F6673] hover:text-[#23272F]"}`}>{t === "uren" ? "Weekstaat" : "Accorderen"}</button>)}
    </div>}

    {tab === "accorderen" && magAccorderen ? <Accorderen employees={employees} werkNaam={werkNaam} beoordelaar={(user?.email || "").split("@")[0] || "kantoor"} /> : <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-[rgba(15,23,42,0.12)] rounded-[10px]">
            <button onClick={() => setWeek(plus(week, -7))} className="p-2 text-[#5F6673] hover:text-[#23272F]" aria-label="Vorige week"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-1 text-sm font-semibold text-[#23272F] whitespace-nowrap">Week {weekNr(week)}</span>
            <button onClick={() => setWeek(plus(week, 7))} className="p-2 text-[#5F6673] hover:text-[#23272F]" aria-label="Volgende week"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {week !== maandagVan(vandaag()) && <button onClick={() => setWeek(maandagVan(vandaag()))} className="text-xs text-[#1E3A7B] font-semibold">Deze week</button>}
          {!eigen && <select value={mw.id} onChange={(e) => setMwId(e.target.value)} aria-label="Medewerker" className="py-2 px-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F] max-w-[15rem]">
            {mensen.map((m) => <option key={m.id} value={m.id}>{m.naam} · {m.afdeling}</option>)}
          </select>}
        </div>
        <div className="flex items-center gap-1 text-xs">
          {(["concept", "ingediend", "goedgekeurd"] as const).map((s, i) => <span key={s} className="flex items-center gap-1">
            {i > 0 && <span className="text-[#9AA1AD]">›</span>}
            <span className={`px-2.5 py-1 rounded-full font-medium ${status === s || (s === "concept" && (status === "leeg" || status === "afgekeurd")) ? "bg-[#1E3A7B] text-white" : "border border-[rgba(15,23,42,0.12)] text-[#5F6673]"}`}>{s === "concept" ? "Concept" : s === "ingediend" ? "Ingediend" : "Goedgekeurd"}</span>
          </span>)}
        </div>
      </div>

      {status === "afgekeurd" && <p className="text-sm text-[#A42A1E] bg-[#FCE1DC] rounded-[10px] px-3 py-2">Deze week is afgekeurd{mijnWeek.find((r) => r.beoordeeldDoor)?.beoordeeldDoor ? ` door ${mijnWeek.find((r) => r.beoordeeldDoor)!.beoordeeldDoor}` : ""}. Pas de uren aan en dien de week opnieuw in.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_17rem] gap-4 items-start">
        <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-[#23272F]">{mw.naam}</p>
              <p className="text-xs text-[#5F6673]">{mw.afdeling} · contract {fmt(contract)} uur</p>
            </div>
            {!vergrendeld && gepland.size > 0 && <button onClick={neemPlanningOver} className="text-xs text-[#1E3A7B] font-semibold text-right">Gestippeld = uit de planning.<br />Alles overnemen</button>}
          </div>
          {laden ? <p className="px-4 py-8 flex items-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Uren laden…</p> : <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead><tr className="bg-[#F4F6F9] text-xs text-[#5F6673]">
                <th className="text-left font-medium px-4 py-2">Werk of soort</th>
                {dagen.map((d) => <th key={d} className={`font-medium px-1 py-2 w-14 text-center ${d === vandaag() ? "text-[#E0402F]" : ""}`}>{kopDag(d)}<span className="block text-[10px] font-normal">{Number(d.slice(8))}</span></th>)}
                <th className="font-medium px-3 py-2 text-right w-16">Totaal</th>
              </tr></thead>
              <tbody className="divide-y divide-[rgba(15,23,42,0.06)]">
                {rijen.map((rij) => {
                  const pid = rij.startsWith("werk:") ? rij.slice(5) : "";
                  return <tr key={rij}>
                    <td className="px-4 py-2">{pid ? <span className="text-[#23272F] font-medium line-clamp-2">{werkNaam(pid) || "Werk"}</span> : <span className="text-[#23272F]">{SOORT_LABEL[rij as "reisuren"]}</span>}</td>
                    {dagen.map((d) => {
                      const v = waarde(rij, d), gp = gepland.get(`${rij}|${d}`), af = afwezig(d);
                      const leegMetPlan = !v && gp;
                      if (!v && af && !gp && pid) return <td key={d} className="px-1 py-1.5 text-center"><span className="inline-block w-12 py-1.5 text-xs text-[#9AA1AD] border border-[rgba(15,23,42,0.08)] rounded-[8px]">{af}</span></td>;
                      return <td key={d} className="px-1 py-1.5 text-center">
                        {leegMetPlan && !vergrendeld
                          ? <button onClick={() => zet(rij, d, fmt(gp!))} title="Ingepland: klik om over te nemen" className="w-12 py-1.5 text-sm tabular-nums text-[#5F6673] border border-dashed border-[#9AA1AD] rounded-[8px] hover:border-[#1E3A7B] hover:text-[#1E3A7B]">{fmt(gp!)}</button>
                          : <input value={v} disabled={vergrendeld} inputMode="decimal" placeholder="–" aria-label={`${pid ? werkNaam(pid) : rij} ${d}`}
                            onChange={(e) => zet(rij, d, e.target.value)}
                            className={`w-12 py-1.5 text-sm text-center tabular-nums rounded-[8px] border outline-none focus:border-[#1E3A7B] focus:ring-1 focus:ring-[#1E3A7B]/40 disabled:bg-[#F4F6F9] ${leesUren(v) === null ? "border-[#E0402F]" : "border-[rgba(15,23,42,0.15)]"} ${v ? "font-semibold text-[#23272F]" : "text-[#9AA1AD]"}`} />}
                      </td>;
                    })}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#23272F]">{fmt(rijTotaal(rij))}</td>
                  </tr>;
                })}
                {!vergrendeld && <tr><td colSpan={dagen.length + 2} className="px-4 py-2">
                  {zoek === null ? <button onClick={() => setZoek("")} className="text-xs text-[#1E3A7B] font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Werk toevoegen</button>
                    : <div className="max-w-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <input autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op werknummer of naam" className="flex-1 px-3 py-1.5 text-sm border border-[rgba(15,23,42,0.15)] rounded-[10px] outline-none focus:border-[#1E3A7B]" />
                        <button onClick={() => setZoek(null)} className="p-1 text-[#5F6673]" aria-label="Annuleren"><X className="w-4 h-4" /></button>
                      </div>
                      {zoek.trim().length >= 2 && <div className="border border-[rgba(15,23,42,0.1)] rounded-[10px] divide-y divide-[rgba(15,23,42,0.05)] max-h-44 overflow-y-auto">
                        {zoekWerken(zoek).slice(0, 8).map((w) => <button key={w.id} onClick={() => { setExtraRijen((x) => [...x, `werk:${w.id}`]); setZoek(null); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#F4F6F9] truncate">{w.label}</button>)}
                      </div>}
                    </div>}
                </td></tr>}
              </tbody>
              <tfoot><tr className="bg-[#F4F6F9] font-semibold text-[#23272F]">
                <td className="px-4 py-2.5">Totaal</td>
                {dagen.map((d) => <td key={d} className="px-1 py-2.5 text-center tabular-nums">{fmt(dagTotaal(d))}</td>)}
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(weekTotaal)} / {fmt(contract)}</td>
              </tr></tfoot>
            </table>
          </div>}
          {!vergrendeld && <div className="px-4 py-3 flex justify-end gap-2 border-t border-[rgba(15,23,42,0.06)]">
            <button disabled={!gewijzigd || bezig} onClick={() => void opslaan()} className="px-4 py-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] text-[#23272F] hover:bg-[#F4F6F9] disabled:opacity-50">Opslaan als concept</button>
            <button disabled={bezig || (!gewijzigd && !mijnWeek.some((r) => r.status === "concept" || r.status === "afgekeurd" || !r.status))} onClick={() => void indienen()} className="px-4 py-2 text-sm rounded-[10px] bg-[#1E3A7B] text-white hover:bg-[#172E63] disabled:opacity-50 flex items-center gap-1.5">{bezig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Week indienen</button>
          </div>}
          {vergrendeld && <p className="px-4 py-3 text-xs text-[#5F6673] border-t border-[rgba(15,23,42,0.06)]">Deze week is {status}. Aanpassen kan alleen nog via kantoor.</p>}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 space-y-3">
            <p className="text-sm font-semibold text-[#23272F]">{eigen ? "Mijn weken" : "Weken"}</p>
            {weken.map((w) => <button key={w.m} onClick={() => setWeek(w.m)} className="w-full flex items-start justify-between gap-2 text-left">
              <span><span className="block text-sm font-medium text-[#23272F]">Week {weekNr(w.m)}</span>
                <span className="block text-xs text-[#5F6673]">{fmt(w.totaal)} uur{w.door && w.status === "goedgekeurd" ? ` · door ${w.door}` : ""}</span></span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STIJL[w.status]}`}>{w.status === "leeg" ? "leeg" : w.status}</span>
            </button>)}
          </div>
          <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 space-y-1.5 text-xs text-[#5F6673]">
            <p className="text-sm font-semibold text-[#23272F]">Wie keurt dit goed?</p>
            <p>Na indienen staat de week bij kantoor onder Accorderen. Een planner of projectleider keurt hem goed of af. Afgekeurde uren kun je aanpassen en opnieuw indienen.</p>
          </div>
        </div>
      </div>
    </>}
  </div>;
}

// ===== Accorderen: ingediende weken goedkeuren of afkeuren =====
function Accorderen({ employees, werkNaam, beoordelaar }: { employees: UrenMedewerker[]; werkNaam: (id?: string | null) => string; beoordelaar: string }) {
  const [regels, setRegels] = useState<UrenRegel[] | null>(null);
  const [bezig, setBezig] = useState("");
  useEffect(() => {
    loadUren(plus(vandaag(), -120), plus(vandaag(), 14)).then((l) => setRegels(l.filter((r) => r.status === "ingediend"))).catch(() => setRegels([]));
  }, []);
  const groepen = useMemo(() => {
    const m = new Map<string, UrenRegel[]>();
    (regels || []).forEach((r) => { const k = `${r.employeeId}|${maandagVan(r.datum)}`; m.set(k, [...(m.get(k) || []), r]); });
    return [...m.entries()].sort((a, b) => a[0].split("|")[1].localeCompare(b[0].split("|")[1]));
  }, [regels]);
  const naam = (id: string) => employees.find((e) => e.id === id)?.naam || "Medewerker";
  const beoordeel = async (k: string, l: UrenRegel[], s: UrenStatus) => {
    setBezig(k);
    try { await zetUrenStatus(l.map((r) => r.id), s, beoordelaar); setRegels((c) => (c || []).filter((r) => !l.includes(r))); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBezig(""); }
  };
  if (!regels) return <p className="py-8 flex items-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Laden…</p>;
  if (!groepen.length) return <p className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] px-5 py-10 text-center text-sm text-[#5F6673]">Er staan geen ingediende weken klaar om goed te keuren.</p>;
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {groepen.map(([k, l]) => {
      const [emp, m] = k.split("|");
      const perRij = new Map<string, number>();
      l.forEach((r) => { const n = r.soort && r.soort !== "werk" ? SOORT_LABEL[r.soort] : werkNaam(r.projectId) || "Werk"; perRij.set(n, (perRij.get(n) || 0) + r.uren); });
      return <div key={k} className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div><p className="text-base font-semibold text-[#23272F]">{naam(emp)}</p><p className="text-xs text-[#5F6673]">Week {weekNr(m)}</p></div>
          <span className="text-sm font-semibold tabular-nums text-[#1E3A7B]">{fmt(l.reduce((s, r) => s + r.uren, 0))} uur</span>
        </div>
        <div className="space-y-1">{[...perRij.entries()].map(([n, u]) => <div key={n} className="flex justify-between gap-3 text-sm"><span className="truncate text-[#23272F]">{n}</span><span className="tabular-nums text-[#5F6673]">{fmt(u)}</span></div>)}</div>
        <div className="flex justify-end gap-2">
          <button disabled={!!bezig} onClick={() => void beoordeel(k, l, "afgekeurd")} className="px-3 py-1.5 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] text-[#A42A1E] hover:bg-[#FCE1DC] disabled:opacity-50">Afkeuren</button>
          <button disabled={!!bezig} onClick={() => void beoordeel(k, l, "goedgekeurd")} className="px-3 py-1.5 text-sm rounded-[10px] bg-[#16774A] text-white hover:bg-[#12623D] disabled:opacity-50 flex items-center gap-1.5">{bezig === k ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Goedkeuren</button>
        </div>
      </div>;
    })}
  </div>;
}
