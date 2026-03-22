// PF2e strike rolling and d20 extraction

import { MODULE_ID } from "../../constants.js";
import { getSpellAttackModPF2 } from "./dc.js";

// Robust kept-d20 extractor (handles kh/kl, rerolls, pools)
export function extractKeptD20(resultOrRoll) {
  // 0) Trust adapter-set value if present
  const pre = Number(resultOrRoll?._ccsD20);
  if (Number.isFinite(pre) && pre) return pre;

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

export async function rollAsStrike(ctx) {
  const actor  = ctx.actor;
  const target = ctx.target;
  if (!actor || !target) {
    ui.notifications?.warn("PF2e: No actor or target for Stunt Strike.");
    return null;
  }

  const rollKey = String(ctx.rollKey || "").toLowerCase();

  // 1) pick an existing strike (prefer unarmed/fist, then melee)
  const strikes = actor.system?.actions ?? actor.system?.strikes ?? [];
  const norm = (s) => (s ?? "").toString().toLowerCase();

  let strike;
  let _isSpellAttackChoice = false;
  if ((ctx.rollKind || "").toLowerCase() === "attack" && ctx.rollKey) {
    const key = norm(ctx.rollKey);
    _isSpellAttackChoice = (key === "__spell_attack__");
    if (!_isSpellAttackChoice) {
      strike = strikes.find(s =>
        norm(s?.slug) === key ||
        norm(s?.item?.slug) === key ||
        norm(s?.item?.id) === key ||
        norm(s?.label) === key ||
        norm(s?.item?.name) === key
      );
    }
  }

  // fallback if nothing matched
  strike = strike ||
    strikes.find(s => s?.item?.system?.traits?.value?.includes?.("unarmed")) ||
    strikes.find(s => (s?.item?.system?.range?.value ?? null) == null) ||
    strikes[0];

  const attackFn = strike?.attack ?? strike?.variants?.[0]?.roll;
  if (typeof attackFn !== "function") {
    ui.notifications?.warn("PF2e: Could not access a Strike roll function.");
    return null;
  }

  // 2) compute the chosen SKILL modifier (don't rely on ctx.stat)
  const skillObj =
    actor.system?.skills?.[rollKey] ??
    actor.skills?.[rollKey] ?? null;
  const skillMod = Number(
    skillObj?.mod ??
    skillObj?.totalModifier ??
    skillObj?.value ??
    ctx.stat?.check?.mod ??
    ctx.stat?.mod ??
    0
  );

  ctx._skillMod = skillMod;

  // 3) current strike attack modifier
  const currentAttack =
    Number(strike?.totalModifier ?? strike?.attack?.totalModifier ?? strike?.mod) || 0;

  ctx._attackMod = Number(currentAttack) || 0;
  if ((String(ctx.rollKind || '').toLowerCase() === 'attack')) {
    ctx.rollLabel = strike?.label ?? strike?.item?.name ?? ctx.rollLabel ?? 'Strike';
    if (_isSpellAttackChoice) ctx.rollLabel = "Spell Attack";
  }

  // 4) build stunt modifiers
  const Mod  = game.pf2e?.Modifier ?? game.pf2e?.modifiers?.Modifier;
  const mods = [];

  // A0) If the synthetic "Spell Attack" was chosen, shim to the actor's spell-attack mod
  if (_isSpellAttackChoice && Mod) {
    const spellAttackMod = getSpellAttackModPF2(actor);
    if (Number.isFinite(spellAttackMod)) {
      const delta = spellAttackMod - (Number(currentAttack) || 0);
      if (delta) {
        mods.push(new Mod({ label: "Stunt (spell attack→strike)", modifier: delta, type: "untyped" }));
      }
      ctx._attackMod = spellAttackMod;
    }
  }

  // A) remap strike total to the skill total (ONLY for skill-based stunts)
  const deltaSkillVsStrike = skillMod - currentAttack;
  if (Mod && (String(ctx.rollKind).toLowerCase() !== "attack") && deltaSkillVsStrike) {
    mods.push(new Mod({ label: `Stunt (skill→strike: ${rollKey || "skill"})`, modifier: deltaSkillVsStrike, type: "untyped" }));
  }

  // B) cool bonus (unless swapped for advantage earlier)
  if (Mod && ctx.coolBonus) {
    mods.push(new Mod({ label: "Stunt (cool)", modifier: Number(ctx.coolBonus) || 0, type: "circumstance" }));
  }

  // C) tactical risk: explicit -2 line
  if (Mod && ctx.tacticalRisk) {
    mods.push(new Mod({ label: "Stunt (risk)", modifier: -2, type: "untyped" }));
  }

  // D) challenge adjustments (weakness/resistance)
  if (Mod && (Number(ctx.challengeAdj ?? 0) !== 0)) {
    const val = Number(ctx.challengeAdj) || 0;
    const tag =
      val > 0 ? (val === 4 ? "major weakness" : "weakness")
              : (val === -4 ? "major resistance" : "resistance");

    mods.push(
      new Mod({
        label: `Stunt (challenge: ${tag})`,
        modifier: val,
        type: "untyped",
      })
    );
  }

  // E) defense map shim: make margin vs AC equal margin vs mapped DC
  const targetAC = Number(target?.system?.attributes?.ac?.value ?? target?.attributes?.ac?.value ?? 0) || 0;
  const isAttackStunt = String(ctx.rollKind || '').toLowerCase() === 'attack';
  if (isAttackStunt) {
    ctx._dcStrike = targetAC;
  } else {
      const mappedDC = Number.isFinite(ctx.dc) ? Number(ctx.dc) : null;
      const dcAdj = (mappedDC != null) ? (targetAC - mappedDC) : 0;
      if (Mod && mappedDC != null && dcAdj) {
        mods.push(new Mod({ label: `Stunt (defense map ${mappedDC}→AC ${targetAC})`, modifier: dcAdj, type: "untyped" }));
      }
      ctx._dcStrike = targetAC;
      ctx._dcAdj    = dcAdj;
  }

  // 5) roll the strike (native PF2e attack card -> crit decks can trigger)
  let rollOpts = { createMessage: true, skipDialog: true };
  if (ctx.rollTwice === "keep-higher") rollOpts.rollTwice = "keep-higher";
  if (mods.length) rollOpts.modifiers = mods;

  try {
    const skipPref = !!game.settings.get(MODULE_ID, "skipPlayerDialog");
    const wantSkip = skipPref;
    rollOpts.skipDialog = wantSkip;
  } catch (_) {}

  const r = await attackFn(rollOpts);

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
