import { describe, it, expect } from "vitest";
import { extractKeptD20 } from "../../scripts/adapters/pf2e/rolling.js";

describe("extractKeptD20", () => {
  it("extracts single d20 result", () => {
    const result = {
      roll: {
        dice: [{ faces: 20, results: [{ result: 15, discarded: false, active: true }] }],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBe(15);
  });

  it("extracts kept d20 from advantage (2d20kh)", () => {
    const result = {
      roll: {
        dice: [{
          faces: 20,
          results: [
            { result: 8, discarded: true, active: false },
            { result: 17, discarded: false, active: true },
          ],
        }],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBe(17);
  });

  it("skips rerolled dice", () => {
    const result = {
      roll: {
        dice: [{
          faces: 20,
          results: [
            { result: 3, rerolled: true, discarded: false, active: true },
            { result: 14, rerolled: false, discarded: false, active: true },
          ],
        }],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBe(14);
  });

  it("honors _ccsD20 pre-set value", () => {
    const result = { _ccsD20: 19, roll: { dice: [], terms: [] } };
    expect(extractKeptD20(result)).toBe(19);
  });

  it("does not honor _ccsD20 when 0", () => {
    const result = {
      _ccsD20: 0,
      roll: {
        dice: [{ faces: 20, results: [{ result: 12 }] }],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBe(12);
  });

  it("returns null for empty input", () => {
    expect(extractKeptD20(null)).toBeNull();
    expect(extractKeptD20({})).toBeNull();
    expect(extractKeptD20({ roll: { dice: [], terms: [] } })).toBeNull();
  });

  it("ignores non-d20 dice", () => {
    const result = {
      roll: {
        dice: [
          { faces: 6, results: [{ result: 4 }] },
          { faces: 20, results: [{ result: 18 }] },
        ],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBe(18);
  });

  it("extracts from terms fallback (Die in terms)", () => {
    const result = {
      roll: {
        dice: [],
        terms: [{ faces: 20, results: [{ result: 11, discarded: false, active: true }] }],
      },
    };
    expect(extractKeptD20(result)).toBe(11);
  });

  it("extracts from PoolTerm sub-rolls", () => {
    const result = {
      roll: {
        dice: [],
        terms: [{
          rolls: [
            { dice: [{ faces: 20, results: [{ result: 7 }] }], terms: [] },
          ],
        }],
      },
    };
    expect(extractKeptD20(result)).toBe(7);
  });

  it("handles misfortune (keep-lowest) — returns non-discarded", () => {
    const result = {
      roll: {
        dice: [{
          faces: 20,
          results: [
            { result: 18, discarded: true, active: false },
            { result: 4, discarded: false, active: true },
          ],
        }],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBe(4);
  });

  it("handles nested PoolTerm with multiple sub-rolls", () => {
    const result = {
      roll: {
        dice: [],
        terms: [{
          rolls: [
            { dice: [], terms: [] },
            { dice: [{ faces: 20, results: [{ result: 13 }] }], terms: [] },
          ],
        }],
      },
    };
    expect(extractKeptD20(result)).toBe(13);
  });

  it("handles roll with only non-d20 dice", () => {
    const result = {
      roll: {
        dice: [{ faces: 6, results: [{ result: 4 }] }],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBeNull();
  });

  it("prefers kept non-rerolled over kept rerolled", () => {
    const result = {
      roll: {
        dice: [{
          faces: 20,
          results: [
            { result: 5, rerolled: true, discarded: false, active: true },
            { result: 12, rerolled: false, discarded: false, active: true },
          ],
        }],
        terms: [],
      },
    };
    expect(extractKeptD20(result)).toBe(12);
  });
});
