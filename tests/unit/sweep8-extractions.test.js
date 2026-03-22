import { describe, it, expect } from "vitest";
import {
  buildRollLabel, getSkillModifier, getStrikeAttackModifier,
  buildTriggerRules, getFlavorOptionsForSystem, computeWeaknessEffects,
} from "../../scripts/logic.js";

// --- buildRollLabel ---

describe("buildRollLabel", () => {
  it("returns skill label when present", () => {
    const actor = { skills: { acr: { label: "Acrobatics" } } };
    expect(buildRollLabel(actor, "acr")).toBe("Acrobatics");
  });

  it("returns skill name when label missing", () => {
    const actor = { skills: { acr: { name: "Acrobatics Skill" } } };
    expect(buildRollLabel(actor, "acr")).toBe("Acrobatics Skill");
  });

  it("falls back to SHORT_TO_LABEL for known key", () => {
    const actor = { skills: {} };
    expect(buildRollLabel(actor, "acr")).toBe("Acrobatics");
    expect(buildRollLabel(actor, "ath")).toBe("Athletics");
    expect(buildRollLabel(actor, "med")).toBe("Medicine");
  });

  it("returns 'Skill' when nothing matches", () => {
    const actor = { skills: {} };
    expect(buildRollLabel(actor, "unknownskill")).toBe("Skill");
  });

  it("falls back to SHORT_TO_LABEL for null actor with known key", () => {
    expect(buildRollLabel(null, "acr")).toBe("Acrobatics");
  });

  it("returns 'Skill' for null actor with unknown key", () => {
    expect(buildRollLabel(null, "xyzzy")).toBe("Skill");
  });

  it("normalizes long key names", () => {
    const actor = { skills: { acr: { label: "Acrobatics" } } };
    expect(buildRollLabel(actor, "acrobatics")).toBe("Acrobatics");
  });

  it("checks system.skills fallback", () => {
    const actor = { system: { skills: { ste: { label: "Stealth" } } } };
    expect(buildRollLabel(actor, "ste")).toBe("Stealth");
  });

  it("returns 'Skill' on thrown error", () => {
    const actor = { get skills() { throw new Error("test"); } };
    expect(buildRollLabel(actor, "acr")).toBe("Skill");
  });
});

// --- getSkillModifier ---

describe("getSkillModifier", () => {
  it("reads from system.skills[key].mod", () => {
    const actor = { system: { skills: { acr: { mod: 8 } } } };
    expect(getSkillModifier(actor, "acr")).toBe(8);
  });

  it("reads from system.skills[key].totalModifier", () => {
    const actor = { system: { skills: { acr: { totalModifier: 10 } } } };
    expect(getSkillModifier(actor, "acr")).toBe(10);
  });

  it("reads from skills[key].value", () => {
    const actor = { skills: { acr: { value: 6 } } };
    expect(getSkillModifier(actor, "acr")).toBe(6);
  });

  it("reads from fallback stat.check.mod", () => {
    const actor = {};
    const stat = { check: { mod: 12 } };
    expect(getSkillModifier(actor, "acr", stat)).toBe(12);
  });

  it("reads from fallback stat.mod", () => {
    const actor = {};
    const stat = { mod: 7 };
    expect(getSkillModifier(actor, "acr", stat)).toBe(7);
  });

  it("returns 0 when nothing found", () => {
    expect(getSkillModifier({}, "acr")).toBe(0);
    expect(getSkillModifier(null, "acr")).toBe(0);
  });

  it("prefers system.skills over actor.skills", () => {
    const actor = { system: { skills: { acr: { mod: 10 } } }, skills: { acr: { mod: 5 } } };
    expect(getSkillModifier(actor, "acr")).toBe(10);
  });
});

// --- getStrikeAttackModifier ---

