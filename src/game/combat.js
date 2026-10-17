import * as THREE from 'three';
import { itemMesh } from '../render/itemMesh.js';
import { radialTexture } from '../render/materials.js';

// The player's side of a fight. Left mouse uses the right hand, right mouse
// the left hand (as in the old games):
//   weapon  click = swing, hold = power attack (stamina)
//   shield / empty left hand with a weapon in the right = block; a block that
//           meets a blow within 0.3 s staggers the attacker and stops it all;
//           left click while blocking with a shield = bash
//   bow     hold to draw, release to loose (arrows drop); right mouse zooms
//           with Eagle Eye
//   spell   hold to cast (Flames burns what's ahead, Healing mends you)
// C toggles sneaking: unaware foes take 3x melee / 2x arrow damage.
// Enemies are updated from here; their blows come back through onStrike.

const FWD = new THREE.Vector3();
const _v = new THREE.Vector3();

export class Combat {
  constructor(ctx) {
    Object.assign(this, ctx); // game, player, camera, input, viewmodel, ui, enemies, audio, realmOf
    this.hands = { right: this.handState(), left: this.handState() };
    this.arrows = [];
    this.flames = null;
    this.lastHit = null;   // { enemy, t }
    this.blocking = false;
    this.blockStart = 0;
    this.time = 0;
    this.deadT = -1;
    this.input.on('mousedown', (e) => this.down(e.button === 0 ? 'right' : e.button === 2 ? 'left' : null));
    this.input.on('mouseup', (e) => this.up(e.button === 0 ? 'right' : e.button === 2 ? 'left' : null));
  }

  handState() { return { held: false, t: 0, action: null, hitAt: 0, done: false }; }

  get ch() { return this.game.character; }
  get inv() { return this.game.inventory; }
  get realm() { return this.realmOf(); }
  get active() { return this.ui.state === 'play' && !this.ch.dead; }

  key(e) {
    if (e.code === 'KeyC') {
      this.player.sneaking = !this.player.sneaking;
      this.ui.hud.setSneak(this.player.sneaking);
    }
  }

  toggleDraw() {
    this.viewmodel.drawn = !this.viewmodel.drawn;
    this.audio.play('equip', 0.7);
  }

  /** What a hand does: 'weapon' | 'fist' | 'shield' | 'bow' | 'spell' | 'block' (weapon-block with the left button) | null */
  handKind(side) {
    const E = this.inv.equipped, id = E[side];
    if (side === 'right' && this.inv.isBow(E.right)) return 'bow';
    if (side === 'left' && this.inv.isBow(E.right)) return 'zoom';
    if (!id) {
      if (side === 'left' && E.right && !E.right.startsWith('spell:')) return 'block';
      return 'fist';
    }
    if (id.startsWith('spell:')) return 'spell';
    const def = this.game.items.get(id);
    if (def.cat === 'apparel' && def.slot === 'left') return 'shield';
    return 'weapon';
  }

  down(side) {
    if (!side || !this.active) return;
    if (!this.viewmodel.drawn) { this.viewmodel.drawn = true; return; }
    const h = this.hands[side];
    const kind = this.handKind(side);
    // bash: left click while blocking with a shield
    if (side === 'right' && this.blocking && this.handKind('left') === 'shield') { this.bash(); return; }
    // a click during a swing queues the next one (it doesn't restart this one)
    if ((kind === 'weapon' || kind === 'fist') && (h.action === 'swing' || h.action === 'power')) { h.queued = true; return; }
    h.held = true; h.t = 0; h.kind = kind;
    if (kind === 'weapon' || kind === 'fist') this.viewmodel.hold(side, 'windup');
    else if (kind === 'shield' || kind === 'block') this.startBlock(side);
    else if (kind === 'bow') {
      const ammo = this.inv.equipped.ammo || this.inv.firstAmmo();
      if (!ammo || !this.inv.has(ammo)) { this.ui.hud.toast('No arrows'); h.held = false; return; }
      this.inv.equipped.ammo = ammo;
      h.action = 'draw';
      this.viewmodel.hold('right', 'draw');
      this.audio.play('bowDraw', 0.7);
    } else if (kind === 'spell') { h.action = 'cast'; this.viewmodel.hold(side, 'cast'); }
    else if (kind === 'zoom') h.action = 'zoom';
  }

