# Creative Combat Stunts – GM How-To

This guide covers **weaknesses and templates**: how to add them, import them, and test them.

---

## 1. Add a Custom Weakness to a Monster
1. Open the NPC’s sheet.  
2. Click the **CCS** button in the sheet header (GM-only).  
3. In the **Actor Weaknesses** dialog, click **Add Custom**.  
4. Fill the row:
   - **Label:** `Shattered Glass`  
   - **Trigger Kind:** `attack`  
   - **Trait:** `visual`  
   - **Effect Type:** `apply-condition`  
   - **Value:** `dazzled`  
5. Close (auto-saves).  
6. In play: roll a **visual attack stunt** against this NPC → chat shows *Applied: Dazzled (Actor Weakness)*.

---

## 2. Create a Reusable Template
1. Open **Game Settings → Configure Settings → Module Settings → Creative Combat Stunts**.  
2. Click **Manage Templates**.  
3. In the **Weakness Templates** manager, click **Add Template**.  
4. Example entry:
   - **Label:** `Armor Gaps`  
   - **Trigger Kind:** `skill`  
   - **Key:** `athletics`  
   - **Effect Type:** `apply-condition`  
   - **Value:** `off-guard`  
5. Save.  
   This template is now available to import on any actor.

---

## 3. Import a Template onto an Actor
1. Open the NPC’s sheet → click **CCS**.  
2. In the **Import from Template** dropdown, select `Armor Gaps` → **Add Template**.  
3. Confirm it appears in the weaknesses list and is enabled.  
4. In play: roll an **Athletics stunt** against this NPC → chat shows *Applied: Off-Guard (Actor Weakness)*.

---

## 4. Built-In Starter Templates
The module ships with a few examples so the manager is never empty:

| Label           | Trigger Kind | Key/Trait    | Effect Type      | Value    |
|-----------------|--------------|--------------|------------------|----------|
| Cracked Visor   | attack       | trait=visual | apply-condition  | dazzled  |
| Shaky Footing   | skill        | athletics    | apply-condition  | prone    |
| Prophet’s Chant | spell        | spell-attack | degree-bump      | 1        |

---

## 5. Testing Tips
- Weaknesses apply only if **enabled** (checkbox on).  
- Current wiring fires on **success paths** with **Tactical Risk enabled**.  
- To test degree bumps: set DCs so you succeed by just a few points → see Success → Crit Success upgrades.  
- Conditions apply immediately through the PF2e system adapter.

---

## Notes
- Weaknesses are **actor-specific**: if an NPC doesn’t have them, nothing is checked.  
- Templates are **global**: define once, reuse everywhere.  
- You can mix **custom per-actor weaknesses** and **templates** on the same NPC.  
- Future updates may add more effect types (resistances, damage tweaks).

---