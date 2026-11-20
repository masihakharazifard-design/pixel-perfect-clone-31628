import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSnow, CloudSun, Loader2, MapPin, Sun, Wind } from "lucide-react";

// Weer en planningsadvies: 7-daagse verwachting van Open-Meteo (gratis, zonder account of sleutel)
// met per dag een advies, plus waarschuwingen voor buitenwerk dat op een natte of stormachtige dag staat.

export interface WeerPlanItem {
  datum: string; // JJJJ-MM-DD
  werk: string; // weergavenaam
  buiten: boolean; // buitenwerk (gevel, kozijn, zonwering…)
}

interface Dag {
  datum: string;
  code: number;
  tmin: number;
  tmax: number;
  regenMm: number;
  regenKans: number;
  windstoten: number;
}

export type Soort = "regen" | "wind" | "koud" | "goed";
export const ADVIES: Record<Soort, { kort: string; lang: string; kleur: string; bg: string }> = {
  regen: { kort: "Regen", lang: "Plan binnenschilderwerk en stoffering; geen buitenschilderwerk.", kleur: "#1E3A7B", bg: "#DCE6FA" },
  wind: { kort: "Harde wind", lang: "Geen zonwering buiten monteren en geen ladderwerk buiten.", kleur: "#8A5300", bg: "#FDEBC8" },
  koud: { kort: "Koud", lang: "Buitenverf droogt slecht onder 5 °C; liever binnenwerk.", kleur: "#5134A6", bg: "#ECE6FC" },
  goed: { kort: "Droog", lang: "Geschikt voor buitenschilderwerk en zonwering.", kleur: "#16774A", bg: "#D9F4E5" },
};

export function soortVan(d: Dag): Soort {
  if (d.regenKans >= 60 || d.regenMm >= 2) return "regen";
  if (d.windstoten >= 50) return "wind";
  if (d.tmin < 5) return "koud";
  return "goed";
}

function Icoon({ code, className }: { code: number; className?: string }) {
  const I = code <= 1 ? Sun : code === 2 ? CloudSun : code <= 48 ? Cloud : code <= 57 ? CloudDrizzle : code <= 67 || (code >= 80 && code <= 82) ? CloudRain : code <= 86 ? CloudSnow : CloudLightning;
  return <I className={className} aria-hidden="true" />;
}

const PLAATS_KEY = "maasmond-weer-plaats";
const CACHE_KEY = "maasmond-weer-cache";

// Laatst opgehaalde verwachting, voor waarschuwingen tijdens het inplannen (buiten het Dashboard)
let laatsteWeer: Map<string, Soort> | null = null;
function onthoud(dagen: Dag[]) {
  laatsteWeer = new Map(dagen.map((d) => [d.datum, soortVan(d)]));
}
/** Weersoort op een datum (alleen de komende 7 dagen bekend), of null. */
export function weerOp(datum: string): Soort | null {
  return laatsteWeer?.get(datum) ?? null;
}
/** Verwachting op de achtergrond ophalen (voor de waarschuwingen bij het inplannen). */
export async function laadWeer(): Promise<void> {
  let plaats = "Rotterdam";
  try { plaats = localStorage.getItem(PLAATS_KEY) || plaats; } catch { /* standaard */ }
  try { await haalWeer(plaats); } catch { /* geen weer: dan ook geen waarschuwing */ }
}

async function haalWeer(plaats: string): Promise<{ naam: string; dagen: Dag[] }> {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (c && c.plaats === plaats && Date.now() - c.tijd < 60 * 60 * 1000) { onthoud(c.data.dagen); return c.data; }
  } catch { /* geen cache */ }
  const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(plaats)}&count=1&language=nl&countryCode=NL`)).json();
  const loc = geo?.results?.[0];
  if (!loc) throw new Error(`Plaats "${plaats}" niet gevonden`);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}`
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max"
    + "&timezone=Europe%2FAmsterdam&forecast_days=7";
  const w = await (await fetch(url)).json();
  const d = w?.daily;
  if (!d?.time) throw new Error("Geen weersverwachting ontvangen");
  const dagen: Dag[] = d.time.map((t: string, i: number) => ({
    datum: t,
    code: d.weather_code[i] ?? 0,
    tmin: Math.round(d.temperature_2m_min[i] ?? 0),
    tmax: Math.round(d.temperature_2m_max[i] ?? 0),
    regenMm: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
    regenKans: d.precipitation_probability_max[i] ?? 0,
    windstoten: Math.round(d.wind_gusts_10m_max[i] ?? 0),
  }));
  const data = { naam: loc.name as string, dagen };
  onthoud(dagen);
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ plaats, tijd: Date.now(), data })); } catch { /* vol */ }
  return data;
}

