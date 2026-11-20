import { describe, expect, it } from "vitest";
import { addWorkdays, isWeekendStr, shiftPlanRows, workdayDiff } from "./werkdagen";

describe("werkdagen", () => {
  it("herkent het weekend", () => {
    expect(isWeekendStr("2026-11-14")).toBe(true); // zaterdag
    expect(isWeekendStr("2026-11-15")).toBe(true); // zondag
    expect(isWeekendStr("2026-11-16")).toBe(false); // maandag
  });

  it("telt werkdagen over het weekend heen", () => {
    expect(addWorkdays("2026-11-13", 1)).toBe("2026-11-16"); // vrijdag + 1 = maandag
    expect(addWorkdays("2026-11-16", -1)).toBe("2026-11-13");
    expect(workdayDiff("2026-11-13", "2026-11-16")).toBe(1);
    expect(workdayDiff("2026-11-16", "2026-11-13")).toBe(-1);
  });

  it("verschuift een planning zonder in het weekend te belanden", () => {
    const rijen = [
      { id: "a", date: "2026-11-12" }, // do
      { id: "b", date: "2026-11-13" }, // vr
    ];
    const verschoven = shiftPlanRows(rijen, "2026-11-13"); // één werkdag later
    expect(verschoven.map((r) => r.date)).toEqual(["2026-11-13", "2026-11-16"]);
  });

  it("verschuift in kalenderdagen als je bewust op een weekenddag mikt", () => {
    const verschoven = shiftPlanRows([{ id: "a", date: "2026-11-12" }], "2026-11-14");
    expect(verschoven[0].date).toBe("2026-11-14");
  });

  it("doet niets als de startdag gelijk blijft", () => {
    expect(shiftPlanRows([{ id: "a", date: "2026-11-12" }], "2026-11-12")).toEqual([]);
  });
});

import { verschuifMetSprong } from "./werkdagen";
describe("verschuifMetSprong", () => {
  it("springt over een vrije dag en houdt het aantal dagen gelijk", () => {
    // ma 23 t/m wo 25 nov naar ma 30 nov; di 1 dec is de medewerker vrij
    const rows = ["2026-11-23", "2026-11-24", "2026-11-25"].map((date, i) => ({ id: String(i), employeeId: "a", date }));
    const uit = verschuifMetSprong(rows, "2026-11-30", (_r, d) => d === "2026-12-01");
    expect(uit.map((r) => r.date)).toEqual(["2026-11-30", "2026-12-02", "2026-12-03"]);
  });
  it("springt ook over het weekend dat door het springen bereikt wordt", () => {
    const rows = ["2026-11-23", "2026-11-24"].map((date, i) => ({ id: String(i), employeeId: "a", date }));
    const uit = verschuifMetSprong(rows, "2026-11-26", (_r, d) => d === "2026-11-27");
    expect(uit.map((r) => r.date)).toEqual(["2026-11-26", "2026-11-30"]);
  });
});

import { schuifVolgendeOp } from "./werkdagen";
describe("schuifVolgendeOp", () => {
  const rij = (id: string, projectId: string, date: string) => ({ id, employeeId: "a", date, startTime: "07:00", endTime: "17:00", status: "Ingepland", projectId });
  it("schuift het volgende werk op als het verplaatste werk erop terechtkomt", () => {
    // Werk B staat di 24 en wo 25 nov; werk A wordt naar di 24 nov verplaatst
    const alle = [rij("b1", "B", "2026-11-24"), rij("b2", "B", "2026-11-25"), rij("c1", "C", "2026-11-27")];
    const uit = schuifVolgendeOp(alle, [rij("a1", "A", "2026-11-24")], () => false);
    expect(uit.map((r) => `${r.id}:${r.date}`)).toEqual(["b1:2026-11-25", "b2:2026-11-26"]);
  });
  it("laat werk staan dat niet botst en springt over weekend en vrije dag", () => {
    const alle = [rij("b1", "B", "2026-11-27"), rij("c1", "C", "2026-11-30")];
    const uit = schuifVolgendeOp(alle, [rij("a1", "A", "2026-11-27")], (_r, d) => d === "2026-11-30");
    // B gaat van vr 27 naar di 1 dec (weekend + vrije ma 30 overgeslagen); C botst daardoor niet en blijft
    expect(uit.map((r) => `${r.id}:${r.date}`)).toEqual(["b1:2026-12-01"]);
  });
});
