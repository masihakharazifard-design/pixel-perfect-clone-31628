// Dag-voor-dag agenda van één werk als echte PDF (jsPDF, A4 portret).
// Alle renderlogica staat hier; de UI verzamelt alleen de data.
import { jsPDF } from "jspdf";
import { addDays, parseDay, taakEind, taakKleur, TAAK_TYPES, type Taak } from "./taken";

export interface PlanningPdfProject {
  werknummer: string;
  projectnaam: string;
  opdrachtgever: string;
  adres: string;
  plaats: string;
}

const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function langeDatum(ds: string): string {
  const d = parseDay(ds);
  if (!d) return ds;
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

function isWeekend(ds: string): boolean {
  const d = parseDay(ds);
  if (!d) return false;
  return d.getDay() === 0 || d.getDay() === 6;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** Alle dagen met minstens één actieve taak, chronologisch. */
export function dagenMetTaken(taken: Taak[]): { datum: string; taken: Taak[] }[] {
  const geldig = taken.filter((t) => !!t.start && !!parseDay(t.start));
  if (!geldig.length) return [];
  const starts = geldig.map((t) => t.start).sort();
  const einden = geldig.map((t) => taakEind(t)).sort();
  const eerste = starts[0];
  const laatste = einden[einden.length - 1];
  const out: { datum: string; taken: Taak[] }[] = [];
  let d = eerste;
  let guard = 0;
  while (d <= laatste && guard++ < 4000) {
    const actief = geldig.filter((t) => t.start <= d && d <= taakEind(t));
    if (actief.length) out.push({ datum: d, taken: actief });
    d = addDays(d, 1);
    if (!d) break;
  }
  return out;
}

export function generateProjectPlanningPdf({ project, taken }: { project: PlanningPdfProject; taken: Taak[] }): void {
  const dagen = dagenMetTaken(taken);
  if (!dagen.length) throw new Error("geen taken");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14;
  const bodemMarge = 18;
  let y = 0;

  const kop = () => {
    doc.setFillColor(26, 39, 68);
    doc.rect(0, 0, W, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold").setFontSize(14);
    doc.text(project.projectnaam || project.werknummer || "Planning", M, 12);
    doc.setFont("helvetica", "normal").setFontSize(9);
    const regel2 = [project.werknummer, project.opdrachtgever].filter(Boolean).join("  ·  ");
    const regel3 = [project.adres, project.plaats].filter(Boolean).join(", ");
    doc.text(regel2, M, 18);
    if (regel3) doc.text(regel3, M, 23);
    doc.setTextColor(26, 39, 68);
    y = 34;
  };

  const voet = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120, 130, 155);
      doc.text("Planning gemaakt met Maasmond Planning", M, H - 8);
      doc.text(`Pagina ${i} van ${n}`, W - M, H - 8, { align: "right" });
    }
  };

  kop();

  for (const dag of dagen) {
    const hoogte = 9 + dag.taken.length * 6 + 3;
    if (y + hoogte > H - bodemMarge) {
      doc.addPage();
      kop();
    }
    const weekend = isWeekend(dag.datum);
    doc.setFillColor(weekend ? 244 : 240, weekend ? 246 : 243, weekend ? 250 : 248);
    doc.roundedRect(M, y, W - M * 2, hoogte, 2, 2, "F");
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(26, 39, 68);
    doc.text(langeDatum(dag.datum) + (weekend ? "  (weekend)" : ""), M + 4, y + 6.5);
    let ty = y + 12;
    for (const t of dag.taken) {
      const [r, g, b] = hexToRgb(taakKleur(t.type));
      doc.setFillColor(r, g, b);
      doc.roundedRect(M + 5, ty - 3, 3.2, 3.2, 0.6, 0.6, "F");
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(26, 39, 68);
      const naam = t.taaknaam || t.type || "Taak";
      doc.text(doc.splitTextToSize(naam, 110)[0], M + 11, ty);
      doc.setTextColor(107, 122, 153);
      doc.text(t.type || "-", W - M - 5, ty, { align: "right" });
      ty += 6;
    }
    y += hoogte + 4;
  }

  // Legenda
  const legHoogte = 10 + Math.ceil(TAAK_TYPES.length / 2) * 5.5;
  if (y + legHoogte > H - bodemMarge) { doc.addPage(); kop(); }
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(26, 39, 68);
  doc.text("Type activiteit", M, y + 4);
  let ly = y + 10;
  TAAK_TYPES.forEach((type, i) => {
    const kolom = i % 2;
    const x = M + kolom * ((W - M * 2) / 2);
    if (kolom === 0 && i > 0) ly += 5.5;
    const [r, g, b] = hexToRgb(taakKleur(type));
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, ly - 3, 3.2, 3.2, 0.6, 0.6, "F");
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(26, 39, 68);
    doc.text(type, x + 5.5, ly);
  });

  voet();

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Planning - ${(project.werknummer || project.projectnaam || "werk").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