  up(side) {
    if (!side) return;
    const h = this.hands[side];
    if (!h.held) return;
    h.held = false;
    if ((h.kind === 'weapon' || h.kind === 'fist') && !h.action) this.swing(side, false);
    else if (h.kind === 'shield' || h.kind === 'block') this.stopBlock(side);
    else if (h.kind === 'bow' && h.action === 'draw') this.loose();
    else if (h.kind === 'spell') { h.action = null; this.viewmodel.release(side); this.flamesOff(side); }
    else if (h.kind === 'zoom') h.action = null;
  }

  // ------------------------------------------------------------ melee
  weaponDef(side) {
    const id = this.inv.equipped[side];
    return id && !id.startsWith('spell:') ? this.game.items.get(id) : null;
  }

  swing(side, power) {
    const h = this.hands[side];
    const def = this.weaponDef(side);
    const speed = def?.speed ?? 1.4;
    if (power) {
      const cost = 22 * (1 + this.ch.mod('power.cost'));
      if (!this.ch.spend('stamina', cost)) power = false;
    }
    const dur = (power ? 0.85 : 0.55) / speed;
    h.action = power ? 'power' : 'swing';
    h.kind = this.handKind(side);
    h.t = 0; h.dur = dur; h.queued = false; h.hitAt = dur * (power ? 0.55 : 0.4); h.done = false; h.power = power;
    this.viewmodel.release(side);
    this.viewmodel.play(side, power ? 'power' : 'swing', dur);
    this.audio.play(power ? 'swingHeavy' : 'swing', 0.8);
  }

  /** The blow lands: hit the nearest enemy in front within reach. */
  strike(side) {
    const h = this.hands[side];
    const def = this.weaponDef(side);
    const reach = def?.reach ?? 1.8;
    const e = this.enemyInFront(reach, 0.45);
    if (!e) return;
    let dmg = def ? this.game.items.damage(def, this.ch) : 4;
    if (h.power) dmg *= 2 * (1 + this.ch.mod('power.damage'));
    const sneak = this.player.sneaking && !e.aware;
    if (sneak) {
      const mult = this.ch.mod('sneak.melee') || 3;
      dmg *= mult;
      this.ch.useSkill('sneak', 2.5);
      this.game.notify({ type: 'log', text: `Sneak attack for ${mult}x damage` });
    }
    const stagger = h.power && (this.ch.mod('power.stagger') > 0 || Math.random() < 0.5);
    const dealt = e.hit(dmg, { stagger });
    this.audio.play(e.def.armor > 15 ? 'hitMetal' : 'hit');
    this.player.shake = Math.max(this.player.shake, 0.08);
    if (def?.skill) this.ch.useSkill(def.skill, h.power ? 1.5 : 1);
    this.lastHit = { enemy: e, t: this.time };
    return dealt;
  }

