export function registerUI(){
  Hooks.on("renderActorSheet", (app, html, data) => {
    if (!app.actor.isOwner) return;
    const btn = $(`<a class="ccs-stunt-button"><i class="fas fa-theater-masks"></i> Stunt</a>`);
    btn.on("click", () => openStuntDialog(app.actor));
    html.closest('.app').find('.ccs-stunt-button').remove();
    html.find(".window-title").after(btn);

    if (game.user.isGM && app.actor.type === "npc" && game.system.id === "pf2e") {
      const wbtn = $(`<a class="ccs-weakness-button"><i class="fas fa-bolt"></i> Creative Hooks</a>`);
      wbtn.on("click", () => openWeaknessEditor(app.actor));
      html.find(".window-title").after(wbtn);
    }
  });

  Hooks.on("renderCombatTracker", (app, html, data) => {
    if (!game.user.isGM) return;
    const controls = $(`<div class="ccs-ct-controls"><a class="ccs-toggle"><i class="fas fa-film"></i> Cinematic Pool</a></div>`);
    controls.find(".ccs-toggle").on("click", () => openPoolConfig());
    html.find(".directory-footer").append(controls);
  });
}

async function openPoolConfig(){
  const combat = game.combat;
  if (!combat) return ui.notifications?.warn("No active combat.");
  const pool = combat.getFlag("creative-combat-stunts","cinematicPool") || {enabled:false,size:4,remaining:4};
  const content = `
    <div class="form-group"><label>Enabled</label>
      <input type="checkbox" name="enabled" ${pool.enabled ? "checked": ""}/>
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
      save: { label: "Save", callback: async html => {
        const enabled = html.find('[name="enabled"]').is(':checked');
        const size = Number(html.find('[name="size"]').val()) || 4;
        const remaining = Math.min(pool.remaining ?? size, size);
        await combat.setFlag("creative-combat-stunts","cinematicPool", {enabled,size,remaining});
        ui.notifications?.info(enabled ? `Cinematic Pool enabled (${remaining}/${size}).` : "Cinematic Pool disabled.");
      }},
      reset: { label: "Reset Remaining", callback: async () => {
        const size = (pool?.size ?? 4);
        await combat.setFlag("creative-combat-stunts","cinematicPool", { ...(pool||{}), remaining: size });
        ui.notifications?.info("Cinematic Pool remaining reset.");
      }},
      cancel: { label: "Close" }
    }
  }).render(true);
}

async function openWeaknessEditor(actor){
  const triggers = actor.getFlag("creative-combat-stunts","weaknessTriggers") || [];
  const rows = triggers.map((t,i)=>`
    <tr>
      <td><input name="id-${i}" value="${t.id || ''}"/></td>
      <td><input name="label-${i}" value="${t.label || ''}"/></td>
      <td><input name="setup-${i}" value="${t.setup || ''}"/></td>
      <td><textarea name="effect-${i}" rows="2">${(t.effect && JSON.stringify(t.effect)) || '{}'}</textarea></td>
    </tr>`).join("");
  const content = `
    <p>Define boss "Creative Hooks" that apply when stunts succeed.</p>
    <div style="margin-bottom:6px;">
      <button type="button" id="ccs-import-samples">Import Sample Triggers</button>
    </div>
    <table class="ccs-table">
      <thead><tr><th>ID</th><th>Label</th><th>Setup</th><th>Effect JSON</th></tr></thead>
      <tbody>${rows || ""}</tbody>
    </table>
    <button type="button" id="ccs-add-row">Add Row</button>
  `;
  const dlg = new Dialog({
    title: `Creative Hooks: ${actor.name}`,
    content,
    buttons: {
      save:{label:"Save", callback: async html=>{
        const body = html.find("tbody tr");
        const list = [];
        body.each((idx, tr)=>{
          const $tr = $(tr);
          const id = $tr.find(`input[name="id-${idx}"]`).val();
          const label = $tr.find(`input[name="label-${idx}"]`).val();
          const setup = $tr.find(`input[name="setup-${idx}"]`).val();
          let effect = {};
          try { effect = JSON.parse($tr.find(`textarea[name="effect-${idx}"]`).val() || "{}"); } catch(e){}
          if (id) list.push({id,label,setup,effect});
        });
        await actor.setFlag("creative-combat-stunts","weaknessTriggers", list);
        ui.notifications?.info("Creative Hooks saved.");
      }},
      close:{label:"Close"}
    },
    render: html => {
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
          const current = actor.getFlag("creative-combat-stunts","weaknessTriggers") || [];
          const merged = [...current];
          for (const s of samples) {
            if (!merged.find(m=>m.id===s.id)) merged.push(s);
          }
          await actor.setFlag("creative-combat-stunts","weaknessTriggers", merged);
          ui.notifications?.info(`Imported ${samples.length} sample triggers.`);
          dlg.close();
          openWeaknessEditor(actor);
        } catch (e) {
          console.error(e);
          ui.notifications?.error("Failed to import sample triggers.");
        }
      });
    }
  });
  dlg.render(true);
}

export async function openStuntDialog(actor){
  const sys = game.system.id;
  const targets = Array.from(game.user.targets);
  const target = targets[0]?.actor || null;
  const pf2eAdvOnce = sys === "pf2e" ? game.settings.get("creative-combat-stunts","pf2eAdvantageOnce") : false;
  const pool = game.combat?.getFlag("creative-combat-stunts","cinematicPool");
  const triggers = (sys === "pf2e" ? (target?.getFlag("creative-combat-stunts","weaknessTriggers") || []) : []);

  const content = await renderTemplate("modules/creative-combat-stunts/templates/stunt-dialog.hbs",{
    actor, targetName: target?.name ?? "(none)", pf2eAdvOnce,
    poolEnabled: !!pool?.enabled, poolRemaining: pool?.remaining ?? 0,
    triggers
  });
  new Dialog({
    title: "Creative Stunt",
    content,
    buttons: {
      roll: {
        label: "Roll",
        callback: html => {
          const coolSel = html.find('[name="cool"]').val();
          const risky = html.find('[name="risk"]').is(':checked');
          const plausible = html.find('[name="plausible"]').is(':checked');
          const advNow = html.find('[name="advNow"]').is(':checked');
          const spendPoolNow = html.find('[name="spendPool"]').is(':checked');
          const triggerId = html.find('[name="trigger"]').val() || null;
          game.ccf.rollStunt({
            actor,
            target: target,
            options: { coolTier: coolSel, tacticalRisk: risky, plausible, chooseAdvNow: advNow, spendPoolNow, triggerId }
          });
        }
      },
      cancel: { label: "Cancel" }
    }
  }).render(true);
}