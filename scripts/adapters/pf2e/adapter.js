// PF2e system adapter

import { SKILL_TO_DEF, SHORT_TO_LABEL } from "../../constants.js";
import { parseCoolTier, computeDegree, clampDegree } from "../../logic.js";
import { chooseRiderDialog } from "../../ui/dialogs.js";
import { actorHasWeaknesses, applyActorWeaknessesPF2e } from "../../weakness/index.js";
import { getLevelBasedDC, getDefenseDC } from "./dc.js";
import { extractKeptD20, rollAsStrike } from "./rolling.js";
import { applyCondition, applyConfiguredEffect, applyTriggerEffect } from "./conditions.js";

export function normalizeSkillKey(k) {
  const v = String(k || "").toLowerCase();
  if (v === "acrobatics" || v === "acr") return "acr";
  if (v === "athletics"  || v === "ath") return "ath";
  if (v === "crafting"   || v === "cra") return "cra";
  if (v === "medicine"   || v === "med") return "med";
  if (v === "stealth"    || v === "ste") return "ste";
  if (v === "survival"   || v === "sur") return "sur";
  if (v === "thievery"   || v === "thi") return "thi";
  return v;
}

export class PF2eAdapter {
  async buildContext({ actor, target, options }) {
    const rollKind = (options?.rollKind ?? "skill").toLowerCase();
    const rollKey = normalizeSkillKey(options?.rollKey ?? "acr");

    let dc;
    if (target) {
      const def = SKILL_TO_DEF[rollKey] ?? "will";
      dc = getDefenseDC(target, def) ?? 20;
    } else {
      dc = getLevelBasedDC(actor);
    }

    return {
      actor, target, rollKind, rollKey,
      rollLabel: (() => {
        try {
          const skills = actor?.system?.skills ?? actor?.skills ?? {};
          const key = normalizeSkillKey(rollKey);
          const k2  = String(rollKey ?? "").toLowerCase();
          const sk  = skills?.[key] ?? skills?.[k2];
          return sk?.label ?? sk?.name ?? SHORT_TO_LABEL[key] ?? (SHORT_TO_LABEL[k2] ?? "Skill");
        } catch {
          return "Skill";
        }
      })(),
      stat: this.pickStatistic(actor, rollKind, rollKey),
      dc,
      rollTwice: null,
      coolBonus: 0,
      trigger: null,
      ...options
    };
  }

  pickStatistic(actor, rollKind = "skill", rollKey = "acr") {
    if (rollKind !== "skill") return null;
    const skills = actor?.skills ?? actor?.system?.skills ?? {};
    const chosen = skills?.[rollKey] ?? skills?.acr ?? null;
    return chosen?.check ?? (typeof chosen?.roll === "function" ? chosen : null);
  }

  async roll(ctx) {
    return await rollAsStrike(ctx);
  }

  async degreeOfSuccess(result, ctx) {
    const dc = (ctx?._dcStrike ?? ctx?.dc) || 20;
    const total = Number(result?.total ?? 0);

    const api =
      (game.pf2e?.Check && game.pf2e.Check.degreeOfSuccess) ||
      game.pf2e?.degreeOfSuccess ||
      CONFIG?.PF2E?.degreeOfSuccess ||
      null;

    if (typeof api === "function") {
      try { return api(total, dc, { modifier: 0 }); } catch { /* fall through */ }
    }

    const d20 = Number(extractKeptD20(result) ?? 0);
    return computeDegree(total, dc, d20);
  }

  async applyOutcome({ actor, target, ctx, degree, tacticalRisk }) {
    const isCrit = tacticalRisk && (degree === 0 || degree === 3);
    if (isCrit) {
      return { applied: "draw from deck", crit: degree === 3 ? "critical-success" : "critical-failure" };
    }

    if (!tacticalRisk) return null;

    let weakTexts = [];

    if (degree >= 2) {
      if (ctx.trigger) {
        await applyTriggerEffect(target, ctx.trigger, degree);
        if (actorHasWeaknesses(target)) {
          const wr = await applyActorWeaknessesPF2e(this, ctx, target, degree);
          degree = wr.degree;
          weakTexts = wr.texts;
        }
        return { targetEffect: [ctx.trigger.label, ...weakTexts].filter(Boolean) };
      }

      const rider = await chooseRiderDialog("success");
      if (rider) {
        await applyConfiguredEffect(target, rider, true);
        if (actorHasWeaknesses(target)) {
          const wr = await applyActorWeaknessesPF2e(this, ctx, target, degree);
          degree = wr.degree;
          weakTexts = wr.texts;
        }
        return { targetEffect: [rider, ...weakTexts].filter(Boolean) };
      }

      await applyCondition(target, "off-guard");
      if (actorHasWeaknesses(target)) {
        const wr = await applyActorWeaknessesPF2e(this, ctx, target, degree);
        degree = wr.degree;
        weakTexts = wr.texts;
      }
      return { targetEffect: ["off-guard (default)", ...weakTexts].filter(Boolean) };
    } else {
      const rider = await chooseRiderDialog("failure");
      if (rider) {
        await applyConfiguredEffect(actor, rider, false);
        return { selfEffect: rider };
      }
      await applyCondition(actor, "prone");
      return { selfEffect: "prone (default)" };
    }
  }

  // Exposed as instance method for use by weakness logic (adapter.applyCondition)
  async applyCondition(actor, slug, value = null) {
    return applyCondition(actor, slug, value);
  }

  async applyPreRollAdjustments(ctx, { coolTier, chooseAdvNow }) {
    ctx.coolBonus = parseCoolTier(coolTier);

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

  async applyCinematicUpgrade(degree, ctx, { poolSpent }) {
    if (!poolSpent) return degree;
    return clampDegree(degree, 1);
  }

  async applyTacticalUpgrade(degree, ctx) {
    return degree;
  }
}
