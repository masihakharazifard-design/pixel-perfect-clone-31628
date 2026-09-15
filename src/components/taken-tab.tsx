// Taken per werk: toevoegen, bewerken en verwijderen, gesorteerd op startdatum.
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listTaken, saveTaak, deleteTaak } from "@/lib/store";
import { TAAK_TYPES, taakKleur, taakEind, fmtDay, sorteerTaken, type Taak } from "@/lib/taken";

const LEEG = (projectId: string): Taak => ({
  id: "", projectId, taaknaam: "", type: TAAK_TYPES[0], start: "", duur: 1,
});

export function TakenTab({ projectId, canEdit = true }: { projectId: string; canEdit?: boolean }) {
  const [taken, setTaken] = useState<Taak[]>([]);
  const [laden, setLaden] = useState(true);
  const [form, setForm] = useState<Taak | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLaden(true);
    listTaken(projectId)
      .then((t) => { if (!cancelled) setTaken(t); })
      .catch(() => { if (!cancelled) toast.error("Taken laden is niet gelukt"); })
      .finally(() => { if (!cancelled) setLaden(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const lijst = useMemo(() => sorteerTaken(taken), [taken]);

  const set = <K extends keyof Taak>(k: K, v: Taak[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const opslaan = async () => {
    if (!form) return;
    if (!form.taaknaam.trim()) { toast.error("Vul een taaknaam in"); return; }
    try {
      const saved = await saveTaak({ ...form, duur: Math.max(1, Number(form.duur) || 1) });
      setTaken((prev) => {
        const i = prev.findIndex((t) => t.id === saved.id);
        if (i >= 0) { const next = [...prev]; next[i] = saved; return next; }
        return [...prev, saved];
      });
      setForm(null);
      toast.success("Taak opgeslagen");
    } catch {
      toast.error("Opslaan is niet gelukt");
    }
  };

  const verwijder = async (t: Taak) => {
    try {
      await deleteTaak(t.id);
      setTaken((prev) => prev.filter((x) => x.id !== t.id));
      toast.success("Taak verwijderd");
    } catch {
      toast.error("Verwijderen is niet gelukt");
    }
  };

  if (laden) return <p className="text-sm text-[#6B7A99]">Taken laden…</p>;

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Taken</p>
      {canEdit && <button onClick={() => setForm(LEEG(projectId))}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0ABFB8] text-white text-xs font-semibold hover:opacity-90">
        <Plus className="w-3.5 h-3.5"/>Taak toevoegen
      </button>}
    </div>

    {lijst.length === 0 && <p className="text-sm text-[#6B7A99]">Nog geen taken voor dit werk.</p>}

    {lijst.length > 0 && <div className="border border-[rgba(26,39,68,0.1)] rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead className="text-[#6B7A99]">
          <tr className="border-b border-[rgba(26,39,68,0.08)] bg-[#F0F3F8]">
            <th className="px-3 py-2 text-left font-semibold">Taaknaam</th>
            <th className="px-3 py-2 text-left font-semibold">Type</th>
            <th className="px-3 py-2 text-left font-semibold">Start</th>
            <th className="px-3 py-2 text-left font-semibold">Duur</th>
            <th className="px-3 py-2 text-left font-semibold">Eind</th>
            <th className="px-3 py-2"/>
          </tr>
        </thead>
        <tbody>
          {lijst.map((t) => <tr key={t.id} className="border-b border-[rgba(26,39,68,0.05)]">
            <td className="px-3 py-2 text-[#1A2744] font-medium">{t.taaknaam}</td>
            <td className="px-3 py-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: taakKleur(t.type) }}/>
                <span className="text-[#1A2744]">{t.type || "-"}</span>
              </span>
            </td>
            <td className="px-3 py-2 text-[#1A2744]">{fmtDay(t.start)}</td>
            <td className="px-3 py-2 text-[#1A2744]">{t.duur} d</td>
            <td className="px-3 py-2 text-[#1A2744]">{fmtDay(taakEind(t))}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              {canEdit && <>
                <button onClick={() => setForm(t)} className="text-[#6B7A99] hover:text-[#1A2744] p-1"><Pencil className="w-3.5 h-3.5"/></button>
                <button onClick={() => void verwijder(t)} className="text-[#E2725B] p-1"><Trash2 className="w-3.5 h-3.5"/></button>
              </>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {form && <div className="border border-[#0ABFB8]/40 rounded-xl p-4 space-y-3 bg-[#F8F9FC]">
      <p className="text-sm font-bold text-[#1A2744]">{form.id ? "Taak bewerken" : "Nieuwe taak"}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Veld label="Taaknaam">
          <input value={form.taaknaam} onChange={(e) => set("taaknaam", e.target.value)} className={INPUT}/>
        </Veld>
        <Veld label="Type">
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className={INPUT}>
            {TAAK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Veld>
        <Veld label="Start">
          <input type="date" value={form.start} onChange={(e) => set("start", e.target.value)} className={INPUT}/>
        </Veld>
        <Veld label="Duur (dagen)">
          <input type="number" min={1} value={form.duur} onChange={(e) => set("duur", Number(e.target.value) || 1)} className={INPUT}/>
        </Veld>
        <Veld label="Eind (automatisch)">
          <p className="py-2 text-sm text-[#1A2744] font-semibold">{fmtDay(taakEind(form))}</p>
        </Veld>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6B7A99] bg-white border border-[rgba(26,39,68,0.12)]">Annuleren</button>
        <button onClick={() => void opslaan()} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0ABFB8]">Opslaan</button>
      </div>
    </div>}
  </div>;
}

const INPUT = "w-full px-3 py-2 rounded-lg border border-[rgba(26,39,68,0.12)] text-sm text-[#1A2744] bg-white focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50";

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div>
    <p className="text-xs text-[#6B7A99] mb-1">{label}</p>
    {children}
  </div>;
}

export default TakenTab;
