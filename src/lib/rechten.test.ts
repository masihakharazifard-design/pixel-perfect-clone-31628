import { describe, expect, it } from "vitest";
import { rechtenVoor } from "./rechten";

describe("rechtenVoor", () => {
  it("schilder heeft standaard geen kantoorscherm", () => {
    expect(rechtenVoor(["medewerker"], {}).kantoor).toBe(false);
  });
  it("aangepaste rechten uit de tabel gaan voor de standaard", () => {
    const r = rechtenVoor(["hoofddirectie"], { hoofddirectie: { kantoor: true, plannen: true, urenAccorderen: false, facturatie: false } });
    expect(r.plannen).toBe(true);
    expect(r.facturatie).toBe(false);
  });
  it("beheerder mag altijd alles, ook als de tabel iets anders zegt", () => {
    const r = rechtenVoor(["beheerder"], { beheerder: { kantoor: false, plannen: false, urenAccorderen: false, facturatie: false } });
    expect(Object.values(r).every(Boolean)).toBe(true);
  });
  it("onbekende rol geeft geen rechten", () => {
    expect(rechtenVoor(["onbekend" as never], {}).kantoor).toBe(false);
  });
});
