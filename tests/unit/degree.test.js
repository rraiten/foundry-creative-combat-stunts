import { describe, it, expect } from "vitest";
import { computeDegree, compute5eDegree, clampDegree } from "../../scripts/logic.js";

describe("computeDegree (PF2e)", () => {
  const dc = 20;

  it("critical success when total >= dc + 10", () => {
    expect(computeDegree(30, dc, 10)).toBe(3);
    expect(computeDegree(31, dc, 11)).toBe(3);
  });

  it("success when total >= dc", () => {
    expect(computeDegree(20, dc, 10)).toBe(2);
    expect(computeDegree(25, dc, 10)).toBe(2);
  });

  it("failure when dc-10 < total < dc", () => {
    expect(computeDegree(19, dc, 9)).toBe(1);
    expect(computeDegree(11, dc, 5)).toBe(1);
  });

  it("critical failure when total <= dc - 10", () => {
    expect(computeDegree(10, dc, 5)).toBe(0);
    expect(computeDegree(5, dc, 3)).toBe(0);
  });

  it("nat 20 bumps degree up by 1", () => {
    // total 19 vs dc 20 is failure (1), nat 20 bumps to success (2)
    expect(computeDegree(19, dc, 20)).toBe(2);
  });

  it("nat 20 caps at 3", () => {
    // already crit success, stays 3
    expect(computeDegree(30, dc, 20)).toBe(3);
  });

  it("nat 1 bumps degree down by 1", () => {
    // total 20 vs dc 20 is success (2), nat 1 drops to failure (1)
    expect(computeDegree(20, dc, 1)).toBe(1);
  });

  it("nat 1 floors at 0", () => {
    // already crit fail, stays 0
    expect(computeDegree(5, dc, 1)).toBe(0);
  });

  it("nat 20 on crit failure becomes failure", () => {
    expect(computeDegree(10, dc, 20)).toBe(1);
  });

  it("nat 1 on crit success becomes success", () => {
    expect(computeDegree(30, dc, 1)).toBe(2);
  });
});

describe("compute5eDegree", () => {
  it("nat 1 is always critical failure", () => {
    expect(compute5eDegree(25, 10, 1)).toBe(0);
  });

  it("nat 20 is always critical success", () => {
    expect(compute5eDegree(5, 30, 20)).toBe(3);
  });

  it("total >= dc is success", () => {
    expect(compute5eDegree(15, 15, 10)).toBe(2);
    expect(compute5eDegree(20, 15, 10)).toBe(2);
  });

  it("total < dc is failure", () => {
    expect(compute5eDegree(14, 15, 10)).toBe(1);
  });
});

describe("clampDegree", () => {
  it("bumps degree up", () => {
    expect(clampDegree(2, 1)).toBe(3);
  });

  it("caps at 3", () => {
    expect(clampDegree(3, 1)).toBe(3);
    expect(clampDegree(2, 5)).toBe(3);
  });

  it("bumps degree down", () => {
    expect(clampDegree(2, -1)).toBe(1);
  });

  it("floors at 0", () => {
    expect(clampDegree(0, -1)).toBe(0);
    expect(clampDegree(1, -5)).toBe(0);
  });

  it("handles zero bump", () => {
    expect(clampDegree(2, 0)).toBe(2);
  });
});
