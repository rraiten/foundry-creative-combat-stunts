import { CCF } from "./core.js";
import { registerUI } from "./ui/hooks.js";
import { registerAllSettings } from "./settings.js";
import { PF2eAdapter } from "./adapters/pf2e/adapter.js";
import { DnD5eAdapter } from "./adapters/dnd5e.js";
import { MODULE_ID, FLAGS, DEFAULT_POOL } from "./constants.js";

Hooks.once("init", () => {
  game.ccf = new CCF();
  registerAllSettings();
  registerUI();
});

Hooks.once("ready", () => {
  const sys = game.system?.id;
  if (sys === "pf2e") game.ccf.setAdapter(new PF2eAdapter());
  else if (sys === "dnd5e") game.ccf.setAdapter(new DnD5eAdapter());
  else ui.notifications?.warn("Creative Combat Stunts: Unsupported system - core will load but effects may be limited.");
});

Hooks.on("createCombat", async (combat) => {
  await combat.setFlag(MODULE_ID, FLAGS.POOL, { ...DEFAULT_POOL });
  await combat.setFlag(MODULE_ID, FLAGS.POOL_USAGE, {});
  await combat.setFlag(MODULE_ID, FLAGS.ADV_USAGE, {});
});
