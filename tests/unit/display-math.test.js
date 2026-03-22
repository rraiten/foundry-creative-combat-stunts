import { describe, it, expect } from "vitest";
import { computeDisplayMath } from "../../scripts/logic.js";

describe("computeDisplayMath", () => {
  it("uses skillMod for skill rollKind", () => {
    const r = computeDisplayMath({ d20: 15, skillMod: 8, attackMod: 12, rollKind: "skill" });
    expect(r.displayMod).toBe(8);
    expect(r.displayTotal).toBe(23);
  });

  it("uses attackMod for attack rollKind", () => {
    const r = computeDisplayMath({ d20: 15, skillMod: 8, attackMod: 12, rollKind: "attack" });
    expect(r.displayMod).toBe(12);
    expect(r.displayTotal).toBe(27);
  });

  it("adds coolBonus", () => {
    const r = computeDisplayMath({ d20: 10, skillMod: 5, coolBonus: 2, rollKind: "skill" });
    expect(r.displayMod).toBe(7);
  });

  it("subtracts 2 for tactical risk", () => {
    const r = computeDisplayMath({ d20: 10, skillMod: 5, tacticalRisk: true, rollKind: "skill" });
    expect(r.displayMod).toBe(3);
  });

  it("includes challengeAdj", () => {
    const r = computeDisplayMath({ d20: 10, skillMod: 5, challengeAdj: -4, rollKind: "skill" });
    expect(r.displayMod).toBe(1);
  });

  it("combines all modifiers", () => {
    const r = computeDisplayMath({
      d20: 10, skillMod: 5, coolBonus: 2, tacticalRisk: true, challengeAdj: 4, rollKind: "skill"
    });
    // 5 + 2 - 2 + 4 = 9
    expect(r.displayMod).toBe(9);
    expect(r.displayTotal).toBe(19);
  });

  it("formats positive modifier", () => {
    const r = computeDisplayMath({ d20: 10, skillMod: 5, rollKind: "skill" });
    expect(r.displayFormula).toBe("1d20 + 5");
  });

  it("formats negative modifier", () => {
    const r = computeDisplayMath({ d20: 10, skillMod: -3, rollKind: "skill" });
    expect(r.displayFormula).toBe("1d20 - 3");
  });

  it("formats zero modifier", () => {
    const r = computeDisplayMath({ d20: 10, skillMod: 0, rollKind: "skill" });
    expect(r.displayFormula).toBe("1d20 + 0");
  });

  it("handles missing values gracefully", () => {
    const r = computeDisplayMath({ rollKind: "skill" });
    expect(r.displayMod).toBe(0);
    expect(r.displayTotal).toBe(0);
    expect(r.displayFormula).toBe("1d20 + 0");
  });
});
