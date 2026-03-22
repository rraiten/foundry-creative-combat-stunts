import { MODULE_ID } from "./constants.js";
import { CCSWeaknessTemplatesManager } from "./weakness/templates-ui.js";

const DEFAULT_TEMPLATES = [
  {
    id: "default-visor",
    label: "Cracked Visor",
    trigger: { kind: "attack", trait: "visual" },
    effect:  { type: "apply-condition", value: "dazzled" },
    enabled: true
  },
  {
    id: "default-athletics",
    label: "Shaky Footing",
    trigger: { kind: "skill", key: "athletics" },
    effect:  { type: "apply-condition", value: "prone" },
    enabled: true
  },
  {
    id: "default-prophet",
    label: "Prophet's Chant",
    trigger: { kind: "spell", key: "spell-attack" },
    effect:  { type: "degree-bump", value: 1 },
    enabled: true
  }
];

export function registerAllSettings() {
  // Weakness templates (hidden setting + menu)
  game.settings.register(MODULE_ID, "weaknessTemplates", {
    scope: "world", config: false, type: Array, default: DEFAULT_TEMPLATES
  });
  game.settings.registerMenu(MODULE_ID, "weaknessTemplatesMenu", {
    name: "Weakness Templates (CCS)",
    label: "Manage Templates",
    hint: "Reusable weaknesses you can import into actors.",
    type: CCSWeaknessTemplatesManager,
    restricted: true
  });

  // PF2e-specific (harmless on 5e, UI hides them)
  game.settings.register(MODULE_ID, "pf2eAdvantageOnce", {
    scope: "world", config: true, type: Boolean, default: true,
    name: "PF2e: Allow once-per-combat Advantage instead of +2",
    hint: "PF2e only. Players may declare roll-twice-keep-higher once per combat instead of a +2 Cool bonus."
  });
  game.settings.register(MODULE_ID, "successRiders", {
    scope: "world", config: true, type: String, default: "off-guard, frightened:1, prone, clumsy:1",
    name: "Default Success Rider Menu (PF2e)",
    hint: "PF2e only. Comma-separated PF2e conditions with optional :value."
  });
  game.settings.register(MODULE_ID, "failureSetbacks", {
    scope: "world", config: true, type: String, default: "prone, drop-item, off-guard, stunned:1",
    name: "Default Failure Setback Menu (PF2e)",
    hint: "PF2e only. Comma-separated entries; for conditions use PF2e slugs."
  });
  game.settings.register(MODULE_ID, "critPrompt", {
    scope: "world", config: true, type: Boolean, default: true,
    name: "PF2e: Prompt after Crit",
    hint: "PF2e only: after a Tactical Risk crit, prompt for Crit Deck vs rider."
  });
  game.settings.register(MODULE_ID, "skipPlayerDialog", {
    name: "Stunt: Skip PF2e pre-roll dialog for players",
    hint: "When enabled, players will NOT see the PF2e pre-roll dialog for stunt rolls. GMs always see it.",
    scope: "world", config: true, type: Boolean, default: false,
  });
}
