import { describe, it, expect } from "vitest";
import { buildChatCardData, effectToText, extractD20FromResult } from "../../scripts/logic.js";

describe("effectToText", () => {
  it("joins array with commas", () => {
    expect(effectToText(["prone", "off-guard"])).toBe("prone, off-guard");
  });

  it("filters falsy values from array", () => {
    expect(effectToText(["prone", null, "", "off-guard"])).toBe("prone, off-guard");
  });

  it("trims string values", () => {
    expect(effectToText("  prone  ")).toBe("prone");
  });

  it("returns empty string for null", () => {
    expect(effectToText(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(effectToText(undefined)).toBe("");
  });
});

describe("extractD20FromResult", () => {
  it("extracts d20 from roll dice", () => {
    const result = { roll: { dice: [{ faces: 20, results: [{ result: 15 }] }] } };
    expect(extractD20FromResult(result)).toBe(15);
  });

  it("falls back to _ccsD20", () => {
    const result = { _ccsD20: 18, roll: { dice: [] } };
    expect(extractD20FromResult(result)).toBe(18);
  });

  it("returns 0 for empty result", () => {
    expect(extractD20FromResult(null)).toBe(0);
    expect(extractD20FromResult({})).toBe(0);
  });
});

describe("buildChatCardData", () => {
  const baseCtx = {
    rollKind: "skill", rollKey: "ath", rollLabel: "Athletics",
    _skillMod: 8, _attackMod: 0, coolBonus: 0,
    tacticalRisk: false, challengeAdj: 0,
    dc: 20, _dcStrike: 22,
  };

  it("maps degree to label text", () => {
    expect(buildChatCardData({ degree: 0, ctx: baseCtx, d20: 10 }).degree).toBe("Critical Failure");
    expect(buildChatCardData({ degree: 1, ctx: baseCtx, d20: 10 }).degree).toBe("Failure");
    expect(buildChatCardData({ degree: 2, ctx: baseCtx, d20: 10 }).degree).toBe("Success");
    expect(buildChatCardData({ degree: 3, ctx: baseCtx, d20: 10 }).degree).toBe("Critical Success");
  });

  it("returns dash for null degree", () => {
    expect(buildChatCardData({ degree: null, ctx: baseCtx, d20: 10 }).degree).toBe("—");
  });

  it("normalizes applied target effects", () => {
    const data = buildChatCardData({
      degree: 2, ctx: baseCtx, d20: 10,
      applied: { targetEffect: ["off-guard", "prone"] },
    });
    expect(data.appliedTargetText).toBe("off-guard, prone");
    expect(data.hasAnyApplied).toBe(true);
  });

  it("normalizes applied self effects", () => {
    const data = buildChatCardData({
      degree: 1, ctx: baseCtx, d20: 10,
      applied: { selfEffect: "prone (default)" },
    });
    expect(data.appliedSelfText).toBe("prone (default)");
    expect(data.hasAnyApplied).toBe(true);
  });

  it("sets hasAnyApplied false when no effects", () => {
    const data = buildChatCardData({ degree: 2, ctx: baseCtx, d20: 10 });
    expect(data.hasAnyApplied).toBe(false);
  });

  it("adds advantage consumed to log extras", () => {
    const ctx = { ...baseCtx, rollTwice: "keep-higher" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 10, advUsed: true });
    expect(data.logExtras).toContain("Advantage consumed");
  });

  it("adds pool spent to log extras", () => {
    const data = buildChatCardData({ degree: 2, ctx: baseCtx, d20: 10, poolSpent: true });
    expect(data.logExtras).toContain("Cinematic Pool spent");
  });

  it("sets fallback text for crit with no applied effects", () => {
    const data = buildChatCardData({ degree: 3, ctx: baseCtx, d20: 10 });
    expect(data.appliedFallback).toBe("Draw a Creative Stunt Card");
  });

  it("no fallback for non-crit degrees", () => {
    const data = buildChatCardData({ degree: 2, ctx: baseCtx, d20: 10 });
    expect(data.appliedFallback).toBeNull();
  });

  it("uses skill DC for skill rollKind", () => {
    const data = buildChatCardData({ degree: 2, ctx: baseCtx, d20: 10 });
    expect(data.dc).toBe(20); // ctx.dc, not _dcStrike
  });

  it("uses strike DC for attack rollKind", () => {
    const ctx = { ...baseCtx, rollKind: "attack" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 10 });
    expect(data.dc).toBe(22); // ctx._dcStrike
  });

  it("formats challenge text", () => {
    const ctx = { ...baseCtx, challengeAdj: 4 };
    const data = buildChatCardData({ degree: 2, ctx, d20: 10 });
    expect(data.challengeText).toBe("+4");
  });

  it("formats negative challenge text", () => {
    const ctx = { ...baseCtx, challengeAdj: -2 };
    const data = buildChatCardData({ degree: 2, ctx, d20: 10 });
    expect(data.challengeText).toBe("-2");
  });

  it("sets coolNote for cool bonus", () => {
    const ctx = { ...baseCtx, coolBonus: 2 };
    const data = buildChatCardData({ degree: 2, ctx, d20: 10 });
    expect(data.coolNote).toContain("+2 Flavor");
  });

  it("sets coolNote for advantage", () => {
    const ctx = { ...baseCtx, rollTwice: "keep-higher" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 10 });
    expect(data.coolNote).toContain("Advantage used");
  });
});
