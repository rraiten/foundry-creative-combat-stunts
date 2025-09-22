import { getActorWeaknesses, importTemplatesToActor, getWeaknessTemplates } from "./logic.js";

export class CCSWeaknessManager extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ccs-weakness-manager",
      title: "CCS: Actor Weaknesses",
      template: "modules/creative-combat-stunts/templates/weakness-manager.hbs",
      width: 520,
      height: "auto",
      closeOnSubmit: true
    });
  }

  get actor() { return this.object; }

  async getData() {
    return {
      actor: this.actor,
      weaknesses: getActorWeaknesses(this.actor),
      templates: getWeaknessTemplates()
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="add-template"]').on("click", () => this._onAddTemplate());
    html.find('[data-action="add-custom"]').on("click", () => this._onAddCustom());
    html.find('[data-action="delete"]').on("click", ev => this._onDelete(ev));
    html.find('[data-field]').on("change", ev => this._onEditField(ev));
    html.find('[data-action="toggle"]').on("click", ev => this._onToggle(ev));
  }

  async _onAddTemplate() {
    const select = this.element.find('select[name="templateId"]')[0];
    const id = select?.value;
    if (!id) return;
    await importTemplatesToActor(this.actor, [id]);
    this.render(true);
  }

  async _onAddCustom() {
    const list = getActorWeaknesses(this.actor);
    const rid = crypto.randomUUID?.() || foundry.utils.randomID();
    list.push({
      id: rid,
      label: "New Weakness",
      trigger: { kind: "attack", key: "" },
      effect: { type: "apply-condition", value: "dazzled", modifierType: "circumstance" },
      enabled: true
    });
    await this.actor.setFlag("creative-combat-stunts", "weaknesses", list);
    this.render(true);
  }

  async _onDelete(ev) {
    const id = ev.currentTarget?.dataset?.id;
    if (!id) return;
    const list = getActorWeaknesses(this.actor).filter(w => w.id !== id);
    await this.actor.setFlag("creative-combat-stunts", "weaknesses", list);
    this.render(true);
  }

  async _onToggle(ev) {
    const id = ev.currentTarget?.dataset?.id;
    if (!id) return;
    const list = getActorWeaknesses(this.actor);
    const w = list.find(x => x.id === id);
    if (!w) return;
    w.enabled = !w.enabled;
    await this.actor.setFlag("creative-combat-stunts", "weaknesses", list);
    this.render(true);
  }

  async _onEditField(ev) {
    const el = ev.currentTarget;
    const id = el?.dataset?.id;
    const path = el?.dataset?.field; // e.g., "label", "trigger.kind", "effect.value"
    const value = el.type === "number" ? Number(el.value) : el.value;
    if (!id || !path) return;
    const list = getActorWeaknesses(this.actor);
    const w = list.find(x => x.id === id);
    if (!w) return;
    foundry.utils.setProperty(w, path, value);
    await this.actor.setFlag("creative-combat-stunts", "weaknesses", list);
  }
}

// Idempotent header button (prevents duplicates on re-render)
Hooks.on("renderActorSheet", (sheet, html) => {
  if (!game.user?.isGM) return;
  const app = html.closest(".app");
  const header = app.find(".window-header .window-title");
  if (!header.length) return;

  // Remove any existing CCS button in this sheet, then add fresh
  app.find(".ccs-weaknesses-btn").remove();

  const btn = $(`<a class="ccs-weaknesses-btn" title="Creative Combat Stunts – Weaknesses"><i class="fas fa-bolt"></i> CCS</a>`);
  btn.off("click.ccs").on("click.ccs", () => new CCSWeaknessManager(sheet.actor).render(true));
  header.after(btn);
});