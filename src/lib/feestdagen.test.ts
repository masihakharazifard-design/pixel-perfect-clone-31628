import { describe, expect, it } from "vitest";
import { feestdagenVan, feestdagOp, paaszondag } from "./feestdagen";

describe("feestdagen", () => {
  it("berekent Pasen correct", () => {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect(iso(paaszondag(2025))).toBe("2025-04-20");
    expect(iso(paaszondag(2026))).toBe("2026-04-05");
    expect(iso(paaszondag(2027))).toBe("2027-03-28");
    expect(iso(paaszondag(2030))).toBe("2030-04-21");
  });

  it("geeft alle elf feestdagen van 2026", () => {
    expect(feestdagenVan(2026).map((f) => f.date)).toEqual([
      "2026-01-01", "2026-04-03", "2026-04-05", "2026-04-06", "2026-04-27", "2026-05-05",
      "2026-05-14", "2026-05-24", "2026-05-25", "2026-12-25", "2026-12-26",
    ]);
  });

  it("verschuift Koningsdag naar 26 april als 27 april een zondag is", () => {
    expect(feestdagOp("2025-04-26")).toBe("Koningsdag");
    expect(feestdagOp("2025-04-27")).toBeNull();
    expect(feestdagOp("2031-04-26")).toBe("Koningsdag");
  });

  it("werkt ook ver na de oude handmatige lijst", () => {
    expect(feestdagOp("2028-12-25")).toBe("Eerste Kerstdag");
    expect(feestdagOp("2035-05-03")).toBe("Hemelvaartsdag");
    expect(feestdagOp("2028-03-15")).toBeNull();
  });
});