describe("getStrikeAttackModifier", () => {
  it("reads totalModifier", () => {
    expect(getStrikeAttackModifier({ totalModifier: 15 })).toBe(15);
  });

  it("reads attack.totalModifier", () => {
    expect(getStrikeAttackModifier({ attack: { totalModifier: 12 } })).toBe(12);
  });

  it("reads mod fallback", () => {
    expect(getStrikeAttackModifier({ mod: 8 })).toBe(8);
  });

  it("returns 0 for null strike", () => {
    expect(getStrikeAttackModifier(null)).toBe(0);
  });

  it("returns 0 for empty object", () => {
    expect(getStrikeAttackModifier({})).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(getStrikeAttackModifier(undefined)).toBe(0);
  });
});

// --- buildTriggerRules ---

describe("buildTriggerRules", () => {
  it("builds acMod rule", () => {
    const eff = { apply: [{ type: "acMod", value: -2 }] };
    const { rules, conditionsToApply } = buildTriggerRules(eff, 2, "Test");
    expect(rules).toHaveLength(1);
    expect(rules[0].key).toBe("FlatModifier");
    expect(rules[0].selector).toBe("ac");
    expect(rules[0].value).toBe(-2);
    expect(conditionsToApply).toHaveLength(0);
  });

  it("builds saveMods rules (3 saves)", () => {
    const eff = { apply: [{ type: "saveMods", value: -4 }] };
    const { rules } = buildTriggerRules(eff, 2);
    expect(rules).toHaveLength(3);
    expect(rules.map(r => r.selector)).toEqual(["fortitude", "reflex", "will"]);
    rules.forEach(r => expect(r.value).toBe(-4));
  });

  it("builds condition entry (not rule)", () => {
    const eff = { apply: [{ type: "condition", value: "stunned", amount: 2 }] };
    const { rules, conditionsToApply } = buildTriggerRules(eff, 2);
    expect(rules).toHaveLength(0);
    expect(conditionsToApply).toHaveLength(1);
    expect(conditionsToApply[0]).toEqual({ slug: "stunned", value: 2 });
  });

  it("builds off-guard condition", () => {
    const eff = { apply: [{ type: "off-guard", value: true }] };
    const { conditionsToApply } = buildTriggerRules(eff, 2);
    expect(conditionsToApply).toHaveLength(1);
    expect(conditionsToApply[0].slug).toBe("off-guard");
  });

  it("builds removeReaction note", () => {
    const eff = { apply: [{ type: "removeReaction", value: "reaction name" }] };
    const { rules } = buildTriggerRules(eff, 2);
    expect(rules).toHaveLength(1);
    expect(rules[0].text).toContain("No reactions");
  });

  it("builds suppressResistance note", () => {
    const eff = { apply: [{ type: "suppressResistance" }] };
    const { rules } = buildTriggerRules(eff, 2);
    expect(rules[0].text).toContain("Resistances suppressed");
  });

  it("builds generic note", () => {
    const eff = { apply: [{ type: "note", value: "Custom note" }] };
    const { rules } = buildTriggerRules(eff, 2);
    expect(rules[0].text).toBe("Custom note");
  });

  it("includes critApply on degree 3", () => {
    const eff = {
      apply: [{ type: "acMod", value: -2 }],
      critApply: [{ type: "condition", value: "blinded" }],
    };
    const { rules, conditionsToApply } = buildTriggerRules(eff, 3);
    expect(rules).toHaveLength(1);
    expect(conditionsToApply).toHaveLength(1);
    expect(conditionsToApply[0].slug).toBe("blinded");
  });

  it("does NOT include critApply on degree 2", () => {
    const eff = {
      apply: [{ type: "acMod", value: -2 }],
      critApply: [{ type: "condition", value: "blinded" }],
    };
    const { conditionsToApply } = buildTriggerRules(eff, 2);
    expect(conditionsToApply).toHaveLength(0);
  });

  it("handles null/empty effect", () => {
    const { rules, conditionsToApply } = buildTriggerRules(null, 2);
    expect(rules).toHaveLength(0);
    expect(conditionsToApply).toHaveLength(0);
  });

  it("handles mixed rule types", () => {
    const eff = {
      apply: [
        { type: "condition", value: "prone" },
        { type: "acMod", value: -4 },
        { type: "note", value: "Extra" },
      ],
    };
    const { rules, conditionsToApply } = buildTriggerRules(eff, 2, "Boss");
    expect(conditionsToApply).toHaveLength(1);
    expect(rules).toHaveLength(2);
    expect(rules[0].label).toBe("Boss");
  });

  it("returns rounds from effect", () => {
    const { rounds } = buildTriggerRules({ durationRounds: 3 }, 2);
    expect(rounds).toBe(3);
  });

  it("defaults rounds to 1", () => {
    const { rounds } = buildTriggerRules({}, 2);
    expect(rounds).toBe(1);
  });
});

