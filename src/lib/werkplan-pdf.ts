// Werkbon schilder (werkplan) als pdf, opgebouwd zoals het Word-formulier "Werkplan schilder":
// kopgegevens, omschrijving, onderaannemers, planning, checklists, klachten, meerwerk, oplevering,
// evaluatie en sponningenlijst. Wat de app weet (werknummer, opdrachtgever, projectleider, data, adres,
// omschrijving, opmerkingen, planning) wordt ingevuld; de rest blijft leeg om op locatie in te vullen.
import { jsPDF } from "jspdf";

export interface WerkplanWerk {
  werknummer?: string;
  opdrachtgever?: string;
  werkadres?: string;
  projectleider?: string;
  uitvoeringDoor?: string; // ingeplande medewerkers
  startdatum?: string; // JJJJ-MM-DD
  opleverdatum?: string; // JJJJ-MM-DD
  omschrijving?: string;
  bijzonderheden?: string;
  planning?: string[]; // regels als "di 1 december: Jan, Piet"
  invuldatum?: string; // JJJJ-MM-DD
  behandeldDoor?: string;
}

const W = 210, H = 297, M = 16, ONDER = H - 18;
const BLAUW: [number, number, number] = [30, 58, 123];
const INKT: [number, number, number] = [35, 39, 47];
const GRIJS: [number, number, number] = [95, 102, 115];
const LIJN: [number, number, number] = [175, 182, 194];

const BEDRIJF = [
  "Maasmond Nederland B.V.", "Vareseweg 140", "3047 AV Rotterdam", "",
  "Tel. +31 (0)10 4150411", "algemeen@maasmond.nl", "www.maasmond.nl", "",
  "NL30 INGB 0659 0253 37", "BIC INGBNL2A", "", "Handelsregister: 01065681", "BTW NL: 801686805B01",
];

