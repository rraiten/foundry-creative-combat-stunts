import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupFoundryMocks, teardownFoundryMocks } from "../helpers/foundry-mocks.js";
import { spendCinematicToken, canUseOncePerCombat, markUsedOncePerCombat } from "../../scripts/pool.js";

/**
 * Tests for pool operations with mock combat objects.
 * Covers permission failures and edge cases.
 */

function mockCombat(flags = {}, throwOnWrite = false) {
  return {
    _flags: { ...flags },
    getFlag(moduleId, key) {
      return this._flags[key];
    },
    async setFlag(moduleId, key, value) {
      if (throwOnWrite) throw new Error("Permission denied");
      this._flags[key] = value;
    },
  };
}

describe("spendCinematicToken", () => {
  beforeEach(() => setupFoundryMocks());
  afterEach(() => teardownFoundryMocks());

  it("spends token when permitted", async () => {
    const combat = mockCombat({
      cinematicPool: { enabled: true, size: 4, remaining: 3 },
      poolUsage: {},
    });
    const result = await spendCinematicToken(combat, "player1");
    expect(result.ok).toBe(true);
    expect(combat._flags.cinematicPool.remaining).toBe(2);
    expect(combat._flags.poolUsage.player1).toBe(true);
  });

  it("returns error when pool is disabled", async () => {
    const combat = mockCombat({
      cinematicPool: { enabled: false, size: 4, remaining: 4 },
      poolUsage: {},
    });
    const result = await spendCinematicToken(combat, "player1");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Pool disabled");
  });

  it("returns error when no tokens remaining", async () => {
    const combat = mockCombat({
      cinematicPool: { enabled: true, size: 4, remaining: 0 },
      poolUsage: {},
    });
    const result = await spendCinematicToken(combat, "player1");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("No tokens left");
  });

  it("returns error when actor already spent", async () => {
    const combat = mockCombat({
      cinematicPool: { enabled: true, size: 4, remaining: 3 },
      poolUsage: { player1: true },
    });
    const result = await spendCinematicToken(combat, "player1");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Already used this encounter");
  });

  it("handles permission denied gracefully (player can't write combat flags)", async () => {
    const combat = mockCombat({
      cinematicPool: { enabled: true, size: 4, remaining: 3 },
      poolUsage: {},
    }, true); // throwOnWrite = true
    const result = await spendCinematicToken(combat, "player1");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Permission denied");
  });

  it("returns error when combat is null", async () => {
    const result = await spendCinematicToken(null, "player1");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("No combat");
  });
});

describe("canUseOncePerCombat", () => {
  it("returns true when actor hasn't used", async () => {
    const combat = mockCombat({ advUsage: {} });
    expect(await canUseOncePerCombat(combat, "actor1", "advUsage")).toBe(true);
  });

  it("returns false when actor has used", async () => {
    const combat = mockCombat({ advUsage: { actor1: true } });
    expect(await canUseOncePerCombat(combat, "actor1", "advUsage")).toBe(false);
  });

  it("returns false when combat is null", async () => {
    expect(await canUseOncePerCombat(null, "actor1", "advUsage")).toBe(false);
  });

  it("returns true when flag is missing (first use ever)", async () => {
    const combat = mockCombat({});
    expect(await canUseOncePerCombat(combat, "actor1", "advUsage")).toBe(true);
  });
});

describe("markUsedOncePerCombat", () => {
  it("writes usage flag when permitted", async () => {
    const combat = mockCombat({ advUsage: {} });
    const result = await markUsedOncePerCombat(combat, "actor1", "advUsage");
    expect(result).toBe(true);
    expect(combat._flags.advUsage.actor1).toBe(true);
  });

  it("handles permission denied gracefully", async () => {
    const combat = mockCombat({ advUsage: {} }, true);
    const result = await markUsedOncePerCombat(combat, "actor1", "advUsage");
    expect(result).toBe(false);
  });

  it("returns false when combat is null", async () => {
    const result = await markUsedOncePerCombat(null, "actor1", "advUsage");
    expect(result).toBe(false);
  });
});
