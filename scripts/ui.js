// scripts/ui.js

/* ---------- helpers ---------- */
const isPF2 = () => (game?.system?.id ?? game.systemId ?? "") === "pf2e";

const getFlavorOptions = () =>
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

// --- PF2e: try to read a "spell attack" modifier robustly (best-effort, many fallbacks)
function getSpellAttackModPF2(actor) {
  if (!actor) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  try {
    // 1) Preferred: PF2e statistic getter (if present)
    const stat =
      typeof actor.getStatistic === "function"
        ? (actor.getStatistic("spell-attack") || actor.getStatistic("spellAttack"))
        : null;
    const fromStat =
      num(stat?.check?.mod) ?? num(stat?.modifier) ?? num(stat?.mod);
    if (fromStat != null) return fromStat;
  } catch (_) {}

  try {
    // 2) Common places people find it in system data (broad fallbacks)
    const sys = actor.system || {};
    const candidates = [
      sys?.attributes?.spellAttack?.mod,
      sys?.attributes?.spellcasting?.attack?.mod,
      sys?.proficiencies?.spellcasting?.attack?.mod,
      sys?.spells?.attack?.mod,
      sys?.statistics?.spellattack?.mod,
      sys?.statistics?.["spell-attack"]?.mod,
    ];
    for (const c of candidates) {
      const v = num(c);
      if (v != null) return v;
    }
  } catch (_) {}

  try {
    // 3) Spellcasting entries (if API exists)
    const entries = actor?.spellcasting?.contents ?? actor?.spellcasting ?? [];
    const arr = Array.isArray(entries) ? entries : Object.values(entries ?? {});
    for (const e of arr) {
      const v =
        num(e?.statistic?.check?.mod) ??
        num(e?.statistic?.modifier) ??
        num(e?.attack?.mod);
      if (v != null) return v;
    }
  } catch (_) {}

  return null;
}

/* ---------- UI registration ---------- */
export function registerUI() {
// Combat tracker footer button
  Hooks.on("renderCombatTracker", (_app, element) => {
    const $el = element instanceof jQuery ? element : $(element);
    $el.find(".ccs-pool-button").remove();
    const $btn = $(
      `<button type="button" class="ccs-pool-button">
         <i class="fas fa-bolt"></i> Cinematic Pool
       </button>`
    ).on("click", () => openPoolConfig());
    const mount = $el.find(".directory-footer, .sidebar-tab .footer").first();
+  (mount.length ? mount : $el).append($btn); 
  });

  // === CCS: scrub internal stunt shims from PF2e pre-roll dialog for PLAYERS (GMs keep full details) ===
  function ccsScrubStuntModifiers(root) {
    try {
      if (!root?.querySelector) return;

      // Look through common modifier lists PF2e uses in its pre-roll dialogs
      const candidates = root.querySelectorAll(
        '.dice-modifiers li, .modifiers-list li, li[role="listitem"], li'
      );

      candidates.forEach((li) => {
        const t = (li.textContent || "").toLowerCase();
        // Remove only the internal mapping lines (players shouldn't learn target stats)
        if (t.includes("stunt (skill") || t.includes("stunt (defense map")) {
          li.remove();
        }
      });
    } catch (_e) { /* no-op */ }
  }

  // Scrub on generic Foundry Dialog render
  Hooks.on("renderDialog", (_app, html) => {
    if (game.user?.isGM) return;          // GM keeps full visibility
    const root = html?.[0] ?? html;
    ccsScrubStuntModifiers(root);
  });

  // Scrub on PF2e-specific Application renders (kept narrow to check/attack style dialogs)
  Hooks.on("renderApplication", (app, html) => {
    if (game.user?.isGM) return;
    const name = app?.constructor?.name ?? "";
    if (!/Statistic|Check|Attack|Dialog/i.test(name)) return;
    const root = html?.[0] ?? html;
    ccsScrubStuntModifiers(root);
  });
  // === end scrub ===

  // Token HUD button (v12/13 safe)
  Hooks.on("renderTokenHUD", (app, htmlArg) => {
    const html = htmlArg instanceof jQuery ? htmlArg : $(htmlArg); // normalize
    if (!html?.length) return;
    const token = app?.object;
    if (!token?.document) return;
    html.find(".control-icon.ccs").remove(); // idempotent
    const btn = $(`<div class="control-icon ccs" title="Creative Combat Stunts"><i class="fas fa-bolt"></i></div>`)
      .on("click", () => openStuntDialog({ token }));
    const col = html.find(".col.right, .col").last();
    (col.length ? col : html).append(btn);
  });

  // Expose API after ready
  Hooks.once("ready", () => {
    const mod = game.modules.get("foundry-creative-combat-stunts");
    if (mod) mod.api = { openStuntDialog, openPoolConfig, openWeaknessEditor };
  });

  // === CCS: setting to optionally skip PF2e pre-roll dialog for PLAYERS (default: don't skip) ===
  Hooks.once("init", () => {
    try {
      game.settings.register("creative-combat-stunts", "skipPlayerDialog", {
        name: "Stunt: Skip PF2e pre-roll dialog for players",
        hint: "When enabled, players will NOT see the PF2e pre-roll dialog for stunt rolls. GMs always see it.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
      });
    } catch (e) { /* safe if already registered */ }
  });
  // === end setting ===

}

