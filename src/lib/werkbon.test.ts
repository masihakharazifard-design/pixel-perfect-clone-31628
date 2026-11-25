import { describe, expect, it } from "vitest";
import { maakWerkbon } from "./werkbon";
import { berekenUren } from "./store-types";

describe("berekenUren", () => {
  it("trekt de pauze af en rondt af op een kwartier", () => {
    expect(berekenUren("07:00", "16:00", 30)).toBe(8.5);
    expect(berekenUren("07:00", "15:40", 0)).toBe(8.75);
  });
  it("geeft 0 bij een eindtijd voor de begintijd", () => {
    expect(berekenUren("16:00", "07:00", 0)).toBe(0);
  });
});

describe("maakWerkbon", () => {
  it("zet werk, dagen en medewerker in de mail en ontsnapt HTML", () => {
    const wb = maakWerkbon({
      medewerker: "Piet <script>",
      werk: { werknummer: "24001", projectnaam: "Gevel & kozijnen", plaats: "Rotterdam", adres: "Kade 1" },
      dagen: [{ datum: "2026-11-24", start: "07:00", eind: "16:00" }, { datum: "2026-11-23" }],
    });
    expect(wb.onderwerp).toContain("24001 – Gevel & kozijnen");
    expect(wb.html).toContain("Gevel &amp; kozijnen");
    expect(wb.html).not.toContain("<script>");
    expect(wb.tekst.indexOf("23 november")).toBeLessThan(wb.tekst.indexOf("24 november"));
    expect(wb.tekst).toContain("07:00 – 16:00");
  });
});

import { maakWerkplanPdf } from "./werkplan-pdf";
import { maakWerkplanMail } from "./werkbon";
describe("werkplan", () => {
  it("maakt een pdf en een mail met link", async () => {
    const regels = [{ datum: "2026-11-24", start: "07:00", eind: "16:00", werk: "24001 – Gevel", adres: "Kade 1, Rotterdam", opmerking: "Steiger staat er al" }];
    const pdf = maakWerkplanPdf([{ werkadres: "Kade 1, Rotterdam", projectleider: "R. Schwickard", startdatum: "2026-11-24" }, {}]);
    expect(pdf.size).toBeGreaterThan(5000);
    const m = maakWerkplanMail({ medewerker: "Piet", van: "2026-11-23", tot: "2026-11-27", regels, pdfUrl: "https://x/storage/v1/object/sign/a.pdf" });
    expect(m.html).toContain("Werkplan downloaden");
    expect(m.tekst).toContain("24001 – Gevel");
  });
});
