// Pure logic functions — zero FoundryVTT dependencies, fully testable.
import { DEGREE_LABELS, SHORT_TO_LABEL } from "./constants.js";

/**
 * Parse a cool tier value (string or number) into a numeric tier (0, 1, 2).
 */
export function parseCoolTier(value) {
  if (typeof value === "string") {
    if (value === "full") return 2;
    if (value === "light") return 1;
    return 0;
  }
  return Number(value ?? 0);
}

/**
 * PF2e degree of success calculation.
 * Rules: >=dc+10 = crit success, >=dc = success, <=dc-10 = crit fail, else fail.
 * Nat 20 bumps +1 (capped at 3), nat 1 bumps -1 (floored at 0).
 */
export function computeDegree(total, dc, d20) {
  let degree = (total >= dc + 10) ? 3
             : (total >= dc)      ? 2
             : (total <= dc - 10) ? 0
             : 1;
  if (d20 === 20) degree = Math.min(3, degree + 1);
  else if (d20 === 1) degree = Math.max(0, degree - 1);
  return degree;
}

/**
 * 5e degree of success (simple): nat1=0, nat20=3, >=dc=2, else 1.
 */
export function compute5eDegree(total, dc, nat) {
  if (nat === 1) return 0;
  if (nat === 20) return 3;
  return total >= dc ? 2 : 1;
}

/**
 * Clamp a degree after applying a bump (+/-), keeping it in [0, 3].
 */
export function clampDegree(degree, bump) {
  return Math.min(3, Math.max(0, degree + bump));
}

/**
 * Build stunt roll options from raw form values.
 */
export function buildStuntConfig({ coolStr, rollKindStr, strikeKey, rollKey, risk, plausible, challengeAdj, advNow, spendPool, triggerId, defaultStrike }) {
  const coolTier = parseCoolTier(coolStr);
  const rollKind = (rollKindStr || "skill").toLowerCase();
  const resolvedRollKey = (rollKind === "attack"
    ? (strikeKey || defaultStrike || "")
    : (rollKey || "acr")
  ).toLowerCase();
  let chooseAdvNow = !!advNow;
  if (coolTier < 2) chooseAdvNow = false;
  return {
    rollKind,
    rollKey: resolvedRollKey,
    coolTier,
    tacticalRisk: !!risk,
    plausible: !!plausible,
    chooseAdvNow,
    spendPoolNow: !!spendPool,
    triggerId: triggerId || null,
    challengeAdj: Number(challengeAdj) || 0,
  };
}

/**
 * Compute display math for the chat card (pure arithmetic).
 */
export function computeDisplayMath({ d20, skillMod, attackMod, coolBonus, tacticalRisk, challengeAdj, rollKind }) {
  const cool = Number(coolBonus ?? 0);
  const risk = tacticalRisk ? -2 : 0;
  const challenge = Number(challengeAdj ?? 0);
  const base = (String(rollKind).toLowerCase() === "attack") ? Number(attackMod ?? 0) : Number(skillMod ?? 0);
  const displayMod = base + cool + risk + challenge;
  const sign = displayMod >= 0 ? "+" : "-";
  const displayFormula = `1d20 ${sign} ${Math.abs(displayMod)}`;
  const displayTotal = Number(d20 ?? 0) + displayMod;
  return { displayFormula, displayTotal, displayMod };
}

/**
 * Validate whether a cinematic pool spend is allowed (no side effects).
 */
export function validatePoolSpend(pool, usage, actorId) {
  if (!pool?.enabled) return { ok: false, reason: "Pool disabled" };
  const remaining = Number(pool.remaining ?? 0);
  if (!Number.isFinite(remaining) || remaining <= 0) return { ok: false, reason: "No tokens left" };
  if (usage?.[actorId]) return { ok: false, reason: "Already used this encounter" };
  return { ok: true, reason: null };
}

/**
 * Normalize a PF2e skill key to its 3-letter short code.
 * Accepts both long names ("acrobatics") and short codes ("acr").
 */