export function WeerAdvies({ planning }: { planning: WeerPlanItem[] }) {
  const [plaats, setPlaats] = useState(() => {
    try { return localStorage.getItem(PLAATS_KEY) || "Rotterdam"; } catch { return "Rotterdam"; }
  });
  const [invoer, setInvoer] = useState(plaats);
  const [weer, setWeer] = useState<{ naam: string; dagen: Dag[] } | null>(null);
  const [fout, setFout] = useState("");
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    let weg = false;
    setLaden(true);
    setFout("");
    haalWeer(plaats)
      .then((w) => { if (!weg) setWeer(w); })
      .catch((e) => { if (!weg) setFout(e instanceof Error ? e.message : "Weer kon niet worden geladen"); })
      .finally(() => { if (!weg) setLaden(false); });
    return () => { weg = true; };
  }, [plaats]);

  const zetPlaats = () => {
    const p = invoer.trim();
    if (!p || p === plaats) return;
    try { localStorage.setItem(PLAATS_KEY, p); } catch { /* geen opslag */ }
    setPlaats(p);
  };

  // Buitenwerk dat op een natte, stormachtige of koude dag staat
  const waarschuwingen = useMemo(() => {
    if (!weer) return [];
    const perDag = new Map(weer.dagen.map((d) => [d.datum, soortVan(d)]));
    const gezien = new Set<string>();
    return planning
      .filter((p) => p.buiten && perDag.has(p.datum) && perDag.get(p.datum) !== "goed")
      .filter((p) => { const k = p.datum + p.werk; if (gezien.has(k)) return false; gezien.add(k); return true; })
      .map((p) => ({ ...p, soort: perDag.get(p.datum) as Soort }))
      .sort((a, b) => a.datum.localeCompare(b.datum));
  }, [weer, planning]);

  const dagNaam = (ds: string) => new Date(ds + "T12:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });

  return <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
    <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between gap-3 flex-wrap">
      <h3 className="text-base leading-[22px] font-semibold text-[#23272F]">Weer en planningsadvies</h3>
      <form onSubmit={(e) => { e.preventDefault(); zetPlaats(); }} className="flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-[#5F6673]" aria-hidden="true" />
        <input value={invoer} onChange={(e) => setInvoer(e.target.value)} onBlur={zetPlaats} aria-label="Plaats voor het weer"
          className="w-32 px-2 py-1 text-xs border border-[rgba(15,23,42,0.15)] rounded-[10px] text-[#23272F] outline-none focus:border-[#1E3A7B]" />
      </form>
    </div>
    {laden && <div className="px-5 py-8 flex items-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Weersverwachting laden…</div>}
    {!laden && fout && <p className="px-5 py-6 text-sm text-[#A42A1E]">{fout}</p>}
    {!laden && weer && <div className="p-4 md:p-5 space-y-4">
      <div className="grid grid-cols-7 gap-1.5">
        {weer.dagen.map((d) => {
          const s = soortVan(d), a = ADVIES[s];
          return <div key={d.datum} className="rounded-[12px] px-1 py-2 text-center" style={{ backgroundColor: a.bg }} title={`${dagNaam(d.datum)}: ${a.kort} – ${a.lang}`}>
            <p className="text-[11px] font-semibold text-[#23272F]">{new Date(d.datum + "T12:00").toLocaleDateString("nl-NL", { weekday: "short" })}</p>
            <Icoon code={d.code} className="w-5 h-5 mx-auto my-1 text-[#23272F]" />
            <p className="text-[11px] tabular-nums text-[#23272F]">{d.tmax}°/{d.tmin}°</p>
            <p className="text-[10px] tabular-nums text-[#5F6673]">{d.regenKans}% · {d.regenMm} mm</p>
            {d.windstoten >= 50 && <p className="text-[10px] text-[#8A5300] flex items-center justify-center gap-0.5"><Wind className="w-3 h-3" aria-hidden="true" />{d.windstoten}</p>}
            <p className="text-[10px] font-semibold mt-0.5" style={{ color: a.kleur }}>{a.kort}</p>
          </div>;
        })}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-[#23272F]">Planningssuggesties</p>
        {weer.dagen.filter((d) => soortVan(d) !== "goed").length === 0
          ? <p className="text-sm text-[#5F6673]">De hele week droog en zacht: goed weer voor buitenwerk.</p>
          : weer.dagen.filter((d) => soortVan(d) !== "goed").map((d) => {
            const a = ADVIES[soortVan(d)];
            return <p key={d.datum} className="text-sm text-[#23272F]"><span className="font-semibold" style={{ color: a.kleur }}>{dagNaam(d.datum)} – {a.kort}:</span> {a.lang}</p>;
          })}
      </div>
      {waarschuwingen.length > 0 && <div className="rounded-[12px] border border-[#F6DCA5] bg-[#FEF3DC] p-3 space-y-1">
        <p className="text-sm font-semibold text-[#7A4A00] flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden="true" />Buitenwerk op een slechte dag ({waarschuwingen.length})</p>
        {waarschuwingen.slice(0, 8).map((w) => <p key={w.datum + w.werk} className="text-xs text-[#7A4A00]">{dagNaam(w.datum)} ({ADVIES[w.soort].kort.toLowerCase()}): <b>{w.werk}</b> — overweeg binnenwerk die dag.</p>)}
      </div>}
      <p className="text-[11px] text-[#9AA1AD]">Weer voor {weer.naam} · bron: Open-Meteo</p>
    </div>}
  </div>;
}
