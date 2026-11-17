import { describe, expect, it } from "vitest";
import { isAllowedLoginEmail } from "./login-access";

describe("login access", () => {
  it("allows the specifically authorized Tyas address", () => {
    expect(isAllowedLoginEmail("tyas@msoftware.nl")).toBe(true);
    expect(isAllowedLoginEmail(" TYAS@MSOFTWARE.NL ")).toBe(true);
  });
  it("does not allow other external addresses", () => {
    expect(isAllowedLoginEmail("other@msoftware.nl")).toBe(false);
    expect(isAllowedLoginEmail("tyas@msoftware.nl.evil.example")).toBe(false);
    expect(isAllowedLoginEmail("tyas@example.nl")).toBe(false);
  });
  it("preserves Maasmond access", () => {
    expect(isAllowedLoginEmail("planner@maasmond.nl")).toBe(true);
  });
});