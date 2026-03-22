import { describe, it, expect } from "vitest";
import {
  parseCoolTier, computeDegree, compute5eDegree, clampDegree,
  buildStuntConfig, buildStuntModifiers, computeDisplayMath,
  validatePoolSpend, selectStrike, parseEntry, normalizeSkillKey,
  buildChatCardData, effectToText, extractD20FromResult
} from "../../scripts/logic.js";
import { matchesWeakness } from "../../scripts/weakness/logic.js";

// --- buildStuntModifiers gaps ---

describe("buildStuntModifiers: spell attack edge cases", () => {
  it("skips spell attack shim when spellAttackMod is null", () => {
    const mods = buildStuntModifiers({ isSpellAttack: true, spellAttackMod: null, currentAttack: 10, rollKind: "attack" });
    expect(mods.find(m => m.label.includes("spell attack"))).toBeUndefined();
  });

  it("skips spell attack shim when spellAttackMod is NaN", () => {
    const mods = buildStuntModifiers({ isSpellAttack: true, spellAttackMod: NaN, currentAttack: 10, rollKind: "attack" });
    expect(mods.find(m => m.label.includes("spell attack"))).toBeUndefined();
  });

  it("skips spell attack shim when delta is 0", () => {
    const mods = buildStuntModifiers({ isSpellAttack: true, spellAttackMod: 10, currentAttack: 10, rollKind: "attack" });
    expect(mods.find(m => m.label.includes("spell attack"))).toBeUndefined();
  });
});

describe("buildStuntModifiers: negative values", () => {
  it("handles negative skillMod with positive currentAttack", () => {
    const mods = buildStuntModifiers({ skillMod: -5, currentAttack: 3, rollKind: "skill", rollKey: "ath" });
    const remap = mods.find(m => m.label.includes("skill→strike"));
    expect(remap.modifier).toBe(-8); // -5 - 3
  });

  it("handles negative currentAttack", () => {
    const mods = buildStuntModifiers({ skillMod: 5, currentAttack: -3, rollKind: "skill", rollKey: "ath" });
    const remap = mods.find(m => m.label.includes("skill→strike"));
    expect(remap.modifier).toBe(8); // 5 - (-3)
  });

  it("handles both negative", () => {
    const mods = buildStuntModifiers({ skillMod: -2, currentAttack: -5, rollKind: "skill", rollKey: "ath" });
    const remap = mods.find(m => m.label.includes("skill→strike"));
    expect(remap.modifier).toBe(3); // -2 - (-5)
  });
});

// --- selectStrike: matching precedence ---

describe("selectStrike: match precedence", () => {
  it("matches by slug first", () => {
    const strikes = [
      { slug: "target", label: "NotThis", item: { slug: "other", name: "Other" } },
    ];
    const { strike } = selectStrike(strikes, "attack", "target");
    expect(strike.slug).toBe("target");
  });

  it("matches by item.slug when slug differs", () => {
    const strikes = [
      { slug: "different", item: { slug: "target", name: "Other" } },
    ];
    const { strike } = selectStrike(strikes, "attack", "target");
    expect(strike.slug).toBe("different"); // found via item.slug
  });

  it("matches by item.id", () => {
    const strikes = [
      { slug: "a", item: { slug: "b", id: "target", name: "c" } },
    ];
    const { strike } = selectStrike(strikes, "attack", "target");
    expect(strike.slug).toBe("a");
  });

  it("matches by label", () => {
    const strikes = [
      { slug: "a", label: "target", item: { slug: "b", name: "c" } },
    ];
    const { strike } = selectStrike(strikes, "attack", "target");
    expect(strike.slug).toBe("a");
  });

  it("matches by item.name", () => {
    const strikes = [
      { slug: "a", label: "b", item: { slug: "c", name: "target" } },
    ];
    const { strike } = selectStrike(strikes, "attack", "target");
    expect(strike.slug).toBe("a");
  });
});

// --- matchesWeakness: undefined traits ---

