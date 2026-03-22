import { describe, it, expect } from "vitest";
import { normalizeSkillKey } from "../../scripts/logic.js";

describe("normalizeSkillKey", () => {
  it("converts long name to short code", () => {
    expect(normalizeSkillKey("acrobatics")).toBe("acr");
    expect(normalizeSkillKey("athletics")).toBe("ath");
    expect(normalizeSkillKey("crafting")).toBe("cra");
    expect(normalizeSkillKey("medicine")).toBe("med");
    expect(normalizeSkillKey("stealth")).toBe("ste");
    expect(normalizeSkillKey("survival")).toBe("sur");
    expect(normalizeSkillKey("thievery")).toBe("thi");
  });

  it("passes through short codes unchanged", () => {
    expect(normalizeSkillKey("acr")).toBe("acr");
    expect(normalizeSkillKey("ath")).toBe("ath");
  });

  it("is case insensitive", () => {
    expect(normalizeSkillKey("ACROBATICS")).toBe("acr");
    expect(normalizeSkillKey("Athletics")).toBe("ath");
    expect(normalizeSkillKey("ATH")).toBe("ath");
  });

  it("passes through unmapped skills as lowercase", () => {
    expect(normalizeSkillKey("arcana")).toBe("arcana");
    expect(normalizeSkillKey("occultism")).toBe("occultism");
    expect(normalizeSkillKey("diplomacy")).toBe("diplomacy");
    expect(normalizeSkillKey("arc")).toBe("arc");
  });

  it("handles null/undefined/empty", () => {
    expect(normalizeSkillKey(null)).toBe("");
    expect(normalizeSkillKey(undefined)).toBe("");
    expect(normalizeSkillKey("")).toBe("");
  });
});
