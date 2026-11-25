// Gegevens voor de werkbon-pdf (werkplan) van één werk, opgebouwd uit het werk en de ingeplande regels.
import type { WerkplanWerk } from "./werkplan-pdf";

export interface WpPlanRegel { employeeId: string; date: string; startTime: string; endTime: string; status: string; projectId?: string }
export interface WpWerkInfo {
  werk: string; werknummer?: string; opdrachtgever?: string; adres?: string; projectleider?: string;
  opmerking?: string; startdatum?: string; opleverdatum?: string; omschrijving?: string;
}

const vandaagDs = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dagKort = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });

/** Werkbon-gegevens van één werk, met de planning (wie wanneer) uit de ingeplande regels. */
export function werkbonVoorWerk(pid: string, availability: WpPlanRegel[], naamVan: (id: string) => string, info: (pid: string) => WpWerkInfo, behandeldDoor?: string): WerkplanWerk {
  const i = info(pid);
  const perDag = new Map<string, Set<string>>();
  availability.filter((a) => a.projectId === pid && a.status === "Ingepland").forEach((a) => {
    perDag.set(a.date, (perDag.get(a.date) || new Set()).add(naamVan(a.employeeId)));
  });
  const dagen = [...perDag.keys()].sort();
  const mensen = [...new Set(dagen.flatMap((d) => [...perDag.get(d)!]))].filter(Boolean);
  return {
    werknummer: i.werknummer, opdrachtgever: i.opdrachtgever, werkadres: i.adres, projectleider: i.projectleider,
    uitvoeringDoor: mensen.join(", "), startdatum: i.startdatum || dagen[0], opleverdatum: i.opleverdatum || dagen[dagen.length - 1],
    omschrijving: i.omschrijving, bijzonderheden: i.opmerking,
    planning: dagen.slice(0, 7).map((d) => `${dagKort(d)}: ${[...perDag.get(d)!].filter(Boolean).join(", ")}`).concat(dagen.length > 7 ? [`… en nog ${dagen.length - 7} dagen`] : []),
    invuldatum: vandaagDs(), behandeldDoor,
  };
}
