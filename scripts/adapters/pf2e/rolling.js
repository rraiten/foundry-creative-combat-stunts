// PF2e strike rolling and d20 extraction

import { MODULE_ID } from "../../constants.js";
import { selectStrike, buildStuntModifiers, getSkillModifier, getStrikeAttackModifier } from "../../logic.js";
import { getSpellAttackModPF2 } from "./dc.js";

// Robust kept-d20 extractor (handles kh/kl, rerolls, pools)
export function extractKeptD20(resultOrRoll) {
  // 0) Trust adapter-set value if present
  const pre = Number(resultOrRoll?._ccsD20);
  if (Number.isFinite(pre) && pre !== 0) return pre;

  const roll = resultOrRoll?.roll ?? resultOrRoll;
  const dice = Array.isArray(roll?.dice) ? roll.dice : [];

  // 1) Gather all d20 results across all d20 Die terms
  const candidates = [];
  for (const die of dice) {
    if (Number(die?.faces) !== 20) continue;
    const res = Array.isArray(die?.results) ? die.results : [];
    for (const r of res) {
      const v = Number(r?.result ?? r?.value ?? r?.roll ?? r?.total);
      if (!Number.isFinite(v)) continue;
      const kept = (r?.discarded !== true) && (r?.active !== false);
      const rerolled = (r?.rerolled === true) || (r?.isRerolled === true);
      candidates.push({ v, kept, rerolled, discarded: r?.discarded === true });
    }
  }

  // 2) Prefer kept & not rerolled -> kept -> non-discarded -> first seen
  let pick =
    candidates.find(c => c.kept && !c.rerolled) ||
    candidates.find(c => c.kept) ||
    candidates.find(c => !c.discarded) ||
    candidates[0];
  if (pick) return pick.v;

  // 3) Recurse into PoolTerm sub-rolls (fortune/misfortune often creates pools)
  const terms = Array.isArray(roll?.terms) ? roll.terms : [];
  for (const t of terms) {
    if (Array.isArray(t?.rolls)) {
      for (const sub of t.rolls) {
        const v = extractKeptD20({ roll: sub });
        if (Number.isFinite(v)) return v;
      }
    }
    if (Number(t?.faces) === 20 && Array.isArray(t?.results)) {
      const keptRes = t.results.find(r => r?.discarded !== true && r?.active !== false);
      const v = Number(keptRes?.result ?? keptRes?.value);
      if (Number.isFinite(v)) return v;
    }
  }

  // 4) PF2e CheckRoll may expose a d20s accessor (best-effort)
  try {
    const d20s = roll?.d20s;
    const v = Array.isArray(d20s) ? Number(d20s.find?.(x => Number.isFinite(Number(x?.value)))?.value) : null;
    if (Number.isFinite(v)) return v;
  } catch (_) {}

  return null;
}

// computeSkillMod and getStrikeAttackMod moved to logic.js as getSkillModifier / getStrikeAttackModifier

export async function rollAsStrike(ctx) {
  const { actor, target } = ctx;
  if (!actor || !target) {
    ui.notifications?.warn(game.i18n.localize("CCS.Notify.PF2eNoActorTarget"));
    return null;
  }

  const rollKey = String(ctx.rollKey || "").toLowerCase();
  const isAttack = String(ctx.rollKind || "").toLowerCase() === "attack";

  // 1) Select strike
  const strikesRaw = actor.system?.actions ?? actor.system?.strikes ?? [];
  const strikes = Array.isArray(strikesRaw) ? strikesRaw : [];
  const { strike, isSpellAttack } = selectStrike(strikes, ctx.rollKind, ctx.rollKey);

  const attackFn = strike?.attack ?? strike?.variants?.[0]?.roll;
  if (typeof attackFn !== "function") {
    ui.notifications?.warn(game.i18n.localize("CCS.Notify.PF2eNoStrikeRoll"));
    return null;
  }

  // 2) Compute modifiers for context
  const skillMod = getSkillModifier(actor, rollKey, ctx.stat);
  const currentAttack = getStrikeAttackModifier(strike);
  const spellAttackMod = isSpellAttack ? getSpellAttackModPF2(actor) : null;

  ctx._skillMod = skillMod;
  ctx._attackMod = isSpellAttack && Number.isFinite(spellAttackMod) ? spellAttackMod : currentAttack;

  if (isAttack) {
    ctx.rollLabel = strike?.label ?? strike?.item?.name ?? ctx.rollLabel ?? "Strike";
    if (isSpellAttack) ctx.rollLabel = game.i18n.localize("CCS.UI.SpellAttack");
  }

  // 3) Build modifier descriptors (pure logic) then instantiate Mod objects
  const targetAC = Number(target?.system?.attributes?.ac?.value ?? target?.attributes?.ac?.value ?? 0) || 0;
  const mappedDC = Number.isFinite(ctx.dc) ? Number(ctx.dc) : null;

  const modDescriptors = buildStuntModifiers({
    skillMod, currentAttack, spellAttackMod, rollKind: ctx.rollKind, rollKey,
    coolBonus: ctx.coolBonus, tacticalRisk: ctx.tacticalRisk,
    challengeAdj: ctx.challengeAdj, targetAC, mappedDC, isSpellAttack,
  });

  const Mod = game.pf2e?.Modifier ?? game.pf2e?.modifiers?.Modifier;
  const mods = Mod ? modDescriptors.map(d => new Mod(d)) : [];

  // Set DC for degree-of-success (both attack and skill stunts use AC
  // because the defense map shim adjusts the roll to compensate)
  ctx._dcStrike = targetAC;

  // 4) Execute the roll
  let rollOpts = { createMessage: true, skipDialog: true };
  if (ctx.rollTwice === "keep-higher") rollOpts.rollTwice = "keep-higher";
  if (mods.length) rollOpts.modifiers = mods;

  try {
    const skipPref = !!game.settings.get(MODULE_ID, "skipPlayerDialog");
    rollOpts.skipDialog = skipPref;
  } catch (_) {}

  const r = await attackFn(rollOpts);
  if (!r) return null; // roll was cancelled or failed

  try {
    const v = extractKeptD20(r);
    if (Number.isFinite(v)) r._ccsD20 = v;
  } catch (_) {}

  return {
    total:   r?.total   ?? r?.roll?.total   ?? 0,
    formula: r?.formula ?? r?.roll?.formula ?? "d20",
    roll:    r?.roll    ?? r,
    _ccsD20: r?._ccsD20
  };
}
