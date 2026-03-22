export const MODULE_ID = "creative-combat-stunts";

export const DEGREE_LABELS = ["Critical Failure", "Failure", "Success", "Critical Success"];

export const FLAGS = {
  POOL: "cinematicPool",
  POOL_USAGE: "poolUsage",
  ADV_USAGE: "advUsage",
  WEAKNESSES: "weaknesses",
  TRIGGERS: "weaknessTriggers",
};

export const DEFAULT_POOL = { enabled: false, size: 4, remaining: 4 };

export const SKILL_TO_DEF = {
  acr: "reflex",
  ath: "fortitude",
  cra: "fortitude",
  med: "fortitude",
  ste: "perception",
  sur: "perception",
  thi: "reflex",
};

export const SHORT_TO_LABEL = {
  acr: "Acrobatics",
  arc: "Arcana",
  ath: "Athletics",
  cra: "Crafting",
  dec: "Deception",
  dip: "Diplomacy",
  itm: "Intimidation",
  med: "Medicine",
  nat: "Nature",
  occ: "Occultism",
  prf: "Performance",
  rel: "Religion",
  soc: "Society",
  ste: "Stealth",
  sur: "Survival",
  thi: "Thievery",
};
