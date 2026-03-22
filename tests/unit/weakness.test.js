import { describe, it, expect } from "vitest";
import { matchesWeakness } from "../../scripts/weakness/logic.js";

describe("matchesWeakness", () => {
  // Skill triggers
  it("matches skill trigger with matching key", () => {
    const ctx = { rollKind: "skill", rollKey: "athletics", traits: [] };
    const w = { trigger: { kind: "skill", key: "athletics" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("matches skill trigger with no key (any skill)", () => {
    const ctx = { rollKind: "skill", rollKey: "stealth", traits: [] };
    const w = { trigger: { kind: "skill" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("rejects skill trigger with wrong key", () => {
    const ctx = { rollKind: "skill", rollKey: "stealth", traits: [] };
    const w = { trigger: { kind: "skill", key: "athletics" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  it("rejects skill trigger when rollKind is attack", () => {
    const ctx = { rollKind: "attack", rollKey: "athletics", traits: [] };
    const w = { trigger: { kind: "skill", key: "athletics" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  // Attack triggers
  it("matches attack trigger with matching trait", () => {
    const ctx = { rollKind: "attack", rollKey: "longsword", traits: ["visual", "trip"] };
    const w = { trigger: { kind: "attack", trait: "visual" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("matches attack trigger with matching key (no trait specified)", () => {
    const ctx = { rollKind: "attack", rollKey: "longsword", traits: [] };
    const w = { trigger: { kind: "attack", key: "longsword" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("matches attack trigger with no key or trait (any attack)", () => {
    const ctx = { rollKind: "attack", rollKey: "dagger", traits: [] };
    const w = { trigger: { kind: "attack" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("rejects attack trigger when rollKind is skill", () => {
    const ctx = { rollKind: "skill", rollKey: "longsword", traits: ["visual"] };
    const w = { trigger: { kind: "attack", trait: "visual" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  // Spell triggers
  it("matches spell trigger with matching key", () => {
    const ctx = { rollKind: "spell", rollKey: "spell-attack", traits: [] };
    const w = { trigger: { kind: "spell", key: "spell-attack" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("matches spell trigger with no key (any spell)", () => {
    const ctx = { rollKind: "spell", rollKey: "fireball", traits: [] };
    const w = { trigger: { kind: "spell" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("rejects spell trigger when rollKind is attack", () => {
    const ctx = { rollKind: "attack", rollKey: "spell-attack", traits: [] };
    const w = { trigger: { kind: "spell", key: "spell-attack" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  // Trait triggers
  it("matches trait trigger when trait is in ctx.traits", () => {
    const ctx = { rollKind: "attack", rollKey: "axe", traits: ["trip", "forceful"] };
    const w = { trigger: { kind: "trait", trait: "trip" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("rejects trait trigger when trait not in ctx.traits", () => {
    const ctx = { rollKind: "attack", rollKey: "axe", traits: ["forceful"] };
    const w = { trigger: { kind: "trait", trait: "trip" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  // Condition triggers
  it("matches condition trigger when cond: prefix in traits", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: ["cond:prone"] };
    const w = { trigger: { kind: "condition", key: "prone" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  it("rejects condition trigger when cond: not in traits", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: [] };
    const w = { trigger: { kind: "condition", key: "prone" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  // Case insensitivity
  it("is case insensitive for keys", () => {
    const ctx = { rollKind: "skill", rollKey: "ATHLETICS", traits: [] };
    const w = { trigger: { kind: "skill", key: "athletics" } };
    expect(matchesWeakness(ctx, w)).toBe(true);
  });

  // Unknown trigger kind
  it("returns false for unknown trigger kind", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: [] };
    const w = { trigger: { kind: "unknown" } };
    expect(matchesWeakness(ctx, w)).toBe(false);
  });

  // Null safety
  it("returns false for null weakness", () => {
    const ctx = { rollKind: "skill", rollKey: "ath", traits: [] };
    expect(matchesWeakness(ctx, null)).toBe(false);
  });
});