/* ---------- dialogs ---------- */
export async function openStuntDialog({ token, actor } = {}) {
  token ??= canvas?.tokens?.controlled?.[0] ?? null;
  actor ??= token?.actor ?? (game.user?.character ? game.actors.get(game.user.character) : null);
  if (!actor) return ui.notifications?.warn("Select a token or set a player character, then try again.");

  const sys = game?.system?.id ?? game.systemId ?? "";
  const target = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  
  // build skill stunt choices
  let skills = getSkillChoices(actor, sys);

   // PF2e strikes list for "Attack" source
  // PF2e strikes list for "Attack" source
  const strikesRaw = actor.system?.actions ?? actor.system?.strikes ?? [];
  const strikes = (Array.isArray(strikesRaw) ? strikesRaw : []).map(s => ({
    value: (s?.slug ?? s?.item?.slug ?? s?.item?.id ?? s?.label ?? s?.item?.name ?? "").toString().toLowerCase(),
    label: (s?.label ?? s?.item?.name ?? "Strike")
  }));

  // PF2e only: add a synthetic "Spell Attack" option if the actor has one
  if ((game?.system?.id ?? game.systemId ?? "") === "pf2e") {
    const spellAtk = getSpellAttackModPF2(actor);
    if (Number.isFinite(spellAtk)) {
      // Show the mod so players understand what they’re choosing
      strikes.unshift({
        value: "__spell_attack__",
        label: `Spell Attack (+${spellAtk >= 0 ? spellAtk : String(spellAtk)})`,
      });
    }
  }

  const rollSources = [
    { value: "skill", label: "Skill" },
    { value: "attack", label: "Attack (Strike)" },
  ];

  const hideRollSource = (Array.isArray(rollSources) && rollSources.length <= 1);
  const effectiveRollKind = hideRollSource ? (rollSources[0]?.value ?? "skill") : null; // keep simple for now

  const pf2eAdvOnce = sys === "pf2e"
    ? game.settings.get("creative-combat-stunts", "pf2eAdvantageOnce")
    : false;

  const pool = game.combat?.getFlag("creative-combat-stunts", "cinematicPool") ?? null;
  const triggers = sys === "pf2e"
    ? (target?.getFlag("creative-combat-stunts", "weaknessTriggers") ?? [])
    : [];

  const content = await foundry.applications.handlebars.renderTemplate(
    "modules/creative-combat-stunts/templates/stunt-dialog.hbs",
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
    let dlg; // so callbacks can see the element
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
        if (++n > tries) return rej();
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

export async function openPoolConfig() {
  const combat = game.combat;
  if (!combat) return ui.notifications?.warn("No active combat.");

  const pool = combat.getFlag("creative-combat-stunts", "cinematicPool") ?? {
    enabled: false, size: 4, remaining: 4,
  };

  const content = `
    <div class="form-group"><label>Enabled</label>
      <input type="checkbox" name="enabled" ${pool.enabled ? "checked" : ""}/>
    </div>
    <div class="form-group"><label>Pool Size</label>
      <input type="number" name="size" value="${pool.size ?? 4}" min="1" max="8"/>
    </div>
    <p>Each player may spend once per encounter. Spend = upgrade (PF2e +1 degree; 5e miss→hit, hit→crit).</p>
  `;

  new Dialog({
    title: "Cinematic Pool",
    content,
    buttons: {
      save: {
        label: "Save",
        callback: async (html) => {
          const enabled = html.find('[name="enabled"]').is(":checked");
          const size = Number(html.find('[name="size"]').val()) || 4;
          const remaining = Math.min(pool.remaining ?? size, size);
          await combat.setFlag("creative-combat-stunts", "cinematicPool", { enabled, size, remaining });
          ui.notifications?.info(enabled ? `Cinematic Pool enabled (${remaining}/${size}).` : "Cinematic Pool disabled.");
        },
      },
      reset: {
        label: "Reset Remaining",
        callback: async () => {
          const size = pool.size ?? 4;
          await combat.setFlag("creative-combat-stunts", "cinematicPool", { ...pool, remaining: size });
          ui.notifications?.info("Cinematic Pool remaining reset.");
        },
      },
      cancel: { label: "Close" },
    },
  }).render(true);
}

export async function openWeaknessEditor(actor) {
  const triggers = actor.getFlag("creative-combat-stunts", "weaknessTriggers") ?? [];

  const rows = triggers.map((t, i) => `
    <tr>
      <td><input name="id-${i}" value="${t.id || ""}"/></td>
      <td><input name="label-${i}" value="${t.label || ""}"/></td>
      <td><input name="setup-${i}" value="${t.setup || ""}"/></td>
      <td><textarea name="effect-${i}" rows="2">${(t.effect && JSON.stringify(t.effect)) || "{}"}</textarea></td>
    </tr>`).join("");

  const content = `
    <p>Define boss "Creative Hooks" that apply when stunts succeed.</p>
    <div style="margin-bottom:6px;">
      <button type="button" id="ccs-import-samples">Import Sample Triggers</button>
    </div>
    <table class="ccs-table">
      <thead><tr><th>ID</th><th>Label</th><th>Setup</th><th>Effect JSON</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button type="button" id="ccs-add-row">Add Row</button>
  `;

  const dlg = new Dialog({
    title: `Creative Hooks: ${actor.name}`,
    content,
    buttons: {
      save: {
        label: "Save",
        callback: async (html) => {
          const list = [];
          html.find("tbody tr").each((idx, tr) => {
            const $tr = $(tr);
            const id = $tr.find(`input[name="id-${idx}"]`).val();
            const label = $tr.find(`input[name="label-${idx}"]`).val();
            const setup = $tr.find(`input[name="setup-${idx}"]`).val();
            let effect = {};
            try { effect = JSON.parse($tr.find(`textarea[name="effect-${idx}"]`).val() || "{}"); } catch {}
            if (id) list.push({ id, label, setup, effect });
          });
          await actor.setFlag("creative-combat-stunts", "weaknessTriggers", list);
          ui.notifications?.info("Creative Hooks saved.");
        },
      },
      close: { label: "Close" },
    },
    render: (html) => {
      html.find("#ccs-add-row").on("click", () => {
        const idx = html.find("tbody tr").length;
        html.find("tbody").append(`
          <tr>
            <td><input name="id-${idx}" value=""/></td>
            <td><input name="label-${idx}" value=""/></td>
            <td><input name="setup-${idx}" value=""/></td>
            <td><textarea name="effect-${idx}" rows="2">{}</textarea></td>
          </tr>`);
      });

      html.find("#ccs-import-samples").on("click", async () => {
        try {
          const res = await fetch("modules/creative-combat-stunts/data/ccs_boss_triggers.json");
          const samples = await res.json();
          const current = actor.getFlag("creative-combat-stunts", "weaknessTriggers") ?? [];
          const merged = [...current];
          for (const s of samples) if (!merged.find(m => m.id === s.id)) merged.push(s);
          await actor.setFlag("creative-combat-stunts", "weaknessTriggers", merged);
          ui.notifications?.info(`Imported ${samples.length} sample triggers.`);
          dlg.close();
          openWeaknessEditor(actor);
        } catch (e) {
          console.error(e);
          ui.notifications?.error("Failed to import sample triggers.");
        }
      });
    },
  });

  dlg.render(true);
}

function getSkillChoices(actor, sysId) {
  // PF2e exposes actor.skills (v4+/v5+), 5e exposes actor.system.skills
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

export async function chooseRiderDialog(kind = "success") {
  // Use V2 if available
  if (foundry?.applications?.api?.DialogV2) {
    return new Promise(resolve => {
      const content = `
        <p>Select a rider or cancel to use the default.</p>
        <input type="text" name="rider" placeholder="e.g., prone, frightened:1, drop-item" style="width:100%"/>
      `;
      // Create first so callbacks can reference it
      let dlg = null;
      const buttons = [
        {
          action: "ok",
          label: "Apply",
          default: true,
          callback: () => {
            const val = dlg?.element?.querySelector?.('[name="rider"]')?.value?.trim() || null;
            resolve(val);
          }
        },
        { action: "cancel", label: "Cancel", callback: () => resolve(null) }
      ];
      dlg = openSimpleDialogV2({
        title: `Choose Rider (${kind})`,
        content,
        buttons,
        defaultId: "ok",
      });
    });
  }
}

export async function openCritPrompt({ isFailure = false } = {}) {
  if (foundry?.applications?.api?.DialogV2) {
    return new Promise(resolve => {
      openSimpleDialogV2({
        title: isFailure ? "Critical Failure" : "Critical Success",
        content: `<p>Pick how to resolve the critical.</p>`,
        buttons: [
          { action: "rider", label: "Pick Effect",                   callback: () => resolve("rider") },
          { action: "cancel",label: "Cancel",                        callback: () => resolve(null)    },
        ],
        defaultId: "deck",
      });
    });
  }
}

function openSimpleDialogV2({ title, content, buttons = [] }) {
  const D2 = foundry?.applications?.api?.DialogV2;
  if (!D2) return null;

  // Expect: [{ action, label, default?, callback? }, ...]
  const btns = (buttons || [])
    .filter(b => b && b.action && b.label)
    .map(b => ({
      action: b.action,
      label:  b.label,
      default: !!b.default,
      callback: typeof b.callback === "function" ? b.callback : undefined
    }));

  if (btns.length === 0) {
    btns.push({ action: "ok", label: "OK", default: true });
  }

  const dlg = new D2({
      window: { title, resizable: false },
      position: { width: 420 },
      content,
      buttons: btns,
    });
    dlg.render(true);
    try { setTimeout(() => { const el = dlg?.element?.querySelector?.('[data-action="roll"],[data-button="roll"],button.primary,button.default'); el?.focus?.(); }, 10); } catch(_) {}
    return dlg;
  }

/* ---------- per-view masking for DCs / mapping ---------- */
Hooks.on("renderChatMessage", (_message, html) => {
  try {
    const root = html?.[0] ?? html;
    if (!root?.querySelector) return;
    if (!root.querySelector('.ccs-card')) return;
    const isGM = !!game.user?.isGM;

    const dcs = root.querySelectorAll('.ccs-dc');
    dcs.forEach(el => {
      const dc = el.getAttribute('data-dc') ?? '';
      el.textContent = isGM ? dc : '??';
    });

    const gmOnly = root.querySelectorAll('.ccs-gm-only');
    gmOnly.forEach(el => { el.style.display = isGM ? '' : 'none'; });
  } catch (e) { /* no-op */ }
});


// Hide internal stunt shim modifiers from players (keep visible to GMs)
Hooks.on("renderChatMessage", (_message, html) => {
  try {
    const root = html?.[0] ?? html;
    if (!root?.querySelector) return;
    // Only act on our cards or PF2e attack cards
    const isGM = !!game.user?.isGM;
    if (isGM) return;

    // Remove "Stunt (skill→strike...)" and "Stunt (defense map ...)" lines from the tooltip
    const lists = root.querySelectorAll('.dice-tooltip li, .dice-modifiers li');
    lists.forEach(li => {
      const t = (li.textContent || "").toLowerCase();
      if (t.includes("stunt (skill") || t.includes("stunt (defense map")) {
        li.remove();
      }
    });
  } catch (_) {}
}); // ccs-hide-stunt-mods