describe("matchesWeakness: traits edge cases", () => {
  it("handles ctx.traits = undefined", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: undefined };
    const w = { trigger: { kind: "trait", trait: "trip" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  it("handles ctx.traits = null", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: null };
    const w = { trigger: { kind: "trait", trait: "trip" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  it("handles ctx without traits property", () => {
    const ctx = { rollKind: "attack", rollKey: "sword" };
    const w = { trigger: { kind: "attack", trait: "visual" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });
});

// --- extractKeptD20: d20s accessor path (in rolling.js, not logic.js) ---
import { extractKeptD20 } from "../../scripts/adapters/pf2e/rolling.js";

describe("extractKeptD20: PF2e d20s accessor", () => {
  it("extracts via roll.d20s accessor", () => {
    const result = {
      roll: {
        dice: [],
        terms: [],
        d20s: [{ value: 17 }],
      },
    };
    expect(extractKeptD20(result)).toBe(17);
  });

  it("skips d20s if values are not finite", () => {
    const result = {
      roll: {
        dice: [],
        terms: [],
        d20s: [{ value: "abc" }],
      },
    };
    expect(extractKeptD20(result)).toBeNull();
  });
});

// --- parseCoolTier: boolean input ---

describe("parseCoolTier: non-standard inputs", () => {
  it("converts true to 1 (Number(true) = 1)", () => {
    expect(parseCoolTier(true)).toBe(1);
  });

  it("converts false to 0 (Number(false) = 0)", () => {
    expect(parseCoolTier(false)).toBe(0);
  });
});

// --- clampDegree: non-integer ---

describe("clampDegree: non-integer values", () => {
  it("does not round — 1.5 + 1 = 2.5", () => {
    expect(clampDegree(1.5, 1)).toBe(2.5);
  });

  it("clamps non-integer at 3", () => {
    expect(clampDegree(2.5, 1)).toBe(3);
  });
});

// --- effectToText: nested arrays ---

describe("effectToText: nested arrays", () => {
  it("includes string representation of nested arrays", () => {
    const result = effectToText([["prone", "off-guard"], "dazzled"]);
    expect(result).toContain("prone");
    expect(result).toContain("dazzled");
  });
});

// --- normalizeSkillKey: substring inputs ---

describe("normalizeSkillKey: substrings and near-matches", () => {
  it("does not match substring 'acro' (not a valid key)", () => {
    expect(normalizeSkillKey("acro")).toBe("acro"); // pass-through
  });

  it("does not match 'ath1' (not a valid key)", () => {
    expect(normalizeSkillKey("ath1")).toBe("ath1");
  });

  it("does not match 'stealthy' (substring of stealth)", () => {
    expect(normalizeSkillKey("stealthy")).toBe("stealthy");
  });
});

// --- 5e advantage in chat card ---

describe("buildChatCardData: 5e advantage display", () => {
  it("shows advantage consumed when rollTwice is set", () => {
    const ctx = { rollTwice: "keep-higher", rollKind: "skill" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 15, advUsed: true });
    expect(data.logExtras).toContain("Advantage consumed");
  });

  it("does NOT show advantage consumed when rollTwice is null", () => {
    const ctx = { rollTwice: null, rollKind: "skill" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 15, advUsed: true });
    expect(data.logExtras).not.toContain("Advantage consumed");
  });

  it("shows coolNote for advantage when coolBonus is 0 but rollTwice set", () => {
    const ctx = { rollTwice: "keep-higher", coolBonus: 0, rollKind: "skill" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 15 });
    expect(data.coolNote).toContain("Advantage used");
  });
});

// --- computeDisplayMath: d20 = 0 ---

describe("computeDisplayMath: edge d20 values", () => {
  it("handles d20 = 0", () => {
    const r = computeDisplayMath({ d20: 0, skillMod: 5, rollKind: "skill" });
    expect(r.displayTotal).toBe(5); // 0 + 5
  });

  it("handles d20 = 1 (nat 1)", () => {
    const r = computeDisplayMath({ d20: 1, skillMod: 10, rollKind: "skill" });
    expect(r.displayTotal).toBe(11);
  });

  it("handles d20 = 20 (nat 20)", () => {
    const r = computeDisplayMath({ d20: 20, skillMod: 10, rollKind: "skill" });
    expect(r.displayTotal).toBe(30);
  });
});

// --- Weakness effect type edge cases ---

describe("weakness effect handling", () => {
  it("unknown effect type is silently skipped (no crash)", () => {
    // This tests the pure matching logic; applyActorWeaknessesPF2e has the
    // type check, but matchesWeakness doesn't care about effect type
    const ctx = { rollKind: "skill", rollKey: "athletics", traits: [] };
    const w = {
      trigger: { kind: "skill", key: "athletics" },
      effect: { type: "unknown-type", value: "foo" },
      enabled: true,
    };
    expect(matchesWeakness(ctx, w)).toBe(true); // matches, but effect won't apply
  });

  it("weakness with null effect matches but won't crash", () => {
    const ctx = { rollKind: "attack", rollKey: "sword", traits: [] };
    const w = {
      trigger: { kind: "attack" },
      effect: null,
      enabled: true,
    };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });
});

// --- Options override prevention ---

describe("buildStuntConfig: no dangerous field injection", () => {
  it("does not produce actor or target fields", () => {
    const config = buildStuntConfig({ coolStr: "none", actor: "evil", target: "evil", dc: 999 });
    expect(config).not.toHaveProperty("actor");
    expect(config).not.toHaveProperty("target");
    expect(config).not.toHaveProperty("dc");
  });

  it("only produces known fields", () => {
    const config = buildStuntConfig({ coolStr: "full", unknownField: "injection" });
    const keys = Object.keys(config);
    const expected = ["rollKind", "rollKey", "coolTier", "tacticalRisk", "plausible", "chooseAdvNow", "spendPoolNow", "triggerId", "challengeAdj"];
    expect(keys.sort()).toEqual(expected.sort());
  });
});
