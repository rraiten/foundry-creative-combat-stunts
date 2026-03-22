import { describe, it, expect } from "vitest";
import { getSkillChoices } from "../../scripts/ui/stunt-dialog.js";

describe("getSkillChoices", () => {
  it("extracts PF2e skills from actor.skills", () => {
    const actor = { skills: { acr: { label: "Acrobatics" }, ath: { label: "Athletics" } } };
    const choices = getSkillChoices(actor, "pf2e");
    expect(choices).toHaveLength(2);
    expect(choices[0].value).toBe("acr");
    expect(choices[0].label).toBe("Acrobatics");
  });

  it("extracts 5e skills from actor.system.skills", () => {
    const actor = { system: { skills: { prc: { label: "Perception" }, ath: { label: "Athletics" } } } };
    const choices = getSkillChoices(actor, "dnd5e");
    expect(choices).toHaveLength(2);
  });

  it("falls back to actor.system.skills for PF2e", () => {
    const actor = { system: { skills: { ste: { label: "Stealth" } } } };
    const choices = getSkillChoices(actor, "pf2e");
    expect(choices).toHaveLength(1);
    expect(choices[0].label).toBe("Stealth");
  });

  it("capitalizes key when no label", () => {
    const actor = { skills: { arcana: {} } };
    const choices = getSkillChoices(actor, "pf2e");
    expect(choices[0].label).toBe("Arcana");
  });

  it("sorts alphabetically by label", () => {
    const actor = { skills: { ste: { label: "Stealth" }, acr: { label: "Acrobatics" }, med: { label: "Medicine" } } };
    const choices = getSkillChoices(actor, "pf2e");
    expect(choices.map(c => c.label)).toEqual(["Acrobatics", "Medicine", "Stealth"]);
  });

  it("handles empty skills", () => {
    const actor = { skills: {} };
    expect(getSkillChoices(actor, "pf2e")).toEqual([]);
  });

  it("handles null actor gracefully", () => {
    expect(getSkillChoices(null, "pf2e")).toEqual([]);
  });

  it("handles unknown system like PF2e (generic fallback)", () => {
    const actor = { skills: { foo: { label: "Foo" } } };
    const choices = getSkillChoices(actor, "starfinder");
    expect(choices).toHaveLength(1);
  });
});
