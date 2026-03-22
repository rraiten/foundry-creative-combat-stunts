// Minimal FoundryVTT global stubs for testing code that touches game.pf2e etc.

const DEFAULT_DC_TABLE = {
  0: 14, 1: 15, 2: 16, 3: 18, 4: 19, 5: 20,
  6: 22, 7: 23, 8: 24, 9: 26, 10: 27,
};

export function setupFoundryMocks(overrides = {}) {
  globalThis.game = {
    pf2e: {
      DCByLevel: { ...DEFAULT_DC_TABLE },
      ...(overrides.pf2e ?? {}),
    },
    ...overrides,
  };
  globalThis.CONFIG = globalThis.CONFIG ?? {};
}

export function teardownFoundryMocks() {
  delete globalThis.game;
  delete globalThis.CONFIG;
}
