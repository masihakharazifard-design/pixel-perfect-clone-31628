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
