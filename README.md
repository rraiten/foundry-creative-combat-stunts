# Creative Combat Stunts (PF2e & 5e)

Brings more life and agency into combat.  
Instead of flat rolls, players can commit to stunts before they act, with outcomes tied to success or failure. This adds tension, drama, and roleplay choices back into each turn.

## Install
**Recommended:** In Foundry's Module Browser, search: *Creative Combat Stunts* (after approval in the directory).  
**Manual:** Paste this Manifest URL into Foundry:  
`https://raw.githubusercontent.com/rraiten/foundry-creative-combat-stunts/main/module.json`

---

## What it does
- ✨ **Liven Up Combat**: Transform routine attack rolls into cinematic, roleplay-driven moments.  
- 🎭 **Player Agency**: Give players meaningful decisions before dice are rolled, keeping the spotlight on their creativity.  
- ⚔️ **Smooth Integration**: Dialogs and chat cards make it quick and seamless in play.  
- 📜 **System Support**: Built-in adapters for Pathfinder 2e & D&D 5e ensure outcomes follow each system’s rules.  
- 🪓 **Boss Weaknesses**: GMs can define weaknesses for actors (with reusable templates) so stunts can directly exploit enemy flaws.

---

## Usage
1. Enable the module in **Game Settings → Manage Modules**.  
2. Select a token and open **Stunt Dialog** from the token HUD / macro (if you add one).  
3. Choose a stunt, confirm, and let the adapter apply outcomes.  
4. (Optional GM Feature) Add **Weaknesses** to monsters and bosses so that certain stunt types (skills, traits, spell attacks, etc.) trigger extra effects.

---

## Weaknesses & Templates
In addition to general stunts, the GM can attach **actor-specific weaknesses**. This creates cinematic “cracks in the armor” for the party to exploit.

- **Per-Actor Weaknesses**: Open an NPC sheet → click **CCS** (top bar) → add a custom weakness or import from a template.  
- **Templates**: Manage reusable defaults under *Game Settings → Configure Settings → Creative Combat Stunts → Manage Templates*.  

### Quick Examples

| Label           | Trigger Kind | Key/Trait    | Effect Type      | Value      | In Play Example |
|-----------------|--------------|--------------|------------------|------------|-----------------|
| Cracked Visor   | attack       | trait=visual | apply-condition  | dazzled    | Visual stunt blinds the foe. |
| Shaky Footing   | skill        | athletics    | apply-condition  | prone      | Athletics stunt knocks foe prone. |
| Prophet’s Chant | spell        | spell-attack | degree-bump      | 1          | Spell attack stunt bumps success to crit success. |

**Field meanings**
- **Trigger Kind**: Which stunt type this applies to (`skill`, `attack`, `spell`, `trait`, `condition`).  
- **Key**: Optional. For skills: use slug (`athletics`). For spell stunts: `spell-attack`. For conditions: the condition slug.  
- **Trait**: Optional trait filter (e.g. `visual`, `trip`).  
- **Effect**:  
  - `apply-condition`: applies a PF2e condition (value = slug, e.g. `dazzled`).  
  - `degree-bump`: shifts degree of success by +N (value = number, capped at crit).  

---

## How it actually works
1. Rewards players for roleplaying cool stunts with flat bonuses, advantage, special statuses or a draw from a critical deck.  
2. Allows a fail-forward for important combat narrative moments – no more describing in detail a great stunt only for nothing to happen on a bad roll.  
3. Balances risk vs reward: make the DC higher for a more rewarding effect, but risk harsher backlash on a failure.  
4. Introduces an optional cinematic points pool for the party to spend in important boss fights.  
5. Lets the GM spice up boss encounters by defining **weaknesses**: bosses are tougher, but smart stunts can exploit flaws to swing the battle.  

---

## Compatibility
- Foundry **v12+**, verified **v13**  
- Systems: **pf2e**, **dnd5e**

---

## Roadmap
- More weakness effect types (damage multipliers, resistances, rider effects).  
- Drag-and-drop import/export for templates.  
- Expanded 5e adapter coverage.  

---

## Support & Issues
Open issues or feature requests here:  
https://github.com/rraiten/foundry-creative-combat-stunts/issues

---

## License
MIT © rraiten
