// Werkbon (opdrachtbon) voor een medewerker: wordt gemaild als iets voor hem/haar is ingepland.
// Voorlopige opmaak; de definitieve opmaak volgt later. Pure functie, zodat dezelfde
// werkbon in de app als voorbeeld getoond en op de server verstuurd kan worden.

export interface WerkbonWerk {
  werknummer?: string;
  projectnaam?: string;
  opdrachtgever?: string;
  adres?: string; // straat + huisnummer
  plaats?: string;
  projectleider?: string;
  opmerkingen?: string;
  afdeling?: string;
}

export interface WerkbonDag {
  datum: string; // JJJJ-MM-DD
  start?: string; // UU:MM
  eind?: string;
}

export interface WerkbonInvoer {
  medewerker: string;
  werk: WerkbonWerk;
  dagen: WerkbonDag[];
  bedrijf?: { naam?: string; telefoon?: string; email?: string };
  /** Downloadlink naar de werkbon-pdf (werkplan) */
  pdfUrl?: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function datumLang(ds: string): string {
  const d = new Date(ds + "T12:00:00");
  if (Number.isNaN(d.getTime())) return ds;
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function maakWerkbon(inv: WerkbonInvoer): { onderwerp: string; html: string; tekst: string } {
  const w = inv.werk;
  const naamWerk = [w.werknummer, w.projectnaam].filter(Boolean).join(" – ") || "Werk";
  const dagen = [...inv.dagen].sort((a, b) => a.datum.localeCompare(b.datum));
  const bedrijf = inv.bedrijf?.naam || "Maasmond";
  const eerste = dagen[0] ? datumLang(dagen[0].datum) : "";
  const onderwerp = `Werkbon ${naamWerk}${eerste ? ` – vanaf ${eerste}` : ""}`;
  const adres = [w.adres, w.plaats].filter(Boolean).join(", ");
  const kaart = adres ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}` : "";
  const tijd = (d: WerkbonDag) => (d.start && d.eind ? `${d.start} – ${d.eind}` : d.start || "");

  const regels: [string, string][] = [
    ["Werknummer", w.werknummer || ""],
    ["Werk", w.projectnaam || ""],
    ["Opdrachtgever", w.opdrachtgever || ""],
    ["Adres", adres],
    ["Afdeling", w.afdeling || ""],
    ["Projectleider", w.projectleider || ""],
  ].filter(([, v]) => v) as [string, string][];

  const td = "padding:6px 10px;border-bottom:1px solid #E6E9EF;font-size:14px;color:#23272F;vertical-align:top";
  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:#EEF1F5;font-family:Aptos,'Segoe UI',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1E3A7B;padding:18px 24px;color:#ffffff">
<div style="font-size:12px;opacity:.8">${esc(bedrijf)}</div>
<div style="font-size:22px;font-weight:bold;margin-top:2px">Werkbon</div>
</td></tr>
<tr><td style="padding:20px 24px 4px;font-size:15px;color:#23272F">Beste ${esc(inv.medewerker)},<br><br>Je bent ingepland voor het volgende werk.</td></tr>
<tr><td style="padding:12px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${regels.map(([k, v]) => `<tr><td style="${td};width:130px;color:#5F6673">${esc(k)}</td><td style="${td};font-weight:600">${k === "Adres" && kaart ? `<a href="${kaart}" style="color:#1E3A7B">${esc(v)}</a>` : esc(v)}</td></tr>`).join("\n")}
</table></td></tr>
${inv.pdfUrl ? `<tr><td style="padding:8px 24px 4px"><a href="${esc(inv.pdfUrl)}" style="display:inline-block;background:#E0402F;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 16px;border-radius:8px">Werkplan downloaden (pdf)</a></td></tr>` : ""}
<tr><td style="padding:12px 24px 0;font-size:15px;font-weight:bold;color:#23272F">Ingeplande dagen</td></tr>
<tr><td style="padding:6px 24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${dagen.map((d) => `<tr><td style="${td}">${esc(datumLang(d.datum))}</td><td style="${td};text-align:right;white-space:nowrap">${esc(tijd(d))}</td></tr>`).join("\n")}
</table></td></tr>
${w.opmerkingen ? `<tr><td style="padding:8px 24px 12px"><div style="font-size:15px;font-weight:bold;color:#23272F;margin-bottom:4px">Opmerkingen</div><div style="font-size:14px;color:#23272F;white-space:pre-wrap;background:#F4F6F9;border-radius:8px;padding:10px 12px">${esc(w.opmerkingen)}</div></td></tr>` : ""}
<tr><td style="padding:12px 24px 22px;font-size:12px;color:#5F6673">Vragen over dit werk? Neem contact op met ${esc(w.projectleider || "je projectleider")}${inv.bedrijf?.telefoon ? ` of bel ${esc(inv.bedrijf.telefoon)}` : ""}.<br>Registreer je gewerkte uren in Maasmond Planning.</td></tr>
</table></td></tr></table></body></html>`;

  const tekst = [
    `Werkbon – ${bedrijf}`,
    "",
    `Beste ${inv.medewerker},`,
    "",
    "Je bent ingepland voor het volgende werk.",
    "",
    ...regels.map(([k, v]) => `${k}: ${v}`),
    "",
    "Ingeplande dagen:",
    ...dagen.map((d) => `- ${datumLang(d.datum)}${tijd(d) ? ` (${tijd(d)})` : ""}`),
    ...(w.opmerkingen ? ["", "Opmerkingen:", w.opmerkingen] : []),
    ...(inv.pdfUrl ? ["", `Werkplan (pdf): ${inv.pdfUrl}`] : []),
    "",
    `Vragen over dit werk? Neem contact op met ${w.projectleider || "je projectleider"}${inv.bedrijf?.telefoon ? ` of bel ${inv.bedrijf.telefoon}` : ""}.`,
  ].join("\n");

  return { onderwerp, html, tekst };
}
