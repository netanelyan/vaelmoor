import * as THREE from 'three';
import { Character } from './character.js';
import { Items, EFFECT_NAMES, HARMFUL } from './items.js';
import { Inventory } from './inventory.js';
import { Containers, prices } from './loot.js';
import { itemMesh } from '../render/itemMesh.js';

// The RPG layer: character, items, inventory, containers, merchants and the
// player's actions on them. Screens call these methods; the HUD hears about
// results through `notify`. Everything here is saved by toJSON/loadState.

export const START = {
  gold: 25,
  items: { wanderer_tunic: 1, grey_hood: 1, iron_dagger: 1, lockpick: 4, potion_health: 1, bread: 2 },
  equip: ['wanderer_tunic', 'grey_hood', 'iron_dagger'],
  favorites: ['iron_dagger', 'spell:flames', 'spell:healing'],
};

export class Game {
  constructor(data, { audio = null } = {}) {
    this.items = new Items(data.items);
    this.character = new Character(data.skills);
    this.inventory = new Inventory(this.items, this.character);
    this.containers = new Containers(data.loot);
    this.spells = data.spells;
    this.audio = audio;
    this.flags = {};
    this.read = new Set();      // books already read (a skill book teaches once)
    this.dropped = [];          // [{ uid, realm, item, count, at: [x, y, z] }]
    this.taken = new Set();     // world pickups already taken
    this.remembrance = null;    // equipped remembrance id
    this.ui = null;             // set by GameUI
    this.realmOf = null;        // () => current realm (set by main)
    this.listeners = [];
    this.character.on((e) => this.onCharacter(e));
  }

  on(fn) { this.listeners.push(fn); }
  notify(e) { for (const fn of this.listeners) fn(e); }

  newGame() {
    const inv = this.inventory;
    inv.gold = START.gold;
    for (const [id, n] of Object.entries(START.items)) inv.add(id, n, { silent: true });
    for (const id of START.equip) inv.equip(id, 'right');
    for (const id of START.favorites) inv.favorites.add(id);
  }

  onCharacter(e) {
    if (e.type === 'skill-up') { this.audio?.play('skillup'); this.notify(e); }
    if (e.type === 'level-up') { this.audio?.play('levelup'); this.notify(e); }
    if (e.type === 'perk') this.audio?.play('perk');
  }

  armorRating() {
    return this.inventory.armorRating();
  }

  spellCost(spell) {
    const ch = this.character;
    return spell.cost * (1 + ch.mod(`${spell.school}.cost`)) * (1 - Math.min(100, ch.skill(spell.school)) / 250);
  }

  // ------------------------------------------------------------ using items
  useItem(id, hand = 'right') {
    const def = this.items.get(id);
    const inv = this.inventory;
    if (!def || !inv.has(id)) return;
    switch (def.cat) {
      case 'weapons':
      case 'apparel':
        inv.equip(id, hand);
        this.audio?.play('equip');
        break;
      case 'potions':
        inv.remove(id, 1);
        for (const e of def.effects) this.character.applyEffect(e);
        this.audio?.play(def.food ? 'eat' : 'drink');
        this.notify({ type: 'log', text: `${def.name} ${def.food ? 'eaten' : 'drunk'}` });
        break;
      case 'ingredients': {
        // eating an ingredient applies (weakly) and reveals its first effect
        inv.remove(id, 1);
        const n = this.character.mod('alchemy.reveal') ? 4 : 1;
        for (let i = 0; i < n; i++) inv.learn(id, i);
        const eff = def.alchemy[0];
        this.character.applyEffect([eff, HARMFUL.has(eff) ? 2 : 4, 0]);
        this.audio?.play('eat');
        this.notify({ type: 'log', text: `${def.name}: ${EFFECT_NAMES[eff]}` });
        break;
      }
      case 'books':
        this.audio?.play('page');
        this.ui?.openBook(def);
        if (def.teaches && !this.read.has(id)) { this.read.add(id); this.character.raiseSkill(def.teaches); }
        else this.read.add(id);
        break;
      default:
        this.ui?.hud.toast('You cannot use that');
    }
  }

  /** Drop one of an item in front of the player. */
  drop(id) {
    const inv = this.inventory;
    if (!inv.has(id)) return;
    inv.remove(id, 1);
    const p = this.ui.player;
    const at = [p.pos.x - Math.sin(p.yaw) * 1.2, 0, p.pos.z - Math.cos(p.yaw) * 1.2];
    const realm = this.realmOf();
    at[1] = realm.world.groundAt(at[0], at[2]);
    const d = { uid: `drop:${Date.now().toString(36)}:${Math.floor(Math.random() * 1e6).toString(36)}`, realm: realm.id, item: id, count: 1, at };
    this.dropped.push(d);
    this.placePickup(realm, d);
    this.audio?.play('pickup', 0.6);
  }

  /** Put a takeable item into a realm (dropped items, loot placed in the region data). */
  placePickup(realm, { uid, item, count = 1, at, rot = 0 }) {
    const def = this.items.get(item);
    if (!def || this.taken.has(uid)) return null;
    const obj = itemMesh(def);
    const k = def.mesh?.kind;
    if (['sword', 'dagger', 'axe', 'mace', 'bow', 'arrow'].includes(k)) obj.rotation.z = Math.PI / 2;
    const g = new THREE.Group();
    g.add(obj);
    g.position.set(at[0], at[1] + (['sword', 'dagger', 'axe', 'mace', 'bow', 'arrow'].includes(k) ? 0.04 : 0), at[2]);
    g.rotation.y = rot;
    realm.scene.add(g);
    const it = realm.world.interactables.add({ id: uid, name: count > 1 ? `${def.name} (${count})` : def.name, action: 'Take', kind: 'pickup', radius: 0.35,
      pos: new THREE.Vector3(at[0], at[1] + 0.15, at[2]), object: g });
    it.item = item; it.count = count;
    return it;
  }

