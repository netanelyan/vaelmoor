import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { human, attachToHand } from '../world/humans.js';
import { itemMesh } from '../render/itemMesh.js';
import { stylize } from '../render/materials.js';

// Hostile creatures (data/enemies.json): wolves on the surface, Hollow Ones
// in the barrow, shades in the Gloaming. A small state machine each:
// idle (wander near home) -> noticing (a detection meter that sneaking,
// distance and view angle slow down) -> combat (chase, telegraphed attack,
// cooldown) -> flee at low health -> dead (a searchable body). Far enemies
// sleep. State that matters (dead or alive) is saved.

const _v = new THREE.Vector3();
let wolfP = null;

async function wolfModel(assets) {
  wolfP ||= assets.gltfLoader.loadAsync('assets/models/animals/Wolf.glb');
  const g = await wolfP;
  const root = SkeletonUtils.clone(g.scene);
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    // the pack's flat colours read as plastic at night: a grey-brown coat, darker below
    m.material = mats.map((x) => {
      const c = x.clone();
      const l = c.color.r * 0.3 + c.color.g * 0.59 + c.color.b * 0.11;
      c.color.set(l > 0.5 ? '#58534c' : l > 0.2 ? '#4a4540' : '#1e1c1a');
      c.roughness = 1; c.metalness = 0; c.map = null;
      return stylize(c, { rim: 0.3 });
    });
    if (m.material.length === 1) m.material = m.material[0];
  });
  const clips = new Map(g.animations.map((c) => [c.name.split('|').pop(), c]));
  // the FBX comes in at an arbitrary unit scale: size it to a real wolf (~0.85 m at the shoulder)
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true); // precise: through the bones
  const h = box.max.y - box.min.y;
  root.scale.multiplyScalar(0.95 / Math.max(1e-3, h));
  return { root, clips };
}

export class Enemy {
  constructor(id, kind, def, home, game, world) {
    Object.assign(this, { id, kind, def, game, world });
    this.home = home.clone();
    this.pos = home.clone();
    this.yaw = Math.random() * Math.PI * 2;
    this.health = def.health;
    this.state = 'idle';
    this.detect = 0;
    this.timer = Math.random() * 3;
    this.cool = 0;
    this.attack = null;   // { t, power }
    this.stagger = 0;
    this.flee = 0;
    this.wander = null;
    this.object = new THREE.Group();
    this.dead = false;
    this.ready = false;
    this.lights = [];
  }

  async build(assets) {
    const d = this.def;
    if (d.model === 'wolf') {
      const { root, clips } = await wolfModel(assets);
      root.scale.multiplyScalar(d.scale ?? 1);
      this.body = new THREE.Group();
      this.body.add(root);
      this.object.add(this.body);
      this.mixer = new THREE.AnimationMixer(root);
      this.clipMap = { idle: clips.get('Idle'), walk: clips.get('Walking'), run: clips.get('Walking'), attack: clips.get('Walking') };
    } else {
      const res = await human({ assets, groundAt: this.world.groundAt }, { ...d.look, anim: d.clips.idle, seed: Math.floor(Math.random() * 100) });
      this.res = res;
      this.body = res.object;
      this.object.add(this.body);
      this.mixer = res.mixer;
      this.mixer.stopAllAction();
      this.clipMap = Object.fromEntries(Object.entries(d.clips).map(([k, n]) => [k, res.clips.get(n)]));
      if (d.weapon) {
        const w = itemMesh(this.game.items.get(d.weapon));
        attachToHand(res.root, w, { dir: new THREE.Vector3(0, 1, 0.4) });
      }
      if (d.shade) {
        res.object.traverse((m) => {
          if (!m.isMesh || !m.material) return;
          const ms = Array.isArray(m.material) ? m.material : [m.material];
          for (const x of ms) { x.transparent = true; x.opacity = 0.82; x.depthWrite = true; }
        });
      }
      this.lights = res.lights;
    }
    this.current = null;
    this.play('idle');
    this.ready = true;
  }

  play(name, { once = false, fade = 0.2, speed = 1 } = {}) {
    const clip = this.clipMap[name];
    if (!clip) return;
    const a = this.mixer.clipAction(clip);
    if (this.current === a && !once) { a.timeScale = speed; return; }
    a.reset();
    a.timeScale = speed;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.currentName = name;
  }

  get aware() { return this.state === 'combat' || this.state === 'flee'; }