export function normalizeSkillKey(k) {
  const v = String(k || "").toLowerCase();
  if (v === "acrobatics" || v === "acr") return "acr";
  if (v === "athletics"  || v === "ath") return "ath";
  if (v === "crafting"   || v === "cra") return "cra";
  if (v === "medicine"   || v === "med") return "med";
  if (v === "stealth"    || v === "ste") return "ste";
  if (v === "survival"   || v === "sur") return "sur";
  if (v === "thievery"   || v === "thi") return "thi";
  return v;
}

/**
 * Select a strike from the strikes array based on rollKind and rollKey.
 * Returns { strike, isSpellAttack }.
 */
export function selectStrike(strikes, rollKind, rollKey) {
  const norm = (s) => (s ?? "").toString().toLowerCase();
  const kind = (rollKind || "").toLowerCase();
  const key = norm(rollKey);

  let strike = null;
  let isSpellAttack = false;

  if (kind === "attack" && rollKey) {
    isSpellAttack = (key === "__spell_attack__");
    if (!isSpellAttack) {
      strike = strikes.find(s =>
        norm(s?.slug) === key ||
        norm(s?.item?.slug) === key ||
        norm(s?.item?.id) === key ||
        norm(s?.label) === key ||
        norm(s?.item?.name) === key
      ) || null;
    }
  }

  // fallback: unarmed → melee → first
  strike = strike ||
    strikes.find(s => s?.item?.system?.traits?.value?.includes?.("unarmed")) ||
    strikes.find(s => (s?.item?.system?.range?.value ?? null) == null) ||
    strikes[0] || null;

  return { strike, isSpellAttack };
}

/**
 * Build an array of stunt modifier descriptors (plain objects).
 * Each descriptor has { label, modifier, type }.
 * Foundry Mod objects are instantiated by the caller (rolling.js).
 */
export function buildStuntModifiers({ skillMod, currentAttack, spellAttackMod, rollKind, rollKey, coolBonus, tacticalRisk, challengeAdj, targetAC, mappedDC, isSpellAttack }) {
  const mods = [];
  const kind = String(rollKind || "").toLowerCase();
  const isAttack = kind === "attack";

  // Spell attack shim
  if (isSpellAttack && Number.isFinite(spellAttackMod)) {
    const delta = spellAttackMod - (Number(currentAttack) || 0);
    if (delta) {
      mods.push({ label: "Stunt (spell attack→strike)", modifier: delta, type: "untyped" });
    }
  }

  // Skill→strike remap (only for skill-based stunts)
  if (!isAttack) {
    const delta = Number(skillMod || 0) - Number(currentAttack || 0);
    if (delta) {
      mods.push({ label: `Stunt (skill→strike: ${rollKey || "skill"})`, modifier: delta, type: "untyped" });
    }
  }

  // Cool bonus
  if (coolBonus) {
    mods.push({ label: "Stunt (cool)", modifier: Number(coolBonus) || 0, type: "circumstance" });
  }

  // Tactical risk: -2
  if (tacticalRisk) {
    mods.push({ label: "Stunt (risk)", modifier: -2, type: "untyped" });
  }

  // Challenge adjustment
  const challenge = Number(challengeAdj) || 0;
  if (challenge !== 0) {
    const tag = challenge > 0
      ? (challenge === 4 ? "major weakness" : "weakness")
      : (challenge === -4 ? "major resistance" : "resistance");
    mods.push({ label: `Stunt (challenge: ${tag})`, modifier: challenge, type: "untyped" });
  }

  // Defense map shim (skill stunts only)
  if (!isAttack && mappedDC != null && Number.isFinite(mappedDC)) {
    const ac = Number(targetAC) || 0;
    const dcAdj = ac - mappedDC;
    if (dcAdj) {
      mods.push({ label: `Stunt (defense map ${mappedDC}→AC ${ac})`, modifier: dcAdj, type: "untyped" });
    }
  }

  return mods;
}

/**
 * Extract the d20 value from a roll result for display purposes.
 * Works with various FoundryVTT roll structures.
 */
