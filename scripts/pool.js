// Cinematic pool and once-per-combat tracking

import { MODULE_ID, FLAGS } from "./constants.js";
import { validatePoolSpend } from "./logic.js";

export async function canUseOncePerCombat(combat, actorId, key) {
  if (!combat) return false;
  const usage = combat.getFlag(MODULE_ID, key) || {};
  return !usage[actorId];
}

export async function markUsedOncePerCombat(combat, actorId, key) {
  if (!combat) return;
  const usage = combat.getFlag(MODULE_ID, key) || {};
  usage[actorId] = true;
  await combat.setFlag(MODULE_ID, key, usage);
}

export async function spendCinematicToken(combat, actorId) {
  if (!combat) return { ok: false, reason: "No combat" };
  const pool = combat.getFlag(MODULE_ID, FLAGS.POOL);
  const usage = combat.getFlag(MODULE_ID, FLAGS.POOL_USAGE) || {};
  const check = validatePoolSpend(pool, usage, actorId);
  if (!check.ok) return check;
  await combat.setFlag(MODULE_ID, FLAGS.POOL, { ...pool, remaining: pool.remaining - 1 });
  usage[actorId] = true;
  await combat.setFlag(MODULE_ID, FLAGS.POOL_USAGE, usage);
  return { ok: true };
}
