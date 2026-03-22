import { describe, it, expect } from "vitest";
import { getSpellAttackModPF2 } from "../../scripts/adapters/pf2e/dc.js";

describe("getSpellAttackModPF2", () => {
  it("returns null for null actor", () => {
    expect(getSpellAttackModPF2(null)).toBeNull();
  });

  it("reads from actor.getStatistic('spell-attack')", () => {
    const actor = {
      getStatistic: (name) => name === "spell-attack" ? { check: { mod: 14 } } : null,
    };
    expect(getSpellAttackModPF2(actor)).toBe(14);
  });

  it("reads from statistic.modifier fallback", () => {
    const actor = {
      getStatistic: (name) => name === "spell-attack" ? { modifier: 12 } : null,
    };
    expect(getSpellAttackModPF2(actor)).toBe(12);
  });

  it("falls back to system.attributes.spellAttack.mod", () => {
    const actor = { system: { attributes: { spellAttack: { mod: 10 } } } };
    expect(getSpellAttackModPF2(actor)).toBe(10);
  });

  it("falls back to spellcasting entries", () => {
    const actor = {
      spellcasting: {
        contents: [
          { statistic: { check: { mod: 16 } } },
        ],
      },
    };
    expect(getSpellAttackModPF2(actor)).toBe(16);
  });

  it("returns null when no spell attack found", () => {
    const actor = { system: {} };
    expect(getSpellAttackModPF2(actor)).toBeNull();
  });

  it("handles actor with getStatistic throwing", () => {
    const actor = {
      getStatistic: () => { throw new Error("test"); },
      system: { attributes: { spellAttack: { mod: 8 } } },
    };
    expect(getSpellAttackModPF2(actor)).toBe(8);
  });

  it("handles spellcasting as array (not object with contents)", () => {
    const actor = {
      spellcasting: [
        { statistic: { modifier: 11 } },
      ],
    };
    expect(getSpellAttackModPF2(actor)).toBe(11);
  });

  it("skips non-finite values", () => {
    const actor = {
      getStatistic: () => ({ check: { mod: NaN } }),
      system: { attributes: { spellAttack: { mod: 9 } } },
    };
    expect(getSpellAttackModPF2(actor)).toBe(9);
  });
});
