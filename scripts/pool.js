// Cinematic pool and once-per-combat tracking

import { MODULE_ID, FLAGS } from "./constants.js";
import { validatePoolSpend } from "./logic.js";

/**
 * Safely write a flag on a combat document.
 * Falls back gracefully if the user lacks permission (player vs GM).
 */
async function safeCombatSetFlag(combat, key, value) {
  try {
    await combat.setFlag(MODULE_ID, key, value);
    return true;
  } catch (e) {
    console.warn("CCS: Flag write failed (likely permission)", key, e);
    return false;
  }
}

export async function canUseOncePerCombat(combat, actorId, key) {
  if (!combat) return false;
  try {
    const usage = combat.getFlag(MODULE_ID, key) || {};
    return !usage[actorId];
  } catch (e) {
    console.warn("CCS: Flag read failed", key, e);
    return false;
  }
}

export async function markUsedOncePerCombat(combat, actorId, key) {
  if (!combat) return false;
  const usage = combat.getFlag(MODULE_ID, key) || {};
  usage[actorId] = true;
  return safeCombatSetFlag(combat, key, usage);
}

export async function spendCinematicToken(combat, actorId) {
  if (!combat) return { ok: false, reason: "No combat" };
  try {
    const pool = combat.getFlag(MODULE_ID, FLAGS.POOL);
    const usage = combat.getFlag(MODULE_ID, FLAGS.POOL_USAGE) || {};
    const check = validatePoolSpend(pool, usage, actorId);
    if (!check.ok) return check;

    // Write both flags — if pool write fails, don't write usage (keep state consistent)
    const poolOk = await safeCombatSetFlag(combat, FLAGS.POOL, { ...pool, remaining: pool.remaining - 1 });
    if (!poolOk) return { ok: false, reason: "Permission denied — ask GM to enable pool spending" };

    usage[actorId] = true;
    const usageOk = await safeCombatSetFlag(combat, FLAGS.POOL_USAGE, usage);
    if (!usageOk) {
      // Roll back pool decrement since we couldn't mark actor as used
      await safeCombatSetFlag(combat, FLAGS.POOL, pool);
      return { ok: false, reason: "Permission denied — ask GM to enable pool spending" };
    }
    return { ok: true };
  } catch (e) {
    console.warn("CCS: spendCinematicToken failed", e);
    return { ok: false, reason: "Failed to spend token" };
  }
}
