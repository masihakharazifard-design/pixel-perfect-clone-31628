import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, MessageSquarePlus, Send } from "lucide-react";
import { toast } from "sonner";
import { geefFeedback, loadFeedback, zetFeedbackStatus, type FeedbackItem, type FeedbackStatus } from "@/lib/store";

// Feedbackbalk bovenaan elke pagina: feedback typen over de pagina waar je bent, en via
// "Alle feedback" een uitklaplijst met alle feedback (kantoor ziet alles en zet de status).

const STATUSSEN: FeedbackStatus[] = ["nieuw", "in behandeling", "opgelost"];
const STIJL: Record<FeedbackStatus, string> = {
  nieuw: "bg-[#FDEFD3] text-[#8A5300]",
  "in behandeling": "bg-[#E5ECF8] text-[#1E3A7B]",
  opgelost: "bg-[#D9F4E5] text-[#16774A]",
};

export default function FeedbackBalk({ pagina, kantoor, extra }: { pagina: string; kantoor: boolean; extra?: ReactNode }) {
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [open, setOpen] = useState(false);
  const [lijst, setLijst] = useState<FeedbackItem[] | null>(null);
  const [filter, setFilter] = useState<"open" | "alle" | "pagina">("open");

  useEffect(() => { loadFeedback().then(setLijst).catch(() => setLijst([])); }, []);
  const openAantal = (lijst || []).filter((f) => f.status !== "opgelost").length;

  const versturen = async () => {
    const t = tekst.trim();
    if (!t || bezig) return;
    setBezig(true);
    try {
      const f = await geefFeedback(t.slice(0, 2000), pagina);
      setLijst((l) => [f, ...(l || [])]);
      setTekst("");
      toast.success("Bedankt, je feedback is verstuurd.");
    } catch (e) {
      toast.error(`Feedback versturen lukte niet: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBezig(false); }
  };
  const zetStatus = async (f: FeedbackItem, s: FeedbackStatus) => {
    setLijst((l) => (l || []).map((x) => (x.id === f.id ? { ...x, status: s } : x)));
    try { await zetFeedbackStatus(f.id, s); }
    catch (e) { setLijst((l) => (l || []).map((x) => (x.id === f.id ? f : x))); toast.error(`Status wijzigen lukte niet: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const zichtbaar = useMemo(() => (lijst || []).filter((f) =>
    filter === "alle" ? true : filter === "pagina" ? f.pagina === pagina : f.status !== "opgelost"), [lijst, filter, pagina]);
  const wanneer = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return <div className="flex-shrink-0 border-b border-[rgba(15,23,42,0.06)] bg-white/70">
    <div className="px-3 md:px-5 py-2 flex items-center gap-2">
      {extra}
      <MessageSquarePlus className="w-4 h-4 text-[#5F6673] shrink-0" aria-hidden="true" />
      <form onSubmit={(e) => { e.preventDefault(); void versturen(); }} className="flex-1 min-w-0 flex items-center gap-2">
        <input value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={2000}
          placeholder={`Feedback over ${pagina.toLowerCase()}? Typ het hier…`} aria-label="Feedback"
          className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-white border border-[rgba(15,23,42,0.12)] rounded-[10px] text-[#23272F] outline-none focus:border-[#1E3A7B] focus:ring-1 focus:ring-[#1E3A7B]/40" />
        <button type="submit" disabled={!tekst.trim() || bezig} className="px-3 py-1.5 text-sm rounded-[10px] bg-[#1E3A7B] text-white hover:bg-[#172E63] disabled:opacity-40 flex items-center gap-1.5 shrink-0">
          {bezig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}<span className="hidden sm:inline">Versturen</span>
        </button>
      </form>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="px-2.5 py-1.5 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F] hover:bg-[#F4F6F9] flex items-center gap-1 shrink-0">
        <span className="hidden sm:inline">{kantoor ? "Alle feedback" : "Mijn feedback"}</span><span className="sm:hidden">Lijst</span>
        {openAantal > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-[#E0402F] text-white text-xs font-semibold">{openAantal}</span>}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
    {open && <div className="px-3 md:px-5 pb-3">
      <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.08)] overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-1 border-b border-[rgba(15,23,42,0.06)] text-xs">
          {([["open", "Open"], ["pagina", "Deze pagina"], ["alle", "Alles"]] as const).map(([k, l]) =>
            <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded-full font-medium ${filter === k ? "bg-[#1E3A7B] text-white" : "text-[#5F6673] hover:bg-[#F2F4F7]"}`}>{l}</button>)}
          <span className="ml-auto text-[#5F6673]">{zichtbaar.length} {zichtbaar.length === 1 ? "melding" : "meldingen"}</span>
        </div>
        <div className="divide-y divide-[rgba(15,23,42,0.05)] max-h-80 overflow-y-auto">
          {lijst === null && <p className="px-3 py-4 flex items-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Laden…</p>}
          {lijst !== null && zichtbaar.length === 0 && <p className="px-3 py-4 text-sm text-[#5F6673]">Geen feedback in deze lijst.</p>}
          {zichtbaar.map((f) => <div key={f.id} className="px-3 py-2.5 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#23272F] whitespace-pre-wrap break-words">{f.tekst}</p>
              <p className="text-xs text-[#5F6673] mt-0.5">{f.pagina || "Onbekende pagina"} · {f.eigen ? "jij" : f.auteur || "onbekend"} · {wanneer(f.tijd)}</p>
            </div>
            {kantoor
              ? <select value={f.status} onChange={(e) => void zetStatus(f, e.target.value as FeedbackStatus)} aria-label="Status van de feedback"
                className={`text-xs font-medium rounded-full px-2 py-1 border-0 outline-none shrink-0 ${STIJL[f.status]}`}>
                {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              : <span className={`text-xs font-medium rounded-full px-2 py-1 shrink-0 ${STIJL[f.status]}`}>{f.status}</span>}
          </div>)}
        </div>
      </div>
    </div>}
  </div>;
}
