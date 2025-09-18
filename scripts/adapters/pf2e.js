import { openCritPrompt, chooseRiderDialog } from "../ui.js";

// --- Skill → defense map (only special-cased skills listed)
const SKILL_TO_DEF = {
  acr: "reflex",
  ath: "fortitude",
  cra: "fortitude",
  med: "fortitude",
  ste: "perception",
  sur: "perception",
  thi: "reflex",
};

function normalizeSkillKey(k) {
  const v = String(k || "").toLowerCase();
  // Accept both short and long names; return short code
  if (v === "acrobatics" || v === "acr") return "acr";
  if (v === "athletics"  || v === "ath") return "ath";
  if (v === "crafting"   || v === "cra") return "cra";
  if (v === "medicine"   || v === "med") return "med";
  if (v === "stealth"    || v === "ste") return "ste";
  if (v === "survival"   || v === "sur") return "sur";
  if (v === "thievery"   || v === "thi") return "thi";
  return v; // others pass through (occultism, arcana, etc.)
}

// --- DC helpers: PCs often store modifiers, NPCs often store DCs -----------
function _getLevelBasedDC(actor) {
  const lvl = Number(actor?.system?.details?.level?.value ?? actor?.system?.details?.level ?? 0) || 0;
  const tbl = game.pf2e?.DCByLevel
          ?? game.pf2e?.difficulty?.dcByLevel
          ?? CONFIG?.PF2E?.dcByLevel
          ?? CONFIG?.PF2E?.difficulty?.dcByLevel;
  return tbl?.[lvl] ?? (14 + lvl);
}

function _num(n) { const x = Number(n); return Number.isFinite(x) ? x : null; }

function _getDefenseDC(target, defense) {
  const sys = target?.system ?? {};

  if (defense === "perception") {
    // Prefer explicit DC if present (NPCs etc.)
    const dc = _num(sys.attributes?.perception?.dc?.value);
    if (dc != null) return dc;

    // PCs usually have only the modifier; compute DC = 10 + mod
    const mod = _num(sys.attributes?.perception?.totalModifier)
             ?? _num(sys.attributes?.perception?.mod)
             ?? _num(sys.attributes?.perception?.value);
    if (mod != null) return 10 + mod;

    return null;
  }

  // fortitude / reflex / will
  const s = sys.saves?.[defense];
  if (!s) return null;

  // Prefer explicit DC if present (NPCs)
  const dc = _num(s?.dc?.value);
  if (dc != null) return dc;

  // Otherwise compute DC = 10 + save modifier (PCs)
  const mod = _num(s?.totalModifier) ?? _num(s?.mod) ?? _num(s?.value);
  if (mod != null) return 10 + mod;

  return null;
}


export class PF2eAdapter {
  async buildContext({actor, target, options}){
    const rollKind = (options?.rollKind ?? "skill").toLowerCase();
    const rollKey = normalizeSkillKey(options?.rollKey ?? "acr");
    
    let dc;
    if (target) {
      const def = SKILL_TO_DEF[rollKey] ?? "will";
      dc = _getDefenseDC(target, def) ?? 20;
    } else {
      dc = _getLevelBasedDC(actor);
    }

    return {
      actor, target, rollKind, rollKey, 
      stat: this.pickStatistic(actor, rollKind, rollKey),
      dc,
      rollTwice: null,
      coolBonus: 0,
      trigger: null,
      ...options
    };
  }

  pickStatistic(actor, rollKind = "skill", rollKey = "acr"){
    if (rollKind !== "skill") return null; // (future sources can be added here)
    // skill - Try both locations PF2e has used
    const skills = actor?.skills ?? actor?.system?.skills ?? {};
    const chosen = skills?.[rollKey] ?? skills?.acr ?? null;
    // Return a roll-capable object if possible (some PF2e versions use .check.roll)
    return chosen?.check ?? (typeof chosen?.roll === "function" ? chosen : null);
  }

  async roll(ctx){
    return await this.rollAsStrike(ctx);
  }

  async degreeOfSuccess(result, ctx) {
    const dc = (ctx?._dcStrike ?? ctx?.dc) || 20;
    const total = Number(result?.total ?? 0);

    // Try known PF2e entry points first
    const api =
      (game.pf2e?.Check && game.pf2e.Check.degreeOfSuccess) ||
      game.pf2e?.degreeOfSuccess ||
      CONFIG?.PF2E?.degreeOfSuccess ||
      null;

    if (typeof api === "function") {
      try { return api(total, dc, { modifier: 0 }); } catch { /* fall through */ }
    }

    // Fallback: PF2e DoS rules (±10, then nat 20/1 step)
    const d20 = Number(result?.roll?.dice?.find(d => d.faces === 20)?.total ?? 0);
    let degree = (total >= dc + 10) ? 3 :
                (total >= dc)      ? 2 :
                (total <= dc - 10) ? 0 : 1;
    if (d20 === 20) degree = Math.min(3, degree + 1);
    else if (d20 === 1) degree = Math.max(0, degree - 1);
    return degree;
  }

