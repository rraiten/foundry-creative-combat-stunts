import { describe, it, expect } from "vitest";
import { selectStrike } from "../../scripts/logic.js";

describe("selectStrike", () => {
  const strikes = [
    { slug: "longsword", label: "Longsword", item: { slug: "longsword", name: "Longsword", system: { traits: { value: [] } } } },
    { slug: "fist", label: "Fist", item: { slug: "fist", name: "Fist", system: { traits: { value: ["unarmed"] } } } },
    { slug: "shortbow", label: "Shortbow", item: { slug: "shortbow", name: "Shortbow", system: { range: { value: 60 }, traits: { value: [] } } } },
  ];

  it("matches strike by slug when rollKind is attack", () => {
    const { strike, isSpellAttack } = selectStrike(strikes, "attack", "longsword");
    expect(strike.slug).toBe("longsword");
    expect(isSpellAttack).toBe(false);
  });

  it("matches strike by item name", () => {
    const { strike } = selectStrike(strikes, "attack", "Fist");
    expect(strike.slug).toBe("fist");
  });

  it("detects spell attack choice", () => {
    const { strike, isSpellAttack } = selectStrike(strikes, "attack", "__spell_attack__");
    expect(isSpellAttack).toBe(true);
    // falls back since __spell_attack__ doesn't match any slug
    expect(strike.slug).toBe("fist"); // unarmed fallback
  });

  it("falls back to unarmed when no match", () => {
    const { strike } = selectStrike(strikes, "attack", "nonexistent");
    expect(strike.slug).toBe("fist");
  });

  it("falls back to melee (no range) when no unarmed", () => {
    const noUnarmed = [
      { slug: "longsword", item: { slug: "longsword", system: { traits: { value: [] } } } },
      { slug: "shortbow", item: { slug: "shortbow", system: { range: { value: 60 }, traits: { value: [] } } } },
    ];
    const { strike } = selectStrike(noUnarmed, "attack", "nonexistent");
    expect(strike.slug).toBe("longsword");
  });

  it("falls back to first strike when nothing matches", () => {
    const rangedOnly = [
      { slug: "shortbow", item: { slug: "shortbow", system: { range: { value: 60 }, traits: { value: [] } } } },
    ];
    const { strike } = selectStrike(rangedOnly, "attack", "nonexistent");
    expect(strike.slug).toBe("shortbow");
  });

  it("returns null strike for empty array", () => {
    const { strike } = selectStrike([], "attack", "longsword");
    expect(strike).toBeNull();
  });

  it("skips strike matching for skill rollKind (uses fallback)", () => {
    const { strike, isSpellAttack } = selectStrike(strikes, "skill", "longsword");
    // doesn't try to match by key, just falls back
    expect(strike.slug).toBe("fist"); // unarmed fallback
    expect(isSpellAttack).toBe(false);
  });
});
