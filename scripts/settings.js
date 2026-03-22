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
    name: "CCS.Setting.WeaknessTemplatesMenu.Name",
    label: "CCS.Setting.WeaknessTemplatesMenu.Label",
    hint: "CCS.Setting.WeaknessTemplatesMenu.Hint",
    type: CCSWeaknessTemplatesManager,
    restricted: true
  });

  // PF2e-specific (harmless on 5e, UI hides them)
  game.settings.register(MODULE_ID, "pf2eAdvantageOnce", {
    scope: "world", config: true, type: Boolean, default: true,
    name: "CCS.Setting.Pf2eAdvantageOnce.Name",
    hint: "CCS.Setting.Pf2eAdvantageOnce.Hint"
  });
  game.settings.register(MODULE_ID, "successRiders", {
    scope: "world", config: true, type: String, default: "off-guard, frightened:1, prone, clumsy:1",
    name: "CCS.Setting.SuccessRiders.Name",
    hint: "CCS.Setting.SuccessRiders.Hint"
  });
  game.settings.register(MODULE_ID, "failureSetbacks", {
    scope: "world", config: true, type: String, default: "prone, drop-item, off-guard, stunned:1",
    name: "CCS.Setting.FailureSetbacks.Name",
    hint: "CCS.Setting.FailureSetbacks.Hint"
  });
  game.settings.register(MODULE_ID, "critPrompt", {
    scope: "world", config: true, type: Boolean, default: true,
    name: "CCS.Setting.CritPrompt.Name",
    hint: "CCS.Setting.CritPrompt.Hint"
  });
  game.settings.register(MODULE_ID, "skipPlayerDialog", {
    name: "CCS.Setting.SkipPlayerDialog.Name",
    hint: "CCS.Setting.SkipPlayerDialog.Hint",
    scope: "world", config: true, type: Boolean, default: false,
  });
}