  /** The player's damage arrives here. `opts`: { stagger, sneak, fire, dir } */
  hit(amount, opts = {}) {
    if (this.dead) return 0;
    const dmg = amount * (opts.fire ? 1 : 1 - Math.min(0.6, this.def.armor * 0.006));
    this.health -= dmg;
    this.detect = 1;
    if (this.state !== 'flee') this.state = 'combat';
    if (this.health <= 0) { this.die(); return dmg; }
    if (opts.stagger || (!opts.fire && dmg > this.def.health * 0.22)) {
      this.stagger = opts.stagger ? 0.8 : 0.45;
      this.attack = null;
      this.play(this.clipMap.stagger && opts.stagger ? 'stagger' : 'hit', { once: true, fade: 0.08 });
      this.knock = 2.5;
    } else if (!opts.fire && this.clipMap.hit && !this.attack) {
      this.play('hit', { once: true, fade: 0.08 });
      this.stagger = 0.25;
    }
    if (this.def.model === 'wolf') this.flinch = 0.25;
    return dmg;
  }

  die() {
    this.dead = true;
    this.health = 0;
    this.state = 'dead';
    this.attack = null;
    if (this.def.model === 'wolf') { this.mixer.stopAllAction(); this.deathT = 0; }
    else this.play('death', { once: true, fade: 0.1 });
    this.game.onEnemyKilled?.(this);
  }

  /** Place as already dead (loading a save). */
  corpse() {
    this.dead = true;
    this.state = 'dead';
    this.health = 0;
    if (this.def.model === 'wolf') { this.body.rotation.z = Math.PI / 2; this.body.position.y = 0.35; }
    else { this.play('death', { once: true, fade: 0 }); this.mixer.update(10); }
  }

  /** Noise / visibility of the player to this enemy. */
  noticeRate(player, sneak, dist) {
    const d = this.def;
    const crouched = player.sneaking;
    const skill = Math.min(100, sneak.skill);
    let vis = crouched ? 0.45 * (1 - skill / 160) * (1 + sneak.mod) : 1;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const noise = player.events.sprinting ? 1.6 : speed > 0.5 ? (crouched ? 0.5 : 1) : 0.35;
    // view cone: behind them they only hear you
    const toP = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const facing = Math.cos(toP - this.yaw) > 0.2;
    const sightR = d.sight * vis * (facing ? 1 : 0.35);
    const hearR = d.hearing * noise * (crouched ? 0.55 * (1 + sneak.mod) : 1);
    const r = Math.max(sightR, hearR);
    if (dist > r) return -0.35;
    return (1.2 - dist / r) * 1.4;
  }

