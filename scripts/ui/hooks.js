import { MODULE_ID } from "../constants.js";
import { openStuntDialog } from "./stunt-dialog.js";
import { openPoolConfig } from "./pool-dialog.js";

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
    (mount.length ? mount : $el).append($btn);
  });

  // Scrub internal stunt shims from PF2e pre-roll dialog for players
  function ccsScrubStuntModifiers(root) {
    try {
      if (!root?.querySelector) return;
      const candidates = root.querySelectorAll(
        '.dice-modifiers li, .modifiers-list li, li[role="listitem"], li'
      );
      candidates.forEach((li) => {
        const t = (li.textContent || "").toLowerCase();
        if (t.includes("stunt (skill") || t.includes("stunt (defense map")) {
          li.remove();
        }
      });
    } catch (_e) { /* no-op */ }
  }

  Hooks.on("renderDialog", (_app, html) => {
    if (game.user?.isGM) return;
    const root = html?.[0] ?? html;
    ccsScrubStuntModifiers(root);
  });

  Hooks.on("renderApplication", (app, html) => {
    if (game.user?.isGM) return;
    const name = app?.constructor?.name ?? "";
    if (!/Statistic|Check|Attack|Dialog/i.test(name)) return;
    const root = html?.[0] ?? html;
    ccsScrubStuntModifiers(root);
  });

  // Token HUD button (v12/13 safe)
  Hooks.on("renderTokenHUD", (app, htmlArg) => {
    const html = htmlArg instanceof jQuery ? htmlArg : $(htmlArg);
    if (!html?.length) return;
    const token = app?.object;
    if (!token?.document) return;
    html.find(".control-icon.ccs").remove();
    const btn = $(`<div class="control-icon ccs" title="Creative Combat Stunts"><i class="fas fa-bolt"></i></div>`)
      .on("click", () => openStuntDialog({ token }));
    const col = html.find(".col.right, .col").last();
    (col.length ? col : html).append(btn);
  });

  // Expose API after ready
  Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);
    if (mod) mod.api = { openStuntDialog, openPoolConfig };
  });
}

// Chat message post-render: DC mask + hide internal shim mods
Hooks.on("renderChatMessageHTML", (_message, html) => {
  try {
    const root = html?.[0] ?? html;
    if (!root?.querySelector) return;
    const isGM = !!game.user?.isGM;

    if (root.querySelector('.ccs-card')) {
      const dcs = root.querySelectorAll('.ccs-dc');
      dcs.forEach(el => {
        const dc = el.getAttribute('data-dc') ?? '';
        el.textContent = isGM ? dc : '??';
      });
      const gmOnly = root.querySelectorAll('.ccs-gm-only');
      gmOnly.forEach(el => { el.style.display = isGM ? '' : 'none'; });
    }

    if (!isGM) {
      const lists = root.querySelectorAll('.dice-tooltip li, .dice-modifiers li');
      lists.forEach(li => {
        const t = (li.textContent || "").toLowerCase();
        if (t.includes("stunt (skill") || t.includes("stunt (defense map")) {
          li.remove();
        }
      });
    }
  } catch (_) {}
});