  enemyInFront(reach, cosMin) {
    this.camera.getWorldDirection(FWD);
    FWD.y = 0; FWD.normalize();
    const p = this.player.pos;
    let best = null, bd = Infinity;
    for (const e of this.enemies.list(this.realm.id)) {
      if (e.dead || !e.ready) continue;
      _v.set(e.pos.x - p.x, 0, e.pos.z - p.z);
      const d = _v.length() - e.def.radius;
      if (d > reach || Math.abs(e.pos.y - p.y) > 2.2) continue;
      if (_v.normalize().dot(FWD) < cosMin && d > 0.6) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------ block
  startBlock(side) {
    this.blocking = true;
    this.blockStart = this.time;
    this.blockSide = this.handKind('left') === 'shield' ? 'left' : 'right';
    this.viewmodel.hold(this.blockSide, 'block');
  }
  stopBlock() {
    this.blocking = false;
    this.viewmodel.release(this.blockSide ?? 'left');
  }
  bash() {
    if (!this.ch.spend('stamina', 15)) return;
    this.viewmodel.play('left', 'bash', 0.35);
    const e = this.enemyInFront(2.0, 0.4);
    if (e) { e.hit(3, { stagger: true }); this.audio.play('block'); this.ch.useSkill('block', 1); }
    this.blockStart = this.time - 1;
  }

  // ------------------------------------------------------------ bow
  loose() {
    const h = this.hands.right;
    h.action = null;
    this.viewmodel.release('right');
    this.player.zoomFov = null;
    const def = this.weaponDef('right');
    const drawTime = (def?.draw ?? 1) * (1 - this.ch.mod('archery.draw'));
    const power = Math.min(1, h.t / drawTime);
    if (power < 0.2) return;
    const ammo = this.inv.equipped.ammo;
    if (!ammo || !this.inv.has(ammo)) return;
    this.inv.remove(ammo, 1);
    if (!this.inv.has(ammo)) this.inv.equipped.ammo = this.inv.firstAmmo();
    this.audio.play('bowShot');
    const adef = this.game.items.get(ammo);
    const mesh = itemMesh(adef);
    const holder = new THREE.Group();
    mesh.rotation.x = -Math.PI / 2; // +Y -> -Z (forward)
    holder.add(mesh);
    this.camera.getWorldDirection(FWD);
    const pos = this.camera.getWorldPosition(new THREE.Vector3()).addScaledVector(FWD, 0.6).add(new THREE.Vector3(0, -0.08, 0));
    const vel = FWD.clone().multiplyScalar(26 + 34 * power);
    holder.position.copy(pos);
    this.realm.scene.add(holder);
    const sneak = this.player.sneaking;
    let dmg = (this.game.items.damage(def, this.ch) + adef.damage) * (0.35 + 0.65 * power);
    this.arrows.push({ holder, pos, vel, dmg, sneak, ammo, life: 6, from: pos.clone() });
  }

  updateArrows(dt) {
    const world = this.realm.world;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.stuck) {
        a.life -= dt;
        if (a.life <= 0) { a.holder.removeFromParent(); this.arrows.splice(i, 1); }
        continue;
      }
      const prev = a.pos.clone();
      a.vel.y -= 9.8 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.holder.position.copy(a.pos);
      a.holder.lookAt(_v.copy(a.pos).add(a.vel));
      // enemies: segment vs. a sphere at chest height
      let hit = null;
      for (const e of this.enemies.list(this.realm.id)) {
        if (e.dead || !e.ready) continue;
        const c = _v.set(e.pos.x, e.pos.y + e.def.height * 0.6, e.pos.z);
        const seg = a.pos.clone().sub(prev);
        const t = THREE.MathUtils.clamp(c.clone().sub(prev).dot(seg) / Math.max(1e-6, seg.lengthSq()), 0, 1);
        const closest = prev.clone().addScaledVector(seg, t);
        if (closest.distanceTo(c) < e.def.radius + e.def.height * 0.3) { hit = e; break; }
      }
      if (hit) {
        let dmg = a.dmg;
        if (a.sneak && !hit.aware) {
          const m = this.ch.mod('sneak.bow') || 2;
          dmg *= m;
          this.ch.useSkill('sneak', 2);
          this.game.notify({ type: 'log', text: `Sneak attack for ${m}x damage` });
        }
        hit.hit(dmg, {});
        this.audio.play('arrowHit');
        this.ch.useSkill('archery', 1 + a.from.distanceTo(a.pos) / 25);
        this.lastHit = { enemy: hit, t: this.time };
        a.holder.removeFromParent();
        this.arrows.splice(i, 1);
        continue;
      }
      const g = world.groundAt(a.pos.x, a.pos.z);
      a.life -= dt;
      if (a.pos.y <= g + 0.02 || a.life <= 0) {
        a.pos.y = Math.max(a.pos.y, g + 0.05);
        a.holder.position.copy(a.pos);
        a.stuck = true;
        a.life = 1.5;
        // half the arrows can be picked up again
        if (Math.random() < 0.5 && a.life > 0) {
          const at = [a.pos.x, g, a.pos.z];
          const d = { uid: `drop:arrow:${Date.now().toString(36)}${i}`, realm: this.realm.id, item: a.ammo, count: 1, at, rot: Math.atan2(a.vel.x, a.vel.z) };
          this.game.dropped.push(d);
          this.game.placePickup(this.realm, d);
          a.life = 0;
        }
      }
    }
  }