  update(dt, ctx) {
    if (!this.ready) return;
    const { player, ch } = ctx;
    const d = this.def;
    const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (dist > 120 && this.state === 'idle') { this.object.visible = dist < 220; return; } // far and calm: sleep
    this.object.visible = true;
    this.mixer.update(dt);
    if (this.dead) {
      if (this.def.model === 'wolf' && this.deathT != null && this.deathT < 1) {
        this.deathT = Math.min(1, this.deathT + dt * 2.2);
        this.body.rotation.z = (Math.PI / 2) * this.deathT * this.deathT;
        this.body.position.y = 0.35 * this.deathT;
      }
      return;
    }
    if (this.flinch > 0) { this.flinch -= dt; this.body.rotation.x = -Math.sin(this.flinch * 12) * 0.15; }
    this.cool -= dt;
    this.stagger -= dt;
    let move = 0, faceTo = null;

    // --- awareness
    if (!this.aware) {
      this.detect = Math.max(0, Math.min(1.05, this.detect + dt * this.noticeRate(player, ctx.sneak, dist)));
      if (this.detect >= 1 && !ctx.dead) {
        this.state = 'combat';
        this.game.audio?.play(d.sounds?.alert ?? 'detected', 0.8);
        ctx.onAlert?.(this);
      }
    }

    if (this.stagger > 0) {
      if (this.knock > 0) { this.stepMove(-Math.sin(this.yaw) * this.knock * dt, -Math.cos(this.yaw) * this.knock * dt); this.knock -= dt * 8; }
    } else if (this.state === 'idle') {
      // wander near home, pause, look around; turn toward a noise
      if (this.detect > 0.3) { faceTo = player.pos; }
      else {
        this.timer -= dt;
        if (!this.wander && this.timer <= 0) {
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * (d.patrol ?? 7);
          this.wander = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        if (this.wander) {
          faceTo = this.wander;
          move = d.walk;
          if (Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 0.6) { this.wander = null; this.timer = 3 + Math.random() * 5; }
        }
      }
    } else if (this.state === 'flee') {
      this.flee -= dt;
      faceTo = _v.set(this.pos.x * 2 - player.pos.x, 0, this.pos.z * 2 - player.pos.z);
      move = d.run;
      if (this.flee <= 0) this.state = 'combat';
    } else if (this.state === 'combat') {
      const homeDist = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
      if (ctx.dead || (homeDist > d.leash && dist > 12)) {
        // give up: walk home and forget
        this.state = 'idle'; this.detect = 0; this.wander = this.home.clone(); this.attack = null;
      } else if (d.fleeAt && this.health < d.health * d.fleeAt && !this.fled) {
        this.fled = true; this.state = 'flee'; this.flee = 5;
      } else if (this.attack) {
        // telegraphed strike: wind up, then the blow lands if the player is still in reach
        this.attack.t += dt;
        faceTo = player.pos;
        if (this.def.model === 'wolf') this.body.position.z = Math.sin(Math.min(1, this.attack.t / d.windup) * Math.PI) * 0.6;
        if (!this.attack.landed && this.attack.t >= d.windup) {
          this.attack.landed = true;
          const toP = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
          if (dist < d.reach * 1.25 && Math.cos(toP - this.yaw) > 0.4 && !ctx.dead) ctx.onStrike(this, this.attack.power ? d.damage * 1.8 : d.damage);
        }
        // (a perfect block may have staggered us and cancelled the attack just now)
        if (this.attack && this.attack.t >= d.windup + 0.45) { this.attack = null; this.cool = d.cooldown * (0.8 + Math.random() * 0.4); this.body.position.z = 0; }
        if (!this.attack) this.body.position.z = 0;
      } else {
        faceTo = player.pos;
        if (dist > d.reach * 0.9) move = dist > 6 ? d.run : Math.max(d.walk * 1.6, d.run * 0.6);
        else if (this.cool <= 0) {
          const power = Math.random() < 0.25;
          this.attack = { t: 0, power, landed: false };
          if (this.def.model === 'wolf') { this.game.audio?.play('growl', 0.6); this.play('run', { speed: 2.2 }); }
          else this.play(power && this.clipMap.power ? 'power' : 'attack', { once: true, fade: 0.1, speed: this.clipMap.attack.duration / (d.windup + 0.45) });
        }
      }
    }

    // --- turn and move
    if (faceTo) {
      const want = Math.atan2(faceTo.x - this.pos.x, faceTo.z - this.pos.z);
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * (this.aware ? 8 : 3));
    }
    if (move > 0 && this.stagger <= 0) this.stepMove(Math.sin(this.yaw) * move * dt, Math.cos(this.yaw) * move * dt);
    if (!this.attack && this.stagger <= 0) {
      if (move > d.walk * 1.2) this.play('run', { speed: this.def.model === 'wolf' ? move / 1.6 * 0.55 : 1 });
      else if (move > 0) this.play('walk');
      else this.play('idle');
    }
    this.object.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.object.rotation.y = this.yaw;
  }

  stepMove(dx, dz) {
    let x = this.pos.x + dx, z = this.pos.z + dz;
    [x, z] = this.world.colliders.resolve(x, z, this.def.radius);
    const g = this.world.groundAt(x, z);
    if (this.world.waterLevelAt(x, z) > g + 0.6) return;
    if (g - this.pos.y > 1.0) return; // a ledge
    this.pos.set(x, g, z);
  }
}

export class Enemies {
  constructor(data, game) {
    this.kinds = data.kinds;
    this.game = game;
    this.byRealm = new Map(); // realm id -> [Enemy]
    this.killed = new Set();
  }

  async spawnRealm(realm, assets) {
    const list = [];
    for (const s of realm.world.enemyDefs) {
      const def = { ...this.kinds[s.kind], ...(s.patrol ? { patrol: s.patrol } : {}) };
      if (!def.health) continue;
      const pos = new THREE.Vector3(s.at[0], realm.world.groundAt(s.at[0], s.at[1]), s.at[1]);
      const e = new Enemy(s.id, s.kind, def, pos, this.game, realm.world);
      e.yaw = s.rot ?? e.yaw;
      e.realm = realm.id;
      await e.build(assets);
      realm.scene.add(e.object);
      e.object.position.copy(pos);
      list.push(e);
    }
    this.byRealm.set(realm.id, list);
  }

  list(realmId) { return this.byRealm.get(realmId) ?? []; }

  toJSON() { return [...this.killed]; }
  loadState(killed, realms) {
    this.killed = new Set(killed || []);
    for (const list of this.byRealm.values()) {
      for (const e of list) {
        const realm = realms[e.realm];
        e.health = e.def.health; e.dead = false; e.state = 'idle'; e.detect = 0; e.attack = null; e.fled = false;
        e.pos.copy(e.home); e.body.rotation.set(0, 0, 0); e.body.position.set(0, 0, 0);
        if (this.killed.has(e.id)) e.corpse();
        else e.play('idle', { fade: 0 });
        e.object.position.copy(e.pos);
        realm && this.game.registerCorpse?.(e, realm, this.killed.has(e.id));
      }
    }
  }
}