// --- getFlavorOptionsForSystem ---

describe("getFlavorOptionsForSystem", () => {
  it("returns PF2e options when isPF2=true", () => {
    const opts = getFlavorOptionsForSystem(true);
    expect(opts).toHaveLength(3);
    expect(opts[2].label).toContain("circumstance");
  });

  it("returns 5e options when isPF2=false", () => {
    const opts = getFlavorOptionsForSystem(false);
    expect(opts).toHaveLength(3);
    expect(opts[1].label).toContain("Advantage");
  });

  it("has consistent value structure", () => {
    for (const isPF2 of [true, false]) {
      const opts = getFlavorOptionsForSystem(isPF2);
      expect(opts[0].value).toBe(0);
      expect(opts[1].value).toBe(1);
      expect(opts[2].value).toBe(2);
    }
  });
});

// --- computeWeaknessEffects ---

describe("computeWeaknessEffects", () => {
  it("applies degree bump", () => {
    const weaknesses = [{ effect: { type: "degree-bump", value: 1 } }];
    const { degree, degreeBumpTexts } = computeWeaknessEffects(weaknesses, 2);
    expect(degree).toBe(3);
    expect(degreeBumpTexts).toHaveLength(1);
  });

  it("collects conditions to apply without executing", () => {
    const weaknesses = [{ effect: { type: "apply-condition", value: "prone" } }];
    const { conditionsToApply, degreeBumpTexts } = computeWeaknessEffects(weaknesses, 2);
    expect(conditionsToApply).toHaveLength(1);
    expect(conditionsToApply[0].slug).toBe("prone");
    expect(conditionsToApply[0].text).toBe("prone (Actor Weakness)");
    expect(degreeBumpTexts).toHaveLength(0);
  });

  it("handles multiple weaknesses", () => {
    const weaknesses = [
      { effect: { type: "degree-bump", value: 1 } },
      { effect: { type: "apply-condition", value: "dazzled" } },
      { effect: { type: "degree-bump", value: 1 } },
    ];
    const { degree, degreeBumpTexts, conditionsToApply } = computeWeaknessEffects(weaknesses, 1);
    expect(degree).toBe(3);
    expect(degreeBumpTexts).toHaveLength(2);
    expect(conditionsToApply).toHaveLength(1);
  });

  it("clamps degree at 3", () => {
    const weaknesses = [
      { effect: { type: "degree-bump", value: 5 } },
    ];
    const { degree } = computeWeaknessEffects(weaknesses, 2);
    expect(degree).toBe(3);
  });

  it("ignores unknown effect types", () => {
    const weaknesses = [{ effect: { type: "teleport", value: "mars" } }];
    const { degree, degreeBumpTexts, conditionsToApply } = computeWeaknessEffects(weaknesses, 2);
    expect(degree).toBe(2);
    expect(degreeBumpTexts).toHaveLength(0);
    expect(conditionsToApply).toHaveLength(0);
  });

  it("handles null/empty effect", () => {
    const weaknesses = [{ effect: null }, { effect: {} }, {}];
    const { degree } = computeWeaknessEffects(weaknesses, 2);
    expect(degree).toBe(2);
  });

  it("skips empty condition slug", () => {
    const weaknesses = [{ effect: { type: "apply-condition", value: "" } }];
    const { conditionsToApply } = computeWeaknessEffects(weaknesses, 2);
    expect(conditionsToApply).toHaveLength(0);
  });
});
