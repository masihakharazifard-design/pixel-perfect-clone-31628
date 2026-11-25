import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, CloudRain, Download, Loader2, LogOut, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-gate";
import { gereedFotoUrl, loadAll, loadGereed, meldGereed, type GereedMelding } from "@/lib/store";
import { verkleinFoto } from "@/lib/foto";
import { datumLang } from "@/lib/werkbon";
import { downloadBlob, maakWerkplanPdf, werkplanBestandsnaam } from "@/lib/werkplan-pdf";
import { laadWeer, weerOp } from "@/components/weer-advies";
import UrenView from "@/components/uren-view";
import FeedbackBalk from "@/components/feedback-balk";
import maasmondLogo from "@/assets/maasmond-logo.jpg";

// Eigen omgeving voor schilders (rol "medewerker"): alleen de eigen planning met werkbonnen,
// per dag gereed melden met een foto, en de eigen uren. De database geeft hen ook alleen die gegevens.

type Rec = Record<string, unknown> & { id: string };
interface Regel { id: string; employeeId: string; date: string; startTime: string; endTime: string; status: string; projectId?: string }

const pad = (n: number) => String(n).padStart(2, "0");
const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ds(d); };
const str = (x: unknown) => (x == null ? "" : String(x));
const BUITEN = /buiten|gevel|kozijn|dakgoot|boeideel|zonwering|screen|markies|rolluik|luifel|terras|knikarm/i;

