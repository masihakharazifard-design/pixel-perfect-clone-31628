// Wachtrij voor dagfoto's en gereedmeldingen die niet verstuurd konden worden (bijv. geen bereik op de bouwplaats).
// De (verkleinde) foto wordt in de browser bewaard en later automatisch opnieuw verstuurd.
import { blobNaarDataUrl } from "./foto";
import type { GereedSoort } from "./store-types";

export interface WachtendeMelding {
  id: string;
  soort?: GereedSoort; // ontbreekt bij oude items = dagfoto
  employeeId: string;
  projectId: string;
  datum: string;
  opmerking: string;
  foto: string; // data-URL (jpeg); leeg bij een gereedmelding zonder foto
  pogingen: number;
  laatsteFout?: string;
}

const SLEUTEL = "maasmond-gereed-wachtrij";
export const MAX_POGINGEN = 20;

export function leesWachtrij(): WachtendeMelding[] {
  try { return JSON.parse(localStorage.getItem(SLEUTEL) || "[]") as WachtendeMelding[]; } catch { return []; }
}
function schrijf(l: WachtendeMelding[]): void {
  localStorage.setItem(SLEUTEL, JSON.stringify(l));
}

/** Melding in de wachtrij zetten (vervangt een eerdere van dezelfde soort voor hetzelfde werk en dezelfde dag). */
export async function zetInWachtrij(m: { soort: GereedSoort; employeeId: string; projectId: string; datum: string; opmerking: string; foto: Blob | null }): Promise<WachtendeMelding> {
  const item: WachtendeMelding = { id: `w-${Date.now()}`, soort: m.soort, employeeId: m.employeeId, projectId: m.projectId, datum: m.datum, opmerking: m.opmerking, foto: m.foto ? await blobNaarDataUrl(m.foto) : "", pogingen: 0 };
  const l = leesWachtrij().filter((x) => !((x.soort || "dag") === m.soort && x.employeeId === m.employeeId && x.projectId === m.projectId && (m.soort === "gereed" || x.datum === m.datum)));
  try { schrijf([...l, item]); }
  catch { throw new Error("De foto kon niet op dit toestel worden bewaard (geheugen vol). Probeer het opnieuw als je bereik hebt."); }
  return item;
}

export function dataUrlNaarBlob(u: string): Blob {
  const [kop, data] = u.split(",");
  const type = /data:([^;]+)/.exec(kop)?.[1] || "image/jpeg";
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Alle wachtende meldingen opnieuw proberen; geslaagde worden uit de wachtrij gehaald. */
export async function verwerkWachtrij<T>(verstuur: (m: WachtendeMelding, foto: Blob | null) => Promise<T>): Promise<{ gelukt: T[]; over: WachtendeMelding[] }> {
  const gelukt: T[] = [];
  const over: WachtendeMelding[] = [];
  for (const m of leesWachtrij()) {
    if (m.pogingen >= MAX_POGINGEN) { over.push(m); continue; }
    try { gelukt.push(await verstuur(m, m.foto ? dataUrlNaarBlob(m.foto) : null)); }
    catch (e) { over.push({ ...m, pogingen: m.pogingen + 1, laatsteFout: e instanceof Error ? e.message : String(e) }); }
  }
  try { schrijf(over); } catch { /* laat staan */ }
  return { gelukt, over };
}

export function verwijderUitWachtrij(id: string): void {
  try { schrijf(leesWachtrij().filter((x) => x.id !== id)); } catch { /* niets */ }
}
