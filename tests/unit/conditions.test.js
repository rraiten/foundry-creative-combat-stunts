import { describe, it, expect } from "vitest";
import { parseEntry } from "../../scripts/logic.js";

describe("parseEntry", () => {
  it('parses simple condition "prone"', () => {
    expect(parseEntry("prone")).toEqual({ slug: "prone", value: null });
  });

  it('parses valued condition "frightened:2"', () => {
    expect(parseEntry("frightened:2")).toEqual({ slug: "frightened", value: 2 });
  });

  it('parses valued condition "clumsy:1"', () => {
    expect(parseEntry("clumsy:1")).toEqual({ slug: "clumsy", value: 1 });
  });

  it('parses "drop-item" as special text entry', () => {
    expect(parseEntry("drop-item")).toEqual({ text: "drop-item" });
  });

  it("returns null for empty string", () => {
    expect(parseEntry("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseEntry(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseEntry(undefined)).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseEntry("  prone  ")).toEqual({ slug: "prone", value: null });
  });

  it("trims whitespace around colon", () => {
    expect(parseEntry("frightened : 3")).toEqual({ slug: "frightened", value: 3 });
  });

  it("returns null value when no colon value", () => {
    expect(parseEntry("off-guard")).toEqual({ slug: "off-guard", value: null });
  });
});