function datumNl(ds?: string): string {
  if (!ds || !/^\d{4}-\d{2}-\d{2}/.test(ds)) return "";
  return new Date(ds.slice(0, 10) + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export function werkplanBestandsnaam(naam: string, van?: string, tot?: string): string {
  return `Werkbon schilder ${naam}${van ? ` ${van}` : ""}${tot ? ` tm ${tot}` : ""}.pdf`.replace(/[\/:*?"<>|]+/g, "-");
}

/** Logo (url uit de app) omzetten naar een data-URL voor in de pdf. */
export async function logoDataUrl(url: string): Promise<string | undefined> {
  try {
    const b = await (await fetch(url)).blob();
    return await new Promise((ok, fout) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fout(r.error); r.readAsDataURL(b); });
  } catch { return undefined; }
}

export function maakWerkplanPdf(werken: WerkplanWerk[], logo?: string): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const lijst = werken.length ? werken : [{}];
  const startPaginas: number[] = [];
  let y = 0;
  let werknr = "";

  const kleur = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const lijnKleur = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const tekst = (t: string | string[], x: number, yy: number, o: { b?: boolean; s?: number; c?: [number, number, number]; align?: "left" | "right" | "center" } = {}) => {
    doc.setFont("helvetica", o.b ? "bold" : "normal").setFontSize(o.s ?? 9.5);
    kleur(o.c ?? INKT);
    doc.text(t, x, yy, o.align ? { align: o.align } : undefined);
  };
  const kop = () => {
    tekst("WERKBON", M, 14, { b: true, s: 15, c: BLAUW });
    tekst("Werknummer:", M + 34, 14, { s: 10 });
    lijnKleur(LIJN); doc.setLineWidth(0.25); doc.line(M + 56, 14.8, M + 105, 14.8);
    if (werknr) tekst(werknr, M + 57, 14, { b: true, s: 10 });
    y = 22;
  };
  const nieuwePagina = () => { doc.addPage(); kop(); };
  const ruimte = (h: number) => { if (y + h > ONDER) nieuwePagina(); };

  // Label : invullijn (met eventueel ingevulde waarde)
  const veld = (label: string, waarde: string, x: number, breedte: number, labelB = 45) => {
    tekst(label, x, y);
    tekst(":", x + labelB - 2, y);
    lijnKleur(LIJN); doc.setLineWidth(0.25); doc.line(x + labelB, y + 0.8, x + breedte, y + 0.8);
    if (waarde) tekst(doc.splitTextToSize(waarde, breedte - labelB - 1)[0], x + labelB + 1, y - 0.4, { b: true });
  };
  const rij = (velden: [string, string, number?][], h = 7.5) => {
    ruimte(h);
    const breed = (W - 2 * M) / velden.length;
    velden.forEach(([l, v, lb], i) => veld(l, v, M + i * breed + (i ? 3 : 0), breed - (i ? 3 : 0) - 2, lb ?? (i ? 24 : 45)));
    y += h;
  };
  const kopje = (t: string, extraRuimte = 14) => { ruimte(extraRuimte); y += 2; tekst(t, M, y, { b: true, s: 11 }); y += 4; };
  const vak = (label: string, h: number, hint?: string, inhoud?: string) => {
    ruimte(h + 7);
    tekst(label, M, y, { b: true });
    y += 2;
    lijnKleur(LIJN); doc.setLineWidth(0.3); doc.rect(M, y, W - 2 * M, h);
    if (inhoud) {
      doc.setFontSize(9.5);
      const regels = (doc.splitTextToSize(inhoud, W - 2 * M - 6) as string[]).slice(0, Math.max(1, Math.floor((h - 3) / 4.3)));
      tekst(regels, M + 3, y + 5);
    } else if (hint) tekst(doc.splitTextToSize(hint, W - 2 * M - 6), M + 3, y + 5, { s: 8.5, c: GRIJS });
    y += h + 6;
  };
  // Tabel met kopregel en lege rijen
  const tabel = (koppen: string[], breedtes: number[], rijen: number, rijH = 8) => {
    const kopTekst = koppen.map((k, i) => doc.setFontSize(9).splitTextToSize(k, breedtes[i] - 3) as string[]);
    const hKop = Math.max(7.5, ...kopTekst.map((l) => l.length * 4 + 3.5));
    const teken = (yy: number, metKop: boolean) => {
      let x = M;
      lijnKleur(LIJN); doc.setLineWidth(0.3);
      if (metKop) {
        // Tekstkleur en vulkleur delen in pdf dezelfde instelling: per vak opnieuw zetten
        kopTekst.forEach((l, i) => { doc.setFillColor(238, 241, 245); doc.rect(x, yy, breedtes[i], hKop, "FD"); tekst(l, x + 1.5, yy + 4.8, { b: true, s: 9 }); x += breedtes[i]; });
      }
    };
    ruimte(hKop + rijH * Math.min(rijen, 3));
    teken(y, true);
    y += hKop;
    for (let r = 0; r < rijen; r++) {
      if (y + rijH > ONDER) { nieuwePagina(); teken(y, true); y += hKop; }
      let x = M;
      breedtes.forEach((b) => { doc.rect(x, y, b, rijH); x += b; });
      y += rijH;
    }
    y += 5;
  };
  // Checklist met kolommen Ja / Nee / Nvt en onderaan "Anders:"
  const checklist = (titel: string, items: string[], anders = true) => {
    const bJa = 13, bItem = W - 2 * M - 3 * bJa;
    const regels = items.map((t) => doc.setFontSize(9.5).splitTextToSize(t, bItem - 3) as string[]);
    const hoogtes = regels.map((l) => Math.max(7, l.length * 4.2 + 2.8));
    ruimte(7.5 + hoogtes.slice(0, 3).reduce((s, h) => s + h, 0));
    lijnKleur(LIJN); doc.setLineWidth(0.3);
    doc.setFillColor(238, 241, 245);
    doc.rect(M, y, W - 2 * M, 7.5, "FD");
    if (titel) tekst(titel, M + 1.5, y + 5, { b: true });
    ["Ja", "Nee", "Nvt"].forEach((k, i) => { doc.line(M + bItem + i * bJa, y, M + bItem + i * bJa, y + 7.5); tekst(k, M + bItem + i * bJa + bJa / 2, y + 5, { b: true, s: 9, align: "center" }); });
    y += 7.5;
    regels.forEach((l, i) => {
      if (y + hoogtes[i] > ONDER) nieuwePagina();
      doc.rect(M, y, bItem, hoogtes[i]);
      [0, 1, 2].forEach((k) => doc.rect(M + bItem + k * bJa, y, bJa, hoogtes[i]));
      tekst(l, M + 1.5, y + 4.8);
      y += hoogtes[i];
    });
    if (anders) {
      ruimte(16);
      doc.rect(M, y, W - 2 * M, 16);
      tekst("Anders:", M + 1.5, y + 4.8);
      y += 16;
    }
    y += 6;
  };

  lijst.forEach((werk, wi) => {
    if (wi > 0) doc.addPage();
    werknr = werk.werknummer || "";
    startPaginas.push(doc.getNumberOfPages());
    kop();

    // Bedrijfsgegevens rechtsboven (zoals in het briefpapier)
    const bx = 148;
    if (logo) { try { doc.addImage(logo, "JPEG", bx, 19, 11, 11); } catch { /* geen logo */ } }
    tekst("MAASMOND", bx + (logo ? 13 : 0), 27, { b: true, s: 13, c: BLAUW });
    BEDRIJF.forEach((r, i) => r && tekst(r, bx, 35 + i * 3.7, { s: 8, c: GRIJS }));

    // Kopgegevens links naast het bedrijfsblok
    const smal = bx - M - 6;
    const linksRij = (l: string, v = "", h = 7.5) => { veld(l, v, M, smal); y += h; };
    linksRij("Invuldatum", datumNl(werk.invuldatum));
    linksRij("Behandeld door", werk.behandeldDoor || "", 11);
    linksRij("Opdrachtgever", werk.opdrachtgever || "");
    linksRij("Adres");
    linksRij("Postcode / Plaats", "", 11);
    linksRij("Contactpersoon op locatie");
    linksRij("Telefoon", "", 11);
    y = Math.max(y, 35 + BEDRIJF.length * 3.7 + 4);

    rij([["Projectleider", werk.projectleider || ""], ["Telefoon", ""]]);
    rij([["Uitvoerder", ""], ["Telefoon", ""]]);
    rij([["Voorman", ""], ["Telefoon", ""]], 11);
    rij([["Uitvoering door", werk.uitvoeringDoor || ""]]);
    rij([["Startdatum", datumNl(werk.startdatum)], ["Geplande opleverdatum", datumNl(werk.opleverdatum), 40]]);
    rij([["Planning per fase", ""]], 11);
    rij([["Aantal woningen/objecten", ""]]);
    rij([["Ruimte(s)", ""]], 11);
    rij([["Werkadres", werk.werkadres || ""]]);
    rij([["Inkoopordernummer", ""]], 10);

    vak("Omschrijving werkzaamheden:", 42, undefined, werk.omschrijving);
    vak("Bijzonderheden (zoals kleuren):", 28, undefined, werk.bijzonderheden);
    ruimte(16);
    tekst(doc.splitTextToSize("Dit werkplan dient te worden doorgenomen tijdens de kick-offmeeting, die voorafgaand aan aanvang gehouden dient te worden.", W - 2 * M), M, y, { s: 9 });
    y += 9;
    tekst(doc.splitTextToSize("Werkplan doorgenomen en bestudeerd; akkoord voor uitvoering door eigen medewerkers, voorlieden en onderaannemers.", W - 2 * M), M, y, { s: 9 });
    y += 10;

    kopje("Onderaannemers:");
    tabel(["Bedrijf", "Contactpersoon", "Telefoonnummer"], [70, 62, W - 2 * M - 132], 5);
    vak("Planning:", 34, undefined, (werk.planning || []).join("\n"));
    vak("Route / Werkvolgorde", 40, "Per straat of woonblok. Bijvoorbeeld: Week 1 – Straat A, Straat B; Week 2 – Straat C; Week 3 – Straat D.");
    ruimte(12);
    tekst("Eventuele afwijkingen direct communiceren met de projectleider:", M, y);
    lijnKleur(LIJN); doc.line(M, y + 7, W - M, y + 7);
    y += 14;

    kopje("Checklist:");
    checklist("Materieel", ["Steiger", "Hoogwerker", "Aanhanger", "Containers", "Schaftkeet", "Pas op nat kaart", "Toiletvoorziening"]);
    checklist("Veiligheid", ["V&G-plan ontvangen", "LMRA uitgevoerd", "PBM's aanwezig", "EHBO aanwezig", "Brandblusser aanwezig", "Noodnummers bekend"]);
    checklist("Bewonerscommunicatie", [
      "Bewonersbrief verstuurd. Zo ja, wanneer:",
      "Contactgegevens uitvoerder in bewonersbrief opgenomen",
      "Bewoners geïnformeerd over planning",
      "Klachten geregistreerd. Zo ja, vermeld volledige info op volgende pagina.",
      "Klachten afgehandeld. Zo ja, vermeld volledige info op volgende pagina.",
    ]);

    kopje("Klachtenregistratie (inclusief genomen maatregel en oplossing):", 40);
    vak("Omschrijving klacht:", 26);
    vak("Klacht ontvangen van:", 14);
    vak("Genomen maatregel:", 26);
    vak("Foto's:", 40);
    checklist("", ["Klacht naar tevredenheid opgelost:"], false);

    kopje("Meerwerk", 40);
    tabel(["Datum", "Locatie meerwerk (straat, huisnummer)", "Contactpersoon (incl. telefoonnummer)", "Omschrijving meerwerk"], [24, 46, 46, W - 2 * M - 116], 12, 9);

    checklist("Oplevering", [
      "Eigen controle uitgevoerd", "Restpunten opgelost", "Oplevering met opdrachtgever", "Opleverformulier ondertekend",
      "Foto's gemaakt", "Enquête bewoners verzonden", "Zijn alle materialen en het materieel afgevoerd",
    ]);
    kopje("Evaluatie", 40);
    vak("Wat ging goed:", 24);
    vak("Verbeterpunten:", 24);
    vak("Bijzonderheden voor een volgend project:", 24);
    vak("Aanvullende opmerking:", 18);
    checklist("Algemeen", [
      "Werkzaamheden uitgevoerd conform werkbon",
      "Vochtmeting nodig",
      "Juiste materiaal aanwezig: (soort / kleurnummer → controle met offerte/opdracht)",
    ], false);

    // Sponningenlijst op een eigen pagina
    nieuwePagina();
    tekst("Sponningenlijst", M, y + 2, { b: true, s: 13 });
    y += 10;
    const sponning: Record<string, string> = { Project: werk.werknummer || "", "Adres / Complex": werk.werkadres || "", Uitvoerder: "" };
    for (const l of Object.keys(sponning)) { veld(l, sponning[l], M, W - M - 40, 36); y += 8; }
    y += 2;
    tabel(["Woningadres", "Onderdeel", "Buiten/ binnen", "Reden niet uitgevoerd"], [52, 42, 26, W - 2 * M - 120], 22, 8.5);
  });

  // Voettekst per werkbon: "Werkbon schilder – Pagina x van n"
  const totaal = doc.getNumberOfPages();
  startPaginas.forEach((start, i) => {
    const eind = (startPaginas[i + 1] ?? totaal + 1) - 1;
    for (let p = start; p <= eind; p++) {
      doc.setPage(p);
      tekst("Werkbon schilder", M, H - 9, { s: 8, c: GRIJS });
      tekst(`Pagina ${p - start + 1} van ${eind - start + 1}`, W / 2, H - 9, { s: 8, c: GRIJS, align: "center" });
    }
  });
  return doc.output("blob");
}

export function downloadBlob(blob: Blob, naam: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = naam;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
