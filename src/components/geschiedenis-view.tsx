import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FolderOpen, History, Loader2, MessageSquare, Search, Settings, UserCircle, UserX } from "lucide-react";
import { loadGeschiedenis, type GeschiedenisRegel } from "@/lib/store";
import type { LogPlanRij } from "@/lib/geschiedenis";

// Geschiedenis: wie heeft wat wanneer veranderd. Leest het auditlog en zet elke regel om naar gewone taal.

type Werk = { id: string; werknummer?: string; projectnaam?: string };
type Medewerker = { id: string; naam: string };
type Soort = "planning" | "afwezigheid" | "werken" | "medewerkers" | "notities" | "overig";

const SOORTEN: [Soort | "alles", string][] = [
  ["alles", "Alles"], ["planning", "Planning"], ["afwezigheid", "Afwezigheid"], ["werken", "Werken"],
  ["medewerkers", "Medewerkers"], ["notities", "Notities"], ["overig", "Overig"],
];
const ICOON: Record<Soort, typeof History> = {
  planning: CalendarDays, afwezigheid: UserX, werken: FolderOpen, medewerkers: UserCircle, notities: MessageSquare, overig: Settings,
};

const PLAN_ACTIES: Record<string, string> = {
  planning_opgeslagen: "Planning opgeslagen",
  planning_aangepast: "Planning aangepast",
  planning_gewijzigd: "Planning gewijzigd",
  planning_verschoven_met_werk: "Planning meegeschoven met het werk",
  werken_samengevoegd: "Dubbele werken samengevoegd",
  planning_verwijderd_bij_werk: "Planning verwijderd (werk verwijderd)",
  planning_verwijderd_bij_medewerker: "Planning verwijderd (medewerker verwijderd)",
  afwezigheid_opgeslagen: "Afwezigheid opgeslagen",
  afwezigheid_verwijderd: "Afwezigheid verwijderd",
};
const VELDEN: Record<string, string> = {
  werknummer: "Werknummer", projectnr: "Projectnummer", projectnaam: "Naam", opdrachtgever: "Opdrachtgever", adres: "Adres",
  plaats: "Plaats", afdeling: "Afdeling", afdelingen: "Afdelingen", projectleider: "Projectleider", startdatum: "Startdatum",
  afloopdatum: "Einddatum", status: "Status", medewerkers: "Medewerkers", notities: "Notities", opmerkingen: "Opmerkingen",
  calculatiecode: "Calculatiecode", vestiging: "Vestiging", ar: "A/R", naam: "Naam", functie: "Functie", telefoon: "Telefoon",
  email: "E-mail", competenties: "Competenties", termijnen: "Facturatietermijnen", docs: "Documenten",
};
const VERBORGEN = new Set(["_context", "id", "eersteVanDag", "teamKleur", "uurprijs", "uren", "region"]);

