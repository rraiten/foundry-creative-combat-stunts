import { CCF } from "./core.js";
import { registerUI } from "./ui.js";
import { PF2eAdapter } from "./adapters/pf2e.js";
import { DnD5eAdapter } from "./adapters/dnd5e.js";

Hooks.once("init", () => {
  game.ccf = new CCF();
  // Actor Weakness Templates (global, optional)
  game.settings.register("creative-combat-stunts","weaknessTemplates",{
    scope:"world", config:true, type:Object, default:[],
    name:"Weakness Templates (CCS)",
    hint:"Reusable templates for actor-specific weaknesses. Manage per-actor via the CCS button on the actor sheet."
  });
  
  // Settings (PF2e-only setting still exists harmlessly on 5e but UI hides it)
  game.settings.register("creative-combat-stunts","pf2eAdvantageOnce",{
    scope:"world", config:true, type:Boolean, default:true,
    name:"PF2e: Allow once-per-combat Advantage instead of +2",
    hint:"PF2e only. Players may declare roll-twice-keep-higher once per combat instead of a +2 Cool bonus."
  });
  game.settings.register("creative-combat-stunts","successRiders",{
    scope:"world", config:true, type:String, default:"off-guard, frightened:1, prone, clumsy:1",
    name:"Default Success Rider Menu (PF2e)",
    hint:"PF2e only. Comma-separated PF2e conditions with optional :value."
  });
  game.settings.register("creative-combat-stunts","failureSetbacks",{
    scope:"world", config:true, type:String, default:"prone, drop-item, off-guard, stunned:1",
    name:"Default Failure Setback Menu (PF2e)",
    hint:"PF2e only. Comma-separated entries; for conditions use PF2e slugs."
  });
  game.settings.register("creative-combat-stunts","critPrompt",{
    scope:"world", config:true, type:Boolean, default:true,
    name:"PF2e: Prompt after Crit",
    hint:"PF2e only: after a Tactical Risk crit, prompt for Crit Deck vs rider."
  });
  registerUI();
});

Hooks.once("ready", () => {
  const sys = game.system?.id;
  if (sys === "pf2e") game.ccf.setAdapter(new PF2eAdapter());
  else if (sys === "dnd5e") game.ccf.setAdapter(new DnD5eAdapter());
  else ui.notifications?.warn("Creative Combat Stunts: Unsupported system - core will load but effects may be limited.");
});

Hooks.on("createCombat", async (combat) => {
  await combat.setFlag("creative-combat-stunts", "cinematicPool",
    { enabled: false, size: 4, remaining: 4 });
  await combat.setFlag("creative-combat-stunts", "poolUsage", {});
  await combat.setFlag("creative-combat-stunts", "advUsage", {});
});

Hooks.on("updateCombat", (combat, changes) => {
  game.ccf?.effects?.tick(combat, changes);
});