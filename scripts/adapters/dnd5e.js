// systems/dnd5e/dnd5e.js
import { compute5eDegree, clampDegree } from "../logic.js";

export class DnD5eAdapter {
  async buildContext({ actor, target, options }) {
    const rollKind = (options?.rollKind ?? "skill").toLowerCase();
    let rollKey = options?.rollKey ?? (rollKind === "perception" ? "prc" : "acr");

    // DC: override > auto (AC) > 12
    const autoDC =
      target?.system?.attributes?.ac?.value ??
      target?.system?.attributes?.ac ??
      12;
    const dc = options?.dcOverride != null ? Number(options.dcOverride) : Number(autoDC) || 12;

    return {
      actor,
      target,
      rollKind,
      rollKey,
      dc,
      rollMode: "normal",
      rollTwice: null,
      coolBonus: 0,
      challengeAdj: Number(options?.challengeAdj) || 0,
    };
  }

  async applyPreRollAdjustments(ctx, { coolTier, chooseAdvNow }) {
    const tier = Number(coolTier ?? 0);
    ctx.coolBonus = tier === 2 ? 2 : tier === 1 ? 1 : 0;
    if (chooseAdvNow) {
      ctx.rollMode = "advantage";
      ctx.rollTwice = "keep-higher";
      ctx.coolBonus = 0;
    } else {
      ctx.rollMode = "normal";
    }
    return ctx;
  }

  async roll(ctx = {}) {
    const actor = ctx?.actor;
    if (!actor) { ui.notifications?.error(game.i18n.localize("CCS.Notify.5eNoActor")); return null; }

    const skill = (ctx.rollKind === "perception" ? "prc" : (ctx.rollKey ?? "acr")).toLowerCase();

    let roll;
    try {
      if (typeof actor.rollSkill === "function") {
        roll = await actor.rollSkill(skill, {
          advantage: ctx.rollMode === "advantage",
          fastForward: true,
          chatMessage: false,
        });
      } else if (actor?.skills?.[skill]?.roll) {
        roll = await actor.skills[skill].roll({
          advantage: ctx.rollMode === "advantage",
          fastForward: true,
          chatMessage: false,
        });
      } else {
        ui.notifications?.error(game.i18n.format("CCS.Notify.5eSkillFail", { skill }));
        return null;
      }
    } catch (e) {
      console.warn("CCS 5e rollSkill failed", e);
      return null;
    }

    const baseTotal = Number(roll?.total ?? 0);
    const total = baseTotal + Number(ctx.coolBonus ?? 0);
    const formula = (roll?.formula ?? "d20") + (ctx.coolBonus ? ` + ${ctx.coolBonus} (Cool)` : "");

    // Set skill mod for display math (parallel to PF2e adapter)
    const skillObj = actor?.system?.skills?.[skill];
    ctx._skillMod = Number(skillObj?.total ?? skillObj?.mod ?? 0);
    ctx._attackMod = 0;

    return { total, formula, roll };
  }

  async degreeOfSuccess(result, ctx) {
    if (!result) return null;
    const d20 = result?.roll?.dice?.find?.(d => d.faces === 20);
    const nat = Number(d20?.results?.[0]?.result ?? NaN);
    const dc = Number(ctx?.dc ?? 12);
    return compute5eDegree(result.total, dc, nat);
  }

  async applyCinematicUpgrade(degree, ctx, { poolSpent } = {}) {
    if (!poolSpent || degree == null) return degree;
    return clampDegree(degree, 1);
  }
  async applyTacticalUpgrade(degree) { return degree; }

  async applyOutcome({ actor, target, ctx, degree, tacticalRisk }) {
    if (!tacticalRisk) return { degree };
    if (degree >= 2) {
      ui.notifications?.info(game.i18n.format("CCS.Notify.OffBalance", { target: target?.name ?? "Target" }));
      return { targetEffect: "Off-balance (CCS)", degree };
    } else {
      ui.notifications?.warn(game.i18n.format("CCS.Notify.FallProne", { actor: actor?.name ?? "Actor" }));
      return { selfEffect: "Prone (CCS)", degree };
    }
  }
}

export default DnD5eAdapter;
