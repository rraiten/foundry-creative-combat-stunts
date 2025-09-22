import { CCSWeaknessTemplatesManager } from "./templates-ui.js";

// Seed defaults so new worlds aren’t empty
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
    label: "Prophet’s Chant",
    trigger: { kind: "spell", key: "spell-attack" },
    effect:  { type: "degree-bump", value: 1 },
    enabled: true
  }
];

export function registerWeaknessSettings() {
  // stored silently (no raw JSON input)
  game.settings.register("creative-combat-stunts","weaknessTemplates",{
    scope:"world", config:false, type:Array, default: DEFAULT_TEMPLATES
  });

  game.settings.registerMenu("creative-combat-stunts","weaknessTemplatesMenu",{
    name: "Weakness Templates (CCS)",
    label: "Manage Templates",
    hint: "Reusable weaknesses you can import into actors.",
    type: CCSWeaknessTemplatesManager,
    restricted: true
  });
}
