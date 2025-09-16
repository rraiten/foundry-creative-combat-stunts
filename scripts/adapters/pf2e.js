import { openCritPrompt, chooseRiderDialog } from "../ui.js";

export class PF2eAdapter {
  async buildContext({actor, target, options}){
    const reflexDC = target?.saves?.reflex?.dc?.value ?? target?.system?.saves?.reflex?.dc?.value;
    return {
      actor, target,
      stat: this.pickStatistic(actor),
      dc: reflexDC ?? 20,
      rollTwice: null,
      coolBonus: 0,
      trigger: null,
      ...options
    };
  }

  pickStatistic(actor){
    const acr = actor?.skills?.acr || actor?.system?.skills?.acr;
    return acr ?? actor?.skills?.ath ?? actor?.system?.skills?.ath ?? null;
  }

  async roll(ctx){
    const stat = ctx.stat;
    let rollOpts = { createMessage:false };
    if (ctx.rollTwice === "keep-higher") rollOpts.rollTwice = "keep-higher";
    if (ctx.coolBonus) {
      rollOpts.extraModifiers = rollOpts.extraModifiers || [];
      rollOpts.extraModifiers.push(new game.pf2e.Modifier({label:"Cool", modifier: ctx.coolBonus, type:"circumstance"}));
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
}