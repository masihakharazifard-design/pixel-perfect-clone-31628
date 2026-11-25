// Rollen en wat iedere rol mag. De beheerder mag altijd alles; voor de andere rollen staat het in de
// tabel rol_rechten (aan te passen in Gebruikersbeheer). De database controleert "kantoor" en "plannen"
// zelf; de app gebruikt de rechten alleen om schermen en knoppen te tonen of te verbergen.

export type AppRole =
  | "beheerder" | "projectleider" | "vestigingsmanager" | "hoofddirectie" | "werkvoorbereider"
  | "planner" | "financieel" | "medewerker" | "stoffeerder" | "onderaannemer";

/** Volgorde waarin rollen worden getoond. */
export const ROLLEN: AppRole[] = [
  "beheerder", "hoofddirectie", "vestigingsmanager", "projectleider", "werkvoorbereider",
  "planner", "financieel", "medewerker", "stoffeerder", "onderaannemer",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  beheerder: "Beheerder",
  hoofddirectie: "Hoofddirectie",
  vestigingsmanager: "Vestigingsmanager",
  projectleider: "Projectleider",
  werkvoorbereider: "Werkvoorbereider / calculator",
  planner: "Planner",
  financieel: "Financieel",
  medewerker: "Schilder",
  stoffeerder: "Stoffeerder",
  onderaannemer: "Onderaannemer",
};

export type Recht = "kantoor" | "plannen" | "urenAccorderen" | "facturatie";
export type Rechten = Record<Recht, boolean>;
export type RechtenPerRol = Partial<Record<AppRole, Rechten>>;

export const RECHTEN: { recht: Recht; label: string; uitleg: string }[] = [
  { recht: "kantoor", label: "Alles zien", uitleg: "Ziet de volledige app: alle werken, de hele planning en alle medewerkers. Zonder dit vinkje krijgt iemand het schilderscherm: alleen de eigen planning, werkbonnen, gereed melden en eigen uren." },
  { recht: "plannen", label: "Plannen en wijzigen", uitleg: "Mag werken en medewerkers inplannen, schuiven en werken wijzigen." },
  { recht: "urenAccorderen", label: "Uren accorderen", uitleg: "Mag ingediende uren goedkeuren of afkeuren." },
  { recht: "facturatie", label: "Facturatie", uitleg: "Ziet het tabblad Facturatie." },
];

const ja = (k: boolean, p: boolean, u: boolean, f: boolean): Rechten => ({ kantoor: k, plannen: p, urenAccorderen: u, facturatie: f });
/** Standaard (gelijk aan de database bij de eerste keer). */
export const STANDAARD_RECHTEN: Record<AppRole, Rechten> = {
  beheerder: ja(true, true, true, true),
  hoofddirectie: ja(true, false, false, true),
  vestigingsmanager: ja(true, true, true, true),
  projectleider: ja(true, true, true, true),
  werkvoorbereider: ja(true, false, false, false),
  planner: ja(true, true, true, true),
  financieel: ja(true, false, true, true),
  medewerker: ja(false, false, false, false),
  stoffeerder: ja(false, false, false, false),
  onderaannemer: ja(false, false, false, false),
};

/** Rechten van iemand met deze rollen (een recht telt als één van de rollen het heeft). */
export function rechtenVoor(rollen: AppRole[], tabel: RechtenPerRol): Rechten {
  const uit = ja(false, false, false, false);
  for (const r of rollen) {
    const basis = STANDAARD_RECHTEN[r];
    if (!basis) continue; // onbekende rol
    const rr = r === "beheerder" ? basis : { ...basis, ...(tabel[r] || {}) };
    (Object.keys(uit) as Recht[]).forEach((k) => { if (rr[k]) uit[k] = true; });
  }
  return uit;
}
