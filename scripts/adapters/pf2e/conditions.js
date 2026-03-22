// PF2e condition and effect application

import { applyEffectItem } from "../../core.js";

export function parseEntry(entry) {
  const t = (entry || "").trim();
  if (!t) return null;
  if (t === "drop-item") return { text: "drop-item" };
  const parts = t.split(":").map(s => s.trim());
  return { slug: parts[0], value: parts[1] ? Number(parts[1]) : null };
}

export async function applyConfiguredEffect(actor, entry, isSuccess) {
  const parsed = parseEntry(entry);
  if (!parsed) return;
  if (parsed.text === "drop-item") {
    ui.notifications?.info(`${actor.name} drops a held item.`);
    return;
  }
  await applyCondition(actor, parsed.slug, parsed.value);
}

export async function applyTriggerEffect(target, trigger, degree) {
  const eff = trigger.effect || {};
  const rounds = eff.durationRounds ?? 1;
  const rules = [];

  const applyList = [...(eff.apply || [])];
  if (degree === 3 && Array.isArray(eff.critApply)) applyList.push(...eff.critApply);

  for (const ap of applyList) {
    if (ap.type === "condition") {
      await applyCondition(target, ap.value, ap.amount ?? null);
    } else if (ap.type === "off-guard" && ap.value) {
      await applyCondition(target, "off-guard");
    } else if (ap.type === "acMod") {
      const modType = ap.modType || "circumstance";
      rules.push({ key: "FlatModifier", selector: "ac", type: modType, value: ap.value ?? -2, label: trigger.label || "CCS Trigger" });
    } else if (ap.type === "saveMods") {
      const v = Number(ap.value) || 0;
      const modType = ap.modType || "circumstance";
      for (const sel of ["fortitude", "reflex", "will"]) {
        rules.push({ key: "FlatModifier", selector: sel, type: modType, value: v, label: trigger.label || "CCS Trigger" });
      }
    } else if (ap.type === "removeReaction") {
      rules.push({ key: "Note", selector: "all", text: `No reactions: ${ap.value}`, title: "CCS" });
    } else if (ap.type === "suppressResistance") {
      rules.push({ key: "Note", selector: "all", text: "Resistances suppressed (CCS)", title: "CCS" });
    } else if (ap.type === "note") {
      rules.push({ key: "Note", selector: "all", text: ap.value, title: "CCS" });
    }
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
    ui.notifications?.warn(`CCS: Could not apply condition ${slug}.`);
  }
}
