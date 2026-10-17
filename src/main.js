import * as THREE from 'three';
import './render/heightFog.js';
import { createRenderer, MAX_PIXEL_RATIO } from './engine/renderer.js';
import { Assets } from './engine/assets.js';
import { Input } from './engine/input.js';
import { PostFX } from './render/post.js';
import { shared } from './render/materials.js';
import { Realm } from './world/realm.js';
import { blendProfiles } from './world/profiles.js';
import { Player } from './player/player.js';
import { PhotoMode } from './player/photoMode.js';
import { settings } from './game/settings.js';
import { Vitals } from './game/vitals.js';
import { QuestLog } from './game/quests.js';
import { GameUI } from './ui/ui.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const REALMS = ['surface', 'gloaming'];
const TRANSITION_SECONDS = 3.5;

// Quality presets: pixel-ratio cap, shadow map (0 = off), grass, painterly resolution and brush radius.
const QUALITY = {
  low: { maxRatio: 0.75, shadow: 0, grass: false, paintScale: 0.35, paintRadius: 3 },
  medium: { maxRatio: 1.0, shadow: 1024, grass: true, paintScale: 0.5, paintRadius: 4 },
  high: { maxRatio: MAX_PIXEL_RATIO, shadow: 2048, grass: true, paintScale: 0.5, paintRadius: 5 },
};

const fetchJSON = async (u) => (await fetch(u)).json();

