// systems/dnd5e/dnd5e.js
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
      coolBonus: 0,
      ...options,
    };
  }

  async applyPreRollAdjustments(ctx, { coolTier, chooseAdvNow }) {
    const tier = Number(coolTier ?? 0);
    ctx.coolBonus = tier === 2 ? 2 : tier === 1 ? 1 : 0;
    ctx.rollMode = chooseAdvNow ? "advantage" : "normal";
    return ctx;
  }

  async roll(ctx = {}) {
    const actor = ctx?.actor;
    if (!actor) { ui.notifications?.error("5e: No actor on context."); return null; }

    // Map perception request to the proper 5e skill key
    const skill = (ctx.rollKind === "perception" ? "prc" : (ctx.rollKey ?? "acr")).toLowerCase();

    // Preferred: actor.rollSkill
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
        ui.notifications?.error(`5e: Cannot roll skill '${skill}'.`);
        return null;
      }
    } catch (e) {
      console.warn("CCS 5e rollSkill failed", e);
      return null;
    }

    const baseTotal = Number(roll?.total ?? 0);
    const total = baseTotal + Number(ctx.coolBonus ?? 0);
    const formula = (roll?.formula ?? "d20") + (ctx.coolBonus ? ` + ${ctx.coolBonus} (Cool)` : "");
    return { total, formula, roll };
  }

  async degreeOfSuccess(result, ctx) {
    if (!result) return null;
    // Simple mapping for MVP
    const d20 = result?.roll?.dice?.find?.(d => d.faces === 20);
    const nat = Number(d20?.results?.[0]?.result ?? NaN);
    const dc = Number(ctx?.dc ?? 12);
    if (nat === 1) return 0;
    if (nat === 20) return 3;
    return result.total >= dc ? 2 : 1;
  }

  async applyCinematicUpgrade(degree) { return degree == null ? degree : Math.min(3, degree); }
  async applyTacticalUpgrade(degree) { return degree; }

  async applyOutcome({ actor, target, ctx, degree, tacticalRisk }) {
    if (!tacticalRisk) return null;
    if (degree >= 2) {
      ui.notifications?.info(`${target?.name ?? "Target"} is thrown off-balance (CCS).`);
      return { targetEffect: "Off-balance (CCS)" };
    } else {
      ui.notifications?.warn(`${actor?.name ?? "Actor"} stumbles and falls prone (CCS).`);
      return { selfEffect: "Prone (CCS)" };
    }
  }
}

export default DnD5eAdapter;
