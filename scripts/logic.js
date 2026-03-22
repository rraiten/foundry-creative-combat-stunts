// Pure logic functions — zero FoundryVTT dependencies, fully testable.

/**
 * Parse a cool tier value (string or number) into a numeric tier (0, 1, 2).
 */
export function parseCoolTier(value) {
  if (typeof value === "string") {
    if (value === "full") return 2;
    if (value === "light") return 1;
    return 0;
  }
  return Number(value ?? 0);
}

/**
 * PF2e degree of success calculation.
 * Rules: >=dc+10 = crit success, >=dc = success, <=dc-10 = crit fail, else fail.
 * Nat 20 bumps +1 (capped at 3), nat 1 bumps -1 (floored at 0).
 */
export function computeDegree(total, dc, d20) {
  let degree = (total >= dc + 10) ? 3
             : (total >= dc)      ? 2
             : (total <= dc - 10) ? 0
             : 1;
  if (d20 === 20) degree = Math.min(3, degree + 1);
  else if (d20 === 1) degree = Math.max(0, degree - 1);
  return degree;
}

/**
 * 5e degree of success (simple): nat1=0, nat20=3, >=dc=2, else 1.
 */
export function compute5eDegree(total, dc, nat) {
  if (nat === 1) return 0;
  if (nat === 20) return 3;
  return total >= dc ? 2 : 1;
}

/**
 * Clamp a degree after applying a bump (+/-), keeping it in [0, 3].
 */
export function clampDegree(degree, bump) {
  return Math.min(3, Math.max(0, degree + bump));
}

/**
 * Build stunt roll options from raw form values.
 */
export function buildStuntConfig({ coolStr, rollKindStr, strikeKey, rollKey, risk, plausible, challengeAdj, advNow, spendPool, triggerId, defaultStrike }) {
  const coolTier = parseCoolTier(coolStr);
  const rollKind = (rollKindStr || "skill").toLowerCase();
  const resolvedRollKey = (rollKind === "attack"
    ? (strikeKey || defaultStrike || "")
    : (rollKey || "acr")
  ).toLowerCase();
  let chooseAdvNow = !!advNow;
  if (coolTier < 2) chooseAdvNow = false;
  return {
    rollKind,
    rollKey: resolvedRollKey,
    coolTier,
    tacticalRisk: !!risk,
    plausible: !!plausible,
    chooseAdvNow,
    spendPoolNow: !!spendPool,
    triggerId: triggerId || null,
    challengeAdj: Number(challengeAdj ?? 0),
  };
}

/**
 * Compute display math for the chat card (pure arithmetic).
 */
export function computeDisplayMath({ d20, skillMod, attackMod, coolBonus, tacticalRisk, challengeAdj, rollKind }) {
  const cool = Number(coolBonus ?? 0);
  const risk = tacticalRisk ? -2 : 0;
  const challenge = Number(challengeAdj ?? 0);
  const base = (String(rollKind).toLowerCase() === "attack") ? Number(attackMod ?? 0) : Number(skillMod ?? 0);
  const displayMod = base + cool + risk + challenge;
  const sign = displayMod >= 0 ? "+" : "-";
  const displayFormula = `1d20 ${sign} ${Math.abs(displayMod)}`;
  const displayTotal = Number(d20 ?? 0) + displayMod;
  return { displayFormula, displayTotal, displayMod };
}

/**
 * Validate whether a cinematic pool spend is allowed (no side effects).
 */
export function validatePoolSpend(pool, usage, actorId) {
  if (!pool?.enabled) return { ok: false, reason: "Pool disabled" };
  if ((pool.remaining ?? 0) <= 0) return { ok: false, reason: "No tokens left" };
  if (usage?.[actorId]) return { ok: false, reason: "Already used this encounter" };
  return { ok: true, reason: null };
}

/**
 * Parse a condition entry string like "prone" or "frightened:2" or "drop-item".
 */
export function parseEntry(entry) {
  const t = (entry || "").trim();
  if (!t) return null;
  if (t === "drop-item") return { text: "drop-item" };
  const parts = t.split(":").map(s => s.trim());
  return { slug: parts[0], value: parts[1] ? Number(parts[1]) : null };
}
