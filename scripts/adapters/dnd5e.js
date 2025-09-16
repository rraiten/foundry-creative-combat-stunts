export class DnD5eAdapter {
  async buildContext({actor, target, options}){
    const ac = target?.system?.attributes?.ac?.value ?? 12;
    // pick best of Athletics or Acrobatics
    const ath = actor?.system?.skills?.ath;
    const acr = actor?.system?.skills?.acr;
    let best = acr;
    if (ath && acr) best = (ath.total > acr.total) ? ath : acr;
    else best = ath || acr;
    return {
      system: "dnd5e",
      actor, target,
      skill: best, // will call d20 roll
      dc: ac,
      rollTwice: null,
      coolBonus: 0,
      tacticalRisk: false,
      ...options
    };
  }

  async applyPreRollAdjustments(ctx, {coolTier, plausible, chooseAdvNow, tacticalRisk}){
    // Cool -> Advantage in 5e if plausible; otherwise small +1
    if (coolTier && plausible) {
      ctx.rollTwice = "keep-higher";
    } else if (coolTier && !plausible) {
      ctx.coolBonus = 1;
    }
    if (tacticalRisk) {
      ctx.tacticalRisk = true;
      ctx.dc = (ctx.dc ?? 0) + 2; // boss is harder to outplay
    }
  }

  async roll(ctx){
    const parts = ["1d20"];
    const data = {};
    let adv = (ctx.rollTwice === "keep-higher");
    // add skill mod if available
    let mod = 0;
    try { mod = ctx.skill?.total ?? 0; } catch(e){}
    parts.push(`+ ${mod}`);
    if (ctx.coolBonus) parts.push(`+ ${ctx.coolBonus}`);
    const formula = parts.join(" ");
    const r = await (new Roll(formula, data)).roll({async:true});
    // Handle advantage manually by rolling twice and keeping higher
    if (adv) {
      const r2 = await (new Roll(formula, data)).roll({async:true});
      const total = Math.max(r.total, r2.total);
      const used = (total === r.total) ? r : r2;
      return { total, formula: adv ? `${formula} (Adv)` : formula, roll: used, adv };
    }
    return { total: r.total, formula, roll: r, adv: false };
  }

  async degreeOfSuccess(result, ctx){
    // 5e mapping: nat1 -> CF, nat20 or total >= dc+10 -> CS, total >= dc -> S, else F
    const d20 = result.roll.dice[0]?.results?.[0]?.result ?? null;
    if (d20 === 1) return 0;
    if (d20 === 20) return 3;
    if (result.total >= (ctx.dc + 10)) return 3;
    if (result.total >= ctx.dc) return 2;
    return 1;
  }

  async applyCinematicUpgrade(degree, ctx, {poolSpent}){
    if (!poolSpent) return degree;
    // miss->hit, hit->crit (cap at crit)
    if (degree <= 1) return 2;
    if (degree === 2) return 3;
    return degree;
  }

  async applyTacticalUpgrade(degree, ctx){
    if (ctx.tacticalRisk && degree >= 2) return Math.min(3, degree + 1);
    return degree;
  }

  async applyOutcome({actor, target, ctx, degree}){
    // Success/Crit apply default rider: target has Disadvantage on its next attack (simulated with a chat note)
    if (degree >= 2) {
      const content = `<p><b>CCS (5e):</b> Target suffers Disadvantage on its next attack (GM apply).</p>`;
      ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content});
      return { targetEffect: "5e: Disadvantage on next attack (note)" };
    } else {
      const content = `<p><b>CCS (5e):</b> Setback: you are knocked Prone or lose your bonus action (GM choose).</p>`;
      ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content});
      return { selfEffect: "5e: Prone or lose bonus action (GM choose)" };
    }
  }

  // Map Flavor into 5e roll context (your roll() checks ctx.rollTwice and ctx.coolBonus)
  async applyPreRollAdjustments(ctx, { coolTier /* chooseAdvNow unused in 5e */ }) {
    // “Nice or Repeating” → Advantage
    // “So Cool” → Advantage +2
    if (coolTier === 1) {
      ctx.rollTwice = "keep-higher";
    } else if (coolTier === 2) {
      ctx.rollTwice = "keep-higher";
      ctx.coolBonus = (ctx.coolBonus ?? 0) + 2;
    }
    return ctx;
}

}
