/**
 * Actor-specific Weaknesses for Creative Combat Stunts
 * Flag path: actor.flags["creative-combat-stunts"].weaknesses = Array<CCSWeakness>
 *
 * CCSWeakness = {
 *   id: string,
 *   label: string,
 *   trigger: { kind: "skill"|"attack"|"spell"|"trait"|"condition", key?: string, trait?: string },
 *   effect:  { type: "apply-condition"|"degree-bump", value?: number|string, modifierType?: "circumstance"|"status"|"item" },
 *   gmNotes?: string,
 *   enabled: boolean
 * }
 */

export function getActorWeaknesses(actor) {
  if (!actor) return [];
  return (actor.getFlag("creative-combat-stunts", "weaknesses") || []) ?? [];
}

export function actorHasWeaknesses(actor) {
  return getActorWeaknesses(actor).some(w => w && w.enabled);
}

// Match a weakness against the current stunt context
export function matchesWeakness(ctx, w) {
  const kind = String(ctx?.rollKind || "").toLowerCase();  // "skill" | "attack" | "spell"
  const key  = String(ctx?.rollKey  || "").toLowerCase();
  const traits = (ctx?.traits || []).map(t => String(t).toLowerCase());

  switch (w?.trigger?.kind) {
    case "skill":
      return kind === "skill" && (!w.trigger.key || String(w.trigger.key).toLowerCase() === key);
    case "attack":
      if (kind !== "attack") return false;
      if (w.trigger.trait) return traits.includes(String(w.trigger.trait).toLowerCase());
      return !w.trigger.key || String(w.trigger.key).toLowerCase() === key;
    case "spell":
      if (kind !== "spell") return false;
      return !w.trigger.key || String(w.trigger.key).toLowerCase() === key || key === "spell-attack";
    case "trait":
      return !!w.trigger.trait && traits.includes(String(w.trigger.trait).toLowerCase());
    case "condition":
      return traits.includes("cond:" + String(w.trigger.key || "").toLowerCase());
    default:
      return false;
  }
}

/**
 * Apply matching actor weaknesses (PF2e)
 * - May bump degree (pre-render), and/or apply a condition to the target.
 * Returns: { degree, texts: string[] }
 */
export async function applyActorWeaknessesPF2e(adapter, ctx, target, degree) {
  const list = getActorWeaknesses(target).filter(w => w?.enabled);
  if (!list.length) return { degree, texts: [] };

  const hits = list.filter(w => matchesWeakness(ctx, w));
  if (!hits.length) return { degree, texts: [] };

  const texts = [];
  let newDegree = degree;

  for (const w of hits) {
    const eff = w.effect || {};
    if (eff.type === "degree-bump") {
      const bump = Number(eff.value ?? 1);
      newDegree = Math.min(3, Math.max(0, (newDegree ?? 1) + bump));
      texts.push("Degree +" + bump + " (Actor Weakness)");
    } else if (eff.type === "apply-condition") {
      const slug = String(eff.value || "").trim();
      if (slug) {
        try { await adapter.applyCondition(target, slug); } catch (e) { console.warn("CCS Weakness apply-condition failed", e); }
        texts.push(slug + " (Actor Weakness)");
      }
    }
  }
  return { degree: newDegree, texts };
}

/** Templates bank (global, optional) **/
export function getWeaknessTemplates() {
  return game.settings.get("creative-combat-stunts","weaknessTemplates") || [];
}
export async function importTemplatesToActor(actor, ids) {
  const tmpl = getWeaknessTemplates();
  const toAdd = tmpl.filter(t => ids.includes(t.id));
  const existing = getActorWeaknesses(actor);
  await actor.setFlag("creative-combat-stunts","weaknesses", [...existing, ...toAdd.map(t => ({...t, enabled: true}))]);
}
