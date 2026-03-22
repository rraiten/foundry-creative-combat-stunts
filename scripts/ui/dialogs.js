// Shared dialog helpers used by stunt, rider, and pool dialogs

export function openSimpleDialogV2({ title, content, buttons = [] }) {
  const D2 = foundry?.applications?.api?.DialogV2;
  if (!D2) return null;

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

export async function chooseRiderDialog(kind = "success") {
  if (foundry?.applications?.api?.DialogV2) {
    return new Promise(resolve => {
      const content = `
        <p>${game.i18n.localize("CCS.UI.RiderPrompt")}</p>
        <input type="text" name="rider" placeholder="e.g., prone, frightened:1, drop-item" style="width:100%"/>
      `;
      let dlg = null;
      const buttons = [
        {
          action: "ok",
          label: game.i18n.localize("CCS.UI.Apply"),
          default: true,
          callback: () => {
            const val = dlg?.element?.querySelector?.('[name="rider"]')?.value?.trim() || null;
            resolve(val);
          }
        },
        { action: "cancel", label: game.i18n.localize("CCS.UI.Cancel"), callback: () => resolve(null) }
      ];
      dlg = openSimpleDialogV2({
        title: game.i18n.format("CCS.UI.ChooseRider", { kind }),
        content,
        buttons,
        defaultId: "ok",
      });
    });
  }
}