export default function SchilderApp({ employeeId, onTerug }: { employeeId?: string; onTerug?: () => void }) {
  const { user, signOut } = useAuth();
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState("");
  const [werken, setWerken] = useState<Map<string, Rec>>(new Map());
  const [mensen, setMensen] = useState<Map<string, string>>(new Map());
  const [mij, setMij] = useState<Rec | null>(null);
  const [planning, setPlanning] = useState<Regel[]>([]);
  const [eigenAgenda, setEigenAgenda] = useState<Regel[]>([]);
  const [instellingen, setInstellingen] = useState<Record<string, unknown>>({});
  const [gereed, setGereed] = useState<GereedMelding[]>([]);
  const [tab, setTab] = useState<"planning" | "uren">("planning");
  const vandaag = ds(new Date());
  const van = plus(vandaag, -7), tot = plus(vandaag, 28);

  useEffect(() => {
    let weg = false;
    void laadWeer();
    (async () => {
      try {
        const d = await loadAll<Rec, Rec, Rec, Record<string, unknown>>();
        const email = (user?.email || "").toLowerCase();
        const ik = employeeId ? d.employees.find((e) => e.id === employeeId) : d.employees.find((e) => str(e.email).toLowerCase() === email && email);
        if (weg) return;
        if (!ik) { setFout("Je e-mailadres is nog niet gekoppeld aan een medewerker. Vraag de planning om je e-mailadres bij Medewerkers in te vullen."); return; }
        setMij(ik);
        setWerken(new Map(d.projects.map((p) => [p.id, p])));
        setMensen(new Map(d.employees.map((e) => [e.id, str(e.naam)])));
        setInstellingen(d.settings || {});
        const mijnRegels = (d.availability as unknown as Regel[]).filter((a) => a.employeeId === ik.id);
        setEigenAgenda(mijnRegels);
        setPlanning(mijnRegels.filter((a) => a.status === "Ingepland" && a.projectId));
        setGereed((await loadGereed(van, tot)).filter((g) => g.employeeId === ik.id));
      } catch (e) {
        if (!weg) setFout(`Je planning kon niet worden geladen: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!weg) setLaden(false);
      }
    })();
    return () => { weg = true; };
  }, [employeeId, user?.email, van, tot]);

  // Projectleider: naam van de medewerker, anders de volledige naam bij de afkorting (Instellingen)
  const plNaam = useCallback((code: string) => {
    if (mensen.has(code)) return mensen.get(code)!;
    const namen = (instellingen.projectleiderNamen || {}) as Record<string, string>;
    const naam = namen[code] || namen[code.toUpperCase()];
    if (naam) return naam;
    return /^[A-Za-z.]{2,5}$/.test(code) || /s/.test(code) ? code : "";
  }, [instellingen, mensen]);
  const werkLabel = useCallback((id?: string | null) => {
    const p = id ? werken.get(id) : undefined;
    return p ? [str(p.werknummer), str(p.projectnaam)].filter(Boolean).join(" – ") : "";
  }, [werken]);
  const adresVan = (p?: Rec) => (p ? [str(p.straatObject) || str(p.adres), str(p.plaatsObject) || str(p.plaats)].filter(Boolean).join(", ") : "");

  // Per dag de ingeplande werken (afgelopen week alleen als er nog iets gereed gemeld moet worden)
  const dagen = useMemo(() => {
    const m = new Map<string, Regel[]>();
    planning.filter((a) => a.date >= van && a.date <= tot).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .forEach((a) => { const k = `${a.date}|${a.projectId}`; if (![...(m.get(a.date) || [])].some((x) => `${x.date}|${x.projectId}` === k)) m.set(a.date, [...(m.get(a.date) || []), a]); });
    return [...m.entries()].filter(([d, l]) => d >= vandaag || l.some((a) => !gereed.some((g) => g.projectId === a.projectId && g.datum === d)));
  }, [planning, gereed, van, tot, vandaag]);

  const [melden, setMelden] = useState<{ regel: Regel; foto: Blob; voorbeeld: string } | null>(null);
  const [opmerking, setOpmerking] = useState("");
  const [bezig, setBezig] = useState(false);
  const fotoInput = useRef<HTMLInputElement>(null);
  const [kiesVoor, setKiesVoor] = useState<Regel | null>(null);
  const kiesFoto = (r: Regel) => { setKiesVoor(r); fotoInput.current?.click(); };
  const fotoGekozen = async (f?: File | null) => {
    if (!f || !kiesVoor) return;
    const klein = await verkleinFoto(f);
    setOpmerking("");
    setMelden({ regel: kiesVoor, foto: klein, voorbeeld: URL.createObjectURL(klein) });
    if (fotoInput.current) fotoInput.current.value = "";
  };
  const bevestig = async () => {
    if (!melden || !mij) return;
    setBezig(true);
    try {
      const g = await meldGereed(mij.id, melden.regel.projectId!, melden.regel.date, melden.foto, opmerking.trim());
      setGereed((cur) => [g, ...cur.filter((x) => !(x.projectId === g.projectId && x.datum === g.datum))]);
      URL.revokeObjectURL(melden.voorbeeld);
      setMelden(null);
    } catch (e) {
      toast.error(`Gereed melden lukte niet: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBezig(false); }
  };
  const toonFoto = async (g: GereedMelding) => {
    try { window.open(await gereedFotoUrl(g.fotoPad), "_blank", "noopener"); } catch { toast.error("Foto kon niet worden geopend."); }
  };

  const werkplanPdf = () => {
    if (!mij) return;
    const t = plus(vandaag, 13);
    const regels = planning.filter((a) => a.date >= vandaag && a.date <= t).map((a) => {
      const p = werken.get(a.projectId!);
      return { datum: a.date, start: a.startTime, eind: a.endTime, werk: werkLabel(a.projectId), adres: adresVan(p), projectleider: p ? plNaam(str(p.projectleider)) : "", opmerking: p ? str(p.opmerkingen) : "" };
    });
    downloadBlob(maakWerkplanPdf({ medewerker: str(mij.naam), van: vandaag, tot: t, regels, bedrijf: str(instellingen.bedrijfsnaam) || "Maasmond" }), werkplanBestandsnaam(str(mij.naam), vandaag, t));
  };

  return <div className="min-h-screen bg-[#EEF1F5]" style={{ fontFamily: "var(--font-ui)" }}>
    <header className="bg-white border-b border-[rgba(15,23,42,0.06)] sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        {onTerug && <button onClick={onTerug} className="p-1.5 rounded-[10px] text-[#5F6673] hover:bg-[#F2F4F7]" aria-label="Terug naar de planning"><ArrowLeft className="w-5 h-5" /></button>}
        <img src={maasmondLogo} alt="Maasmond" className="h-7 w-auto" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#23272F] truncate">{mij ? str(mij.naam) : "Mijn planning"}</p>
          {onTerug && <p className="text-xs text-[#5F6673]">Zo ziet deze schilder de app</p>}
        </div>
        {!onTerug && <button onClick={() => void signOut()} className="flex items-center gap-1.5 text-sm text-[#5F6673] hover:text-[#23272F]"><LogOut className="w-4 h-4" />Uitloggen</button>}
      </div>
      <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1">
        {(["planning", "uren"] as const).map((t) => <button key={t} onClick={() => setTab(t)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === t ? "bg-[#1E3A7B] text-white" : "text-[#5F6673] hover:bg-[#F2F4F7]"}`}>{t === "planning" ? "Mijn planning" : "Uren"}</button>)}
      </div>
    </header>
    <div className="max-w-2xl mx-auto"><FeedbackBalk pagina={tab === "planning" ? "Mijn planning" : "Uren"} kantoor={false} /></div>

    <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      {laden && <p className="py-10 flex items-center justify-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Planning laden…</p>}
      {!laden && fout && <p className="bg-white rounded-lg p-4 text-sm text-[#A42A1E]">{fout}</p>}

      {!laden && !fout && tab === "planning" && <>
        <div className="flex justify-end">
          <button onClick={werkplanPdf} className="px-3 py-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F] flex items-center gap-1.5"><Download className="w-4 h-4" />Werkplan (pdf)</button>
        </div>
        {dagen.length === 0 && <p className="bg-white rounded-lg p-6 text-center text-sm text-[#5F6673]">Je bent de komende weken nog nergens ingepland.</p>}
        {dagen.map(([datum, regels]) => <section key={datum} className="space-y-2">
          <h2 className={`text-sm font-semibold ${datum === vandaag ? "text-[#E0402F]" : "text-[#23272F]"}`}>{datum === vandaag ? "Vandaag – " : ""}{datumLang(datum)}</h2>
          {regels.map((a) => {
            const p = werken.get(a.projectId!);
            const adres = adresVan(p);
            const g = gereed.find((x) => x.projectId === a.projectId && x.datum === datum);
            const regen = p && BUITEN.test(`${str(p.projectnaam)} ${str(p.opmerkingen)}`) && weerOp(datum) === "regen";
            return <article key={a.id} className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-[#23272F]">{werkLabel(a.projectId) || "Werk"}</h3>
                <span className="text-sm tabular-nums text-[#5F6673] whitespace-nowrap">{a.startTime}–{a.endTime}</span>
              </div>
              {adres && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-[#1E3A7B]"><MapPin className="w-4 h-4 shrink-0" />{adres}</a>}
              <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {p && str(p.opdrachtgever) && <><dt className="text-[#5F6673]">Opdrachtgever</dt><dd className="text-[#23272F]">{str(p.opdrachtgever)}</dd></>}
                {p && plNaam(str(p.projectleider)) && <><dt className="text-[#5F6673]">Projectleider</dt><dd className="text-[#23272F]">{plNaam(str(p.projectleider))}</dd></>}
              </dl>
              {p && str(p.opmerkingen) && <p className="text-sm text-[#23272F] whitespace-pre-wrap bg-[#F4F6F9] rounded-[10px] px-3 py-2">{str(p.opmerkingen)}</p>}
              {regen && <p className="text-sm text-[#7A4A00] bg-[#FEF3DC] rounded-[10px] px-3 py-2 flex items-center gap-1.5"><CloudRain className="w-4 h-4" aria-hidden="true" />Let op: het regent deze dag.</p>}
              {g ? <button onClick={() => void toonFoto(g)} className="w-full flex items-center gap-2 text-sm text-[#16774A] bg-[#D9F4E5] rounded-[10px] px-3 py-2.5 text-left">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />Gereed gemeld om {new Date(g.tijd).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} · foto bekijken
                </button>
                : datum <= vandaag && <button onClick={() => kiesFoto(a)} className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#E0402F] hover:bg-[#C73526] rounded-[10px] px-3 py-3">
                  <Camera className="w-5 h-5" />Foto maken en gereed melden
                </button>}
            </article>;
          })}
        </section>)}
      </>}

      {!laden && !fout && tab === "uren" && mij && <div>
        <UrenView eigen employees={[{ id: mij.id, naam: str(mij.naam), afdeling: str(mij.afdeling), contractUren: Number(mij.contractUren) || undefined }]} availability={eigenAgenda} werkNaam={werkLabel}
          zoekWerken={(q) => [...werken.values()].filter((p) => `${str(p.werknummer)} ${str(p.projectnaam)}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8).map((p) => ({ id: p.id, label: werkLabel(p.id) }))} />
      </div>}
    </main>

    <input ref={fotoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void fotoGekozen(e.target.files?.[0])} />

    {melden && <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => !bezig && setMelden(null)}>
      <div role="dialog" aria-label="Gereed melden" onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-lg p-4 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#23272F]">Gereed melden</h2>
          <button onClick={() => setMelden(null)} disabled={bezig} className="p-1 text-[#5F6673]" aria-label="Sluiten"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-[#5F6673]">{werkLabel(melden.regel.projectId)} · {datumLang(melden.regel.date)}</p>
        <img src={melden.voorbeeld} alt="Foto van het werk" className="w-full max-h-[50vh] object-contain rounded-[10px] bg-[#F4F6F9]" />
        <button onClick={() => kiesFoto(melden.regel)} disabled={bezig} className="text-sm text-[#1E3A7B] font-semibold">Andere foto kiezen</button>
        <label className="block text-sm text-[#5F6673]">Opmerking (niet verplicht)
          <input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} placeholder="Bijv. tweede laag morgen" className="w-full mt-1 px-3 py-2 text-sm border border-[rgba(15,23,42,0.15)] rounded-[10px] text-[#23272F] outline-none focus:border-[#1E3A7B]" />
        </label>
        <button onClick={() => void bevestig()} disabled={bezig} className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#1E3A7B] hover:bg-[#172E63] rounded-[10px] px-3 py-3 disabled:opacity-60">
          {bezig ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}Gereed
        </button>
      </div>
    </div>}
  </div>;
}
