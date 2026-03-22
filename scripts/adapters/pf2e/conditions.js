// PF2e condition and effect application

import { applyEffectItem } from "../../core.js";
import { parseEntry, buildTriggerRules } from "../../logic.js";

export async function applyConfiguredEffect(actor, entry, isSuccess) {
  const parsed = parseEntry(entry);
  if (!parsed) return;
  if (parsed.text === "drop-item") {
    ui.notifications?.info(game.i18n.format("CCS.Notify.DropItem", { name: actor.name }));
    return;
  }
  await applyCondition(actor, parsed.slug, parsed.value);
}

export async function applyTriggerEffect(target, trigger, degree) {
  if (!trigger || !target) return;

  const { rules, conditionsToApply, rounds } = buildTriggerRules(trigger.effect, degree, trigger.label);

  for (const c of conditionsToApply) {
    await applyCondition(target, c.slug, c.value);
  }

  if (rules.length) {
    await applyEffectItem(target, `CCS: ${trigger.label}`, rounds, rules);
  }
}

export async function applyCondition(actor, slug, value = null) {
  try {
    const s = String(slug || "").toLowerCase();
    const cm = game.pf2e?.ConditionManager;

    if (cm?.addCondition) {
      const opts = value != null ? { value } : undefined;
      await cm.addCondition(s, actor, opts);
      return;
    }

    if (value == null && typeof actor?.toggleCondition === "function") {
      await actor.toggleCondition(s, { active: true });
      return;
    }
    if (value != null && typeof actor?.increaseCondition === "function") {
      await actor.increaseCondition(s, { value });
      return;
    }

    // Fallback: lightweight effect so play continues
    await applyEffectItem(actor, `CCS: ${s}`, 1, [
      { key: "Note", selector: "all", text: `${s} (CCS fallback)`, title: "CCS" },
    ]);
  } catch (e) {
    console.warn("CCS: Failed to apply condition", slug, e);
    ui.notifications?.warn(game.i18n.format("CCS.Notify.ConditionFail", { slug }));
  }
}
