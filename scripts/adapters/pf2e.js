import { openCritPrompt, chooseRiderDialog } from "../ui.js";

export class PF2eAdapter {
  async buildContext({actor, target, options}){
    const rollKind = (options?.rollKind ?? "skill").toLowerCase();
    const rollKey = options?.rollKey ?? "acr";
    const dc = this._computeDC({ actor, target, rollKind, rollKey, override: options?.dcOverride });
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

  _computeDC({ actor, target, rollKind, rollKey, override }) {
    if (override != null && override !== "") return Number(override);
    if (rollKind !== "skill") {
      // Non-skill -> default to Reflex DC if target exists, else level DC
      return target ? this._bestSaveDC(target, "reflex") : this._levelDC(actor);
    }
    // Map skill -> save/perception
    const fortSkills = new Set(["ath", "med", "cra"]);
    const refSkills  = new Set(["acr", "thi"]);
    const perSkills  = new Set(["sur", "ste"]);

    if (target) {
      if (fortSkills.has(rollKey)) return this._bestSaveDC(target, "fortitude");
      if (refSkills.has(rollKey))  return this._bestSaveDC(target, "reflex");
      if (perSkills.has(rollKey))  return this._perceptionDC(target);
      return this._bestSaveDC(target, "will");
    } else {
      return this._levelDC(actor);
    }
  }

  _bestSaveDC(target, which) {
    const path = target?.system?.saves?.[which]?.dc?.value ?? target?.saves?.[which]?.dc?.value;
    const val = Number(path ?? NaN);
    return Number.isFinite(val) ? val : 20;
  }

  _perceptionDC(target) {
    // Try PF2e DC if present; else 10 + perception modifier
    const dcPath = target?.system?.perception?.dc?.value;
    if (Number.isFinite(Number(dcPath))) return Number(dcPath);
    const mod = Number(target?.system?.perception?.mod ?? target?.perception?.mod ?? 0);
    return 10 + mod;
  }

  _levelDC(actor) {
    // Moderate DC by level (PF2e baseline): 14 + level
    const lvl = Number(actor?.system?.details?.level?.value ?? 0);
    return 14 + (Number.isFinite(lvl) ? lvl : 0);
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
    const decks = game.pf2e?.criticalDecks ?? game.pf2e?.criticalDeck ?? null;

    // 1) Known top-level signatures
    try { if (decks?.draw)         { await decks.draw({ type, isFailure }); return true; } } catch {}
    try { if (decks?.draw)         { await decks.draw(outcome);             return true; } } catch {}
    try { if (decks?.drawCard)     { await decks.drawCard({ type, isFailure }); return true; } } catch {}
    try { if (game.pf2e?.drawCriticalCard) { await game.pf2e.drawCriticalCard({ type, outcome }); return true; } } catch {}
    try { if (game.pf2e?.drawCriticalCard) { await game.pf2e.drawCriticalCard(type, outcome); return true; } } catch {}

    // 2) Nested drawers (some worlds expose e.g. criticalDecks.attack.draw)
    try {
      if (decks && typeof decks === "object") {
        for (const k of Object.keys(decks)) {
          const sub = decks[k];
          if (sub && typeof sub.draw === "function") {
            try {
              // Try object form first, then outcome string
              await sub.draw({ type, isFailure }); return true;
            } catch {}
            try {
              await sub.draw(outcome); return true;
            } catch {}
          }
        }
      }
    } catch {}

    // Foundry Cards fallback (vanilla worlds)
    try {
      const nameHit    = game.i18n?.localize?.("PF2E.CritDeck.Hit")    || "Critical Hit Deck";
      const nameFumble = game.i18n?.localize?.("PF2E.CritDeck.Fumble") || "Critical Fumble Deck";
      const deckName   = isFailure ? nameFumble : nameHit;

      // Exact name first, then a plain EN fallback
      let deck = game.cards?.getName?.(deckName)
              || game.cards?.getName?.(isFailure ? "Critical Fumble Deck" : "Critical Hit Deck");
      if (!deck && Array.isArray(game.cards?.contents)) {
        deck = game.cards.contents.find(c => c.name?.toLowerCase?.() === deckName.toLowerCase());
      }
      if (deck && typeof deck.draw === "function") {
        await deck.draw(1, { rollMode: game.settings.get("core","rollMode") });
        return true;
      }
    } catch {}

    console.warn("CCS: No matching crit deck API. Available on game.pf2e:", {
      hasCriticalDecks: !!game.pf2e?.criticalDecks,
      hasCriticalDeck: !!game.pf2e?.criticalDeck,
      keysCriticalDecks: game.pf2e?.criticalDecks ? Object.keys(game.pf2e.criticalDecks) : null,
      keysCriticalDeck: game.pf2e?.criticalDeck ? Object.keys(game.pf2e.criticalDeck) : null,
      hasDrawCriticalCard: typeof game.pf2e?.drawCriticalCard === "function",
    });
    ui.notifications?.warn("Draw a crit card (GM): no compatible deck API detected.");
    return false;
  }
}
