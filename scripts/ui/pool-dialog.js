import { MODULE_ID, FLAGS } from "../constants.js";

export async function openPoolConfig() {
  const combat = game.combat;
  if (!combat) return ui.notifications?.warn("No active combat.");

  const pool = combat.getFlag(MODULE_ID, FLAGS.POOL) ?? {
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
          await combat.setFlag(MODULE_ID, FLAGS.POOL, { enabled, size, remaining });
          ui.notifications?.info(enabled ? `Cinematic Pool enabled (${remaining}/${size}).` : "Cinematic Pool disabled.");
        },
      },
      reset: {
        label: "Reset Remaining",
        callback: async () => {
          const size = pool.size ?? 4;
          await combat.setFlag(MODULE_ID, FLAGS.POOL, { ...pool, remaining: size });
          ui.notifications?.info("Cinematic Pool remaining reset.");
        },
      },
      cancel: { label: "Close" },
    },
  }).render(true);
}