const kort = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const datum = (s: string) => {
  const d = new Date(s.length === 10 ? s + "T12:00" : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};
const wieNaam = (wie: string | null) => (wie ? wie.split("@")[0] : "Systeem");

interface Uitleg {
  soort: Soort;
  titel: string;
  onderwerp?: string;
  werkId?: string;
  regels: string[];
}

function maakUitleg(r: GeschiedenisRegel, werken: Map<string, Werk>, mensen: Map<string, string>): Uitleg {
  const werkLabel = (id?: string | null, ctx?: Record<string, unknown>) => {
    const w = id ? werken.get(id) : undefined;
    const wn = w?.werknummer ?? (ctx?.werknummer as string | undefined);
    const nm = w?.projectnaam ?? (ctx?.projectnaam as string | undefined);
    return [wn, nm].filter(Boolean).join(" – ") || undefined;
  };
  const waarde = (k: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "leeg";
    if ((k === "startdatum" || k === "afloopdatum") && typeof v === "string") return datum(v);
    if (k === "medewerkers" && Array.isArray(v)) return v.map((id) => mensen.get(String(id)) ?? String(id)).join(", ") || "geen";
    if (Array.isArray(v)) return v.join(", ") || "geen";
    if (typeof v === "object") return "aangepast";
    return kort(String(v), 60);
  };
  const veldRegels = (oud: unknown, nieuw: unknown) => {
    const o = (oud ?? {}) as Record<string, unknown>;
    const n = (nieuw ?? {}) as Record<string, unknown>;
    return Object.keys({ ...o, ...n }).filter((k) => !VERBORGEN.has(k)).slice(0, 8)
      .map((k) => `${VELDEN[k] ?? k}: ${waarde(k, o[k])} → ${waarde(k, n[k])}`);
  };
  const ctx = ((r.nieuw ?? {}) as Record<string, unknown>)._context as Record<string, unknown> | undefined;

  if (r.tabel === "availability") {
    const nieuw = Array.isArray(r.nieuw) ? (r.nieuw as LogPlanRij[]) : [];
    const oud = Array.isArray(r.oud) ? (r.oud as LogPlanRij[]) : [];
    const werkIds = [...new Set([...nieuw, ...oud].map((x) => x.data?.projectId).filter(Boolean))] as string[];
    const plan = (x: LogPlanRij) => {
      const d = x.data || {};
      const wie = mensen.get(String(d.employeeId)) ?? "Medewerker";
      const wat = d.projectId ? (werkIds.length === 1 ? "" : werkLabel(String(d.projectId)) ?? "werk") : String(d.status ?? "");
      const tijd = d.startTime && d.endTime && !(d.startTime === "00:00" && d.endTime === "23:59") ? ` ${d.startTime}–${d.endTime}` : "";
      return `${wie} · ${datum(String(d.date ?? ""))}${tijd}${wat ? ` · ${wat}` : ""}${d.note && !d.projectId ? ` (${kort(String(d.note), 40)})` : ""}`;
    };
    const regels = [...nieuw.slice(0, 5).map(plan), ...oud.slice(0, 3).map((x) => "Weg: " + plan(x))];
    const rest = nieuw.length + oud.length - regels.length;
    if (rest > 0) regels.push(`en nog ${rest} regel${rest === 1 ? "" : "s"}`);
    return {
      soort: r.actie.startsWith("afwezigheid") ? "afwezigheid" : "planning",
      titel: PLAN_ACTIES[r.actie] ?? "Planning gewijzigd",
      onderwerp: werkIds.length === 1 ? werkLabel(werkIds[0]) : werkIds.length > 1 ? `${werkIds.length} werken` : undefined,
      werkId: werkIds.length === 1 ? werkIds[0] : undefined,
      regels,
    };
  }
  if (r.tabel === "projects") {
    const onderwerp = werkLabel(r.recordId, ctx ?? (r.oud as Record<string, unknown>));
    const basis = { soort: "werken" as Soort, onderwerp, werkId: r.recordId ?? undefined };
    if (r.actie === "status_gewijzigd") {
      const o = (r.oud as { status?: string })?.status;
      const n = (r.nieuw as { status?: string })?.status;
      return { ...basis, titel: "Status gewijzigd", regels: [`${o ?? "onbekend"} → ${n ?? "onbekend"}`] };
    }
    if (r.actie === "aangemaakt") return { ...basis, titel: "Werk aangemaakt", regels: [] };
    if (r.actie === "verwijderd") return { ...basis, titel: "Werk verwijderd", regels: [] };
    if (r.actie === "gearchiveerd" || r.actie === "hersteld") return { ...basis, titel: `Werk ${r.actie}`, regels: [] };
    return { ...basis, titel: "Werk gewijzigd", regels: veldRegels(r.oud, r.nieuw) };
  }
  if (r.tabel === "employees") {
    const n = (ctx?.naam as string) ?? ((r.oud as { naam?: string })?.naam) ?? mensen.get(r.recordId ?? "");
    const titel = r.actie === "aangemaakt" ? "Medewerker toegevoegd" : r.actie === "verwijderd" ? "Medewerker verwijderd" : `Medewerker ${r.actie === "gewijzigd" ? "gewijzigd" : r.actie}`;
    return { soort: "medewerkers", titel, onderwerp: n, regels: r.actie === "gewijzigd" ? veldRegels(r.oud, r.nieuw) : [] };
  }
  if (r.tabel === "project_meta") {
    const o = (r.oud ?? {}) as { notities?: string; termijnen?: unknown; docs?: unknown };
    const n = (r.nieuw ?? {}) as { notities?: string; termijnen?: unknown; docs?: unknown };
    const onderwerp = werkLabel(r.recordId);
    if (n.notities !== undefined || o.notities !== undefined) {
      const oud = (o.notities ?? "").trim();
      const nieuw = (n.notities ?? "").trim();
      const erbij = nieuw.startsWith(oud) ? nieuw.slice(oud.length).trim() : nieuw;
      return { soort: "notities", titel: nieuw ? "Notitie bij werk" : "Notitie verwijderd", onderwerp, werkId: r.recordId ?? undefined, regels: erbij ? erbij.split("\n").slice(-4).map((x) => kort(x, 140)) : [] };
    }
    if (n.termijnen !== undefined) return { soort: "werken", titel: "Facturatie bijgewerkt", onderwerp, werkId: r.recordId ?? undefined, regels: [] };
    return { soort: "werken", titel: "Documenten bijgewerkt", onderwerp, werkId: r.recordId ?? undefined, regels: [] };
  }
  if (r.tabel === "app_settings") return { soort: "overig", titel: "Instellingen gewijzigd", regels: [] };
  if (r.tabel === "user_roles") return { soort: "overig", titel: "Gebruikersrol gewijzigd", regels: [`Nieuwe rol: ${String(r.nieuw ?? "")}`] };
  return { soort: "overig", titel: r.actie.replace(/_/g, " "), regels: [] };
}

/** Snel achter elkaar opgeslagen notities (automatisch opslaan tijdens typen) tellen als één wijziging. */
function voegNotitiesSamen(regels: GeschiedenisRegel[]): GeschiedenisRegel[] {
  const uit: GeschiedenisRegel[] = [];
  for (const r of regels) {
    const vorige = uit[uit.length - 1];
    if (vorige && r.tabel === "project_meta" && vorige.tabel === "project_meta" && r.recordId === vorige.recordId && r.wie === vorige.wie
      && new Date(vorige.tijd).getTime() - new Date(r.tijd).getTime() < 3 * 60 * 1000) {
      // lijst is nieuwste eerst: de oudere regel levert de oude waarde
      uit[uit.length - 1] = { ...vorige, oud: r.oud ?? vorige.oud };
      continue;
    }
    uit.push(r);
  }
  return uit;
}

const dagKop = (iso: string) => {
  const d = new Date(iso);
  const vandaag = new Date();
  const gisteren = new Date();
  gisteren.setDate(vandaag.getDate() - 1);
  if (d.toDateString() === vandaag.toDateString()) return "Vandaag";
  if (d.toDateString() === gisteren.toDateString()) return "Gisteren";
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

export function GeschiedenisLijst({ projects, employees, recordId, onOpenProject }: {
  projects: Werk[];
  employees: Medewerker[];
  recordId?: string;
  onOpenProject?: (id: string) => void;
}) {
  const [regels, setRegels] = useState<GeschiedenisRegel[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState("");
  const [meer, setMeer] = useState(true);
  const [soort, setSoort] = useState<Soort | "alles">("alles");
  const [zoek, setZoek] = useState("");
  const PAGINA = recordId ? 100 : 200;

  const haal = async (voor?: string) => {
    setLaden(true);
    try {
      const r = await loadGeschiedenis({ limit: PAGINA, voor, recordId });
      setRegels((oud) => (voor ? [...oud, ...r] : r));
      setMeer(r.length === PAGINA);
      setFout("");
    } catch (e) {
      setFout(/rechten|permission|policy/i.test(String((e as Error)?.message)) ? "Je hebt geen rechten om de geschiedenis te bekijken." : "De geschiedenis kon niet worden geladen. Probeer het opnieuw.");
    } finally {
      setLaden(false);
    }
  };
  useEffect(() => { void haal(); }, [recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  const werken = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const mensen = useMemo(() => new Map(employees.map((e) => [e.id, e.naam])), [employees]);
  const items = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return voegNotitiesSamen(regels)
      .map((r) => ({ r, u: maakUitleg(r, werken, mensen) }))
      .filter(({ u }) => soort === "alles" || u.soort === soort)
      .filter(({ r, u }) => !q || [u.titel, u.onderwerp, wieNaam(r.wie), ...u.regels].join(" ").toLowerCase().includes(q));
  }, [regels, werken, mensen, soort, zoek]);

  let vorigeDag = "";
  return <div className="space-y-3">
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-[#616161] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op werk, medewerker of wie het deed" aria-label="Zoeken in geschiedenis"
          className="w-full pl-9 pr-3 py-2 text-sm text-[#242424] border border-[rgba(0,0,0,0.15)] outline-none focus:border-[#1E3A7B]" />
      </div>
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Soort verandering">
        {SOORTEN.filter(([k]) => !recordId || (k !== "medewerkers" && k !== "overig")).map(([k, label]) => (
          <button key={k} onClick={() => setSoort(k)} aria-pressed={soort === k}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${soort === k ? "bg-[#1E3A7B] text-white border-[#1E3A7B]" : "border-[rgba(0,0,0,0.15)] text-[#616161] hover:border-[#1E3A7B]"}`}>
            {label}
          </button>
        ))}
      </div>
    </div>

    {fout && <p className="text-sm text-[#c0392b]">{fout}</p>}
    {!fout && !laden && items.length === 0 && (
      <p className="text-sm text-[#616161] py-6 text-center">
        {regels.length ? "Geen veranderingen gevonden met deze filters." : "Er zijn nog geen veranderingen vastgelegd."}
      </p>
    )}

    <ol className="space-y-1.5">
      {items.map(({ r, u }) => {
        const dag = dagKop(r.tijd);
        const kop = dag !== vorigeDag ? dag : null;
        vorigeDag = dag;
        const Icoon = ICOON[u.soort];
        return <li key={r.id}>
          {kop && <h3 className="text-xs font-semibold text-[#616161] pt-3 pb-1 first-letter:uppercase">{kop}</h3>}
          <div className="flex gap-3 bg-white rounded-lg border border-[rgba(0,0,0,0.06)] px-3 py-2.5">
            <div className="w-8 h-8 rounded-full bg-[#E3E9F5] flex items-center justify-center flex-shrink-0">
              <Icoon className="w-4 h-4 text-[#1E3A7B]" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-[#242424]">{u.titel}</span>
                {u.onderwerp && (u.werkId && onOpenProject && !recordId
                  ? <button onClick={() => onOpenProject(u.werkId!)} className="text-sm text-[#1E3A7B] hover:underline truncate max-w-full text-left">{u.onderwerp}</button>
                  : <span className="text-sm text-[#242424] truncate">{u.onderwerp}</span>)}
              </div>
              {u.regels.length > 0 && <ul className="mt-0.5 space-y-0.5">
                {u.regels.map((x, i) => <li key={i} className="text-xs text-[#616161] break-words">{x}</li>)}
              </ul>}
              <p className="text-[11px] text-[#8A8A8A] mt-1">
                {new Date(r.tijd).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} · {wieNaam(r.wie)}
              </p>
            </div>
          </div>
        </li>;
      })}
    </ol>

    {laden && <div className="flex items-center gap-2 text-sm text-[#616161] py-3"><Loader2 className="w-4 h-4 animate-spin" />Geschiedenis laden…</div>}
    {!laden && meer && regels.length > 0 && (
      <button onClick={() => void haal(regels[regels.length - 1].tijd)} className="w-full py-2 text-sm text-[#1E3A7B] font-semibold hover:underline">
        Oudere veranderingen laden
      </button>
    )}
  </div>;
}

export default function GeschiedenisView(props: { projects: Werk[]; employees: Medewerker[]; onOpenProject?: (id: string) => void }) {
  return <div className="p-4 md:p-6 space-y-4 max-w-4xl">
    <div>
      <h1 className="text-[24px] md:text-[28px] leading-[32px] md:leading-[36px] font-semibold text-[#242424]">Geschiedenis</h1>
      <p className="text-[#616161] text-xs md:text-sm">Wie heeft wat wanneer veranderd in de planning, werken en medewerkers</p>
    </div>
    <GeschiedenisLijst {...props} />
  </div>;
}
