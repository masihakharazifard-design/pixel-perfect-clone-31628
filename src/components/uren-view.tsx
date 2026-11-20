import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Download, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { berekenUren, deleteUren, loadUren, saveUren, type UrenRegel } from "@/lib/store";

// Urenregistratie: gewerkte uren per medewerker per dag, vooral voor de schilders.
// Ingeplande dagen uit de personeelsplanning kunnen met één klik als uren worden overgenomen.

export interface UrenMedewerker { id: string; naam: string; afdeling: string }
export interface UrenPlanRegel { id: string; employeeId: string; date: string; startTime: string; endTime: string; status: string; projectId?: string }
export interface UrenWerk { id: string; label: string }

const STANDAARD_PAUZE = 30;
const AFDELINGEN = ["Schilderwerk", "Stoffering", "Zonwering"];

const pad = (n: number) => String(n).padStart(2, "0");
const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const vandaag = () => ds(new Date());
function maandagVan(datum: string): string {
  const d = new Date(datum + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ds(d);
}
function plusDagen(datum: string, n: number): string {
  const d = new Date(datum + "T12:00:00");
  d.setDate(d.getDate() + n);
  return ds(d);
}
function weekNr(datum: string): number {
  const d = new Date(datum + "T12:00:00");
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
const dagKort = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const fmtUren = (u: number) => u.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const invoerStijl = "w-full px-3 py-2 text-sm border border-[rgba(15,23,42,0.15)] rounded-[10px] bg-white text-[#23272F] outline-none focus:border-[#1E3A7B] focus:ring-1 focus:ring-[#1E3A7B]/40";

export default function UrenView({ employees, availability, werkNaam, zoekWerken }: {
  employees: UrenMedewerker[];
  availability: UrenPlanRegel[];
  werkNaam: (id?: string | null) => string;
  zoekWerken: (q: string) => UrenWerk[];
}) {
  const [week, setWeek] = useState(() => maandagVan(vandaag()));
  const [afdeling, setAfdeling] = useState("Schilderwerk");
  const [medewerker, setMedewerker] = useState("");
  const [regels, setRegels] = useState<UrenRegel[]>([]);
  const [laden, setLaden] = useState(true);
  const [bewerk, setBewerk] = useState<UrenRegel | null>(null);
  const tot = plusDagen(week, 6);

  const herlaad = useCallback(async () => {
    setLaden(true);
    try { setRegels(await loadUren(week, tot)); }
    catch (e) { toast.error(`Uren konden niet worden geladen: ${e instanceof Error ? e.message : String(e)}`); setRegels([]); }
    finally { setLaden(false); }
  }, [week, tot]);
  useEffect(() => { void herlaad(); }, [herlaad]);

  const mensen = useMemo(() => employees
    .filter((e) => !afdeling || e.afdeling === afdeling)
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl")), [employees, afdeling]);
  const zichtbaar = useMemo(() => new Set((medewerker ? mensen.filter((m) => m.id === medewerker) : mensen).map((m) => m.id)), [mensen, medewerker]);
  const naamVan = useCallback((id: string) => employees.find((e) => e.id === id)?.naam || id, [employees]);

  // Ingeplande dagen (t/m vandaag) waarvoor nog geen uren zijn geschreven
  const teBevestigen = useMemo(() => {
    const geschreven = new Set(regels.map((r) => `${r.employeeId}|${r.datum}|${r.projectId || ""}`));
    const gezien = new Set<string>();
    const nu = vandaag();
    return availability
      .filter((a) => a.status === "Ingepland" && a.projectId && a.date >= week && a.date <= tot && a.date <= nu && zichtbaar.has(a.employeeId))
      .filter((a) => {
        const k = `${a.employeeId}|${a.date}|${a.projectId}`;
        if (geschreven.has(k) || gezien.has(k)) return false;
        gezien.add(k);
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || naamVan(a.employeeId).localeCompare(naamVan(b.employeeId), "nl"));
  }, [availability, regels, week, tot, zichtbaar, naamVan]);

  const vanPlanning = (a: UrenPlanRegel): UrenRegel => {
    const start = a.startTime || "07:00", eind = a.endTime || "16:00";
    return { id: "", employeeId: a.employeeId, projectId: a.projectId || null, datum: a.date, start, eind, pauze: STANDAARD_PAUZE, uren: berekenUren(start, eind, STANDAARD_PAUZE), opmerking: "" };
  };

  const opslaan = async (r: UrenRegel) => {
    try {
      const n = await saveUren({ ...r, uren: berekenUren(r.start, r.eind, r.pauze) });
      setRegels((cur) => [...cur.filter((x) => x.id !== n.id), n].sort((a, b) => a.datum.localeCompare(b.datum)));
      return true;
    } catch (e) {
      toast.error(`Uren opslaan mislukt: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  };
  const allesOvernemen = async () => {
    let ok = 0;
    for (const a of teBevestigen) if (await opslaan(vanPlanning(a))) ok++;
  };
  const verwijder = async (r: UrenRegel) => {
    if (!window.confirm(`Uren van ${naamVan(r.employeeId)} op ${dagKort(r.datum)} verwijderen?`)) return;
    try { await deleteUren(r.id); setRegels((cur) => cur.filter((x) => x.id !== r.id)); }
    catch (e) { toast.error(`Verwijderen mislukt: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const perMedewerker = useMemo(() => {
    const m = new Map<string, UrenRegel[]>();
    regels.filter((r) => zichtbaar.has(r.employeeId)).forEach((r) => { const l = m.get(r.employeeId); if (l) l.push(r); else m.set(r.employeeId, [r]); });
    return [...m.entries()].sort((a, b) => naamVan(a[0]).localeCompare(naamVan(b[0]), "nl"));
  }, [regels, zichtbaar, naamVan]);
  const perWerk = useMemo(() => {
    const m = new Map<string, number>();
    regels.filter((r) => zichtbaar.has(r.employeeId)).forEach((r) => m.set(r.projectId || "", (m.get(r.projectId || "") || 0) + r.uren));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [regels, zichtbaar]);
  const totaal = perWerk.reduce((s, [, u]) => s + u, 0);

  const exporteer = () => {
    const kop = ["Datum", "Medewerker", "Werk", "Begin", "Eind", "Pauze (min)", "Uren", "Opmerking"];
    const rijen = regels.filter((r) => zichtbaar.has(r.employeeId)).map((r) => [r.datum, naamVan(r.employeeId), werkNaam(r.projectId), r.start, r.eind, String(r.pauze), fmtUren(r.uren), r.opmerking]);
    const csv = [kop, ...rijen].map((rij) => rij.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `uren-week-${weekNr(week)}-${week.slice(0, 4)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-6xl">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-[#23272F]">Uren</h1>
        <p className="text-sm text-[#5F6673]">Gewerkte uren per medewerker. Ingeplande dagen neem je met één klik over.</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={exporteer} className="px-3 py-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F] hover:bg-[#F4F6F9] flex items-center gap-1.5"><Download className="w-4 h-4" />Exporteren</button>
        <button onClick={() => setBewerk({ id: "", employeeId: medewerker || mensen[0]?.id || "", projectId: null, datum: vandaag() >= week && vandaag() <= tot ? vandaag() : week, start: "07:00", eind: "16:00", pauze: STANDAARD_PAUZE, uren: 0, opmerking: "" })}
          className="px-3 py-2 text-sm rounded-[10px] bg-[#1E3A7B] text-white hover:bg-[#172E63] flex items-center gap-1.5"><Plus className="w-4 h-4" />Uren invoeren</button>
      </div>
    </div>

    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center bg-white border border-[rgba(15,23,42,0.12)] rounded-[10px]">
        <button onClick={() => setWeek(plusDagen(week, -7))} className="p-2 text-[#5F6673] hover:text-[#23272F]" aria-label="Vorige week"><ChevronLeft className="w-4 h-4" /></button>
        <span className="px-2 text-sm font-semibold text-[#23272F] whitespace-nowrap">Week {weekNr(week)} · {dagKort(week)} – {dagKort(tot)}</span>
        <button onClick={() => setWeek(plusDagen(week, 7))} className="p-2 text-[#5F6673] hover:text-[#23272F]" aria-label="Volgende week"><ChevronRight className="w-4 h-4" /></button>
      </div>
      {week !== maandagVan(vandaag()) && <button onClick={() => setWeek(maandagVan(vandaag()))} className="text-xs text-[#1E3A7B] font-semibold">Deze week</button>}
      <select value={afdeling} onChange={(e) => { setAfdeling(e.target.value); setMedewerker(""); }} aria-label="Afdeling" className="py-2 px-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F]">
        <option value="">Alle afdelingen</option>
        {AFDELINGEN.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <select value={medewerker} onChange={(e) => setMedewerker(e.target.value)} aria-label="Medewerker" className="py-2 px-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F] max-w-[14rem]">
        <option value="">Alle medewerkers</option>
        {mensen.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
      </select>
    </div>

    {teBevestigen.length > 0 && <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-[#23272F]">Ingepland, nog geen uren ({teBevestigen.length})</h3>
        <button onClick={() => void allesOvernemen()} className="px-3 py-1.5 text-sm rounded-[10px] bg-[#E0402F] text-white hover:bg-[#C73526] flex items-center gap-1.5"><Check className="w-4 h-4" />Alles overnemen</button>
      </div>
      <div className="divide-y divide-[rgba(15,23,42,0.05)] max-h-72 overflow-y-auto">
        {teBevestigen.map((a) => {
          const r = vanPlanning(a);
          return <div key={a.id} className="px-4 md:px-5 py-2.5 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-medium text-[#23272F]">{naamVan(a.employeeId)} · {dagKort(a.date)}</p>
              <p className="text-xs text-[#5F6673] truncate">{werkNaam(a.projectId)} · {r.start}–{r.eind}, {STANDAARD_PAUZE} min pauze = {fmtUren(r.uren)} uur</p>
            </div>
            <button onClick={() => setBewerk(r)} className="px-2.5 py-1.5 text-xs rounded-[10px] border border-[rgba(15,23,42,0.12)] text-[#23272F] hover:bg-[#F4F6F9]">Aanpassen</button>
            <button onClick={() => void opslaan(r)} className="px-2.5 py-1.5 text-xs rounded-[10px] bg-[#1E3A7B] text-white hover:bg-[#172E63]">Overnemen</button>
          </div>;
        })}
      </div>
    </div>}

    {laden ? <div className="py-10 flex items-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Uren laden…</div>
      : perMedewerker.length === 0 ? <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] px-5 py-10 text-center">
        <Clock className="w-6 h-6 mx-auto text-[#9AA1AD]" aria-hidden="true" />
        <p className="mt-2 text-sm text-[#5F6673]">Nog geen uren geschreven in week {weekNr(week)}.{teBevestigen.length ? " Neem de ingeplande dagen hierboven over, of voer uren in." : " Kies Uren invoeren om te beginnen."}</p>
      </div>
      : <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-start">
        <div className="lg:col-span-2 space-y-4">
          {perMedewerker.map(([empId, lijst]) => {
            const som = lijst.reduce((s, r) => s + r.uren, 0);
            return <div key={empId} className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
              <div className="px-4 md:px-5 py-3 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#23272F]">{naamVan(empId)}</h3>
                <span className="text-sm font-semibold text-[#1E3A7B] tabular-nums">{fmtUren(som)} uur</span>
              </div>
              <div className="divide-y divide-[rgba(15,23,42,0.05)]">
                {lijst.map((r) => <div key={r.id} className="px-4 md:px-5 py-2.5 flex items-center gap-3">
                  <div className="w-24 shrink-0 text-sm text-[#23272F]">{dagKort(r.datum)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#23272F] truncate">{werkNaam(r.projectId) || "Geen werk gekozen"}</p>
                    <p className="text-xs text-[#5F6673] truncate">{r.start}–{r.eind} · {r.pauze} min pauze{r.opmerking ? ` · ${r.opmerking}` : ""}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-[#23272F]">{fmtUren(r.uren)}</span>
                  <button onClick={() => setBewerk(r)} className="p-1.5 text-[#5F6673] hover:text-[#1E3A7B]" aria-label="Uren aanpassen"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => void verwijder(r)} className="p-1.5 text-[#5F6673] hover:text-[#A42A1E]" aria-label="Uren verwijderen"><Trash2 className="w-4 h-4" /></button>
                </div>)}
              </div>
            </div>;
          })}
        </div>
        <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#23272F]">Per werk</h3>
            <span className="text-sm font-semibold text-[#1E3A7B] tabular-nums">{fmtUren(totaal)} uur</span>
          </div>
          <div className="divide-y divide-[rgba(15,23,42,0.05)]">
            {perWerk.map(([pid, u]) => <div key={pid || "geen"} className="px-4 md:px-5 py-2 flex items-center gap-3">
              <p className="flex-1 min-w-0 text-sm text-[#23272F] truncate">{werkNaam(pid) || "Geen werk gekozen"}</p>
              <span className="text-sm tabular-nums text-[#23272F]">{fmtUren(u)}</span>
            </div>)}
          </div>
        </div>
      </div>}

    {bewerk && <UrenFormulier regel={bewerk} mensen={employees} availability={availability} werkNaam={werkNaam} zoekWerken={zoekWerken}
      onAnnuleer={() => setBewerk(null)} onOpslaan={async (r) => { if (await opslaan(r)) setBewerk(null); }} />}
  </div>;
}

function UrenFormulier({ regel, mensen, availability, werkNaam, zoekWerken, onAnnuleer, onOpslaan }: {
  regel: UrenRegel; mensen: UrenMedewerker[]; availability: UrenPlanRegel[];
  werkNaam: (id?: string | null) => string; zoekWerken: (q: string) => UrenWerk[];
  onAnnuleer: () => void; onOpslaan: (r: UrenRegel) => Promise<void>;
}) {
  const [f, setF] = useState(regel);
  const [zoek, setZoek] = useState("");
  const [bezig, setBezig] = useState(false);
  const zet = <K extends keyof UrenRegel>(k: K, v: UrenRegel[K]) => setF((p) => ({ ...p, [k]: v }));
  const uren = berekenUren(f.start, f.eind, f.pauze);
  // Werken waarop deze medewerker die dag is ingepland staan bovenaan
  const ingepland = useMemo(() => {
    const ids = new Set<string>();
    availability.forEach((a) => { if (a.status === "Ingepland" && a.projectId && a.employeeId === f.employeeId && a.date === f.datum) ids.add(a.projectId); });
    return [...ids].map((id) => ({ id, label: werkNaam(id) }));
  }, [availability, f.employeeId, f.datum, werkNaam]);
  const treffers = useMemo(() => (zoek.trim().length >= 2 ? zoekWerken(zoek).slice(0, 8) : []), [zoek, zoekWerken]);
  const fout = !f.employeeId ? "Kies een medewerker." : !/^\d{4}-\d{2}-\d{2}$/.test(f.datum) ? "Kies een datum." : uren <= 0 ? "De eindtijd moet na de begintijd (plus pauze) liggen." : "";

  return <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onAnnuleer}>
    <div role="dialog" aria-label="Uren invoeren" onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-lg p-4 md:p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#23272F]">{regel.id ? "Uren aanpassen" : "Uren invoeren"}</h2>
        <button onClick={onAnnuleer} className="p-1 text-[#5F6673] hover:text-[#23272F]" aria-label="Sluiten"><X className="w-5 h-5" /></button>
      </div>
      <label className="block text-sm text-[#5F6673]">Medewerker
        <select value={f.employeeId} onChange={(e) => zet("employeeId", e.target.value)} className={`${invoerStijl} mt-1`}>
          <option value="">Kies…</option>
          {[...mensen].sort((a, b) => a.naam.localeCompare(b.naam, "nl")).map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
        </select>
      </label>
      <label className="block text-sm text-[#5F6673]">Datum
        <input type="date" value={f.datum} onChange={(e) => zet("datum", e.target.value)} className={`${invoerStijl} mt-1`} />
      </label>
      <div className="text-sm text-[#5F6673]">Werk
        {f.projectId && <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[#EEF1F5] text-[#23272F]">
          <span className="flex-1 truncate">{werkNaam(f.projectId)}</span>
          <button onClick={() => zet("projectId", null)} className="text-[#5F6673] hover:text-[#23272F]" aria-label="Werk wissen"><X className="w-4 h-4" /></button>
        </div>}
        {!f.projectId && <>
          {ingepland.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">
            {ingepland.map((w) => <button key={w.id} onClick={() => zet("projectId", w.id)} className="px-2.5 py-1.5 text-xs rounded-full bg-[#E5ECF8] text-[#1E3A7B] font-medium hover:bg-[#D6E0F4] max-w-full truncate">{w.label}</button>)}
          </div>}
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op werknummer of naam" className={`${invoerStijl} mt-1`} />
          {treffers.length > 0 && <div className="mt-1 border border-[rgba(15,23,42,0.1)] rounded-[10px] divide-y divide-[rgba(15,23,42,0.05)] max-h-44 overflow-y-auto">
            {treffers.map((w) => <button key={w.id} onClick={() => { zet("projectId", w.id); setZoek(""); }} className="w-full text-left px-3 py-2 text-sm text-[#23272F] hover:bg-[#F4F6F9] truncate">{w.label}</button>)}
          </div>}
        </>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm text-[#5F6673]">Begin<input type="time" step={900} value={f.start} onChange={(e) => zet("start", e.target.value)} className={`${invoerStijl} mt-1`} /></label>
        <label className="block text-sm text-[#5F6673]">Eind<input type="time" step={900} value={f.eind} onChange={(e) => zet("eind", e.target.value)} className={`${invoerStijl} mt-1`} /></label>
        <label className="block text-sm text-[#5F6673]">Pauze (min)<input type="number" min={0} max={240} step={5} value={f.pauze} onChange={(e) => zet("pauze", Math.max(0, Number(e.target.value) || 0))} className={`${invoerStijl} mt-1`} /></label>
      </div>
      <label className="block text-sm text-[#5F6673]">Opmerking
        <input value={f.opmerking} onChange={(e) => zet("opmerking", e.target.value)} placeholder="Bijv. meerwerk, materiaal opgehaald" className={`${invoerStijl} mt-1`} />
      </label>
      <p className="text-sm text-[#23272F]">Totaal: <b className="tabular-nums">{fmtUren(uren)} uur</b></p>
      {fout && <p className="text-sm text-[#A42A1E]">{fout}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onAnnuleer} className="px-4 py-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] text-[#23272F] hover:bg-[#F4F6F9]">Annuleren</button>
        <button disabled={!!fout || bezig} onClick={async () => { setBezig(true); try { await onOpslaan({ ...f, uren }); } finally { setBezig(false); } }}
          className="px-4 py-2 text-sm rounded-[10px] bg-[#1E3A7B] text-white hover:bg-[#172E63] disabled:opacity-50">Opslaan</button>
      </div>
    </div>
  </div>;
}
