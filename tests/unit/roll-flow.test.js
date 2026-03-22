import { describe, it, expect } from "vitest";
import { parseCoolTier, validatePoolSpend, buildStuntConfig, computeDegree, clampDegree } from "../../scripts/logic.js";

/**
 * Tests for the stunt roll flow logic.
 * Verifies the correct ordering and decisions without FoundryVTT.
 */

describe("Roll flow: pre-roll validation", () => {
  it("parseCoolTier gates advantage eligibility", () => {
    // Advantage requires coolTier >= 2 (So Cool)
    const config1 = buildStuntConfig({ coolStr: "full", advNow: true });
    expect(config1.chooseAdvNow).toBe(true);

    const config2 = buildStuntConfig({ coolStr: "light", advNow: true });
    expect(config2.chooseAdvNow).toBe(false);

    const config3 = buildStuntConfig({ coolStr: "none", advNow: true });
    expect(config3.chooseAdvNow).toBe(false);
  });

  it("pool validation happens before roll — state unchanged on failure", () => {
    const pool = { enabled: true, size: 4, remaining: 2 };
    const usage = { player1: true };

    const check = validatePoolSpend(pool, usage, "player1");
    expect(check.ok).toBe(false);

    // Pool and usage unchanged
    expect(pool.remaining).toBe(2);
    expect(usage).toEqual({ player1: true });
  });
});

describe("Roll flow: degree calculation chain", () => {
  it("base degree → cinematic upgrade → outcome", () => {
    const dc = 20;

    // Roll a 15 (total 23, dc 20) → success (2)
    let degree = computeDegree(23, dc, 15);
    expect(degree).toBe(2);

    // Cinematic pool upgrade: +1 → crit success (3)
    degree = clampDegree(degree, 1);
    expect(degree).toBe(3);
  });

  it("cinematic upgrade caps at 3", () => {
    let degree = computeDegree(32, 20, 12); // already crit success
    expect(degree).toBe(3);

    degree = clampDegree(degree, 1); // still 3
    expect(degree).toBe(3);
  });

  it("failure with pool upgrade becomes success", () => {
    let degree = computeDegree(19, 20, 9); // failure (1)
    expect(degree).toBe(1);

    degree = clampDegree(degree, 1); // success (2)
    expect(degree).toBe(2);
  });

  it("critical failure with pool upgrade becomes failure (not success)", () => {
    let degree = computeDegree(8, 20, 4); // crit failure (0)
    expect(degree).toBe(0);

    degree = clampDegree(degree, 1); // failure (1), not success
    expect(degree).toBe(1);
  });
});

describe("Roll flow: tactical risk interaction", () => {
  it("tactical risk config is boolean-coerced", () => {
    const config = buildStuntConfig({ coolStr: "none", risk: 1 });
    expect(config.tacticalRisk).toBe(true);

    const config2 = buildStuntConfig({ coolStr: "none", risk: 0 });
    expect(config2.tacticalRisk).toBe(false);

    const config3 = buildStuntConfig({ coolStr: "none", risk: undefined });
    expect(config3.tacticalRisk).toBe(false);
  });
});

describe("Roll flow: stunt config completeness", () => {
  it("produces all required fields for rollStunt", () => {
    const config = buildStuntConfig({
      coolStr: "full",
      rollKindStr: "attack",
      strikeKey: "longsword",
      risk: true,
      plausible: true,
      challengeAdj: 2,
      advNow: true,
      spendPool: true,
      triggerId: "trigger-1",
    });

    // All fields present
    expect(config).toHaveProperty("rollKind");
    expect(config).toHaveProperty("rollKey");
    expect(config).toHaveProperty("coolTier");
    expect(config).toHaveProperty("tacticalRisk");
    expect(config).toHaveProperty("plausible");
    expect(config).toHaveProperty("chooseAdvNow");
    expect(config).toHaveProperty("spendPoolNow");
    expect(config).toHaveProperty("triggerId");
    expect(config).toHaveProperty("challengeAdj");

    // Correct values
    expect(config.rollKind).toBe("attack");
    expect(config.rollKey).toBe("longsword");
    expect(config.coolTier).toBe(2);
    expect(config.tacticalRisk).toBe(true);
    expect(config.chooseAdvNow).toBe(true);
    expect(config.spendPoolNow).toBe(true);
  });
});