  // ------------------------------------------------------------ spells
  flamesOn() {
    if (this.flames) return this.flames;
    const mat = new THREE.SpriteMaterial({ map: radialTexture(), color: new THREE.Color('#ff7a2a').multiplyScalar(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const g = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Sprite(mat.clone());
      s.visible = false;
      g.add(s);
      parts.push({ s, life: 0, vel: new THREE.Vector3() });
    }
    this.flames = { g, parts, sides: new Set(), emit: 0 };
    return this.flames;
  }
  flamesOff(side) { this.flames?.sides.delete(side); }

  updateSpells(dt) {
    const ch = this.ch;
    for (const side of ['right', 'left']) {
      const h = this.hands[side];
      if (h.action !== 'cast') continue;
      const spell = this.game.spells.spells[this.inv.equipped[side]?.slice(6)];
      if (!spell) { h.action = null; continue; }
      const cost = this.game.spellCost(spell) * dt;
      if (spell.kind === 'self' && ch.cur.health >= ch.max('health')) continue;
      if (!ch.spend('magicka', cost)) {
        h.action = null; h.held = false; this.viewmodel.release(side); this.flamesOff(side);
        this.ui.hud.toast('Not enough magicka', 1200);
        continue;
      }
      if (spell.kind === 'self') {
        const amt = spell.heal * dt * (1 + ch.mod('restoration.heal'));
        ch.restore('health', amt);
        if (ch.mod('restoration.stamina')) ch.restore('stamina', amt);
        ch.useSkill('restoration', amt / 6);
        if ((this.healSound = (this.healSound ?? 0) - dt) <= 0) { this.audio.play('heal'); this.healSound = 0.4; }
      } else if (spell.kind === 'stream') {
        const f = this.flamesOn();
        if (!f.g.parent || f.g.parent !== this.realm.scene) this.realm.scene.add(f.g);
        f.sides.add(side);
        const dps = spell.damage * (1 + ch.mod('destruction.damage')) * (1 + Math.min(100, ch.skill('destruction')) / 250);
        for (const e of this.enemies.list(this.realm.id)) {
          if (e.dead || !e.ready) continue;
          const d = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
          if (d > spell.range + e.def.radius) continue;
          this.camera.getWorldDirection(FWD); FWD.y = 0; FWD.normalize();
          _v.set(e.pos.x - this.player.pos.x, 0, e.pos.z - this.player.pos.z).normalize();
          if (_v.dot(FWD) < 0.8 && d > 1.2) continue;
          const dealt = e.hit(dps * dt, { fire: true });
          ch.useSkill('destruction', dealt / 7);
          this.lastHit = { enemy: e, t: this.time };
          if (ch.mod('destruction.fear') && e.health < e.def.health * 0.2 && e.state !== 'flee') { e.state = 'flee'; e.flee = 4; }
        }
        if ((this.fireSound = (this.fireSound ?? 0) - dt) <= 0) { this.audio.play('fire', 0.6); this.fireSound = 0.25; }
      }
    }
    // flame particles from each casting hand
    const f = this.flames;
    if (!f) return;
    const cam = this.camera;
    cam.getWorldDirection(FWD);
    f.emit += dt * 60 * f.sides.size;
    for (const p of f.parts) {
      if (p.life <= 0 && f.emit >= 1 && f.sides.size) {
        f.emit -= 1;
        const side = [...f.sides][Math.floor(Math.random() * f.sides.size)];
        const off = new THREE.Vector3(side === 'right' ? 0.2 : -0.2, -0.16, -0.5).applyQuaternion(cam.quaternion);
        p.s.position.copy(cam.position).add(off);
        p.vel.copy(FWD).multiplyScalar(8 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.6));
        p.life = 0.55 + Math.random() * 0.2;
        p.max = p.life;
        p.s.visible = true;
      }
      if (p.life > 0) {
        p.life -= dt;
        p.s.position.addScaledVector(p.vel, dt);
        const k = 1 - p.life / p.max;
        p.s.scale.setScalar(0.15 + k * 1.1);
        p.s.material.opacity = Math.max(0, 0.9 * (1 - k));
        p.s.material.color.setRGB(2.4, 1.0 - k * 0.6, 0.35 - k * 0.3);
        if (p.life <= 0) p.s.visible = false;
      }
    }
    if (!f.sides.size) f.emit = 0;
  }

  // ------------------------------------------------------------ taking blows
  onStrike(enemy, dmg) {
    const ch = this.ch;
    if (ch.dead) return;
    this.camera.getWorldDirection(FWD); FWD.y = 0; FWD.normalize();
    _v.set(enemy.pos.x - this.player.pos.x, 0, enemy.pos.z - this.player.pos.z).normalize();
    const facing = _v.dot(FWD) > 0.35;
    if (this.blocking && facing) {
      const shield = this.blockSide === 'left';
      const skill = Math.min(100, ch.skill('block'));
      let red = (shield ? 0.55 + skill / 250 : 0.4 + skill / 330) + ch.mod('block.reduction');
      const timed = this.time - this.blockStart < 0.3;
      if (timed) { red = 1; enemy.hit(0, { stagger: true }); this.game.notify({ type: 'log', text: 'Perfect block' }); }
      if (!ch.spend('stamina', dmg * 0.8 * (1 - red * 0.4))) red *= 0.4;
      const blocked = dmg * Math.min(1, red);
      dmg -= blocked;
      ch.useSkill('block', 1 + blocked / 8);
      this.audio.play('block');
      this.viewmodel.play(this.blockSide, 'recoil', 0.25);
      if (dmg < 0.5) return;
    }
    dmg *= 1 - Math.min(0.8, this.game.armorRating() * 0.0035);
    ch.damage(dmg);
    this.audio.play('hurt');
    this.player.shake = 0.3;
    this.ui.hud.hurt(Math.min(1, dmg / 20));
    this.viewmodel.play('right', 'hit', 0.25);
    if (ch.dead) this.onDeath();
  }

  onDeath() {
    this.deadT = 0;
    this.player.sneaking = false;
    for (const s of ['right', 'left']) { this.hands[s] = this.handState(); this.viewmodel.release(s); }
    this.flamesOff('right'); this.flamesOff('left');
    this.ui.die();
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.time += dt;
    const ch = this.ch;
    const realmId = this.realm.id;
    // hands
    for (const side of ['right', 'left']) {
      const h = this.hands[side];
      if (h.held) h.t += dt;
      if ((h.kind === 'weapon' || h.kind === 'fist') && h.held && !h.action && h.t > 0.38) this.swing(side, true); // held long enough: power attack
      if (h.action === 'swing' || h.action === 'power') {
        h.t += h.held ? 0 : dt;
        if (!h.done && h.t >= h.hitAt) { h.done = true; this.strike(side); }
        if (h.t >= h.dur) {
          h.action = null; h.t = 0;
          if (h.queued) { h.queued = false; this.swing(side, false); }
        }
      }
      if (h.action === 'draw') this.player.speedMul = 0.55;
      if (h.action === 'zoom' && this.hands.right.action === 'draw' && ch.mod('archery.zoom')) this.player.zoomFov = 32;
    }
    if (this.hands.right.action !== 'draw') { this.player.speedMul = this.game.inventory.overweight() ? 0.35 : 1; this.player.zoomFov = null; }
    if (this.hands.left.action !== 'zoom' && this.player.zoomFov) this.player.zoomFov = null;
    this.updateSpells(dt);
    this.updateArrows(dt);

    // enemies
    const list = this.enemies.list(realmId);
    let maxDetect = 0, aware = 0, near = 0;
    const sneak = { skill: ch.skill('sneak'), mod: ch.mod('sneak.detect') };
    const ctx = {
      player: this.player, ch, sneak, dead: ch.dead,
      onStrike: (e, d) => this.onStrike(e, d),
      onAlert: () => this.ui.hud.setDetect?.(1),
    };
    for (const e of list) {
      e.update(dt, ctx);
      if (e.dead || !e.ready) continue;
      const d = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
      if (d < 40) { near++; maxDetect = Math.max(maxDetect, e.aware ? 1 : e.detect); if (e.aware) aware++; }
    }
    ch.combat = aware > 0;
    // sneaking near foes who haven't seen you trains Sneak
    if (this.player.sneaking && near && aware === 0 && Math.hypot(this.player.vel.x, this.player.vel.z) > 0.3) ch.useSkill('sneak', dt * 0.35);
    this.ui.hud.setDetect(this.player.sneaking ? maxDetect : -1);

    // enemy health bar: the last one hit (5 s), or a foe under the crosshair in a fight
    let bar = this.lastHit && this.time - this.lastHit.t < 5 ? this.lastHit.enemy : null;
    if (!bar && aware) bar = this.enemyInFront(12, 0.9);
    this.ui.hud.setEnemy(bar && !(bar.dead && this.time - this.lastHit?.t > 1.2) ? { name: bar.def.name, frac: Math.max(0, bar.health / bar.def.health) } : null);
  }
}