export function extractD20FromResult(result) {
  const _d20Die = result?.roll?.dice?.find?.(d => d?.faces === 20) ?? null;
  return Number(
    _d20Die?.results?.[0]?.result ??
    _d20Die?.results?.[0]?.value ??
    _d20Die?.total ??
    result?.roll?.terms?.find?.(t => t?.faces === 20)?.results?.[0]?.result ??
    result?._ccsD20 ??
    result?.roll?.d20 ??
    0
  );
}

/**
 * Normalize an applied effect value to display text.
 */
export function effectToText(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  return (v ?? "").toString().trim();
}

/**
 * Build the data object for the chat card template (pure data transformation).
 */
export function buildChatCardData({ degree, ctx, applied, poolSpent, advUsed, isPF2, d20 }) {
  const degreeTxt = (degree != null && DEGREE_LABELS[degree]) ? DEGREE_LABELS[degree] : "—";

  const appliedTargetText = effectToText(applied?.targetEffect);
  const appliedSelfText = effectToText(applied?.selfEffect);
  const hasAnyApplied = !!(appliedTargetText || appliedSelfText);

  const extra = [];
  if (advUsed && ctx?.rollTwice === "keep-higher") extra.push("🎲 Advantage consumed");
  if (poolSpent) extra.push("🎬 Cinematic Pool spent (+1 degree/upgrade)");

  const { displayFormula, displayTotal } = computeDisplayMath({
    d20, skillMod: ctx?._skillMod, attackMod: ctx?._attackMod,
    coolBonus: ctx?.coolBonus, tacticalRisk: ctx?.tacticalRisk,
    challengeAdj: ctx?.challengeAdj, rollKind: ctx?.rollKind,
  });

  const challenge = Number(ctx?.challengeAdj ?? 0);
  const challengeText = challenge ? (challenge > 0 ? `+${challenge}` : `${challenge}`) : "";
  const actionName = ctx?.rollLabel ?? (ctx?.rollKey?.toUpperCase?.() ?? "Skill");
  const isAttack = String(ctx?.rollKind ?? "").toLowerCase() === "attack";

  const appliedFallback = ((!applied || (!applied.targetEffect && !applied.selfEffect))
    && (degreeTxt === "Critical Success" || degreeTxt === "Critical Failure"))
    ? "Draw a Creative Stunt Card" : null;

  return {
    displayFormula, displayTotal, d20, challengeText, actionName,
    isPF2,
    dc: isAttack ? (ctx?._dcStrike ?? ctx?.dc) : ctx?.dc,
    dcStrike: ctx?._dcStrike ?? null,
    dcDelta: (ctx?._dcStrike != null && ctx?.dc != null) ? (ctx._dcStrike - ctx.dc) : null,
    degree: degreeTxt,
    coolBonus: ctx?.coolBonus ?? 0,
    coolNote: (ctx?.coolBonus ? `(+${ctx.coolBonus} Flavor)` : (ctx?.rollTwice === "keep-higher" ? "(Advantage used)" : "")),
    rollTwice: ctx?.rollTwice === "keep-higher",
    tacticalRisk: !!ctx?.tacticalRisk,
    applied, appliedFallback,
    spentPool: !!poolSpent,
    triggerLabel: ctx?.trigger?.label || null,
    hasAnyApplied,
    appliedTargetText: appliedTargetText || null,
    appliedSelfText: appliedSelfText || null,
    logExtras: extra.join(" • "),
  };
}

/**
 * Parse a condition entry string like "prone" or "frightened:2" or "drop-item".
 */
export function parseEntry(entry) {
  const t = (entry || "").trim();
  if (!t) return null;
  if (t === "drop-item") return { text: "drop-item" };
  const parts = t.split(":").map(s => s.trim());
  return { slug: parts[0], value: parts[1] ? Number(parts[1]) : null };
}

/**
 * Build a roll label from actor skill data (pure string lookup).
 */
export function buildRollLabel(actor, rollKey) {
  try {
    const skills = actor?.system?.skills ?? actor?.skills ?? {};
    const key = normalizeSkillKey(rollKey);
    const k2 = String(rollKey ?? "").toLowerCase();
    const sk = skills?.[key] ?? skills?.[k2];
    return sk?.label ?? sk?.name ?? SHORT_TO_LABEL[key] ?? (SHORT_TO_LABEL[k2] ?? "Skill");
  } catch {
    return "Skill";
  }
}

