import { useEffect, useRef, useState } from "react";
import { Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSnow, CloudSun, Loader2, MapPin, Sun } from "lucide-react";

// Weer via Open-Meteo (gratis, zonder account). Elke plaats in Nederland is te kiezen; voor een werk
// wordt het weer van de plaats van het werkadres gebruikt. Regen = kans ≥ 60% of ≥ 2 mm.

export interface Plaats { naam: string; provincie: string; lat: number; lon: number }
export interface WeerDag { datum: string; code: number; tmin: number; tmax: number; regenMm: number; regenKans: number; regen: boolean }

const PLAATS_KEY = "maasmond-weer-plaats";
const CACHE_KEY = "maasmond-weer-v2";
const DAGEN = 14;

/** Plaatsen in Nederland zoeken (voor de keuzelijst). */
export async function zoekPlaatsen(q: string): Promise<Plaats[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(s)}&count=8&language=nl&countryCode=NL`)).json();
  return ((r?.results || []) as { name: string; admin1?: string; latitude: number; longitude: number }[])
    .map((x) => ({ naam: x.name, provincie: x.admin1 || "", lat: x.latitude, lon: x.longitude }));
}

// Cache per plaats (1 uur), zowel in het geheugen als in de sessie
const geheugen = new Map<string, { tijd: number; plaats: Plaats; dagen: WeerDag[] }>();
const sleutel = (p: string) => p.trim().toLowerCase();
function uitSessie(): Record<string, { tijd: number; plaats: Plaats; dagen: WeerDag[] }> {
  try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}
const bezig = new Map<string, Promise<{ plaats: Plaats; dagen: WeerDag[] } | null>>();

/** Weersverwachting (14 dagen) voor een plaatsnaam in Nederland; null als de plaats niet bestaat. */
export function weerVoor(plaatsnaam: string): Promise<{ plaats: Plaats; dagen: WeerDag[] } | null> {
  const k = sleutel(plaatsnaam);
  if (!k) return Promise.resolve(null);
  const vers = (c?: { tijd: number }) => !!c && Date.now() - c.tijd < 60 * 60 * 1000;
  const g = geheugen.get(k);
  if (vers(g)) return Promise.resolve(g!);
  const s = uitSessie()[k];
  if (vers(s)) { geheugen.set(k, s); return Promise.resolve(s); }
  if (bezig.has(k)) return bezig.get(k)!;
  const p = (async () => {
    try {
      // "Zwolle (Gelderland)": provincie gebruiken om de juiste plaats te kiezen
      const m = plaatsnaam.match(/^(.*?)\s*\((.+)\)\s*$/);
      const opties = await zoekPlaatsen(m ? m[1] : plaatsnaam);
      const plaats = (m && opties.find((o) => o.provincie.toLowerCase() === m[2].trim().toLowerCase())) || opties[0];
      if (!plaats) return null;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${plaats.lat}&longitude=${plaats.lon}`
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max"
        + `&timezone=Europe%2FAmsterdam&forecast_days=${DAGEN}`;
      const d = (await (await fetch(url)).json())?.daily;
      if (!d?.time) return null;
      const dagen: WeerDag[] = d.time.map((t: string, i: number) => {
        const regenMm = Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10, regenKans = d.precipitation_probability_max[i] ?? 0;
        return { datum: t, code: d.weather_code[i] ?? 0, tmin: Math.round(d.temperature_2m_min[i] ?? 0), tmax: Math.round(d.temperature_2m_max[i] ?? 0), regenMm, regenKans, regen: regenKans >= 60 || regenMm >= 2 };
      });
      const item = { tijd: Date.now(), plaats, dagen };
      geheugen.set(k, item);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...uitSessie(), [k]: item })); } catch { /* vol */ }
      return item;
    } catch { return null; } finally { bezig.delete(k); }
  })();
  bezig.set(k, p);
  return p;
}

/** Regent het op die dag in die plaats? null = onbekend (plaats niet gevonden of buiten de verwachting). */
export async function regentOp(plaatsnaam: string, datum: string): Promise<boolean | null> {
  const w = await weerVoor(plaatsnaam);
  const d = w?.dagen.find((x) => x.datum === datum);
  return d ? d.regen : null;
}

function Icoon({ code, className }: { code: number; className?: string }) {
  const I = code <= 1 ? Sun : code === 2 ? CloudSun : code <= 48 ? Cloud : code <= 57 ? CloudDrizzle : code <= 67 || (code >= 80 && code <= 82) ? CloudRain : code <= 86 ? CloudSnow : CloudLightning;
  return <I className={className} aria-hidden="true" />;
}

