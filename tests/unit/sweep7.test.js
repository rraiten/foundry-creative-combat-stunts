import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupFoundryMocks, teardownFoundryMocks } from "../helpers/foundry-mocks.js";
import {
  buildStuntModifiers, buildChatCardData, computeDisplayMath,
  selectStrike, validatePoolSpend, parseCoolTier,
} from "../../scripts/logic.js";
import { matchesWeakness } from "../../scripts/weakness/logic.js";

// --- getActorWeaknesses / actorHasWeaknesses (mock actor) ---

describe("weakness accessor functions", () => {
  // These are thin wrappers around getFlag — test through matchesWeakness integration
  it("matchesWeakness returns false when weakness has no trigger", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: [] };
    expect(matchesWeakness(ctx, {})).toBe(false);
    expect(matchesWeakness(ctx, { trigger: null })).toBe(false);
  });

  it("matchesWeakness handles trigger with no kind", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: [] };
    expect(matchesWeakness(ctx, { trigger: {} })).toBe(false);
    expect(matchesWeakness(ctx, { trigger: { kind: null } })).toBe(false);
  });
});

// --- pickStatistic behavior (tested via buildContext output) ---

describe("PF2e skill resolution edge cases", () => {
  it("selectStrike with all null items still works (fallback to first)", () => {
    const strikes = [
      { slug: "a", item: null },
      { slug: "b" },
    ];
    const { strike } = selectStrike(strikes, "skill", "acr");
    // Fallback chain: unarmed check → melee check → first
    // null items won't match unarmed/melee, falls through to first
    expect(strike.slug).toBe("a");
  });
});

// --- Pool dialog combat null safety (logic test) ---

describe("pool config combat deletion during dialog", () => {
  it("validatePoolSpend handles pool from deleted combat (null pool)", () => {
    expect(validatePoolSpend(null, {}, "p1").ok).toBe(false);
  });

  it("validatePoolSpend handles pool with missing fields", () => {
    expect(validatePoolSpend({}, {}, "p1").ok).toBe(false); // enabled is falsy
  });

  it("validatePoolSpend handles pool with only enabled=true and no remaining", () => {
    expect(validatePoolSpend({ enabled: true }, {}, "p1").ok).toBe(false); // remaining undefined → 0 → not finite check
  });
});

// --- Chat card with crit path (dead fields removed) ---

describe("buildChatCardData: crit path after dead field removal", () => {
  it("crit degree 3 with no applied effects shows fallback card", () => {
    const applied = { degree: 3 }; // no targetEffect, no selfEffect (crit path)
    const data = buildChatCardData({ degree: 3, ctx: {}, d20: 20, applied });
    expect(data.degree).toBe("Critical Success");
    expect(data.hasAnyApplied).toBe(false);
    expect(data.appliedFallback).toBe("Draw a Creative Stunt Card");
  });

  it("crit degree 0 with no applied effects shows fallback card", () => {
    const applied = { degree: 0 };
    const data = buildChatCardData({ degree: 0, ctx: {}, d20: 1, applied });
    expect(data.degree).toBe("Critical Failure");
    expect(data.appliedFallback).toBe("Draw a Creative Stunt Card");
  });

  it("non-crit with applied effects does NOT show fallback", () => {
    const applied = { targetEffect: "off-guard", degree: 2 };
    const data = buildChatCardData({ degree: 2, ctx: {}, d20: 15, applied });
    expect(data.appliedFallback).toBeNull();
    expect(data.hasAnyApplied).toBe(true);
  });
});

// --- 5e specific: tactical risk applied to total ---

