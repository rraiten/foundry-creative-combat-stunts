import { MODULE_ID, FLAGS } from "./constants.js";
import { parseCoolTier, extractD20FromResult, buildChatCardData } from "./logic.js";
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
    let { coolTier, tacticalRisk, plausible, chooseAdvNow, spendPoolNow, triggerId } = options;
    const combat = game.combat;

    const tierNum = parseCoolTier(coolTier);

    if (!plausible && tierNum === 0) {
      ui.notifications?.warn(game.i18n.localize("CCS.Notify.NotPlausible"));
    }

    // Once-per-combat Advantage gate
    let advUsed = false;
    if (chooseAdvNow) {
      const ok = await canUseOncePerCombat(combat, actor.id, FLAGS.ADV_USAGE);
      if (!ok) {
        ui.notifications?.warn(game.i18n.localize("CCS.Notify.AdvantageUsed"));
        chooseAdvNow = false;
      } else {
        await markUsedOncePerCombat(combat, actor.id, FLAGS.ADV_USAGE);
        advUsed = true;
      }
    }

    // Predeclare Cinematic Pool spend
    let poolSpent = false;
    if (spendPoolNow) {
      const spend = await spendCinematicToken(combat, actor.id);
      if (!spend.ok) {
        ui.notifications?.warn(spend.reason || game.i18n.localize("CCS.Notify.PoolSpendFail"));
        spendPoolNow = false;
      } else {
        poolSpent = true;
      }
    }

    const ctx = await this.adapter.buildContext({actor, target, options});
    ctx.rollKind = (options?.rollKind || ctx.rollKind || "skill").toLowerCase();
    ctx.chooseAdvNow = chooseAdvNow;
    ctx.tacticalRisk = !!tacticalRisk;

    // Resolve triggerId into trigger object
    if (triggerId && target) {
      const triggers = target.getFlag(MODULE_ID, FLAGS.TRIGGERS) || [];
      ctx.trigger = triggers.find(t => t.id === triggerId) || null;
    }

    await this.adapter.applyPreRollAdjustments(ctx, {coolTier, plausible, chooseAdvNow, tacticalRisk});

    const result = await this.adapter.roll(ctx);
    if (!result) return;
    let degree = await this.adapter.degreeOfSuccess(result, ctx);

    degree = await this.adapter.applyCinematicUpgrade(degree, ctx, {poolSpent});
    degree = await this.adapter.applyTacticalUpgrade(degree, ctx);

    const applied = await this.adapter.applyOutcome({actor, target, ctx, degree, tacticalRisk});

    await this.postChat({actor, target, ctx, result, applied, degree, poolSpent, advUsed: chooseAdvNow});
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