  async applyOutcome({ actor, target, ctx, degree, tacticalRisk }) {
    // Treat only crit + Tactical Risk as special; let PF2e Strike/crit-deck handle the outcome.
    const isCrit = tacticalRisk && (degree === 0 || degree === 3);
    if (isCrit) {
      // Don't apply riders, triggers, or defaults on crit; PF2e handles it from the Strike card.
       return { applied: "draw from deck", crit: degree === 3 ? "critical-success" : "critical-failure" };
    }

    // If no Tactical Risk, CCS applies nothing.
    if (!tacticalRisk) return null;

    // Non-crit outcomes with Tactical Risk
    if (degree >= 2) {
      // Success: trigger if configured, else rider, else default off-guard
      if (ctx.trigger) {
        await this.applyTriggerEffect(target, ctx.trigger, degree);
        return { targetEffect: ctx.trigger.label };
      }
      const sel = await chooseRiderDialog("success");
      if (sel) {
        await this.applyConfiguredEffect(target, sel, true);
        return { targetEffect: sel };
      }
      await this.applyCondition(target, "off-guard");
      return { targetEffect: "off-guard (default)" };
    } else {
      // Failure (non-crit): rider on self or default prone
      const sel = await chooseRiderDialog("failure");
      if (sel) {
        await this.applyConfiguredEffect(actor, sel, false);
        return { selfEffect: sel };
      }
      await this.applyCondition(actor, "prone");
      return { selfEffect: "prone (default)" };
    }
  }

  parseEntry(entry){
    const t = (entry||"").trim();
    if (!t) return null;
    if (t === "drop-item") return {text:"drop-item"};
    const parts = t.split(":").map(s=>s.trim());
    return { slug: parts[0], value: parts[1] ? Number(parts[1]) : null };
  }

  async applyConfiguredEffect(actor, entry, isSuccess){
    const parsed = this.parseEntry(entry);
    if (!parsed) return;
    if (parsed.text === "drop-item") {
      ui.notifications?.info(`${actor.name} drops a held item.`);
      return;
    }
    await this.applyCondition(actor, parsed.slug, parsed.value);
  }

