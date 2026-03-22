/**
 * Weakness logic (storage, matching, applying)
 * Flags: actor.flags["creative-combat-stunts"].weaknesses = Array<CCSWeakness>
 */
import { MODULE_ID, FLAGS } from "../constants.js";
import { computeWeaknessEffects } from "../logic.js";

export function getActorWeaknesses(actor) {
  if (!actor) return [];
  return (actor.getFlag(MODULE_ID, FLAGS.WEAKNESSES) || []) ?? [];
}
export function actorHasWeaknesses(actor) {
  return getActorWeaknesses(actor).some(w => w && w.enabled);
}
export function getWeaknessTemplates() {
  return game.settings.get(MODULE_ID, "weaknessTemplates") || [];
}
export async function setWeaknessTemplates(list) {
  await game.settings.set(MODULE_ID, "weaknessTemplates", list ?? []);
}
export async function importTemplatesToActor(actor, ids) {
  const tmpl = getWeaknessTemplates();
  const toAdd = tmpl.filter(t => ids.includes(t.id));
  const existing = getActorWeaknesses(actor);
  await actor.setFlag(MODULE_ID, FLAGS.WEAKNESSES,
    [...existing, ...toAdd.map(t => ({...t, enabled: true}))]);
}

// Matchers
export function matchesWeakness(ctx, w) {
  const kind = String(ctx?.rollKind || "").toLowerCase();  // "skill" | "attack" | "spell"
  const key  = String(ctx?.rollKey  || "").toLowerCase();
  const traits = (ctx?.traits || []).map(t => String(t).toLowerCase());

  switch (w?.trigger?.kind) {
    case "skill":   return kind === "skill"  && (!w.trigger.key || String(w.trigger.key).toLowerCase() === key);
    case "attack":  if (kind !== "attack") return false;
                    if (w.trigger.trait) return traits.includes(String(w.trigger.trait).toLowerCase());
                    return !w.trigger.key || String(w.trigger.key).toLowerCase() === key;
    case "spell":   {
                      const isSpellRoll = kind === "spell" || (kind === "attack" && key === "__spell_attack__");
                      if (!isSpellRoll) return false;
                      return !w.trigger.key || String(w.trigger.key).toLowerCase() === key
                        || key === "spell-attack" || key === "__spell_attack__";
                    }
    case "trait":   return !!w.trigger.trait && traits.includes(String(w.trigger.trait).toLowerCase());
    case "condition": return traits.includes("cond:" + String(w.trigger.key || "").toLowerCase());
    default:        return false;
  }
}

// PF2e-side application (degree bump + condition)
export async function applyActorWeaknessesPF2e(adapter, ctx, target, degree) {
  const list = getActorWeaknesses(target).filter(w => w?.enabled);
  if (!list.length) return { degree, texts: [] };
  const hits = list.filter(w => matchesWeakness(ctx, w));
  if (!hits.length) return { degree, texts: [] };

  // Pure computation: degree bumps + condition list
  const { degree: newDegree, degreeBumpTexts, conditionsToApply } = computeWeaknessEffects(hits, degree);

  // Async: apply conditions via adapter
  const conditionTexts = [];
  for (const c of conditionsToApply) {
    try {
      await adapter.applyCondition(target, c.slug);
      conditionTexts.push(c.text);
    } catch (e) {
      console.warn("CCS Weakness apply-condition failed", e);
    }
  }

  return { degree: newDegree, texts: [...degreeBumpTexts, ...conditionTexts] };
}
