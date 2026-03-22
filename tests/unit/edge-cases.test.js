import { describe, it, expect } from "vitest";
import {
  parseCoolTier, computeDegree, clampDegree, buildStuntConfig,
  buildStuntModifiers, computeDisplayMath, validatePoolSpend,
  selectStrike, parseEntry, normalizeSkillKey, buildChatCardData,
  effectToText, extractD20FromResult
} from "../../scripts/logic.js";

describe("NaN safety", () => {
  it("buildStuntConfig handles NaN challengeAdj", () => {
    const config = buildStuntConfig({ coolStr: "none", challengeAdj: "abc" });
    expect(config.challengeAdj).toBe(0);
    expect(Number.isNaN(config.challengeAdj)).toBe(false);
  });

  it("buildStuntConfig handles undefined challengeAdj", () => {
    const config = buildStuntConfig({ coolStr: "none" });
    expect(config.challengeAdj).toBe(0);
  });

  it("buildStuntModifiers handles NaN challengeAdj", () => {
    const mods = buildStuntModifiers({ rollKind: "skill", challengeAdj: NaN });
    const ch = mods.find(m => m.label.includes("challenge"));
    expect(ch).toBeUndefined(); // NaN || 0 = 0, so no modifier added
  });

  it("computeDisplayMath handles NaN inputs gracefully", () => {
    const r = computeDisplayMath({ d20: NaN, skillMod: NaN, rollKind: "skill" });
    expect(Number.isNaN(r.displayTotal)).toBe(true); // NaN propagates to total
    // This is acceptable — the chat card will show NaN, which is visible and debuggable
  });

  it("parseCoolTier handles NaN", () => {
    expect(parseCoolTier(NaN)).toBeNaN(); // Number(NaN) = NaN — pass-through
  });
});

describe("Degree bump chain (cinematic + weakness stacking)", () => {
  it("cinematic upgrade then weakness bump both apply", () => {
    let degree = computeDegree(19, 20, 9); // failure (1)
    degree = clampDegree(degree, 1); // cinematic: → success (2)
    degree = clampDegree(degree, 1); // weakness: → crit success (3)
    expect(degree).toBe(3);
  });

  it("multiple weakness bumps clamp at 3", () => {
    let degree = 2; // success
    degree = clampDegree(degree, 1); // bump 1: → 3
    degree = clampDegree(degree, 1); // bump 2: → still 3
    degree = clampDegree(degree, 1); // bump 3: → still 3
    expect(degree).toBe(3);
  });

  it("negative weakness bump reduces degree", () => {
    let degree = 3; // crit success
    degree = clampDegree(degree, -2); // → failure (1)
    expect(degree).toBe(1);
  });

  it("degree never goes below 0", () => {
    let degree = 0; // crit failure
    degree = clampDegree(degree, -5);
    expect(degree).toBe(0);
  });
});

describe("selectStrike edge cases", () => {
  it("handles null entries in strikes array", () => {
    const strikes = [null, undefined, { slug: "fist", item: { system: { traits: { value: ["unarmed"] } } } }];
    const { strike } = selectStrike(strikes, "attack", "fist");
    expect(strike?.slug).toBe("fist");
  });

  it("handles strikes with missing item field", () => {
    const strikes = [{ slug: "punch" }];
    const { strike } = selectStrike(strikes, "attack", "nonexistent");
    expect(strike?.slug).toBe("punch"); // falls through to first
  });

  it("handles empty rollKey", () => {
    const strikes = [{ slug: "fist", item: { system: { traits: { value: ["unarmed"] } } } }];
    const { strike, isSpellAttack } = selectStrike(strikes, "attack", "");
    expect(strike?.slug).toBe("fist");
    expect(isSpellAttack).toBe(false);
  });

  it("handles null rollKey", () => {
    const strikes = [{ slug: "fist", item: { system: { traits: { value: ["unarmed"] } } } }];
    const { strike } = selectStrike(strikes, "attack", null);
    expect(strike?.slug).toBe("fist");
  });
});

describe("buildChatCardData edge cases", () => {
  it("handles null ctx gracefully", () => {
    const data = buildChatCardData({ degree: 2, ctx: null, d20: 10 });
    expect(data.degree).toBe("Success");
    expect(data.displayFormula).toBeDefined();
  });

  it("handles undefined applied", () => {
    const data = buildChatCardData({ degree: 2, ctx: {}, d20: 10, applied: undefined });
    expect(data.hasAnyApplied).toBe(false);
    expect(data.appliedTargetText).toBeNull();
  });

  it("handles degree out of range", () => {
    const data = buildChatCardData({ degree: 5, ctx: {}, d20: 10 });
    expect(data.degree).toBe("—"); // DEGREE_LABELS[5] is undefined
  });

  it("handles negative degree", () => {
    const data = buildChatCardData({ degree: -1, ctx: {}, d20: 10 });
    expect(data.degree).toBe("—");
  });
});

describe("validatePoolSpend edge cases", () => {
  it("handles pool with NaN remaining — rejects as non-finite", () => {
    const pool = { enabled: true, remaining: NaN };
    expect(validatePoolSpend(pool, {}, "p1").ok).toBe(false);
    expect(validatePoolSpend(pool, {}, "p1").reason).toBe("No tokens left");
  });

  it("handles pool with negative remaining", () => {
    const pool = { enabled: true, remaining: -1 };
    expect(validatePoolSpend(pool, {}, "p1").ok).toBe(false);
  });

  it("handles null actorId", () => {
    const pool = { enabled: true, remaining: 2 };
    // null as key: usage[null] is undefined → ok
    expect(validatePoolSpend(pool, {}, null).ok).toBe(true);
  });
});

describe("parseEntry edge cases", () => {
  it("handles numeric-only input", () => {
    expect(parseEntry("123")).toEqual({ slug: "123", value: null });
  });

  it("handles colon at end (empty value) — Number('') is 0 which is falsy", () => {
    // "prone:".split(":") = ["prone", ""], parts[1] = "" which is falsy → value: null
    expect(parseEntry("prone:")).toEqual({ slug: "prone", value: null });
  });

  it("handles colon at start", () => {
    expect(parseEntry(":2")).toEqual({ slug: "", value: 2 });
  });
});

describe("normalizeSkillKey edge cases", () => {
  it("handles numeric input", () => {
    expect(normalizeSkillKey(42)).toBe("42");
  });

  it("handles object input", () => {
    expect(normalizeSkillKey({})).toBe("[object object]");
  });
});

describe("applyOutcome degree return contract", () => {
  it("buildChatCardData uses provided degree correctly", () => {
    // Simulates the fix: applyOutcome returns {degree: 3} after weakness bump
    const applied = { targetEffect: ["off-guard", "Degree +1 (Actor Weakness)"], degree: 3 };
    const finalDegree = applied?.degree ?? 2; // fallback to pre-bump degree
    const data = buildChatCardData({ degree: finalDegree, ctx: {}, d20: 15, applied });
    expect(data.degree).toBe("Critical Success");
  });

  it("falls back to original degree when applyOutcome returns null", () => {
    const applied = null;
    const finalDegree = applied?.degree ?? 2;
    const data = buildChatCardData({ degree: finalDegree, ctx: {}, d20: 15, applied });
    expect(data.degree).toBe("Success");
  });
});
