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
    const stat = ctx?.stat ?? this.pickStatistic(ctx?.actor, ctx?.rollKind, ctx?.rollKey);
    const Mod = game.pf2e?.Modifier ?? game.pf2e?.modifiers?.Modifier;
    const rollOpts = { createMessage: false };
    if (ctx.rollTwice === "keep-higher") rollOpts.rollTwice = "keep-higher";
    if (ctx.coolBonus && Mod) {
      rollOpts.modifiers = [
        new Mod({ label: "Cool", modifier: Number(ctx.coolBonus) || 0, type: "circumstance" })
      ];
    }
    const r = await stat.roll(rollOpts);
    return { total: r?.total ?? 0, formula: r?.formula ?? "d20", roll: r };
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


  async applyOutcome({actor, target, ctx, degree, tacticalRisk}){
    const isCrit = (degree === 0 || degree === 3) && tacticalRisk;
    if (isCrit) {
      const choice = await openCritPrompt({isFailure: degree===0});
      if (choice === "deck") {
        await this.drawCritCard({ type: "attack", isFailure: degree === 0 });
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
          await this.applyCondition(target, "off-guard");
          return { targetEffect: "off-guard (default)" };
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

  async drawCritCard({ type = "attack", isFailure = false } = {}) {
    const outcome = isFailure ? "criticalFailure" : "criticalSuccess";

    /* 1) PF2e APIs (several versions) */
    try {
      const decks = game.pf2e?.criticalDecks ?? game.pf2e?.criticalDeck ?? null;

      if (decks?.draw) {
        try { await decks.draw({ type, isFailure }); console.debug("CCS crit: pf2e.decks.draw(obj)"); return true; } catch {}
        try { await decks.draw(outcome);              console.debug("CCS crit: pf2e.decks.draw(outcome)"); return true; } catch {}
      }
      if (typeof decks?.drawCard === "function") {
        try { await decks.drawCard({ type, isFailure }); console.debug("CCS crit: pf2e.decks.drawCard(obj)"); return true; } catch {}
      }
      if (typeof game.pf2e?.drawCriticalCard === "function") {
        try { await game.pf2e.drawCriticalCard({ type, outcome }); console.debug("CCS crit: pf2e.drawCriticalCard(obj)"); return true; } catch {}
        try { await game.pf2e.drawCriticalCard(type, outcome);     console.debug("CCS crit: pf2e.drawCriticalCard(args)"); return true; } catch {}
      }
    } catch {/* noop */}

    /* 2) Foundry Cards fallback */
    try {
      const all = Array.from(game.cards?.contents ?? []);
      // Prefer localized names; then English; then any deck containing "Critical"
      const nameHit    = game.i18n?.localize?.("PF2E.CritDeck.Hit")    || "Critical Hit Deck";
      const nameFumble = game.i18n?.localize?.("PF2E.CritDeck.Fumble") || "Critical Fumble Deck";
      const wantExact  = isFailure ? nameFumble : nameHit;

      let deck =
        game.cards?.getName?.(wantExact) ||
        game.cards?.getName?.(isFailure ? "Critical Fumble Deck" : "Critical Hit Deck") ||
        all.find(d => /critical/i.test(d?.name || "") && (isFailure ? /fumble/i : /hit/i).test(d.name)) ||
        all.find(d => /critical/i.test(d?.name || ""));

      if (deck) {
        // Try programmatic draw first (GM usually allowed):
        if (typeof deck.draw === "function") {
          try {
            await deck.draw(1, { rollMode: game.settings.get("core", "rollMode") });
            console.debug("CCS crit: Cards.draw(1) from", deck.name);
            return true;
          } catch (e) {
            console.debug("CCS crit: Cards.draw failed, falling back to drawDialog()", e);
          }
        }
        // If draw() isn’t permitted or throws, let the user click via dialog:
        if (typeof deck.drawDialog === "function") {
          await deck.drawDialog();
          console.debug("CCS crit: Cards.drawDialog() from", deck.name);
          return true;
        }
      }
      console.warn("CCS: Cards fallback found no usable deck.", { cardDecks: all.map(d => d.name) });
    } catch (e) {
      console.warn("CCS: Cards fallback threw", e);
    }

    /* 3) Nothing matched */
    console.warn("CCS: No crit-deck API or Cards deck matched.", {
      pf2eHasCriticalDecks: !!game.pf2e?.criticalDecks,
      pf2eHasCriticalDeck:  !!game.pf2e?.criticalDeck,
      cardsCount: game.cards?.size ?? (game.cards?.contents?.length || 0)
    });
    ui.notifications?.warn("Draw a crit card (GM): no compatible deck API or deck found.");
    return false;
  }
}
