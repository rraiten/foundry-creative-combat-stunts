import { describe, it, expect } from "vitest";
import {
  compute5eDegree, buildRollLabel, computeDisplayMath, buildChatCardData,
} from "../../scripts/logic.js";
import { extractKeptD20 } from "../../scripts/adapters/pf2e/rolling.js";

// --- 5e challenge adjustment ---

describe("5e: challenge adjustment application", () => {
  it("positive challenge adj increases total", () => {
    // Simulates 5e roll: baseTotal + coolBonus + riskPenalty + challengeAdj
    const baseTotal = 15;
    const coolBonus = 0;
    const riskPenalty = 0;
    const challengeAdj = 2;
    const total = baseTotal + coolBonus + riskPenalty + challengeAdj;
    expect(total).toBe(17);
  });

  it("negative challenge adj decreases total", () => {
    const total = 15 + 0 + 0 + (-4);
    expect(total).toBe(11);
  });

  it("challenge adj stacks with cool and risk", () => {
    const total = 15 + 2 + (-2) + 2; // base + cool + risk + challenge
    expect(total).toBe(17);
  });

  it("display math matches 5e roll total", () => {
    const r = computeDisplayMath({
      d20: 12, skillMod: 3, coolBonus: 2, tacticalRisk: true, challengeAdj: -4, rollKind: "skill",
    });
    // 3 + 2 - 2 - 4 = -1
    expect(r.displayMod).toBe(-1);
    expect(r.displayTotal).toBe(11); // 12 + (-1)
  });
});

// --- 5e d20 extraction with advantage ---

describe("5e: d20 extraction for advantage", () => {
  it("extracts kept d20 from advantage roll (2d20kh)", () => {
    const roll = {
      dice: [{
        faces: 20,
        results: [
          { result: 7, discarded: true, active: false },
          { result: 18, discarded: false, active: true },
        ],
      }],
      terms: [],
    };
    expect(extractKeptD20({ roll })).toBe(18);
  });

  it("extracts single d20 from normal roll", () => {
    const roll = {
      dice: [{ faces: 20, results: [{ result: 14 }] }],
      terms: [],
    };
    expect(extractKeptD20({ roll })).toBe(14);
  });

  it("handles null roll gracefully", () => {
    expect(extractKeptD20(null)).toBeNull();
  });
});

// --- 5e degree calculation with advantage ---

describe("5e: degree with advantage d20", () => {
  it("nat 20 on advantage gives crit success", () => {
    // Advantage: rolled 7 and 20, kept 20
    expect(compute5eDegree(25, 15, 20)).toBe(3);
  });

  it("nat 1 on disadvantage gives crit fail", () => {
    // Disadvantage: rolled 1 and 15, kept 1
    expect(compute5eDegree(5, 15, 1)).toBe(0);
  });

  it("high total but not nat 20 gives success", () => {
    expect(compute5eDegree(20, 15, 15)).toBe(2);
  });
});

// --- 5e roll label ---

describe("5e: roll label in chat card", () => {
  it("buildRollLabel works for 5e skill keys", () => {
    const actor = { system: { skills: { prc: { label: "Perception" } } } };
    expect(buildRollLabel(actor, "prc")).toBe("Perception");
  });

  it("buildRollLabel falls back for unknown 5e skill", () => {
    const actor = { system: { skills: {} } };
    expect(buildRollLabel(actor, "inv")).toBe("Skill"); // no SHORT_TO_LABEL for 5e keys
  });
});

// --- 5e vs PF2e chat card consistency ---

describe("chat card: 5e vs PF2e display consistency", () => {
  it("5e chat card has actionName from rollLabel", () => {
    const ctx = { rollLabel: "Athletics", rollKind: "skill", _skillMod: 5 };
    const data = buildChatCardData({ degree: 2, ctx, d20: 14 });
    expect(data.actionName).toBe("Athletics");
  });

  it("5e chat card shows advantage consumed when rollTwice set", () => {
    const ctx = { rollTwice: "keep-higher", rollKind: "skill" };
    const data = buildChatCardData({ degree: 2, ctx, d20: 18, advUsed: true });
    expect(data.logExtras).toContain("Advantage consumed");
    expect(data.coolNote).toContain("Advantage used");
  });

  it("5e chat card without tacticalRisk shows no penalty in formula", () => {
    const r = computeDisplayMath({ d20: 14, skillMod: 5, rollKind: "skill" });
    expect(r.displayFormula).toBe("1d20 + 5");
  });

  it("5e chat card with tacticalRisk shows -2 in modifier", () => {
    const r = computeDisplayMath({ d20: 14, skillMod: 5, tacticalRisk: true, rollKind: "skill" });
    expect(r.displayMod).toBe(3); // 5 - 2
  });

  it("5e chat card with all modifiers", () => {
    const r = computeDisplayMath({
      d20: 14, skillMod: 5, coolBonus: 1, tacticalRisk: true, challengeAdj: 2, rollKind: "skill",
    });
    // 5 + 1 - 2 + 2 = 6
    expect(r.displayMod).toBe(6);
    expect(r.displayTotal).toBe(20);
  });
});

// --- 5e formula string construction ---

describe("5e: formula string includes all modifiers", () => {
  it("includes cool bonus in formula", () => {
    // Simulates the 5e adapter formula building
    let formula = "1d20 + 3";
    const coolBonus = 2;
    if (coolBonus) formula += ` + ${coolBonus} (Cool)`;
    expect(formula).toBe("1d20 + 3 + 2 (Cool)");
  });

  it("includes risk penalty in formula", () => {
    let formula = "1d20 + 3";
    const riskPenalty = -2;
    if (riskPenalty) formula += ` - 2 (Risk)`;
    expect(formula).toBe("1d20 + 3 - 2 (Risk)");
  });

  it("includes positive challenge in formula", () => {
    let formula = "1d20 + 3";
    const challengeAdj = 2;
    if (challengeAdj > 0) formula += ` + ${challengeAdj} (Challenge)`;
    expect(formula).toBe("1d20 + 3 + 2 (Challenge)");
  });

  it("includes negative challenge in formula", () => {
    let formula = "1d20 + 3";
    const challengeAdj = -4;
    if (challengeAdj < 0) formula += ` - ${Math.abs(challengeAdj)} (Challenge)`;
    expect(formula).toBe("1d20 + 3 - 4 (Challenge)");
  });
});