/** Plaats kiezen uit heel Nederland (zoeken terwijl je typt). */
export function PlaatsKiezer({ waarde, onKies }: { waarde: string; onKies: (p: string) => void }) {
  const [tekst, setTekst] = useState(waarde);
  const [opties, setOpties] = useState<Plaats[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setTekst(waarde), [waarde]);
  const typ = (v: string) => {
    setTekst(v); setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void zoekPlaatsen(v).then(setOpties).catch(() => setOpties([])); }, 250);
  };
  const kies = (p: Plaats) => { const t = p.provincie ? `${p.naam} (${p.provincie})` : p.naam; setTekst(t); setOpen(false); onKies(t); };
  return <div className="relative">
    <div className="flex items-center gap-1.5">
      <MapPin className="w-3.5 h-3.5 text-[#5F6673]" aria-hidden="true" />
      <input value={tekst} onChange={(e) => typ(e.target.value)} onFocus={() => tekst.length >= 2 && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Plaats voor het weer" placeholder="Zoek een plaats"
        className="w-40 px-2 py-1 text-xs border border-[rgba(15,23,42,0.15)] rounded-[10px] text-[#23272F] outline-none focus:border-[#1E3A7B]" />
    </div>
    {open && opties.length > 0 && <div className="absolute right-0 z-20 mt-1 w-56 bg-white border border-[rgba(15,23,42,0.1)] rounded-[10px] shadow-lg overflow-hidden">
      {opties.map((p) => <button key={`${p.naam}-${p.lat}`} onMouseDown={(e) => e.preventDefault()} onClick={() => kies(p)}
        className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#F4F6F9]"><span className="text-[#23272F]">{p.naam}</span>{p.provincie && <span className="text-xs text-[#5F6673]"> · {p.provincie}</span>}</button>)}
    </div>}
  </div>;
}

/** Weerstrook: 7 dagen voor een plaats, met regen of droog. */
export function WeerStrook({ plaats, dagen = 7 }: { plaats: string; dagen?: number }) {
  const [w, setW] = useState<{ plaats: Plaats; dagen: WeerDag[] } | null | undefined>(undefined);
  useEffect(() => { let weg = false; setW(undefined); void weerVoor(plaats).then((x) => { if (!weg) setW(x); }); return () => { weg = true; }; }, [plaats]);
  if (w === undefined) return <p className="py-4 flex items-center gap-2 text-sm text-[#5F6673]"><Loader2 className="w-4 h-4 animate-spin" />Weersverwachting laden…</p>;
  if (!w) return <p className="py-2 text-sm text-[#5F6673]">Geen weer gevonden voor "{plaats}".</p>;
  return <div className="space-y-1.5">
    <div className="grid grid-cols-7 gap-1.5">
      {w.dagen.slice(0, dagen).map((d) => <div key={d.datum} className={`rounded-[12px] px-1 py-2 text-center ${d.regen ? "bg-[#DCE6FA]" : "bg-[#D9F4E5]"}`}>
        <p className="text-[11px] font-semibold text-[#23272F]">{new Date(d.datum + "T12:00").toLocaleDateString("nl-NL", { weekday: "short" })}</p>
        <Icoon code={d.code} className="w-5 h-5 mx-auto my-1 text-[#23272F]" />
        <p className="text-[11px] tabular-nums text-[#23272F]">{d.tmax}°/{d.tmin}°</p>
        <p className="text-[10px] tabular-nums text-[#5F6673]">{d.regenKans}% · {d.regenMm} mm</p>
        <p className={`text-[10px] font-semibold mt-0.5 ${d.regen ? "text-[#1E3A7B]" : "text-[#16774A]"}`}>{d.regen ? "Regen" : "Droog"}</p>
      </div>)}
    </div>
    <p className="text-[11px] text-[#9AA1AD]">Weer voor {w.plaats.naam}{w.plaats.provincie ? ` (${w.plaats.provincie})` : ""} · bron: Open-Meteo</p>
  </div>;
}

/** Dashboard: weer voor een zelf gekozen plaats in Nederland. */
export function WeerAdvies() {
  const [plaats, setPlaats] = useState(() => { try { return localStorage.getItem(PLAATS_KEY) || "Rotterdam"; } catch { return "Rotterdam"; } });
  const kies = (p: string) => { try { localStorage.setItem(PLAATS_KEY, p); } catch { /* geen opslag */ } setPlaats(p); };
  return <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)]">
    <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between gap-3 flex-wrap">
      <h3 className="text-base leading-[22px] font-semibold text-[#23272F]">Weer</h3>
      <PlaatsKiezer waarde={plaats} onKies={kies} />
    </div>
    <div className="p-4 md:p-5"><WeerStrook plaats={plaats} /></div>
  </div>;
}
