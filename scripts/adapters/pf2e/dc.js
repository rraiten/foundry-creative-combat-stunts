// DC calculation helpers for PF2e

function _num(n) { const x = Number(n); return Number.isFinite(x) ? x : null; }

export function getLevelBasedDC(actor) {
  const lvl = Number(actor?.system?.details?.level?.value ?? actor?.system?.details?.level ?? 0) || 0;
  const tbl = game.pf2e?.DCByLevel
          ?? game.pf2e?.difficulty?.dcByLevel
          ?? CONFIG?.PF2E?.dcByLevel
          ?? CONFIG?.PF2E?.difficulty?.dcByLevel;
  return tbl?.[lvl] ?? (14 + lvl);
}

export function getDefenseDC(target, defense) {
  const sys = target?.system ?? {};

  if (defense === "perception") {
    const dc = _num(sys.attributes?.perception?.dc?.value);
    if (dc != null) return dc;

    const mod = _num(sys.attributes?.perception?.totalModifier)
             ?? _num(sys.attributes?.perception?.mod)
             ?? _num(sys.attributes?.perception?.value);
    if (mod != null) return 10 + mod;

    return null;
  }

  // fortitude / reflex / will
  const s = sys.saves?.[defense];
  if (!s) return null;

  const dc = _num(s?.dc?.value);
  if (dc != null) return dc;

  const mod = _num(s?.totalModifier) ?? _num(s?.mod) ?? _num(s?.value);
  if (mod != null) return 10 + mod;

  return null;
}

export function getSpellAttackModPF2(actor) {
  if (!actor) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  try {
    const stat =
      typeof actor.getStatistic === "function"
        ? (actor.getStatistic("spell-attack") || actor.getStatistic("spellAttack"))
        : null;
    const fromStat =
      num(stat?.check?.mod) ?? num(stat?.modifier) ?? num(stat?.mod);
    if (fromStat != null) return fromStat;
  } catch (_) {}

  try {
    const sys = actor.system || {};
    const candidates = [
      sys?.attributes?.spellAttack?.mod,
      sys?.attributes?.spellattack?.mod,
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
