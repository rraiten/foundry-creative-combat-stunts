import { openCritPrompt, chooseRiderDialog } from "../ui.js";

const SKILL_TO_DEF = {
  acr: "reflex",
  ath: "fortitude",
  cra: "fortitude",
  med: "fortitude",
  ste: "perception",
  sur: "perception",
  thi: "reflex",
};

function _getLevelBasedDC(actor) {
  const lvl = Number(actor?.system?.details?.level?.value ?? actor?.system?.details?.level ?? 0) || 0;
  const tbl = game.pf2e?.DCByLevel
          ?? game.pf2e?.difficulty?.dcByLevel
          ?? CONFIG?.PF2E?.dcByLevel
          ?? CONFIG?.PF2E?.difficulty?.dcByLevel;
  return tbl?.[lvl] ?? (14 + lvl);
}

function _getDefenseDC(target, defense) {
  const sys = target?.system ?? {};
  const saves = sys.saves ?? target?.saves ?? {};
  if (defense === "perception") {
    return sys.attributes?.perception?.dc?.value ?? target?.attributes?.perception?.dc?.value ?? null;
  }
  return saves?.[defense]?.dc?.value ?? null;
}

export class PF2eAdapter {
  async buildContext({actor, target, options}){
    const rollKind = (options?.rollKind ?? "skill").toLowerCase();
    const rollKey = options?.rollKey ?? "acr";
    
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
    if (!result) return null;

    const dc = Number(ctx?.dc ?? 20);
    const total = Number(result?.total ?? 0);

    // base degree by ±10 rule
    let degree;
    if (!Number.isFinite(dc)) return null;
    if (total >= dc + 10) degree = 3;
    else if (total >= dc) degree = 2;
    else if (total <= dc - 10) degree = 0;
    else degree = 1;

    // find the d20 and apply nat 20/1 shift
    const nat = (() => {
      const d20 = result?.roll?.dice?.find?.(d => d?.faces === 20);
      const val = d20?.results?.[0]?.result;
      return Number.isFinite(val) ? val : null;
    })();

    if (nat === 20) degree = Math.min(3, degree + 1);
    if (nat === 1)  degree = Math.max(0, degree - 1);

    return degree;
  }


  async applyOutcome({ actor, target, ctx, degree, tacticalRisk }) {
    // Treat only crit + Tactical Risk as special; let PF2e Strike/crit-deck handle the outcome.
    const isCrit = tacticalRisk && (degree === 0 || degree === 3);
    if (isCrit) {
      // Don't apply riders, triggers, or defaults on crit; PF2e handles it from the Strike card.
      return { crit: degree === 3 ? "critical-success" : "critical-failure" };
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

  /**
   * Roll the stunt as a temporary Strike so PF2e's "Use Critical Decks" hooks can trigger.
   * - Matches the chosen skill bonus
   * - Cleans up the temp weapon after rolling
   * Returns a result object { total, formula, roll } like your normal roll().
   */
  async rollAsStrike(ctx) {
    const actor = ctx.actor;
    const skill = ctx.stat;                   // You already resolved this from the chosen skill
    if (!actor || !skill?.check?.roll && !skill?.roll) {
      ui.notifications?.warn("PF2e: Could not resolve the chosen skill to convert into a Strike.");
      return null;
    }

    // Figure the total attack modifier we want the Strike to have
    // Ask PF2e for the current skill total by doing a silent test roll of the check modifier
    // (cheaper than building proficiency math ourselves)
    let skillMod = 0;
    try {
      // Many skills expose .check.mod or .mod; else get modifier from a silent roll's total - d20
      // Prefer reading the modifier directly if available:
      skillMod = Number(skill?.check?.mod ?? skill?.mod ?? 0);
      if (!skillMod) {
        // Silent roll to compute the modifier (minus the die result)
        const tmp = await (skill.check?.roll?.({ createMessage: false }) ?? skill.roll?.({ createMessage: false }));
        if (tmp) {
          // The first die is a d20; subtract to get the static modifier
          const d20 = tmp.dice?.[0]?.total ?? 10;
          skillMod = (tmp.total ?? d20) - d20;
        }
      }
    } catch {
      /* ignore, fallback to 0 already set */
    }

    // Create a very simple temporary weapon item (melee, no damage importance)
    const weaponData = {
      type: "weapon",
      name: "CCS Stunt Strike (temp)",
      system: {
        category: "simple",
        group: "knife",
        damage: { dice: 0, die: "d4", damageType: "bludgeoning", modifier: 0 }, // irrelevant
        bonus: { value: 0 },            // base item bonus 0; we inject the skill via a RuleElement below
        traits: { value: ["unarmed"] },
        range: { value: null },
        melee: true
      }
    };

    let temp;
    try {
      const created = await actor.createEmbeddedDocuments("Item", [weaponData], { temporary: false });
      temp = created?.[0];
      if (!temp) throw new Error("Temp weapon not created");

      // Add a temporary rule to make its attack roll = chosen skill modifier (+ any Stunt bonuses)
      // We use an ephemeral Effect via your existing helper to avoid mutating the item schema.
      const Mod = game.pf2e?.Modifier ?? game.pf2e?.modifiers?.Modifier;

      const mods = [];
      if (Mod) {
        // skill-based modifier
        mods.push(new Mod({ label: "Stunt (skill)", modifier: Number(skillMod) || 0, type: "untyped" }));
        // circumstance from Flavor (already in ctx.coolBonus if not swapped for advantage)
        if (ctx.coolBonus) mods.push(new Mod({ label: "Stunt (cool)", modifier: Number(ctx.coolBonus) || 0, type: "circumstance" }));
      }

      // Build roll options for an attack roll
      const rollOpts = { createMessage: true, // let PF2e post the Strike card
                        skipDialog: true };

      if (ctx.rollTwice === "keep-higher") rollOpts.rollTwice = "keep-higher";
      if (mods.length) rollOpts.modifiers = mods;

      // Find the strike action for this item
      // Depending on PF2e version, access can differ; try a few common shapes:
      let attackFn = temp?.system?.actions?.[0]?.attack
                  ?? temp?.system?.strikes?.[0]?.attack
                  ?? temp?.system?.actions?.[0]?.variants?.[0]?.roll;

      if (typeof attackFn !== "function") {
        // Fallback: use Statistic attack context if exposed
        const strikes = actor.system?.actions ?? actor.system?.strikes ?? [];
        const strike = strikes.find(s => s?.item?.id === temp.id);
        attackFn = strike?.attack ?? strike?.variants?.[0]?.roll ?? null;
      }

      if (typeof attackFn !== "function") {
        ui.notifications?.warn("PF2e: Could not access a Strike roll function for the temp weapon.");
        return null;
      }

      // Roll the attack as a normal Strike (this produces the PF2e strike chat card)
      const r = await attackFn.call(temp, rollOpts);

      // Normalize a result object for your pipeline
      const result = { total: r?.total ?? r?.roll?.total ?? 0,
                      formula: r?.formula ?? r?.roll?.formula ?? "d20",
                      roll: r?.roll ?? r };

      return result;
    } catch (e) {
      console.warn("CCS: Stunt Strike failed", e);
      ui.notifications?.warn("CCS: Could not roll a Stunt Strike.");
      return null;
    } finally {
      // Clean up the temp weapon
      if (temp?.id) {
        try { await actor.deleteEmbeddedDocuments("Item", [temp.id]); } catch { /* ignore */ }
      }
    }
  }

}
