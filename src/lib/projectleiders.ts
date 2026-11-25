// Projectleiders: afkortingen (uit Excel "Projectl.") → volledige naam.
// Vaste standaardlijst; aan te vullen/wijzigen via Instellingen → Projectleiders (settings.projectleiderNamen).
export const DEFAULT_PL_NAMEN: Record<string, string> = { RV: "Ronald Voermans", CB: "Cris Bruin", DDH: "Dennis de Haan", RSC: "Rick Schwickard", RDE: "Rick Deltenre" };

export function normPlAliases(m: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  Object.entries(m).forEach(([k, v]) => { const kk = k.trim().toUpperCase(); const vv = String(v || "").trim(); if (kk && vv) o[kk] = vv; });
  return o;
}

export interface PlMedewerker { id: string; naam?: string; email?: string }

/** Naam van de projectleider van een werk: medewerker-id, afkorting of al een naam. */
export function projectleiderNaam(raw: unknown, medewerkers: PlMedewerker[], namen?: Record<string, string>): string {
  const r = String(raw ?? "").trim();
  if (!r) return "";
  const e = medewerkers.find((x) => x.id === r);
  if (e?.naam) return e.naam;
  return normPlAliases({ ...DEFAULT_PL_NAMEN, ...(namen || {}) })[r.toUpperCase()] || r;
}

/** E-mailadres van de projectleider van een werk (via Medewerkers), of "" als dat onbekend is. */
export function projectleiderEmail(raw: unknown, medewerkers: PlMedewerker[], namen?: Record<string, string>): string {
  const r = String(raw ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)) return r;
  const id = medewerkers.find((x) => x.id === r);
  if (id?.email) return id.email.trim();
  const naam = projectleiderNaam(r, medewerkers, namen).toLowerCase();
  const m = medewerkers.find((x) => (x.naam || "").trim().toLowerCase() === naam && x.email);
  return m?.email?.trim() || "";
}
