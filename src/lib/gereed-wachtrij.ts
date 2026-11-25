// Wachtrij voor gereedmeldingen die niet verstuurd konden worden (bijv. geen bereik op de bouwplaats).
// De (verkleinde) foto wordt in de browser bewaard en later automatisch opnieuw verstuurd.
import { blobNaarDataUrl } from "./foto";

export interface WachtendeMelding {
  id: string;
  employeeId: string;
  projectId: string;
  datum: string;
  opmerking: string;
  foto: string; // data-URL (jpeg)
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

/** Melding in de wachtrij zetten (vervangt een eerdere voor hetzelfde werk en dezelfde dag). */
export async function zetInWachtrij(m: { employeeId: string; projectId: string; datum: string; opmerking: string; foto: Blob }): Promise<WachtendeMelding> {
  const item: WachtendeMelding = { id: `w-${Date.now()}`, employeeId: m.employeeId, projectId: m.projectId, datum: m.datum, opmerking: m.opmerking, foto: await blobNaarDataUrl(m.foto), pogingen: 0 };
  const l = leesWachtrij().filter((x) => !(x.employeeId === m.employeeId && x.projectId === m.projectId && x.datum === m.datum));
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
export async function verwerkWachtrij<T>(verstuur: (m: WachtendeMelding, foto: Blob) => Promise<T>): Promise<{ gelukt: T[]; over: WachtendeMelding[] }> {
  const gelukt: T[] = [];
  const over: WachtendeMelding[] = [];
  for (const m of leesWachtrij()) {
    if (m.pogingen >= MAX_POGINGEN) { over.push(m); continue; }
    try { gelukt.push(await verstuur(m, dataUrlNaarBlob(m.foto))); }
    catch (e) { over.push({ ...m, pogingen: m.pogingen + 1, laatsteFout: e instanceof Error ? e.message : String(e) }); }
  }
  try { schrijf(over); } catch { /* laat staan */ }
  return { gelukt, over };
}

export function verwijderUitWachtrij(id: string): void {
  try { schrijf(leesWachtrij().filter((x) => x.id !== id)); } catch { /* niets */ }
}
