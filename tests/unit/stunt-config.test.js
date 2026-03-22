import { describe, it, expect } from "vitest";
import { buildStuntConfig } from "../../scripts/logic.js";

describe("buildStuntConfig", () => {
  it("uses rollKey for skill rollKind", () => {
    const cfg = buildStuntConfig({ coolStr: "none", rollKindStr: "skill", rollKey: "ath" });
    expect(cfg.rollKind).toBe("skill");
    expect(cfg.rollKey).toBe("ath");
  });

  it("uses strikeKey for attack rollKind", () => {
    const cfg = buildStuntConfig({ coolStr: "none", rollKindStr: "attack", strikeKey: "longsword" });
    expect(cfg.rollKind).toBe("attack");
    expect(cfg.rollKey).toBe("longsword");
  });

  it("falls back to defaultStrike when strikeKey is empty", () => {
    const cfg = buildStuntConfig({ coolStr: "none", rollKindStr: "attack", strikeKey: "", defaultStrike: "fist" });
    expect(cfg.rollKey).toBe("fist");
  });

  it("defaults rollKey to 'acr' for skill when no rollKey given", () => {
    const cfg = buildStuntConfig({ coolStr: "none", rollKindStr: "skill" });
    expect(cfg.rollKey).toBe("acr");
  });

  it("parses cool tier from string", () => {
    expect(buildStuntConfig({ coolStr: "full" }).coolTier).toBe(2);
    expect(buildStuntConfig({ coolStr: "light" }).coolTier).toBe(1);
    expect(buildStuntConfig({ coolStr: "none" }).coolTier).toBe(0);
  });

  it("forces chooseAdvNow to false when coolTier < 2", () => {
    const cfg = buildStuntConfig({ coolStr: "light", advNow: true });
    expect(cfg.chooseAdvNow).toBe(false);
  });

  it("allows chooseAdvNow when coolTier is 2", () => {
    const cfg = buildStuntConfig({ coolStr: "full", advNow: true });
    expect(cfg.chooseAdvNow).toBe(true);
  });

  it("coerces booleans correctly", () => {
    const cfg = buildStuntConfig({ coolStr: "none", risk: 1, plausible: "yes", spendPool: true });
    expect(cfg.tacticalRisk).toBe(true);
    expect(cfg.plausible).toBe(true);
    expect(cfg.spendPoolNow).toBe(true);
  });

  it("defaults challengeAdj to 0", () => {
    const cfg = buildStuntConfig({ coolStr: "none" });
    expect(cfg.challengeAdj).toBe(0);
  });

  it("passes numeric challengeAdj through", () => {
    const cfg = buildStuntConfig({ coolStr: "none", challengeAdj: -4 });
    expect(cfg.challengeAdj).toBe(-4);
  });

  it("sets triggerId to null when empty", () => {
    const cfg = buildStuntConfig({ coolStr: "none", triggerId: "" });
    expect(cfg.triggerId).toBeNull();
  });

  it("passes triggerId through when present", () => {
    const cfg = buildStuntConfig({ coolStr: "none", triggerId: "abc-123" });
    expect(cfg.triggerId).toBe("abc-123");
  });

  it("lowercases rollKind", () => {
    const cfg = buildStuntConfig({ coolStr: "none", rollKindStr: "ATTACK", strikeKey: "X" });
    expect(cfg.rollKind).toBe("attack");
  });

  it("defaults rollKind to skill", () => {
    const cfg = buildStuntConfig({ coolStr: "none" });
    expect(cfg.rollKind).toBe("skill");
  });
});
