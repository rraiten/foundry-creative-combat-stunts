import { describe, it, expect } from "vitest";
import {
  buildTriggerRules, buildRollLabel, getSkillModifier,
  getStrikeAttackModifier, computeWeaknessEffects,
  getFlavorOptionsForSystem, buildChatCardData,
} from "../../scripts/logic.js";

// --- buildTriggerRules: off-guard edge case ---

describe("buildTriggerRules: off-guard trigger", () => {
  it("applies off-guard when value is true", () => {
    const eff = { apply: [{ type: "off-guard", value: true }] };
    const { conditionsToApply } = buildTriggerRules(eff, 2);
    expect(conditionsToApply).toHaveLength(1);
    expect(conditionsToApply[0].slug).toBe("off-guard");
  });

  it("skips off-guard when value is false", () => {
    const eff = { apply: [{ type: "off-guard", value: false }] };
    const { conditionsToApply } = buildTriggerRules(eff, 2);
    expect(conditionsToApply).toHaveLength(0);
  });

  it("skips off-guard when value is 0", () => {
    const eff = { apply: [{ type: "off-guard", value: 0 }] };
    const { conditionsToApply } = buildTriggerRules(eff, 2);
    expect(conditionsToApply).toHaveLength(0);
  });

  it("applies off-guard when value is 1", () => {
    const eff = { apply: [{ type: "off-guard", value: 1 }] };
    const { conditionsToApply } = buildTriggerRules(eff, 2);
    expect(conditionsToApply).toHaveLength(1);
  });
});

// --- buildTriggerRules: acMod defaults ---

describe("buildTriggerRules: acMod defaults", () => {
  it("defaults acMod value to -2", () => {
    const eff = { apply: [{ type: "acMod" }] };
    const { rules } = buildTriggerRules(eff, 2);
    expect(rules[0].value).toBe(-2);
  });

  it("defaults acMod type to circumstance", () => {
    const eff = { apply: [{ type: "acMod", value: -3 }] };
    const { rules } = buildTriggerRules(eff, 2);
    expect(rules[0].type).toBe("circumstance");
  });

  it("uses custom modType when provided", () => {
    const eff = { apply: [{ type: "acMod", value: -2, modType: "status" }] };
    const { rules } = buildTriggerRules(eff, 2);
    expect(rules[0].type).toBe("status");
  });
});

// --- computeWeaknessEffects: interaction with matched weaknesses ---

describe("computeWeaknessEffects: degree bump + condition interaction", () => {
  it("degree bump applies before condition collection", () => {
    const weaknesses = [
      { effect: { type: "degree-bump", value: 1 } },
      { effect: { type: "apply-condition", value: "prone" } },
    ];
    const result = computeWeaknessEffects(weaknesses, 1);
    expect(result.degree).toBe(2); // bumped from 1 to 2
    expect(result.degreeBumpTexts).toHaveLength(1);
    expect(result.conditionsToApply).toHaveLength(1);
  });

  it("all degree bumps apply sequentially", () => {
    const weaknesses = [
      { effect: { type: "degree-bump", value: 1 } },
      { effect: { type: "degree-bump", value: 1 } },
      { effect: { type: "degree-bump", value: 1 } },
    ];
    const result = computeWeaknessEffects(weaknesses, 0);
    expect(result.degree).toBe(3); // 0 → 1 → 2 → 3
  });

  it("empty weakness list returns unchanged degree", () => {
    const result = computeWeaknessEffects([], 2);
    expect(result.degree).toBe(2);
    expect(result.degreeBumpTexts).toHaveLength(0);
    expect(result.conditionsToApply).toHaveLength(0);
  });
});

// --- getSkillModifier: priority order ---

describe("getSkillModifier: precedence", () => {
  it("prefers mod over totalModifier", () => {
    const actor = { system: { skills: { acr: { mod: 10, totalModifier: 8 } } } };
    expect(getSkillModifier(actor, "acr")).toBe(10);
  });

  it("prefers totalModifier over value", () => {
    const actor = { system: { skills: { acr: { totalModifier: 8, value: 5 } } } };
    expect(getSkillModifier(actor, "acr")).toBe(8);
  });
});

// --- getStrikeAttackModifier: precedence ---

describe("getStrikeAttackModifier: precedence", () => {
  it("prefers totalModifier over attack.totalModifier", () => {
    expect(getStrikeAttackModifier({ totalModifier: 15, attack: { totalModifier: 10 } })).toBe(15);
  });

  it("prefers attack.totalModifier over mod", () => {
    expect(getStrikeAttackModifier({ attack: { totalModifier: 12 }, mod: 8 })).toBe(12);
  });
});

// --- buildRollLabel: edge cases ---

describe("buildRollLabel: additional edge cases", () => {
  it("handles rollKey=null", () => {
    const actor = { skills: {} };
    expect(buildRollLabel(actor, null)).toBe("Skill");
  });

  it("handles rollKey=undefined", () => {
    const actor = { skills: {} };
    expect(buildRollLabel(actor, undefined)).toBe("Skill");
  });

  it("handles actor with empty system.skills", () => {
    const actor = { system: { skills: {} } };
    expect(buildRollLabel(actor, "acr")).toBe("Acrobatics"); // from SHORT_TO_LABEL
  });
});

// --- getFlavorOptionsForSystem: structure validation ---

describe("getFlavorOptionsForSystem: detailed structure", () => {
  it("PF2e plain has value 0", () => {
    expect(getFlavorOptionsForSystem(true)[0]).toEqual({ value: 0, label: "Plain" });
  });

  it("5e plain has value 0", () => {
    expect(getFlavorOptionsForSystem(false)[0]).toEqual({ value: 0, label: "Plain" });
  });

  it("PF2e top tier mentions circumstance", () => {
    const top = getFlavorOptionsForSystem(true)[2];
    expect(top.label).toContain("circumstance");
    expect(top.label).toContain("+2");
  });

  it("5e top tier mentions Advantage", () => {
    const top = getFlavorOptionsForSystem(false)[2];
    expect(top.label).toContain("Advantage");
  });
});

// --- buildChatCardData: log extras as non-localized display text ---

describe("buildChatCardData: log extras content", () => {
  it("advantage consumed includes dice emoji", () => {
    const ctx = { rollTwice: "keep-higher", rollKind: "skill" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 15, advUsed: true });
    expect(data.logExtras).toMatch(/Advantage consumed/);
  });

  it("pool spent includes cinema emoji", () => {
    const data = buildChatCardData({ degree: 2, ctx: {}, d20: 15, poolSpent: true });
    expect(data.logExtras).toMatch(/Cinematic Pool spent/);
  });

  it("both extras joined with bullet", () => {
    const ctx = { rollTwice: "keep-higher", rollKind: "skill" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 15, advUsed: true, poolSpent: true });
    expect(data.logExtras).toContain(" • ");
  });

  it("no extras when nothing used", () => {
    const data = buildChatCardData({ degree: 2, ctx: {}, d20: 15 });
    expect(data.logExtras).toBe("");
  });
});