/**
 * Extract skill modifier from actor data (pure numeric extraction).
 */
export function getSkillModifier(actor, rollKey, fallbackStat = null) {
  const skillObj = actor?.system?.skills?.[rollKey] ?? actor?.skills?.[rollKey] ?? null;
  return Number(
    skillObj?.mod ?? skillObj?.totalModifier ?? skillObj?.value ??
    fallbackStat?.check?.mod ?? fallbackStat?.mod ?? 0
  );
}

/**
 * Extract strike attack modifier (pure numeric extraction).
 */
export function getStrikeAttackModifier(strike) {
  return Number(strike?.totalModifier ?? strike?.attack?.totalModifier ?? strike?.mod) || 0;
}

/**
 * Build trigger effect rules (pure data construction, no Foundry calls).
 * Returns { rules, conditionsToApply } where conditionsToApply is an array of
 * {slug, value} objects that need async applyCondition calls.
 */
export function buildTriggerRules(triggerEffect, degree, triggerLabel = "CCS Trigger") {
  const eff = triggerEffect || {};
  const rules = [];
  const conditionsToApply = [];

  const applyList = [...(Array.isArray(eff.apply) ? eff.apply : [])];
  if (degree === 3 && Array.isArray(eff.critApply)) applyList.push(...eff.critApply);

  for (const ap of applyList) {
    if (ap.type === "condition") {
      conditionsToApply.push({ slug: ap.value, value: ap.amount ?? null });
    } else if (ap.type === "off-guard" && ap.value) {
      conditionsToApply.push({ slug: "off-guard", value: null });
    } else if (ap.type === "acMod") {
      rules.push({ key: "FlatModifier", selector: "ac", type: ap.modType || "circumstance", value: ap.value ?? -2, label: triggerLabel });
    } else if (ap.type === "saveMods") {
      const v = Number(ap.value) || 0;
      const modType = ap.modType || "circumstance";
      for (const sel of ["fortitude", "reflex", "will"]) {
        rules.push({ key: "FlatModifier", selector: sel, type: modType, value: v, label: triggerLabel });
      }
    } else if (ap.type === "removeReaction") {
      rules.push({ key: "Note", selector: "all", text: `No reactions: ${ap.value}`, title: "CCS" });
    } else if (ap.type === "suppressResistance") {
      rules.push({ key: "Note", selector: "all", text: "Resistances suppressed (CCS)", title: "CCS" });
    } else if (ap.type === "note") {
      rules.push({ key: "Note", selector: "all", text: ap.value, title: "CCS" });
    }
  }

  return { rules, conditionsToApply, rounds: eff.durationRounds ?? 1 };
}

/**
 * Get flavor options based on system (pure data).
 */
export function getFlavorOptionsForSystem(isPF2) {
  return isPF2
    ? [
        { value: 0, label: "Plain" },
        { value: 1, label: "Nice or Repeating (+1 circumstance)" },
        { value: 2, label: "So Cool (+2 circumstance)" },
      ]
    : [
        { value: 0, label: "Plain" },
        { value: 1, label: "Nice or Repeating (Advantage)" },
        { value: 2, label: "So Cool (Advantage +2)" },
      ];
}

/**
 * Pure weakness effect application (degree bumps only, no async condition calls).
 * Returns { degree, degreeBumpTexts, conditionsToApply }.
 */
export function computeWeaknessEffects(weaknesses, degree) {
  const degreeBumpTexts = [];
  const conditionsToApply = [];
  let newDegree = degree;

  for (const w of weaknesses) {
    const eff = w.effect || {};
    if (eff.type === "degree-bump") {
      const bump = Number(eff.value ?? 1);
      newDegree = clampDegree(newDegree ?? 1, bump);
      degreeBumpTexts.push("Degree +" + bump + " (Actor Weakness)");
    } else if (eff.type === "apply-condition") {
      const slug = String(eff.value || "").trim();
      if (slug) {
        conditionsToApply.push({ slug, text: slug + " (Actor Weakness)" });
      }
    }
  }

  return { degree: newDegree, degreeBumpTexts, conditionsToApply };
}