  async applyTriggerEffect(target, trigger, degree){
    const eff = trigger.effect || {};
    const rounds = eff.durationRounds ?? 1;
    const rules = [];

    const applyList = [...(eff.apply || [])];
    if (degree === 3 && Array.isArray(eff.critApply)) applyList.push(...eff.critApply);

    for (const ap of applyList) {
      if (ap.type === "condition") {
        await this.applyCondition(target, ap.value, ap.amount ?? null);
      } else if (ap.type === "off-guard" && ap.value) {
        await this.applyCondition(target, "off-guard");
      } else if (ap.type === "acMod") {
        const modType = ap.modType || "circumstance";
        rules.push({ key: "FlatModifier", selector: "ac", type: modType, value: ap.value ?? -2, label: trigger.label || "CCS Trigger" });
      } else if (ap.type === "saveMods") {
        const v = Number(ap.value) || 0;
        const modType = ap.modType || "circumstance";
        for (const sel of ["fortitude","reflex","will"]) {
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
      await game.ccf.effects.applyEffectItem(target, `CCS: ${trigger.label}`, rounds, rules);
    }
  }

  async applyCondition(actor, slug, value = null) {
    try {
      const s = String(slug || "").toLowerCase(); // use "off-guard", "prone", etc.
      const cm = game.pf2e?.ConditionManager;

      // Preferred modern API handles both valued and non-valued
      if (cm?.addCondition) {
        const opts = value != null ? { value } : undefined;
        await cm.addCondition(s, actor, opts);
        return;
      }

      // Older actor APIs
      if (value == null && typeof actor?.toggleCondition === "function") {
        await actor.toggleCondition(s, { active: true });
        return;
      }
      if (value != null && typeof actor?.increaseCondition === "function") {
        await actor.increaseCondition(s, { value });
        return;
      }

      // Fallback: lightweight effect so play continues
      await game.ccf.effects.applyEffectItem(actor, `CCS: ${s}`, 1, [
        { key: "Note", selector: "all", text: `${s} (CCS fallback)`, title: "CCS" },
      ]);
    } catch (e) {
      console.warn("CCS: Failed to apply condition", slug, e);
      ui.notifications?.warn(`CCS: Could not apply condition ${slug}.`);
    }
  }


  // Map Flavor + Advantage into PF2e roll context
  async applyPreRollAdjustments(ctx, { coolTier, chooseAdvNow }) {
    // Flavor → circumstance bonus
    // Normalize: accept "none"|"light"|"full" or 0|1|2
    const tier = (typeof coolTier === "string") ? (coolTier === "full" ? 2 : coolTier === "light" ? 1 : 0)
    : Number(coolTier ?? 0);
    ctx.coolBonus = tier;

    ctx.coolBonus = 0;
    if (coolTier === 1) ctx.coolBonus = 1;          // Nice or Repeating
    else if (coolTier === 2) ctx.coolBonus = 2;     // So Cool

    // PF2e “advantage” (roll twice keep higher) only during combat
    if (chooseAdvNow) {
      if (game.combat) {
        ctx.rollTwice = "keep-higher";
        ctx.coolBonus = 0;
      } else {
        ui.notifications.warn("Advantage is only available during an active combat.");
      }
    }
    return ctx;
  }


  // (Optional simple mapping) Cinematic pool can bump degree by +1, capped at crit
  async applyCinematicUpgrade(degree, ctx, { poolSpent }) {
    if (!poolSpent) return degree;
    return Math.min(3, degree + 1);
  }

  // PF2e tactical upgrade is handled in applyOutcome; leave degree unchanged here
  async applyTacticalUpgrade(degree, ctx) {
    return degree;
  }

  async rollAsStrike(ctx) {
    const actor  = ctx.actor;
    const target = ctx.target;
    if (!actor || !target) {
      ui.notifications?.warn("PF2e: No actor or target for Stunt Strike.");
      return null;
    }

    const rollKey = String(ctx.rollKey || "").toLowerCase();

    // 1) pick an existing strike (prefer unarmed/fist, then melee)
    const strikes = actor.system?.actions ?? actor.system?.strikes ?? [];
    let strike =
      strikes.find(s => s?.item?.system?.traits?.value?.includes?.("unarmed")) ||
      strikes.find(s => (s?.item?.system?.range?.value ?? null) == null) ||
      strikes[0];

    const attackFn = strike?.attack ?? strike?.variants?.[0]?.roll;
    if (typeof attackFn !== "function") {
      ui.notifications?.warn("PF2e: Could not access a Strike roll function.");
      return null;
    }

    // 2) compute the chosen SKILL modifier (don’t rely on ctx.stat)
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

    // 3) current strike attack modifier
    const currentAttack =
      Number(strike?.totalModifier ?? strike?.attack?.totalModifier ?? strike?.mod) || 0;

    // 4) build stunt modifiers
    const Mod  = game.pf2e?.Modifier ?? game.pf2e?.modifiers?.Modifier;
    const mods = [];

    // A) remap strike total to the skill total
    const deltaSkillVsStrike = skillMod - currentAttack;
    if (Mod && deltaSkillVsStrike) {
      mods.push(new Mod({ label: `Stunt (skill→strike: ${rollKey || "skill"})`, modifier: deltaSkillVsStrike, type: "untyped" }));
    }

    // B) cool bonus (unless swapped for advantage earlier)
    if (Mod && ctx.coolBonus) {
      mods.push(new Mod({ label: "Stunt (cool)", modifier: Number(ctx.coolBonus) || 0, type: "circumstance" }));
    }

    // C) tactical risk: explicit −2 line
    if (Mod && ctx.tacticalRisk) {
      mods.push(new Mod({ label: "Stunt (risk)", modifier: -2, type: "untyped" }));
    }

    // D) defense map shim: make margin vs AC equal margin vs mapped DC
    const targetAC = Number(target?.system?.attributes?.ac?.value ?? target?.attributes?.ac?.value ?? 0) || 0;
    const mappedDC = Number.isFinite(ctx.dc) ? Number(ctx.dc) : null;               // your mapped Fort/Ref/Will/Perception DC
    const dcAdj = (mappedDC != null) ? (targetAC - mappedDC) : 0;                   // e.g. 21 − 23 = −2
    if (Mod && mappedDC != null && dcAdj) {
      mods.push(new Mod({ label: `Stunt (defense map ${mappedDC}→AC ${targetAC})`, modifier: dcAdj, type: "untyped" }));
    }
    // use AC for DoS if we applied the shim
    ctx._dcStrike = targetAC;
    ctx._dcAdj    = dcAdj;

    // 5) roll the strike (native PF2e attack card → crit decks can trigger)
    const rollOpts = { createMessage: true, skipDialog: true };
    if (ctx.rollTwice === "keep-higher") rollOpts.rollTwice = "keep-higher";
    if (mods.length) rollOpts.modifiers = mods;

    const r = await attackFn(rollOpts);

    return {
      total:   r?.total   ?? r?.roll?.total   ?? 0,
      formula: r?.formula ?? r?.roll?.formula ?? "d20",
      roll:    r?.roll    ?? r
    };
  }
}
