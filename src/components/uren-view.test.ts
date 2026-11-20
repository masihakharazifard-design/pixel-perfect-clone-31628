import { describe, expect, it } from "vitest";
import { leesUren } from "./uren-view";

describe("leesUren", () => {
  it("leest gewone getallen, komma's en uren:minuten", () => {
    expect(leesUren("8")).toBe(8);
    expect(leesUren("7,5")).toBe(7.5);
    expect(leesUren("7:30")).toBe(7.5);
    expect(leesUren("8.1")).toBe(8);
  });
  it("leeg is 0, onzin of meer dan 24 is ongeldig", () => {
    expect(leesUren("")).toBe(0);
    expect(leesUren("abc")).toBeNull();
    expect(leesUren("25")).toBeNull();
  });
});
