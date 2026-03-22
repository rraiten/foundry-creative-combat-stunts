import { describe, it, expect } from "vitest";
import { buildStuntModifiers } from "../../scripts/logic.js";

describe("buildStuntModifiers", () => {
  it("adds skill→strike remap for skill rollKind", () => {
    const mods = buildStuntModifiers({ skillMod: 12, currentAttack: 8, rollKind: "skill", rollKey: "ath" });
    const remap = mods.find(m => m.label.includes("skill→strike"));
    expect(remap).toBeDefined();
    expect(remap.modifier).toBe(4); // 12 - 8
    expect(remap.type).toBe("untyped");
  });

  it("does not add skill→strike remap for attack rollKind", () => {
    const mods = buildStuntModifiers({ skillMod: 12, currentAttack: 8, rollKind: "attack" });
    expect(mods.find(m => m.label.includes("skill→strike"))).toBeUndefined();
  });

  it("does not add skill→strike remap when delta is 0", () => {
    const mods = buildStuntModifiers({ skillMod: 8, currentAttack: 8, rollKind: "skill" });
    expect(mods.find(m => m.label.includes("skill→strike"))).toBeUndefined();
  });

  it("adds cool bonus as circumstance", () => {
    const mods = buildStuntModifiers({ coolBonus: 2, rollKind: "skill" });
    const cool = mods.find(m => m.label.includes("cool"));
    expect(cool).toBeDefined();
    expect(cool.modifier).toBe(2);
    expect(cool.type).toBe("circumstance");
  });

  it("does not add cool bonus when 0", () => {
    const mods = buildStuntModifiers({ coolBonus: 0, rollKind: "skill" });
    expect(mods.find(m => m.label.includes("cool"))).toBeUndefined();
  });

  it("adds tactical risk penalty", () => {
    const mods = buildStuntModifiers({ tacticalRisk: true, rollKind: "skill" });
    const risk = mods.find(m => m.label.includes("risk"));
    expect(risk).toBeDefined();
    expect(risk.modifier).toBe(-2);
  });

  it("does not add risk when false", () => {
    const mods = buildStuntModifiers({ tacticalRisk: false, rollKind: "skill" });
    expect(mods.find(m => m.label.includes("risk"))).toBeUndefined();
  });

  it("adds challenge adjustment with weakness label", () => {
    const mods = buildStuntModifiers({ challengeAdj: 2, rollKind: "skill" });
    const ch = mods.find(m => m.label.includes("challenge"));
    expect(ch.modifier).toBe(2);
    expect(ch.label).toContain("weakness");
  });

  it("labels major weakness for +4", () => {
    const mods = buildStuntModifiers({ challengeAdj: 4, rollKind: "skill" });
    expect(mods.find(m => m.label.includes("major weakness"))).toBeDefined();
  });

  it("labels major resistance for -4", () => {
    const mods = buildStuntModifiers({ challengeAdj: -4, rollKind: "skill" });
    expect(mods.find(m => m.label.includes("major resistance"))).toBeDefined();
  });

  it("adds defense map shim for skill stunts", () => {
    const mods = buildStuntModifiers({ rollKind: "skill", targetAC: 25, mappedDC: 22 });
    const dm = mods.find(m => m.label.includes("defense map"));
    expect(dm).toBeDefined();
    expect(dm.modifier).toBe(3); // 25 - 22
  });

  it("does not add defense map for attack stunts", () => {
    const mods = buildStuntModifiers({ rollKind: "attack", targetAC: 25, mappedDC: 22 });
    expect(mods.find(m => m.label.includes("defense map"))).toBeUndefined();
  });

  it("does not add defense map when dcAdj is 0", () => {
    const mods = buildStuntModifiers({ rollKind: "skill", targetAC: 22, mappedDC: 22 });
    expect(mods.find(m => m.label.includes("defense map"))).toBeUndefined();
  });

  it("adds spell attack shim", () => {
    const mods = buildStuntModifiers({ isSpellAttack: true, spellAttackMod: 15, currentAttack: 10, rollKind: "attack" });
    const sa = mods.find(m => m.label.includes("spell attack"));
    expect(sa).toBeDefined();
    expect(sa.modifier).toBe(5);
  });

  it("does not add spell attack shim when not spell attack", () => {
    const mods = buildStuntModifiers({ isSpellAttack: false, spellAttackMod: 15, currentAttack: 10, rollKind: "attack" });
    expect(mods.find(m => m.label.includes("spell attack"))).toBeUndefined();
  });

  it("combines multiple modifiers", () => {
    const mods = buildStuntModifiers({
      skillMod: 10, currentAttack: 8, rollKind: "skill", rollKey: "ath",
      coolBonus: 1, tacticalRisk: true, challengeAdj: 2,
      targetAC: 20, mappedDC: 18,
    });
    expect(mods.length).toBe(5); // skill remap + cool + risk + challenge + defense map
  });

  it("returns empty array when no modifiers needed", () => {
    const mods = buildStuntModifiers({ skillMod: 8, currentAttack: 8, rollKind: "skill" });
    expect(mods).toEqual([]);
  });
});