  takePickup(it) {
    this.inventory.add(it.item, it.count);
    this.taken.add(it.id);
    this.dropped = this.dropped.filter((d) => d.uid !== it.id);
    it.enabled = false;
    if (it.id.startsWith('drop:')) it.object?.removeFromParent();
    else if (it.object) it.object.visible = false;
    this.audio?.play('pickup');
  }

  // ------------------------------------------------------------ containers
  isOwnedByOther(c) { return !!c.owner && !this.flags[`owns:${c.id}`]; }

  takeFrom(c, id, n) {
    const inv = this.inventory;
    if (id === 'gold') {
      inv.gold += c.gold;
      this.notify({ type: 'log', text: `${c.gold} gold` });
      c.gold = 0;
      this.audio?.play('coins');
    } else {
      const have = c.stacks.get(id) || 0;
      const k = Math.min(have, n);
      if (k <= 0) return;
      if (have - k <= 0) c.stacks.delete(id); else c.stacks.set(id, have - k);
      inv.add(id, k);
      this.audio?.play('pickup');
    }
    if (this.isOwnedByOther(c)) this.notify({ type: 'theft', container: c, item: id });
  }

  storeIn(c, id, n) {
    const k = this.inventory.remove(id, n);
    if (k > 0) { c.stacks.set(id, (c.stacks.get(id) || 0) + k); this.audio?.play('pickup', 0.6); }
  }

  takeAll(c) {
    if (c.gold) this.takeFrom(c, 'gold', c.gold);
    for (const [id, n] of [...c.stacks]) this.takeFrom(c, id, n);
  }

  // ------------------------------------------------------------ trade
  buy(m, id, n = 1) {
    const def = this.items.get(id);
    const have = m.stacks.get(id) || 0;
    const P = prices(this.character);
    let bought = 0;
    for (let i = 0; i < Math.min(n, have); i++) {
      const price = P.buy(def.value);
      if (this.inventory.gold < price) break;
      this.inventory.gold -= price;
      m.gold += price;
      bought++;
      this.character.useSkill('speech', price / 60);
    }
    if (!bought) return false;
    if (have - bought <= 0) m.stacks.delete(id); else m.stacks.set(id, have - bought);
    this.inventory.add(id, bought);
    this.audio?.play('coins');
    return true;
  }

  sell(m, id, n = 1) {
    const def = this.items.get(id);
    const P = prices(this.character);
    let sold = 0;
    for (let i = 0; i < Math.min(n, this.inventory.count(id)); i++) {
      const price = P.sell(def.value);
      if (m.gold < price) break;
      m.gold -= price;
      this.inventory.gold += price;
      sold++;
      this.character.useSkill('speech', price / 60);
    }
    if (!sold) return false;
    this.inventory.remove(id, sold);
    m.stacks.set(id, (m.stacks.get(id) || 0) + sold);
    this.audio?.play('coins');
    return true;
  }

  /**
   * Dialogue Speech checks (deterministic, as in the old games): persuade
   * needs Speech >= level; intimidate counts your level too; a bribe pays.
   */
  speechCheck(o) {
    const c = o.check, ch = this.character, sp = ch.skill('speech');
    let ok;
    if (c.kind === 'bribe') {
      ok = this.inventory.gold >= (c.gold ?? 0);
      if (ok) { this.inventory.gold -= c.gold ?? 0; this.audio?.play('coins'); }
    } else if (c.kind === 'intimidate') ok = (sp + ch.level * 4) * (1 + ch.mod('speech.intimidate')) >= c.level;
    else ok = sp * (1 + ch.mod('speech.persuade')) >= c.level;
    ch.useSkill('speech', ok ? 3 : 0.5);
    this.notify({ type: 'log', text: ok ? `${c.kind === 'bribe' ? 'Bribe' : c.kind === 'intimidate' ? 'Intimidation' : 'Persuasion'} succeeded` : `${c.kind === 'bribe' ? 'Not enough gold' : 'They are not convinced'}` });
    return ok;
  }

  setRemembrance(id) { this.remembrance = this.remembrance === id ? null : id; this.audio?.play('equip'); }

  // ------------------------------------------------------------ save
  toJSON() {
    return {
      character: this.character.toJSON(), inventory: this.inventory.toJSON(), containers: this.containers.toJSON(),
      flags: this.flags, read: [...this.read], dropped: this.dropped, taken: [...this.taken], remembrance: this.remembrance, custom: this.items.custom,
    };
  }

  loadState(s, realms) {
    if (!s) return;
    this.items.loadCustom(s.custom);
    this.character.loadState(s.character);
    this.inventory.loadState(s.inventory);
    this.containers.loadState(s.containers);
    this.flags = s.flags || {};
    this.read = new Set(s.read || []);
    this.remembrance = s.remembrance ?? null;
    // world pickups: restore taken state, re-place dropped items
    this.taken = new Set(s.taken || []);
    for (const r of Object.values(realms)) {
      for (const it of r.world.interactables.list) {
        if (it.kind !== 'pickup') continue;
        if (it.id.startsWith('drop:')) { it.enabled = false; it.object?.removeFromParent(); continue; }
        it.enabled = !this.taken.has(it.id);
        if (it.object) it.object.visible = it.enabled;
      }
    }
    this.dropped = s.dropped || [];
    for (const d of this.dropped) if (realms[d.realm]) this.placePickup(realms[d.realm], d);
  }
}
