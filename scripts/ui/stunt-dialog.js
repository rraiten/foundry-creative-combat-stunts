import { MODULE_ID, FLAGS } from "../constants.js";
import { getSpellAttackModPF2 as _getSpellAttackModPF2 } from "../adapters/pf2e/dc.js";
import { openSimpleDialogV2 } from "./dialogs.js";
import { buildStuntConfig } from "../logic.js";

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

function buildStrikeChoices(actor) {
  const strikesRaw = actor.system?.actions ?? actor.system?.strikes ?? [];
  const strikes = (Array.isArray(strikesRaw) ? strikesRaw : []).map(s => ({
    value: (s?.slug ?? s?.item?.slug ?? s?.item?.id ?? s?.label ?? s?.item?.name ?? "").toString().toLowerCase(),
    label: (s?.label ?? s?.item?.name ?? "Strike")
  }));

  if (isPF2()) {
    const spellAtk = _getSpellAttackModPF2(actor);
    if (Number.isFinite(spellAtk)) {
      strikes.unshift({ value: "__spell_attack__", label: game.i18n.localize("CCS.UI.SpellAttack") });
    }
  }

  return strikes;
}

function wireDialogVisibility(dlg) {
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

  // Wire advantage row visibility
  (async () => {
    try {
      const cool = await waitFor('[name="cool"]');
      const advRow = await waitFor('#ccs-adv-row');
      const update = () => { advRow.style.display = (cool.value === "full" || cool.value === "2") ? "" : "none"; };
      cool.addEventListener("change", update);
      update();
    } catch (_) { /* non-PF2 or row missing */ }
  })();

  // Wire skill/attack row toggle
  try {
    const root = dlg.element?.[0] ?? dlg.element;
    const select = root?.querySelector('[name="rollKind"]');
    const skill = root?.querySelector('.ccs-row-skill');
    const atk = root?.querySelector('.ccs-row-attack');
    const update = () => {
      const k = (select?.value || "skill").toLowerCase();
      if (skill) skill.style.display = (k === "skill") ? "" : "none";
      if (atk) atk.style.display = (k === "attack") ? "" : "none";
    };
    select?.addEventListener("change", update);
    update();
  } catch (_) {}
}

export async function openStuntDialog({ token, actor } = {}) {
  token ??= canvas?.tokens?.controlled?.[0] ?? null;
  actor ??= token?.actor ?? (game.user?.character ? game.actors.get(game.user.character) : null);
  if (!actor) return ui.notifications?.warn(game.i18n.localize("CCS.Notify.NoActor"));

  const sys = game?.system?.id ?? game.systemId ?? "";
  const target = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  const skills = getSkillChoices(actor, sys);
  const strikes = buildStrikeChoices(actor);

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
      actor, isPF2: sys === "pf2e",
      targetName: target?.name ?? "(none)",
      pf2eAdvOnce,
      poolEnabled: !!pool?.enabled,
      poolRemaining: pool?.remaining ?? 0,
      triggers,
      flavorOptions: getFlavorOptions(),
      skills, strikes,
      rollSources: [
        { value: "skill", label: game.i18n.localize("CCS.UI.Skill") },
        { value: "attack", label: game.i18n.localize("CCS.UI.AttackStrike") },
      ],
      hideRollSource: false,
      effectiveRollKind: null,
    }
  );

  const D2 = foundry?.applications?.api?.DialogV2;
  if (!D2) return;

  let dlg;
  dlg = openSimpleDialogV2({
    title: game.i18n.localize("CCS.UI.CreativeStunt"),
    content,
    buttons: [
      {
        action: "roll", label: game.i18n.localize("CCS.UI.Roll"), default: true,
        callback: () => {
          const root = dlg.element;
          const q = (sel) => root.querySelector(sel);
          const options = buildStuntConfig({
            coolStr: q('[name="cool"]')?.value || "none",
            rollKindStr: q('[name="rollKind"]')?.value || "skill",
            strikeKey: q('[name="strikeKey"]')?.value || "",
            rollKey: q('[name="rollKey"]')?.value || "acr",
            risk: q('[name="risk"]')?.checked,
            plausible: q('[name="plausible"]')?.checked,
            challengeAdj: q('[name="challengeAdj"]')?.value,
            advNow: q('[name="advNow"]')?.checked,
            spendPool: q('[name="spendPool"]')?.checked,
            triggerId: q('[name="trigger"]')?.value || null,
            defaultStrike: strikes?.[0]?.value || "",
          });
          game.ccf.rollStunt({ actor, target, options });
          return "roll";
        }
      },
      { action: "cancel", label: game.i18n.localize("CCS.UI.Cancel") },
    ],
    submit: (_result) => {},
  });

  wireDialogVisibility(dlg);
}
