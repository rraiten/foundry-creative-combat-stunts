import { MODULE_ID, FLAGS } from "../constants.js";
import { getSpellAttackModPF2 as _getSpellAttackModPF2 } from "../adapters/pf2e/dc.js";
import { openSimpleDialogV2 } from "./dialogs.js";

const isPF2 = () => (game?.system?.id ?? game.systemId ?? "") === "pf2e";

export const getFlavorOptions = () =>
  (isPF2()
    ? [
        { value: 0, label: "Plain" },
        { value: 1, label: "Nice or Repeating (+1 circumstance)" },
        { value: 2, label: "So Cool (+2 circumstance)" },
      ]
    : [
        { value: 0, label: "Plain" },
        { value: 1, label: "Nice or Repeating (Advantage)" },
        { value: 2, label: "So Cool (Advantage +2)" },
      ]);

export function getSkillChoices(actor, sysId) {
  let dict = null;
  if (sysId === "pf2e") {
    dict = actor?.skills ?? actor?.system?.skills ?? {};
  } else if (sysId === "dnd5e") {
    dict = actor?.system?.skills ?? {};
  } else {
    dict = actor?.skills ?? actor?.system?.skills ?? {};
  }
  return Object.entries(dict).map(([key, val]) => ({
    value: key,
    label: (val?.label ?? val?.name ?? key).toString().replace(/\b\w/g, m => m.toUpperCase()),
  })).sort((a, b) => a.label.localeCompare(b.label));
}

export async function openStuntDialog({ token, actor } = {}) {
  token ??= canvas?.tokens?.controlled?.[0] ?? null;
  actor ??= token?.actor ?? (game.user?.character ? game.actors.get(game.user.character) : null);
  if (!actor) return ui.notifications?.warn("Select a token or set a player character, then try again.");

  const sys = game?.system?.id ?? game.systemId ?? "";
  const target = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;

  let skills = getSkillChoices(actor, sys);

  // PF2e strikes list for "Attack" source
  const strikesRaw = actor.system?.actions ?? actor.system?.strikes ?? [];
  const strikes = (Array.isArray(strikesRaw) ? strikesRaw : []).map(s => ({
    value: (s?.slug ?? s?.item?.slug ?? s?.item?.id ?? s?.label ?? s?.item?.name ?? "").toString().toLowerCase(),
    label: (s?.label ?? s?.item?.name ?? "Strike")
  }));

  // PF2e only: add a synthetic "Spell Attack" option if the actor has one
  if ((game?.system?.id ?? game.systemId ?? "") === "pf2e") {
    const spellAtk = _getSpellAttackModPF2(actor);
    if (Number.isFinite(spellAtk)) {
      strikes.unshift({
        value: "__spell_attack__",
        label: `Spell Attack`,
      });
    }
  }

  const rollSources = [
    { value: "skill", label: "Skill" },
    { value: "attack", label: "Attack (Strike)" },
  ];

  const hideRollSource = (Array.isArray(rollSources) && rollSources.length <= 1);
  const effectiveRollKind = hideRollSource ? (rollSources[0]?.value ?? "skill") : null;

  const pf2eAdvOnce = sys === "pf2e"
    ? game.settings.get(MODULE_ID, "pf2eAdvantageOnce")
    : false;

  const pool = game.combat?.getFlag(MODULE_ID, FLAGS.POOL) ?? null;
  const triggers = sys === "pf2e"
    ? (target?.getFlag(MODULE_ID, FLAGS.TRIGGERS) ?? [])
    : [];

  const content = await foundry.applications.handlebars.renderTemplate(
    `modules/${MODULE_ID}/templates/stunt-dialog.hbs`,
    {
      actor,
      isPF2: sys === "pf2e",
      targetName: target?.name ?? "(none)",
      pf2eAdvOnce,
      poolEnabled: !!pool?.enabled,
      poolRemaining: pool?.remaining ?? 0,
      triggers,
      flavorOptions: getFlavorOptions(),
      skills,
      strikes,
      rollSources,
      hideRollSource,
      effectiveRollKind,
    }
  );

  const D2 = foundry?.applications?.api?.DialogV2;

  if (D2) {
    let dlg;
    dlg = openSimpleDialogV2({
      title: "Creative Stunt",
      content,
      buttons: [
        {
          action: "roll",
          label: "Roll",
          default: true,
          callback: () => {
            const root = dlg.element;
            const q = (sel) => root.querySelector(sel);
            const coolStr  = (q('[name="cool"]')?.value || "none");
            const coolTier = coolStr === "full" ? 2 : coolStr === "light" ? 1 : 0;
            const rollKind = (q('[name="rollKind"]')?.value || "skill").toLowerCase();
            const rollKey  = (rollKind === "attack"
               ? (q('[name="strikeKey"]')?.value || strikes?.[0]?.value || "")
               : (q('[name="rollKey"]')?.value   || "acr")
            ).toLowerCase();
            const tacticalRisk = q('[name="risk"]')?.checked ?? false;
            const plausible    = q('[name="plausible"]')?.checked ?? false;
            const challengeAdj = Number(q('[name="challengeAdj"]')?.value ?? 0);
            let chooseAdvNow   = q('[name="advNow"]')?.checked ?? false;
            if (coolTier < 2) chooseAdvNow = false;
            const spendPoolNow = q('[name="spendPool"]')?.checked ?? false;
            const triggerId    = q('[name="trigger"]')?.value || null;
            game.ccf.rollStunt({
              actor, target,
              options: { rollKind, rollKey, coolTier, tacticalRisk, plausible, chooseAdvNow, spendPoolNow, triggerId, challengeAdj }
            });
            return "roll";
          }
        },
        { action: "cancel", label: "Cancel" },
      ],
      submit: (_result) => {},
    });

    // Robustly wire the PF2 "Use advantage..." row
    const waitFor = (sel, tries = 20) => new Promise((res, rej) => {
      let n = 0;
      const tick = () => {
        const el = dlg?.element?.querySelector?.(sel);
        if (el) return res(el);
        if (++n > tries) return rej(new Error(`Element not found: ${sel}`));
        setTimeout(tick, 25);
      };
      tick();
    });
    try {
      const cool   = await waitFor('[name="cool"]');
      const advRow = await waitFor('#ccs-adv-row');
      const update = () => { advRow.style.display = (cool.value === "full" || cool.value === "2") ? "" : "none"; };
      cool.addEventListener("change", update);
      update();
    } catch (_) { /* non-PF2 or row missing: ignore */ }

    // make sure only 1 strike or skill selection is shown not both
    try {
      const root   = dlg.element?.[0] ?? dlg.element;
      const select = root?.querySelector('[name="rollKind"]');
      const skill  = root?.querySelector('.ccs-row-skill');
      const atk    = root?.querySelector('.ccs-row-attack');
      const update = () => {
        const k = (select?.value || "skill").toLowerCase();
        if (skill) skill.style.display = (k === "skill")  ? "" : "none";
        if (atk)   atk.style.display   = (k === "attack") ? "" : "none";
      };
      select?.addEventListener("change", update);
      update();
    } catch (_) {}

    return;
  }
}
