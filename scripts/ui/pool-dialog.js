import { MODULE_ID, FLAGS } from "../constants.js";

let _poolDialogInstance = null;

export async function openPoolConfig() {
  // Close existing dialog to prevent duplicates
  if (_poolDialogInstance?.rendered) {
    _poolDialogInstance.close();
    _poolDialogInstance = null;
  }

  const combat = game.combat;
  if (!combat) return ui.notifications?.warn(game.i18n.localize("CCS.Notify.NoCombat"));

  const pool = combat.getFlag(MODULE_ID, FLAGS.POOL) ?? {
    enabled: false, size: 4, remaining: 4,
  };

  const content = `
    <div class="form-group"><label>${game.i18n.localize("CCS.UI.Enabled")}</label>
      <input type="checkbox" name="enabled" ${pool.enabled ? "checked" : ""}/>
    </div>
    <div class="form-group"><label>${game.i18n.localize("CCS.UI.PoolSize")}</label>
      <input type="number" name="size" value="${pool.size ?? 4}" min="1" max="8"/>
    </div>
    <p>${game.i18n.localize("CCS.UI.PoolDescription")}</p>
  `;

  const dlg = new Dialog({
    title: game.i18n.localize("CCS.UI.CinematicPool"),
    content,
    buttons: {
      save: {
        label: game.i18n.localize("CCS.UI.Save"),
        callback: async (html) => {
          if (!game.combat) return ui.notifications?.warn(game.i18n.localize("CCS.Notify.NoCombat"));
          const enabled = html.find('[name="enabled"]').is(":checked");
          const size = Math.max(1, Number(html.find('[name="size"]').val()) || 4);
          const remaining = Math.min(pool.remaining ?? size, size);
          await combat.setFlag(MODULE_ID, FLAGS.POOL, { enabled, size, remaining });
          ui.notifications?.info(enabled ? game.i18n.format("CCS.Notify.PoolEnabled", { remaining, size }) : game.i18n.localize("CCS.Notify.PoolDisabled"));
        },
      },
      reset: {
        label: game.i18n.localize("CCS.UI.ResetRemaining"),
        callback: async () => {
          if (!game.combat) return ui.notifications?.warn(game.i18n.localize("CCS.Notify.NoCombat"));
          const size = Math.max(1, Number(pool.size) || 4);
          await combat.setFlag(MODULE_ID, FLAGS.POOL, { ...(pool || {}), remaining: size });
          ui.notifications?.info(game.i18n.localize("CCS.Notify.PoolReset"));
        },
      },
      cancel: { label: game.i18n.localize("CCS.UI.Close") },
    },
  });
  dlg.render(true);
  _poolDialogInstance = dlg;
}
