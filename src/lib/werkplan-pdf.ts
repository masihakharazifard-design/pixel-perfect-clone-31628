// Werkplan van één medewerker als pdf: per dag de werken met tijden, adres, projectleider en opmerkingen.
import { jsPDF } from "jspdf";
import { datumLang } from "./werkbon";

export interface WerkplanRegel {
  datum: string; // JJJJ-MM-DD
  start?: string;
  eind?: string;
  werk: string; // "werknummer – projectnaam"
  adres?: string;
  projectleider?: string;
  opmerking?: string;
}

export interface WerkplanInvoer {
  medewerker: string;
  van: string;
  tot: string;
  regels: WerkplanRegel[];
  bedrijf?: string;
}

export function werkplanBestandsnaam(medewerker: string, van: string, tot: string): string {
  return `Werkplan ${medewerker} ${van} tm ${tot}.pdf`.replace(/[\/:*?"<>|]+/g, "-");
}

export function maakWerkplanPdf(inv: WerkplanInvoer): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14;
  let y = 0;
  const kop = () => {
    doc.setFillColor(30, 58, 123);
    doc.rect(0, 0, W, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(inv.bedrijf || "Maasmond", M, 8);
    doc.setFont("helvetica", "bold").setFontSize(15);
    doc.text(`Werkplan ${inv.medewerker}`, M, 16);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(`${datumLang(inv.van)} t/m ${datumLang(inv.tot)}`, M, 21);
    y = 32;
  };
  kop();
  const perDag = new Map<string, WerkplanRegel[]>();
  [...inv.regels].sort((a, b) => a.datum.localeCompare(b.datum) || (a.start || "").localeCompare(b.start || ""))
    .forEach((r) => perDag.set(r.datum, [...(perDag.get(r.datum) || []), r]));
  if (!perDag.size) {
    doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(35, 39, 47);
    doc.text("Er is in deze periode niets ingepland.", M, y);
  }
  for (const [datum, lijst] of perDag) {
    const blokken = lijst.map((r) => {
      const extra = [r.adres, r.projectleider ? `Projectleider: ${r.projectleider}` : ""].filter(Boolean).join("  ·  ");
      const opm = r.opmerking ? (doc.setFontSize(8.5), doc.splitTextToSize(r.opmerking, W - M * 2 - 14).slice(0, 4) as string[]) : [];
      return { r, extra, opm, h: 6 + (extra ? 4.5 : 0) + opm.length * 4 + 2 };
    });
    const hoogte = 9 + blokken.reduce((s, b) => s + b.h, 0) + 2;
    if (y + hoogte > H - 16) { doc.addPage(); kop(); }
    doc.setFillColor(238, 241, 245);
    doc.roundedRect(M, y, W - M * 2, hoogte, 2, 2, "F");
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(35, 39, 47);
    doc.text(datumLang(datum), M + 4, y + 6.5);
    let ty = y + 13;
    for (const b of blokken) {
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(35, 39, 47);
      doc.text(doc.splitTextToSize(b.r.werk, 140)[0], M + 6, ty);
      doc.setFont("helvetica", "normal").setTextColor(95, 102, 115);
      if (b.r.start) doc.text(b.r.eind ? `${b.r.start} – ${b.r.eind}` : b.r.start, W - M - 5, ty, { align: "right" });
      ty += 4.5;
      if (b.extra) { doc.setFontSize(8.5); doc.text(doc.splitTextToSize(b.extra, W - M * 2 - 14)[0], M + 6, ty); ty += 4.5; }
      if (b.opm.length) { doc.setFontSize(8.5).setTextColor(35, 39, 47); doc.text(b.opm, M + 6, ty); ty += b.opm.length * 4; }
      ty += 2;
    }
    y += hoogte + 4;
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120, 130, 155);
    doc.text("Maasmond Planning", M, H - 8);
    doc.text(`Pagina ${i} van ${n}`, W - M, H - 8, { align: "right" });
  }
  return doc.output("blob");
}

export function downloadBlob(blob: Blob, naam: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = naam;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
