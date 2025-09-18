export class CCF {
  constructor(){ this.adapter = null; this.effects = new CCFEffs(); }
  setAdapter(adapter){ this.adapter = adapter; }

  isPF2 = () => (game?.system?.id ?? game.systemId ?? "") === "pf2e";

  async _canUseOncePerCombat(actorId, key){
    const combat = game.combat; if (!combat) return false;
    const usage = combat.getFlag("creative-combat-stunts", key) || {};
    return !usage[actorId];
  }
  async _markUsedOncePerCombat(actorId, key){
    const combat = game.combat; if (!combat) return;
    const usage = combat.getFlag("creative-combat-stunts", key) || {};
    usage[actorId] = true;
    await combat.setFlag("creative-combat-stunts", key, usage);
  }

  async rollStunt({actor, target, options}){
    let { coolTier, tacticalRisk, plausible, chooseAdvNow, spendPoolNow, triggerId } = options;

    const tierNum = typeof coolTier === "string" ? (coolTier === "full" ? 2 : coolTier === "light" ? 1 : 0)
      : Number(coolTier ?? 0);

    if (!plausible && tierNum === 0) {
      ui.notifications?.warn("Stunt isn’t plausible or flavorful; resolving as a normal roll.");
    }

    // Once-per-combat Advantage gate (PF2e only; harmless on 5e where UI hides)
    let advUsed = false;
    if (chooseAdvNow) {
      const ok = await this._canUseOncePerCombat(actor.id, "advUsage");
      if (!ok) {
        ui.notifications?.warn("You have already used Advantage this combat.");
        chooseAdvNow = false;
      } else {
        // lock it in for this encounter immediately (prevents double-dipping)
        await this._markUsedOncePerCombat(actor.id, "advUsage");
        advUsed = true;
      }
    }

    // Predeclare Cinematic Pool spend
    let poolSpent = false;
    if (spendPoolNow) {
      const spend = await this.spendCinematicTokenOnce(actor.id);
      if (!spend.ok) {
        ui.notifications?.warn(spend.reason || "Unable to spend Cinematic Pool token.");
        spendPoolNow = false;
      } else {
        poolSpent = true;
      }
    }

    const ctx = await this.adapter.buildContext({actor, target, options});
    ctx.chooseAdvNow = chooseAdvNow;
    ctx.tacticalRisk = !!tacticalRisk;  // available both in ctx and as argument

    // Resolve triggerId (if provided) into actual trigger object from target
    if (triggerId && target) {
      const triggers = target.getFlag("creative-combat-stunts", "weaknessTriggers") || [];
      ctx.trigger = triggers.find(t => t.id === triggerId) || null;
    }

    // Let adapter map Cool/Tactical to native mechanics
    await this.adapter.applyPreRollAdjustments(ctx, {coolTier, plausible, chooseAdvNow, tacticalRisk});

    // Roll (system-specific)
    const result = await this.adapter.roll(ctx);
    if (!result) return; // adapter already notified; stop cleanly
    let degree = await this.adapter.degreeOfSuccess(result, ctx);

    // Cinematic Pool upgrade (system-specific mapping handled by adapter if needed)
    degree = await this.adapter.applyCinematicUpgrade(degree, ctx, {poolSpent});

    // Tactical Risk success upgrade, if adapter uses degrees
    degree = await this.adapter.applyTacticalUpgrade(degree, ctx);

    // Apply outcomes (riders/effects)
    const applied = await this.adapter.applyOutcome({actor, target, ctx, degree, tacticalRisk});

    // Chat
    await this.postChat({actor, target, ctx, result, applied, degree, poolSpent, advUsed: chooseAdvNow});
  }

  async postChat({actor, target, ctx, result, applied, degree, poolSpent, advUsed}){
    const degrees = ["Critical Failure","Failure","Success","Critical Success"];
    const degreeTxt = (degree != null && degrees[degree]) ? degrees[degree] : (result?.outcome || "—");
    const extra = [];
    if (advUsed && ctx.rollTwice === "keep-higher") extra.push("🎲 Advantage consumed");
    if (poolSpent) extra.push("🎬 Cinematic Pool spent (+1 degree/upgrade)");

    // Display math for chat card: skill-based (skill + cool − risk), independent of strike formula
    const _d20Die = result?.roll?.dice?.find?.(d => d?.faces === 20) ?? null;
    const d20 = Number(
      _d20Die?.results?.[0]?.result ??
      _d20Die?.results?.[0]?.value  ??
      _d20Die?.total ??
      result?.roll?.terms?.find?.(t => t?.faces === 20)?.results?.[0]?.result ??
      result?._ccsD20 ??            // <-- fallback if adapter provided it
      result?.roll?.d20 ??
      0
    );
    const skillMod = Number(ctx?._skillMod ?? 0);
    const attackMod = Number(ctx?._attackMod ?? 0);
    const cool = Number(ctx?.coolBonus ?? 0);
    const risk = ctx?.tacticalRisk ? -2 : 0;
    const challenge = Number(ctx?.challengeAdj ?? 0);
    const base = (String(ctx?.rollKind).toLowerCase() === "attack") ? attackMod : skillMod;
    const displayMod = base + cool + risk + challenge;
    const sign = displayMod >= 0 ? "+" : "-";
    const displayFormula = `1d20 ${sign} ${Math.abs(displayMod)}`;
    const displayTotal = d20 + displayMod;

    const challengeText = challenge ? (challenge > 0 ? `+${challenge}` : `${challenge}`) : "";
    const actionName = ctx?.rollLabel ?? (ctx?.rollKey?.toUpperCase?.() ?? "Skill");

    const content = await foundry.applications.handlebars.renderTemplate("modules/creative-combat-stunts/templates/chat-card.hbs",{
      displayFormula, displayTotal, d20,  challengeText, actionName,
      actorName: actor?.name, isPF2: this.isPF2(),targetName: target?.name,
      total: displayTotal, formula: displayFormula, dc: (ctx._dcStrike ?? ctx.dc),
      dcStrike: ctx?._dcStrike ?? null,
      dcDelta: (ctx?._dcStrike != null && ctx?.dc != null) ? (ctx._dcStrike - ctx.dc) : null,
      modDelta: (ctx?._dcStrike != null && ctx?.dc != null) ? (ctx._dcStrike - ctx.dc) : null,
      rollTooltip: (await result?.roll?.getTooltip?.()) ?? null,
      degree: degreeTxt,
      coolBonus: ctx.coolBonus ?? 0,
      coolNote: (ctx.coolBonus ? `(+${ctx.coolBonus} Flavor)` : (ctx.rollTwice === "keep-higher" ? "(Advantage used)" : "")),
      rollTwice: ctx.rollTwice === "keep-higher",
      tacticalRisk: !!ctx.tacticalRisk, applied,
      spentPool: poolSpent ? true : false,
      triggerLabel: ctx.trigger?.label || null,
      logExtras: extra.join(" • "),
    });
    ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content});
  }

  async spendCinematicTokenOnce(actorId){
    const combat = game.combat; if (!combat) return {ok:false, reason:"No combat"};
    const pool = combat.getFlag("creative-combat-stunts","cinematicPool");
    if (!pool?.enabled) return {ok:false, reason:"Pool disabled"};
    if ((pool.remaining ?? 0) <= 0) return {ok:false, reason:"No tokens left"};
    const usage = combat.getFlag("creative-combat-stunts","poolUsage") || {};
    if (usage[actorId]) return {ok:false, reason:"Already used this encounter"};
    await combat.setFlag("creative-combat-stunts","cinematicPool", { ...pool, remaining: pool.remaining - 1 });
    usage[actorId] = true;
    await combat.setFlag("creative-combat-stunts","poolUsage", usage);
    return {ok:true};
  }
}

class CCFEffs {
  async applyEffectItem(target, name, rounds, rules=[]){
    const effect = {
      type: "effect",
      name,
      system: {
        description: { value: "Creative Combat Stunts temporary effect" },
        duration: { unit: "rounds", value: rounds },
        start: { value: game.time.worldTime },
        tokenIcon: { show: true },
        rules
      }
    };
    try {
      const created = await target.createEmbeddedDocuments("Item", [effect]);
      return created[0];
    } catch (e) {
      console.warn("CCS: Failed creating effect item", e);
      ui.notifications?.warn("CCS: Could not create temporary effect item.");
      return null;
    }
  }
  async tick(combat, changes){}
}