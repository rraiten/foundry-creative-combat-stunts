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

/* ---------- UI registration ---------- */
export function registerUI() {
  // Actor sheet header button
  Hooks.on("renderActorSheet", (app, html) => {
    const actor = app.actor;
    if (!actor?.isOwner) return;

    const $root = app.element ?? html.closest(".app");
    $root.find(".ccs-stunt-button").remove();

    const $btn = $(
      `<a class="ccs-stunt-button" title="Stunt">
         <i class="fas fa-theater-masks"></i> Stunt
       </a>`
    ).on("click", () => openStuntDialog({ actor }));

    const $actions = $root.find(".window-header .header-actions").first();
    const $title = $root.find(".window-header .title, .window-title").first();
    if ($actions.length) $actions.prepend($btn);
    else if ($title.length) $title.after($btn);
    else html.prepend($btn);
  });

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

  Hooks.on("renderChatMessage", (_msg, html, data) => {
    const btn = html.find(".ccs-crit-draw");
    if (!btn.length) return;
    btn.on("click", async (ev) => {
      const isFailure = $(ev.currentTarget).data("fail") ? true : false;
      try {
        const deckAPI = game.pf2e?.criticalDecks ?? game.pf2e?.criticalDeck;
        if (deckAPI?.draw) await deckAPI.draw({ type: "attack", isFailure });
        else ui.notifications?.info("No PF2e crit deck API detected.");
      } catch (e) {
        console.error("CCS: Crit deck draw failed", e);
        ui.notifications?.error("Failed to draw crit card.");
      }
    });
  });



  // Expose API after ready
  Hooks.once("ready", () => {
    const mod = game.modules.get("foundry-creative-combat-stunts");
    if (mod) mod.api = { openStuntDialog, openPoolConfig, openWeaknessEditor };
  });
}

/* ---------- dialogs ---------- */
export async function openStuntDialog({ token, actor } = {}) {
  token ??= canvas?.tokens?.controlled?.[0] ?? null;
  actor ??= token?.actor ?? (game.user?.character ? game.actors.get(game.user.character) : null);
  if (!actor) return ui.notifications?.warn("Select a token or set a player character, then try again.");

  const sys = game?.system?.id ?? game.systemId ?? "";
  const target = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  const skills = getSkillChoices(actor, sys);          // build choices
  const rollSources = [{ value: "skill", label: "Skill" }]; // keep simple for now

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
      rollSources,
    }
  );

  const D2 = foundry?.applications?.api?.DialogV2;

  if (D2 && typeof openSimpleDialogV2 === "function") {
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
            const rollKey  = (q('[name="rollKey"]')?.value  || "acr").toLowerCase();
            const tacticalRisk = q('[name="risk"]')?.checked ?? false;
            const plausible    = q('[name="plausible"]')?.checked ?? false;
            let chooseAdvNow   = q('[name="advNow"]')?.checked ?? false;
            if (coolTier < 2) chooseAdvNow = false;
            const spendPoolNow = q('[name="spendPool"]')?.checked ?? false;
            const triggerId    = q('[name="trigger"]')?.value || null;
            game.ccf.rollStunt({
              actor, target,
              options: { rollKind, rollKey, coolTier, tacticalRisk, plausible, chooseAdvNow, spendPoolNow, triggerId }
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

    return; // prevent V1 fallback
  }

  // Fallback to V1 Dialog (keeps working on older cores)
  new Dialog({
    title: "Creative Stunt",
    content,
    buttons: {
      roll: {
        label: "Roll",
        callback: (html) => {
          const coolStr  = (html.find('[name="cool"]').val() || "none");
          const coolTier = coolStr === "full" ? 2 : coolStr === "light" ? 1 : 0;
          const rollKind = (html.find('[name="rollKind"]').val() || "skill").toLowerCase();
          const rollKey  = (html.find('[name="rollKey"]').val()  || "acr").toLowerCase();

          const tacticalRisk = html.find('[name="risk"]').is(":checked");
          const plausible    = html.find('[name="plausible"]').is(":checked");
          let chooseAdvNow   = html.find('[name="advNow"]').is(":checked");
          if (coolTier < 2) chooseAdvNow = false;

          const spendPoolNow = html.find('[name="spendPool"]').is(":checked");
          const triggerId    = html.find('[name="trigger"]').val() || null;

          game.ccf.rollStunt({
            actor,
            target,
            options: { rollKind, rollKey, coolTier, tacticalRisk, plausible, chooseAdvNow, spendPoolNow, triggerId }
          });
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    render: (html) => {
      const row = html.find("#ccs-adv-row");
      if (!row.length) return;
      const update = () => row.toggle((html.find('[name="cool"]').val() || "") === "full");
      html.find('[name="cool"]').on("change", update);
      update();
    }
  }).render(true);
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

  // V1 fallback
  return new Promise(resolve => {
    new Dialog({
      title: `Choose Rider (${kind})`,
      content: `
        <p>Select a rider or cancel to use the default.</p>
        <input type="text" name="rider" placeholder="e.g., prone, frightened:1, drop-item" style="width:100%"/>
      `,
      buttons: {
        ok:     { label: "Apply",  callback: html => resolve(html.find('[name="rider"]').val()?.trim() || null) },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "ok"
    }).render(true);
  });
}

export async function openCritPrompt({ isFailure = false } = {}) {
  if (foundry?.applications?.api?.DialogV2) {
    return new Promise(resolve => {
      openSimpleDialogV2({
        title: isFailure ? "Critical Failure" : "Critical Success",
        content: `<p>Pick how to resolve the critical.</p>`,
        buttons: [
          { action: "deck",  label: "Draw Crit Card", default: true, callback: () => resolve("deck")  },
          { action: "rider", label: "Pick Rider",                    callback: () => resolve("rider") },
          { action: "cancel",label: "Cancel",                        callback: () => resolve(null)    },
        ],
        defaultId: "deck",
      });
    });
  }

  // V1 fallback
  return new Promise(resolve => {
    new Dialog({
      title: isFailure ? "Critical Failure" : "Critical Success",
      content: `<p>Pick how to resolve the critical.</p>`,
      buttons: {
        deck:   { label: "Draw Crit Card", callback: () => resolve("deck") },
        rider:  { label: "Pick Rider",     callback: () => resolve("rider") },
        cancel: { label: "Cancel",         callback: () => resolve(null)    },
      },
      default: "deck",
    }).render(true);
  });
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
    window: { title },
    content,
    buttons: btns,
  });
  dlg.render(true);
  return dlg;
}




