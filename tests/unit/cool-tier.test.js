import { describe, it, expect } from "vitest";
import { parseCoolTier } from "../../scripts/logic.js";

describe("parseCoolTier", () => {
  it('returns 2 for "full"', () => {
    expect(parseCoolTier("full")).toBe(2);
  });

  it('returns 1 for "light"', () => {
    expect(parseCoolTier("light")).toBe(1);
  });

  it('returns 0 for "none"', () => {
    expect(parseCoolTier("none")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseCoolTier("")).toBe(0);
  });

  it("returns 0 for unknown string", () => {
    expect(parseCoolTier("bogus")).toBe(0);
  });

  it("passes through numeric 2", () => {
    expect(parseCoolTier(2)).toBe(2);
  });

  it("passes through numeric 1", () => {
    expect(parseCoolTier(1)).toBe(1);
  });

  it("passes through numeric 0", () => {
    expect(parseCoolTier(0)).toBe(0);
  });

  it("returns 0 for null", () => {
    expect(parseCoolTier(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(parseCoolTier(undefined)).toBe(0);
  });
});
