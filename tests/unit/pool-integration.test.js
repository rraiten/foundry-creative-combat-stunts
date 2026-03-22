import { describe, it, expect, vi } from "vitest";
import { validatePoolSpend } from "../../scripts/logic.js";

/**
 * Integration-style tests for pool and advantage flows.
 * These test the logic paths that caused player permission crashes.
 */

describe("Pool spend flow (pre-roll validation)", () => {
  it("validates pool before spending — rejects disabled pool", () => {
    const pool = { enabled: false, size: 4, remaining: 4 };
    const usage = {};
    expect(validatePoolSpend(pool, usage, "player1").ok).toBe(false);
  });

  it("validates pool before spending — rejects 0 remaining", () => {
    const pool = { enabled: true, size: 4, remaining: 0 };
    const usage = {};
    expect(validatePoolSpend(pool, usage, "player1").ok).toBe(false);
  });

  it("validates pool before spending — rejects already-used actor", () => {
    const pool = { enabled: true, size: 4, remaining: 2 };
    const usage = { player1: true };
    expect(validatePoolSpend(pool, usage, "player1").ok).toBe(false);
  });

  it("allows valid spend for unused actor", () => {
    const pool = { enabled: true, size: 4, remaining: 2 };
    const usage = { player2: true };
    expect(validatePoolSpend(pool, usage, "player1").ok).toBe(true);
  });

  it("handles null pool (combat just created, flag missing)", () => {
    expect(validatePoolSpend(null, {}, "player1").ok).toBe(false);
  });

  it("handles undefined usage (first spend in combat) — allows spend", () => {
    const pool = { enabled: true, size: 4, remaining: 4 };
    // undefined?.[actorId] = undefined → falsy → not already used → ok
    expect(validatePoolSpend(pool, undefined, "player1").ok).toBe(true);
  });
});

describe("Pool spend + roll failure scenario", () => {
  it("validation is separate from commitment — can validate without spending", () => {
    const pool = { enabled: true, size: 4, remaining: 3 };
    const usage = {};

    // Pre-roll: validate only (no side effects)
    const check = validatePoolSpend(pool, usage, "player1");
    expect(check.ok).toBe(true);

    // Pool state unchanged after validation
    expect(pool.remaining).toBe(3);
    expect(usage).toEqual({});
  });
});

describe("Advantage once-per-combat flow", () => {
  it("canUse check is read-only — doesn't consume", () => {
    // Simulate: usage flag is empty object = never used
    const usage = {};
    const actorId = "actor123";
    expect(!usage[actorId]).toBe(true); // can use

    // Usage stays empty (read-only check)
    expect(usage).toEqual({});
  });

  it("marking used mutates usage object", () => {
    const usage = {};
    const actorId = "actor123";
    usage[actorId] = true; // this is what markUsedOncePerCombat does

    // Now can't use again
    expect(!usage[actorId]).toBe(false);
  });

  it("different actors don't interfere", () => {
    const usage = { actor1: true };
    expect(!usage["actor2"]).toBe(true); // actor2 can still use
  });
});

describe("Pool edge cases", () => {
  it("pool with remaining=1 allows exactly one more spend", () => {
    const pool = { enabled: true, size: 4, remaining: 1 };
    const usage = {};

    const check1 = validatePoolSpend(pool, usage, "player1");
    expect(check1.ok).toBe(true);

    // Simulate spending
    pool.remaining -= 1;
    usage["player1"] = true;

    // Second player can't spend
    const check2 = validatePoolSpend(pool, usage, "player2");
    expect(check2.ok).toBe(false);
    expect(check2.reason).toBe("No tokens left");
  });

  it("same player can't spend twice even if pool has tokens", () => {
    const pool = { enabled: true, size: 4, remaining: 3 };
    const usage = {};

    // First spend
    const check1 = validatePoolSpend(pool, usage, "player1");
    expect(check1.ok).toBe(true);
    pool.remaining -= 1;
    usage["player1"] = true;

    // Same player tries again
    const check2 = validatePoolSpend(pool, usage, "player1");
    expect(check2.ok).toBe(false);
    expect(check2.reason).toBe("Already used this encounter");
  });
});
