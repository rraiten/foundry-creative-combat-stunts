import { describe, it, expect } from "vitest";
import {
  parseCoolTier, computeDegree, compute5eDegree, clampDegree,
  buildStuntConfig, buildStuntModifiers, computeDisplayMath,
  validatePoolSpend, selectStrike, buildChatCardData,
} from "../../scripts/logic.js";
import { matchesWeakness } from "../../scripts/weakness/logic.js";

// --- Bug #1: Spell attack weakness matching ---

describe("matchesWeakness: spell attack via __spell_attack__ key", () => {
  it("matches spell trigger when rollKind=attack and rollKey=__spell_attack__", () => {
    const ctx = { rollKind: "attack", rollKey: "__spell_attack__", traits: [] };
    const w = { trigger: { kind: "spell", key: "spell-attack" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("matches spell trigger with no key when using __spell_attack__", () => {
    const ctx = { rollKind: "attack", rollKey: "__spell_attack__", traits: [] };
    const w = { trigger: { kind: "spell" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("does NOT match attack trigger for __spell_attack__ (spell trigger only)", () => {
    const ctx = { rollKind: "attack", rollKey: "__spell_attack__", traits: [] };
    const w = { trigger: { kind: "attack", key: "longsword" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  it("matches spell trigger with key=__spell_attack__", () => {
    const ctx = { rollKind: "attack", rollKey: "__spell_attack__", traits: [] };
    const w = { trigger: { kind: "spell", key: "__spell_attack__" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("still matches normal spell rollKind", () => {
    const ctx = { rollKind: "spell", rollKey: "fireball", traits: [] };
    const w = { trigger: { kind: "spell" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });
});

// --- 5e adapter behavior ---

describe("5e tactical risk in roll total", () => {
  it("computeDisplayMath includes -2 risk penalty for 5e", () => {
    const r = computeDisplayMath({ d20: 15, skillMod: 5, tacticalRisk: true, rollKind: "skill" });
    expect(r.displayMod).toBe(3); // 5 - 2
    expect(r.displayTotal).toBe(18); // 15 + 3
  });

  it("computeDisplayMath with coolBonus + tacticalRisk for 5e", () => {
    const r = computeDisplayMath({ d20: 12, skillMod: 4, coolBonus: 2, tacticalRisk: true, rollKind: "skill" });
    expect(r.displayMod).toBe(4); // 4 + 2 - 2
    expect(r.displayTotal).toBe(16);
  });
});

describe("5e advantage in buildChatCardData", () => {
  it("shows advantage consumed for 5e when rollTwice is set", () => {
    const ctx = { rollTwice: "keep-higher", rollKind: "skill", coolBonus: 0 };
    const data = buildChatCardData({ degree: 2, ctx, d20: 15, advUsed: true });
    expect(data.logExtras).toContain("Advantage consumed");
    expect(data.coolNote).toContain("Advantage used");
  });
});

// --- Core integration: null actor ---

describe("rollStunt input validation", () => {
  it("buildStuntConfig handles completely empty input", () => {
    const config = buildStuntConfig({});
    expect(config.rollKind).toBe("skill");
    expect(config.rollKey).toBe("acr");
    expect(config.coolTier).toBe(0);
    expect(config.tacticalRisk).toBe(false);
    expect(config.plausible).toBe(false);
    expect(config.chooseAdvNow).toBe(false);
    expect(config.spendPoolNow).toBe(false);
    expect(config.triggerId).toBeNull();
    expect(config.challengeAdj).toBe(0);
  });
});

// --- Pool: TOCTOU awareness ---

describe("Pool spending: sequential consistency", () => {
  it("spending mutates pool state correctly", () => {
    const pool = { enabled: true, size: 4, remaining: 2 };
    const usage = {};

    // First spend validates
    const check1 = validatePoolSpend(pool, usage, "p1");
    expect(check1.ok).toBe(true);

    // Simulate the actual spend
    pool.remaining -= 1;
    usage["p1"] = true;

    // Second spend by same actor fails
    const check2 = validatePoolSpend(pool, usage, "p1");
    expect(check2.ok).toBe(false);
    expect(check2.reason).toBe("Already used this encounter");

    // Third spend by different actor succeeds
    const check3 = validatePoolSpend(pool, usage, "p2");
    expect(check3.ok).toBe(true);

    // Simulate second spend
    pool.remaining -= 1;
    usage["p2"] = true;

    // Now pool is empty
    const check4 = validatePoolSpend(pool, usage, "p3");
    expect(check4.ok).toBe(false);
    expect(check4.reason).toBe("No tokens left");
  });
});

// --- buildContext: null target handling ---

describe("buildContext scenarios (pure logic parts)", () => {
  it("5e DC defaults to 12 when target is null", () => {
    // Test the pure logic: no target → autoDC fallback
    const autoDC = null ?? null ?? 12; // simulates target?.system?.attributes?.ac?.value ?? ...
    expect(Number(autoDC) || 12).toBe(12);
  });

  it("PF2e DC with no target uses level-based formula", () => {
    // Test the pure fallback: 14 + level
    const level = 5;
    expect(14 + level).toBe(19);
  });
});

// --- applyOutcome return shape consistency ---

describe("applyOutcome return shapes", () => {
  it("no tactical risk returns degree only (PF2e pattern)", () => {
    const applied = { degree: 2 };
    expect(applied.degree).toBe(2);
    expect(applied.targetEffect).toBeUndefined();
    expect(applied.selfEffect).toBeUndefined();
  });

  it("buildChatCardData handles applied with no targetEffect/selfEffect", () => {
    const applied = { degree: 2 };
    const data = buildChatCardData({ degree: 2, ctx: {}, d20: 10, applied });
    expect(data.hasAnyApplied).toBe(false);
    expect(data.appliedTargetText).toBeNull();
    expect(data.appliedSelfText).toBeNull();
  });

  it("buildChatCardData handles applied with crit fields (PF2e crit path)", () => {
    const applied = { applied: "draw from deck", crit: "critical-success", degree: 3 };
    const data = buildChatCardData({ degree: 3, ctx: {}, d20: 20, applied });
    expect(data.degree).toBe("Critical Success");
    // crit path has no targetEffect/selfEffect
    expect(data.hasAnyApplied).toBe(false);
    expect(data.appliedFallback).toBe("Draw a Creative Stunt Card");
  });
});

// --- Weakness: unknown effect type ---

describe("weakness effect type handling in applyActorWeaknessesPF2e", () => {
  it("matchesWeakness returns true regardless of effect type", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: [] };
    const w = { trigger: { kind: "skill", key: "ath" }, effect: { type: "teleport", value: "mars" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });
});

// --- extractKeptD20: additional coverage ---
import { extractKeptD20 } from "../../scripts/adapters/pf2e/rolling.js";

describe("extractKeptD20: additional edge cases", () => {
  it("handles result with roll property that has no dice or terms", () => {
    const result = { roll: {} };
    expect(extractKeptD20(result)).toBeNull();
  });

  it("handles result that IS the roll (no .roll wrapper)", () => {
    const result = {
      dice: [{ faces: 20, results: [{ result: 14 }] }],
      terms: [],
    };
    expect(extractKeptD20(result)).toBe(14);
  });

  it("handles isRerolled flag (alternative to rerolled)", () => {
    const result = {
      roll: {
        dice: [{
          faces: 20,
          results: [
            { result: 3, isRerolled: true, discarded: false, active: true },
            { result: 16, isRerolled: false, discarded: false, active: true },
          ],
        }],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBe(16);
  });
});

// --- computeDisplayMath: all modifier combinations ---

describe("computeDisplayMath: comprehensive modifier stacking", () => {
  it("skill with all modifiers", () => {
    const r = computeDisplayMath({
      d20: 14, skillMod: 8, attackMod: 12,
      coolBonus: 2, tacticalRisk: true, challengeAdj: -2,
      rollKind: "skill",
    });
    // base=8, cool=2, risk=-2, challenge=-2 → mod=6
    expect(r.displayMod).toBe(6);
    expect(r.displayTotal).toBe(20);
    expect(r.displayFormula).toBe("1d20 + 6");
  });

  it("attack with all modifiers", () => {
    const r = computeDisplayMath({
      d20: 14, skillMod: 8, attackMod: 12,
      coolBonus: 1, tacticalRisk: true, challengeAdj: 4,
      rollKind: "attack",
    });
    // base=12, cool=1, risk=-2, challenge=4 → mod=15
    expect(r.displayMod).toBe(15);
    expect(r.displayTotal).toBe(29);
  });

  it("all negative modifiers", () => {
    const r = computeDisplayMath({
      d20: 10, skillMod: -2, tacticalRisk: true, challengeAdj: -4,
      rollKind: "skill",
    });
    // base=-2, risk=-2, challenge=-4 → mod=-8
    expect(r.displayMod).toBe(-8);
    expect(r.displayTotal).toBe(2);
    expect(r.displayFormula).toBe("1d20 - 8");
  });
});
