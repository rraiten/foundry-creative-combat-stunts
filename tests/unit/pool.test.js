import { describe, it, expect } from "vitest";
import { validatePoolSpend } from "../../scripts/logic.js";

describe("validatePoolSpend", () => {
  it("rejects when pool is disabled", () => {
    const r = validatePoolSpend({ enabled: false, remaining: 4 }, {}, "actor1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Pool disabled");
  });

  it("rejects when pool is null", () => {
    const r = validatePoolSpend(null, {}, "actor1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Pool disabled");
  });

  it("rejects when no tokens remaining", () => {
    const r = validatePoolSpend({ enabled: true, remaining: 0 }, {}, "actor1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("No tokens left");
  });

  it("rejects when actor already used", () => {
    const r = validatePoolSpend({ enabled: true, remaining: 2 }, { actor1: true }, "actor1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Already used this encounter");
  });

  it("allows valid spend", () => {
    const r = validatePoolSpend({ enabled: true, remaining: 2 }, {}, "actor1");
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("allows when other actors have used but not this one", () => {
    const r = validatePoolSpend({ enabled: true, remaining: 1 }, { actor2: true }, "actor1");
    expect(r.ok).toBe(true);
  });

  it("rejects when remaining is undefined (treated as 0)", () => {
    const r = validatePoolSpend({ enabled: true }, {}, "actor1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("No tokens left");
  });
});
