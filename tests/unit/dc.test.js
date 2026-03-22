import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupFoundryMocks, teardownFoundryMocks } from "../helpers/foundry-mocks.js";
import { getDefenseDC, getLevelBasedDC } from "../../scripts/adapters/pf2e/dc.js";

describe("getDefenseDC", () => {
  it("returns perception DC from explicit dc.value", () => {
    const target = { system: { attributes: { perception: { dc: { value: 25 } } } } };
    expect(getDefenseDC(target, "perception")).toBe(25);
  });

  it("computes perception DC from modifier (10 + mod)", () => {
    const target = { system: { attributes: { perception: { totalModifier: 12 } } } };
    expect(getDefenseDC(target, "perception")).toBe(22);
  });

  it("returns null for perception when no data", () => {
    const target = { system: { attributes: {} } };
    expect(getDefenseDC(target, "perception")).toBeNull();
  });

  it("returns save DC from explicit dc.value", () => {
    const target = { system: { saves: { fortitude: { dc: { value: 28 } } } } };
    expect(getDefenseDC(target, "fortitude")).toBe(28);
  });

  it("computes save DC from modifier", () => {
    const target = { system: { saves: { reflex: { totalModifier: 10 } } } };
    expect(getDefenseDC(target, "reflex")).toBe(20);
  });

  it("returns null when save does not exist", () => {
    const target = { system: { saves: {} } };
    expect(getDefenseDC(target, "will")).toBeNull();
  });

  it("returns null for null target", () => {
    expect(getDefenseDC(null, "fortitude")).toBeNull();
  });

  it("falls back to mod when totalModifier is missing", () => {
    const target = { system: { saves: { fortitude: { mod: 7 } } } };
    expect(getDefenseDC(target, "fortitude")).toBe(17);
  });
});

describe("getLevelBasedDC", () => {
  beforeEach(() => setupFoundryMocks());
  afterEach(() => teardownFoundryMocks());

  it("looks up DC from game.pf2e.DCByLevel table", () => {
    const actor = { system: { details: { level: { value: 5 } } } };
    expect(getLevelBasedDC(actor)).toBe(20);
  });

  it("uses fallback formula 14 + level when table missing", () => {
    globalThis.game.pf2e.DCByLevel = undefined;
    const actor = { system: { details: { level: { value: 3 } } } };
    expect(getLevelBasedDC(actor)).toBe(17);
  });

  it("handles level as plain number", () => {
    const actor = { system: { details: { level: 2 } } };
    expect(getLevelBasedDC(actor)).toBe(16);
  });

  it("defaults to level 0 when level missing", () => {
    const actor = { system: { details: {} } };
    expect(getLevelBasedDC(actor)).toBe(14);
  });
});
