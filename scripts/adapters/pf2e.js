import { openCritPrompt, chooseRiderDialog } from "../ui.js";

export class PF2eAdapter {
  async buildContext({actor, target, options}){
    const reflexDC = target?.saves?.reflex?.dc?.value ?? target?.system?.saves?.reflex?.dc?.value ?? null;
    const rollKind = (options?.rollKind ?? "skill").toLowerCase();
    const rollKey  = options?.rollKey ?? "acr";
    const dc       = options?.dcOverride != null ? Number(options.dcOverride) : (reflexDC ?? 20);
    return {
      actor, target, rollKind, rollKey, 
      stat: this.pickStatistic(actor),
      dc,
      rollTwice: null,
      coolBonus: 0,
      trigger: null,
      ...options
    };
  }

  pickStatistic(actor, rollKind = "skill", rollKey = "acr"){
    if (rollKind === "perception") {
      return actor?.perception ?? null;
    }
    // skill
    const skills = actor?.skills ?? actor?.system?.skills ?? {};
    const chosen = skills?.[rollKey] ?? skills?.acr ?? null;
    // Return a roll-capable object if possible (some PF2e versions use .check.roll)
    return chosen?.check ?? (typeof chosen?.roll === "function" ? chosen : null);
  }

  async roll(ctx){
    const stat = ctx?.stat ?? this.pickStatistic(ctx?.actor, ctx?.rollKind, ctx?.rollKey);
    let rollOpts = { createMessage:false };
    if (ctx.rollTwice === "keep-higher") rollOpts.rollTwice = "keep-higher";
    if (ctx.coolBonus) {
      rollOpts.extraModifiers = rollOpts.extraModifiers || [];
      rollOpts.extraModifiers.push(new game.pf2e.Modifier({label:"Cool", modifier: ctx.coolBonus, type:"circumstance"}));
    }
    if (!stat || typeof stat.roll !== "function") {
      // Fallback to unified Check roller
      const Check = game?.pf2e?.Check;
      if (Check?.roll) {
        const statistic =
          (ctx?.rollKind === "perception" ? (ctx?.actor?.perception ?? null)
           : ctx?.actor?.skills?.[ctx?.rollKey ?? "acr"] ?? ctx?.actor?.skills?.acr ?? null);
        if (!statistic) {
          ui.notifications?.error("PF2e: Could not resolve a rollable statistic.");
          return null;
        }
        const r2 = await Check.roll({
          actor: ctx.actor,
          type: "skill-check",
          statistic,
          dc: ctx?.dc != null ? { value: Number(ctx.dc) } : undefined,
          traits: ["ccs-stunt"],
          options: ["ccs"],
          skipDialog: true,
        });
        return { total: r2?.total ?? 0, formula: r2?.formula ?? "d20", roll: r2 };
      }
      ui.notifications?.error("PF2e: No roll method available.");
      return null;
    }
    const r = await stat.roll(rollOpts);
    return { total: r?.total ?? 0, formula: r?.formula ?? "d20", roll: r };
  }

  async degreeOfSuccess(result, ctx){
    const dos = game.pf2e.Check.degreeOfSuccess(result.total, ctx.dc, {modifier:0});
    return dos; // 0 CF,1 F,2 S,3 CS
  }

  async applyOutcome({actor, target, ctx, degree, tacticalRisk}){
    const isCrit = (degree === 0 || degree === 3) && tacticalRisk;
    if (isCrit) {
      const choice = await openCritPrompt({isFailure: degree===0});
      if (choice === "deck") {
        await this.drawCritCard("attack", degree===0);
      } else {
        const sel = await chooseRiderDialog(degree===0 ? "failure" : "success");
        if (sel) await this.applyConfiguredEffect(degree===0 ? actor : target, sel, degree!==0);
      }
    }

    if (!tacticalRisk) return null;

    if (degree >= 2) {
      if (ctx.trigger) {
        await this.applyTriggerEffect(target, ctx.trigger, degree);
        return { targetEffect: ctx.trigger.label };
      } else {
        const sel = await chooseRiderDialog("success");
        if (sel) {
          await this.applyConfiguredEffect(target, sel, true);
          return { targetEffect: sel };
        } else {
          await this.applyCondition(target, "flat-footed", 1);
          return { targetEffect: "flat-footed:1 (default)" };
        }
      }
    } else {
      const sel = await chooseRiderDialog("failure");
      if (sel) {
        await this.applyConfiguredEffect(actor, sel, false);
        return { selfEffect: sel };
      } else {
        await this.applyCondition(actor, "prone");
        return { selfEffect: "prone (default)" };
      }
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
      } else if (ap.type === "offGuard" && ap.value) {
        await this.applyCondition(target, "flat-footed", 1);
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

  async applyCondition(actor, slug, value=null){
    try {
      const cm = game.pf2e?.ConditionManager;
      if (!cm) throw new Error("PF2e ConditionManager not available");
      if (value != null) {
        await cm.addCondition(slug, actor, { value });
      } else {
        await cm.addCondition(slug, actor);
      }
    } catch (e) {
      console.warn("CCS: Failed to apply condition", slug, e);
      ui.notifications?.warn(`CCS: Could not apply condition ${slug}.`);
    }
  }

  async drawCritCard(type="attack", isFailure=false){
    try {
      const deckAPI = game.pf2e?.criticalDecks ?? game.pf2e?.criticalDeck;
      if (deckAPI?.draw) return await deckAPI.draw({type, isFailure});
      ui.notifications?.info("Draw a crit card (GM): no deck API detected.");
    } catch(e){
      console.warn("CCS: Crit deck draw failed", e);
    }
  }

  // Map Flavor + Advantage into PF2e roll context
  async applyPreRollAdjustments(ctx, { coolTier, chooseAdvNow }) {
    // Flavor → circumstance bonus
    ctx.coolBonus = 0;
    if (coolTier === 1) ctx.coolBonus = 1;          // Nice or Repeating
    else if (coolTier === 2) ctx.coolBonus = 2;     // So Cool

    // PF2e “advantage” (roll twice keep higher) only during combat
    if (chooseAdvNow) {
      if (game.combat) {
        ctx.rollTwice = "keep-higher";
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

}