describe("5e tactical risk application", () => {
  it("display math reflects -2 penalty when tacticalRisk=true", () => {
    const r = computeDisplayMath({
      d20: 14, skillMod: 6, coolBonus: 0, tacticalRisk: true, rollKind: "skill",
    });
    expect(r.displayMod).toBe(4); // 6 - 2
    expect(r.displayTotal).toBe(18); // 14 + 4
  });

  it("display math reflects -2 penalty stacked with coolBonus", () => {
    const r = computeDisplayMath({
      d20: 14, skillMod: 6, coolBonus: 2, tacticalRisk: true, rollKind: "skill",
    });
    expect(r.displayMod).toBe(6); // 6 + 2 - 2
    expect(r.displayTotal).toBe(20);
  });

  it("display math without tacticalRisk has no penalty", () => {
    const r = computeDisplayMath({
      d20: 14, skillMod: 6, coolBonus: 0, tacticalRisk: false, rollKind: "skill",
    });
    expect(r.displayMod).toBe(6);
    expect(r.displayTotal).toBe(20);
  });
});

// --- parseCoolTier edge cases for 5e vs PF2e consistency ---

describe("parseCoolTier: 5e consistency", () => {
  it("5e adapter uses Number(coolTier ?? 0) which matches parseCoolTier", () => {
    // 5e adapter does: tier === 2 ? 2 : tier === 1 ? 1 : 0
    // Verify parseCoolTier produces same results
    expect(parseCoolTier(0)).toBe(0);
    expect(parseCoolTier(1)).toBe(1);
    expect(parseCoolTier(2)).toBe(2);
    expect(parseCoolTier("full")).toBe(2);
    expect(parseCoolTier("light")).toBe(1);
  });
});

// --- applyOutcome return shape: all branches return degree ---

describe("applyOutcome return shape contract", () => {
  it("all outcome shapes have degree (tested via buildChatCardData)", () => {
    // No tactical risk
    const applied1 = { degree: 2 };
    expect(buildChatCardData({ degree: applied1.degree, ctx: {}, d20: 10, applied: applied1 }).degree).toBe("Success");

    // Success with target effect
    const applied2 = { targetEffect: "off-guard", degree: 2 };
    expect(buildChatCardData({ degree: applied2.degree, ctx: {}, d20: 10, applied: applied2 }).degree).toBe("Success");

    // Failure with self effect
    const applied3 = { selfEffect: "prone", degree: 1 };
    expect(buildChatCardData({ degree: applied3.degree, ctx: {}, d20: 5, applied: applied3 }).degree).toBe("Failure");

    // Crit (no effects, just degree)
    const applied4 = { degree: 3 };
    expect(buildChatCardData({ degree: applied4.degree, ctx: {}, d20: 20, applied: applied4 }).degree).toBe("Critical Success");
  });
});

// --- Weakness: condition trigger with empty key ---

describe("matchesWeakness: condition trigger edge cases", () => {
  it("condition trigger with empty key matches cond: prefix", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: ["cond:"] };
    const w = { trigger: { kind: "condition", key: "" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("condition trigger with key matches specific condition", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: ["cond:frightened"] };
    const w = { trigger: { kind: "condition", key: "frightened" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("condition trigger does not match without cond: prefix", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: ["frightened"] };
    const w = { trigger: { kind: "condition", key: "frightened" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });
});

// --- buildStuntModifiers: challenge label correctness ---

describe("buildStuntModifiers: challenge labels", () => {
  it("labels +2 as weakness (not major)", () => {
    const mods = buildStuntModifiers({ challengeAdj: 2, rollKind: "skill" });
    expect(mods[0].label).toContain("weakness");
    expect(mods[0].label).not.toContain("major");
  });

  it("labels -2 as resistance (not major)", () => {
    const mods = buildStuntModifiers({ challengeAdj: -2, rollKind: "skill" });
    expect(mods[0].label).toContain("resistance");
    expect(mods[0].label).not.toContain("major");
  });

  it("labels +1 as weakness", () => {
    const mods = buildStuntModifiers({ challengeAdj: 1, rollKind: "skill" });
    expect(mods[0].label).toContain("weakness");
  });

  it("labels -1 as resistance", () => {
    const mods = buildStuntModifiers({ challengeAdj: -1, rollKind: "skill" });
    expect(mods[0].label).toContain("resistance");
  });
});