async function main() {
  const canvas = $('view');
  const renderer = createRenderer(canvas);
  const camera = new THREE.PerspectiveCamera(settings.get('fov'), innerWidth / innerHeight, 0.1, 2000);
  const input = new Input(canvas);
  const assets = new Assets(renderer);
  assets.onProgress = (f) => { $('loading-fill').style.width = `${Math.round(f * 100)}%`; };

  const [questData, dialogues, ...regions] = await Promise.all(
    ['data/quests.json', 'data/dialogue.json', ...REALMS.map((r) => `data/regions/${r}.json`)].map(fetchJSON),
  );

  // --- realms (each region is its own scene)
  const realms = {};
  for (const region of regions) realms[region.id] = await Realm.create(renderer, assets, region);
  let realm = realms[params.get('region') || 'surface'] || realms.surface;

  const vitals = new Vitals();
  const player = new Player(camera, input, realm.world);
  player.vitals = vitals;
  const quests = new QuestLog(questData);
  const post = new PostFX(renderer, realm.scene, camera);

  let ui = null;
  // profile crossfade state
  const profileNow = blendProfiles(realm.profile, realm.profile, 0);
  let transition = null; // { from, fromPost, t }
  let postSnapshot = null;

  const setRealm = (next, { crossfade = false } = {}) => {
    if (next === realm) return;
    if (crossfade) transition = { from: blendProfiles(profileNow, profileNow, 0), fromPost: postSnapshot, t: 0 };
    else transition = null;
    realm = next;
    player.world = realm.world;
    post.setScene(realm.scene);
    realm.envDirty = true;
    ui?.setRealm(realm);
  };

  const spawnIn = (r) => {
    const s = r.region.spawn;
    player.teleport(s.at[0], s.at[1], ((s.yaw ?? 0) * Math.PI) / 180);
  };
  spawnIn(realm);

  const photo = new PhotoMode({ camera, player, realms: Object.values(realms), onRealm: (r) => setRealm(r) });

  // --- sizing and quality
  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    post.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  const fixedRatio = params.has('quality'); // ?quality=1.25 pins the pixel ratio (screenshots)
  const setRatio = (pr) => { renderer.setPixelRatio(pr); resize(); };
  let preset = QUALITY.high;
  const applyQuality = () => {
    preset = QUALITY[settings.get('quality')] || QUALITY.high;
    if (!fixedRatio) setRatio(Math.min(window.devicePixelRatio, preset.maxRatio));
    for (const r of Object.values(realms)) {
      r.setShadowSize(preset.shadow);
      const g = r.scene.getObjectByName('grass');
      if (g) g.visible = preset.grass;
    }
    post.painterly.setScale(preset.paintScale);
    post.maxPaintRadius = preset.paintRadius;
  };
  applyQuality();
  settings.onChange((k) => {
    if (k === 'quality') applyQuality();
    if (k === 'fov' && !photo.active) { camera.fov = settings.get('fov'); camera.updateProjectionMatrix(); }
  });
  if (fixedRatio) setRatio(Math.min(parseFloat(params.get('quality')) || 1, MAX_PIXEL_RATIO));
  resize();

  await assets.ready();

  // --- UI + game flow
  ui = new GameUI({ input, canvas, camera, player, realm, quests, vitals, dialogues, photo });
  if (params.has('nohud')) $('ui').style.display = 'none';
  $('loading').classList.add('ui-off');

  const enterPhoto = (id) => {
    if (!photo.enter(id)) return;
    transition = null;
    ui.setState('photo');
    ui.hud.photo.textContent = `Photo mode · ${photo.active.name} · ${photo.active.ref}`;
  };
  const leavePhoto = () => {
    photo.exit(settings.get('fov'));
    ui.hud.photo.textContent = '';
    ui.setState('play');
  };
  ui.onPhoto = enterPhoto;
  ui.switchRealm = (id) => setRealm(realms[id]);
  input.on('keydown', (e) => {
    if (!['play', 'photo'].includes(ui.state)) return;
    const m = /^Digit(\d)$/.exec(e.code);
    if (m) {
      const n = m[1] === '0' ? 10 : +m[1];
      if (e.shiftKey) enterPhoto(`surface:${n}`);
      else if (m[1] === '0') { if (photo.active) leavePhoto(); }
      else enterPhoto(`gloaming:${n}`);
    }
  });

  // portals: walking into one moves you to the other realm with a crossfade
  const checkPortals = () => {
    for (const p of realm.region.portals || []) {
      if (Math.hypot(player.pos.x - p.at[0], player.pos.z - p.at[1]) > (p.radius ?? 1.5)) continue;
      const [rid, pid] = p.to.split(':');
      const dest = realms[rid]?.region.portals?.find((q) => q.id === pid);
      if (!dest) continue;
      setRealm(realms[rid], { crossfade: true });
      const yaw = ((dest.exitYaw ?? 0) * Math.PI) / 180;
      const [ex, ez] = dest.exit;
      player.teleport(ex, ez, yaw, player.pitch);
      return;
    }
  };

  // --- loop
  const timer = new THREE.Timer();
  timer.connect(document);
  let time = 0, frames = 0, fpsTimer = 0;
  const step = (dt) => {
    time += dt;
    shared.time.value = time;

    if (ui.state === 'photo' && player.isMoving()) leavePhoto();
    if (ui.playerControl) {
      player.update(dt);
      vitals.update(dt, player.events);
      checkPortals();
    }
    ui.update(dt, time);
    realm.update(dt, time, camera, post, photo.active?.area);

    // render profile + post: crossfade during a realm transition
    const current = realm.atmosphere.current.post;
    if (transition) {
      transition.t += dt / TRANSITION_SECONDS;
      const w = Math.min(1, transition.t);
      const e = w * w * (3 - 2 * w);
      blendProfiles(transition.from, realm.profile, e, profileNow);
      if (transition.fromPost) post.apply(blendProfiles(transition.fromPost, current, e));
      // waking up: exposure rises out of the dark stairwell
      renderer.toneMappingExposure *= 0.15 + 0.85 * Math.min(1, w * 1.6);
      if (w >= 1) transition = null;
    } else {
      blendProfiles(realm.profile, realm.profile, 0, profileNow);
    }
    if (params.has("nopaint")) { profileNow.painterly.amount = 0; profileNow.sharpen.large = profileNow.sharpen.small = 0; }
    post.applyProfile(profileNow);
    postSnapshot = blendProfiles(current, current, 0, postSnapshot || {});
  };

  window.vaelmoor = {
    ready: false, camera, renderer, assets, realms, get realm() { return realm; }, get world() { return realm.world; },
    get scene() { return realm.scene; }, get atmosphere() { return realm.atmosphere; }, get region() { return realm.region; },
    photo, player, ui, quests, vitals, settings, post, setRealm: (id, o) => setRealm(realms[id], o),
    shot: (id) => enterPhoto(String(id).includes(':') ? id : `gloaming:${id}`),
    info: () => ({ ratio: renderer.getPixelRatio(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length }),
  };

  if (params.has('shot')) window.vaelmoor.shot(params.get('shot'));
  else if (params.has('play')) ui.startGame();
  else ui.showTitle();

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    renderer.info.reset();
    if (ui.simulating) step(dt);
    post.render(dt, time);
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      const fps = frames / fpsTimer;
      window.vaelmoor.fps = fps;
      ui.hud.setFps(settings.get('showFps'), `${Math.round(fps)} FPS · ${renderer.getPixelRatio().toFixed(2)}x · ${settings.get('quality').toUpperCase()}`);
      frames = 0; fpsTimer = 0;
      // adaptive resolution: trade pixels for a steady 60 within the preset's cap
      if (!fixedRatio && ui.simulating) {
        const pr = renderer.getPixelRatio();
        const maxPr = Math.min(window.devicePixelRatio, preset.maxRatio);
        if (fps < 50 && pr > 0.6) setRatio(Math.max(0.6, pr - 0.1));
        else if (fps > 58.5 && pr < maxPr) setRatio(Math.min(maxPr, pr + 0.05));
      }
    }
  });
  window.vaelmoor.ready = true;
}

main().catch((e) => {
  console.error(e);
  const l = $('loading');
  if (l) l.querySelector('.logo').textContent = `Failed to load: ${e.message}`;
});
