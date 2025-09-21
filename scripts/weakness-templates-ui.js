import { getWeaknessTemplates } from "./weakness.js";

export class CCSWeaknessTemplatesManager extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ccs-weakness-templates-manager",
      title: "CCS: Weakness Templates",
      template: "modules/creative-combat-stunts/templates/weakness-templates-manager.hbs",
      width: 600,
      height: "auto",
      closeOnSubmit: true
    });
  }

  async getData() {
    const templates = getWeaknessTemplates();
    return { templates };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="add"]').on("click", ev => this._onAdd(ev));
    html.find('[data-action="delete"]').on("click", ev => this._onDelete(ev));
    html.find('[data-field]').on("change", ev => this._onEditField(ev));
  }

  async _onAdd() {
    const list = getWeaknessTemplates();
    const rid = crypto.randomUUID?.() || randomID();
    list.push({
      id: rid,
      label: "New Template",
      trigger: { kind: "attack", key: "" },
      effect: { type: "apply-condition", value: "dazzled" },
      enabled: true
    });
    await game.settings.set("creative-combat-stunts","weaknessTemplates", list);
    this.render(true);
  }

  async _onDelete(ev) {
    const id = ev.currentTarget?.dataset?.id;
    if (!id) return;
    const list = getWeaknessTemplates().filter(w => w.id !== id);
    await game.settings.set("creative-combat-stunts","weaknessTemplates", list);
    this.render(true);
  }

  async _onEditField(ev) {
    const el = ev.currentTarget;
    const id = el?.dataset?.id;
    const path = el?.dataset?.field;
    const value = el.type === "number" ? Number(el.value) : el.value;
    if (!id || !path) return;
    const list = getWeaknessTemplates();
    const w = list.find(x => x.id === id);
    if (!w) return;
    foundry.utils.setProperty(w, path, value);
    await game.settings.set("creative-combat-stunts","weaknessTemplates", list);
  }
}
