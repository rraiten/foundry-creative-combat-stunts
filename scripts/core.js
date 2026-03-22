import { MODULE_ID, FLAGS } from "./constants.js";
import { parseCoolTier, extractD20FromResult, buildChatCardData, validatePoolSpend } from "./logic.js";
import { canUseOncePerCombat, markUsedOncePerCombat, spendCinematicToken } from "./pool.js";

export async function applyEffectItem(target, name, rounds, rules = []) {
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
    ui.notifications?.warn(game.i18n.localize("CCS.Notify.EffectItemFail"));
    return null;
  }
}

export class CCF {
  constructor(){ this.adapter = null; }
  setAdapter(adapter){ this.adapter = adapter; }

  isPF2 = () => (game?.system?.id ?? game.systemId ?? "") === "pf2e";

  async rollStunt({actor, target, options}){
    if (!this.adapter) {
      ui.notifications?.error(game.i18n.localize("CCS.Notify.UnsupportedSystem"));
      return;
    }
    let { coolTier, tacticalRisk, plausible, chooseAdvNow, spendPoolNow, triggerId } = options;
    const combat = game.combat;

    const tierNum = parseCoolTier(coolTier);

    if (!plausible && tierNum === 0) {
      ui.notifications?.warn(game.i18n.localize("CCS.Notify.NotPlausible"));
    }

    // --- Pre-roll validation (read-only checks, no flag writes yet) ---

    // Once-per-combat Advantage gate: CHECK availability but don't mark used yet
    let advEligible = false;
    if (chooseAdvNow) {
      const ok = await canUseOncePerCombat(combat, actor.id, FLAGS.ADV_USAGE);
      if (!ok) {
        ui.notifications?.warn(game.i18n.localize("CCS.Notify.AdvantageUsed"));
        chooseAdvNow = false;
      } else {
        advEligible = true;
      }
    }

    // Pool spend: VALIDATE but don't spend yet
    let poolEligible = false;
    if (spendPoolNow) {
      // Quick validation without writing flags
      try {
        const pool = combat?.getFlag(MODULE_ID, FLAGS.POOL);
        const usage = combat?.getFlag(MODULE_ID, FLAGS.POOL_USAGE) || {};
        const check = validatePoolSpend(pool, usage, actor.id);
        if (!check.ok) {
          ui.notifications?.warn(check.reason || game.i18n.localize("CCS.Notify.PoolSpendFail"));
          spendPoolNow = false;
        } else {
          poolEligible = true;
        }
      } catch (_) {
        spendPoolNow = false;
      }
    }

    // --- Build context and roll ---
    try {
      const ctx = await this.adapter.buildContext({actor, target, options});
      ctx.rollKind = (options?.rollKind || ctx.rollKind || "skill").toLowerCase();
      ctx.chooseAdvNow = chooseAdvNow;
      ctx.tacticalRisk = !!tacticalRisk;

      // Resolve triggerId into trigger object
      if (triggerId && target) {
        try {
          const triggers = target.getFlag(MODULE_ID, FLAGS.TRIGGERS) || [];
          ctx.trigger = triggers.find(t => t.id === triggerId) || null;
        } catch (_) { ctx.trigger = null; }
      }

      await this.adapter.applyPreRollAdjustments(ctx, {coolTier, plausible, chooseAdvNow, tacticalRisk});

      const result = await this.adapter.roll(ctx);
      if (!result) return; // adapter already notified; stop cleanly

      // --- Roll succeeded — NOW commit the flag writes ---

      let advUsed = false;
      if (advEligible) {
        const ok = await markUsedOncePerCombat(combat, actor.id, FLAGS.ADV_USAGE);
        if (!ok) {
          ui.notifications?.warn(game.i18n.localize("CCS.Notify.AdvantagePermission"));
        } else {
          advUsed = true;
        }
      }

      let poolSpent = false;
      if (poolEligible) {
        const spend = await spendCinematicToken(combat, actor.id);
        if (!spend.ok) {
          ui.notifications?.warn(spend.reason || game.i18n.localize("CCS.Notify.PoolSpendFail"));
        } else {
          poolSpent = true;
        }
      }

      let degree = await this.adapter.degreeOfSuccess(result, ctx);
      degree = await this.adapter.applyCinematicUpgrade(degree, ctx, {poolSpent});
      degree = await this.adapter.applyTacticalUpgrade(degree, ctx);

      const applied = await this.adapter.applyOutcome({actor, target, ctx, degree, tacticalRisk});
      // Use the degree returned by applyOutcome if weakness/trigger bumped it
      const finalDegree = applied?.degree ?? degree;

      await this.postChat({actor, target, ctx, result, applied, degree: finalDegree, poolSpent, advUsed});
    } catch (e) {
      console.error("CCS: rollStunt failed", e);
      ui.notifications?.error(game.i18n.localize("CCS.Notify.RollFailed"));
    }
  }

  async postChat({actor, target, ctx, result, applied, degree, poolSpent, advUsed}){
    const d20 = extractD20FromResult(result);
    const data = buildChatCardData({ degree, ctx, applied, poolSpent, advUsed, isPF2: this.isPF2(), d20 });

    const content = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/chat-card.hbs`,
      { ...data, actorName: actor?.name, targetName: target?.name,
        total: data.displayTotal, formula: data.displayFormula,
        rollTooltip: (await result?.roll?.getTooltip?.()) ?? null }
    );
    ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content});
  }
}
