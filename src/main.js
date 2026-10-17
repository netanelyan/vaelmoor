import * as THREE from 'three';
import { HeightFog } from './render/heightFog.js';
import { createRenderer, MAX_PIXEL_RATIO } from './engine/renderer.js';
import { Assets } from './engine/assets.js';
import { Input } from './engine/input.js';
import { SkyDome } from './shaders/sky.js';
import { PostFX } from './render/post.js';
import { LightPool } from './render/lightPool.js';
import { shared } from './render/materials.js';
import { Atmosphere } from './world/atmosphere.js';
import { buildWorld } from './world/world.js';
import { roadSheen } from './world/road.js';
import { waterState } from './world/water.js';
import { Player } from './player/player.js';
import { PhotoMode } from './player/photoMode.js';
import { settings } from './game/settings.js';
import { Vitals } from './game/vitals.js';
import { QuestLog } from './game/quests.js';
import { GameUI } from './ui/ui.js';

const params = new URLSearchParams(location.search);
const REGION = params.get('region') || 'gloaming';
const $ = (id) => document.getElementById(id);

// Quality presets: max pixel ratio, shadow map size (0 = off), grass on/off.
const QUALITY = {
  low: { maxRatio: 0.75, shadow: 0, grass: false },
  medium: { maxRatio: 1.0, shadow: 1024, grass: true },
  high: { maxRatio: MAX_PIXEL_RATIO, shadow: 2048, grass: true },
};

async function main() {
  const canvas = $('view');
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.get('fov'), innerWidth / innerHeight, 0.1, 2000);
  const input = new Input(canvas);
  const assets = new Assets(renderer);
  assets.onProgress = (f) => { $('loading-fill').style.width = `${Math.round(f * 100)}%`; };

  const [region, questData, dialogues] = await Promise.all(
    [`data/regions/${REGION}.json`, 'data/quests.json', 'data/dialogue.json'].map(async (u) => (await fetch(u)).json()),
  );

  // --- sky + environment
  const sky = new SkyDome();
  scene.add(sky);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const refreshEnv = () => {
    const rt = pmrem.fromScene(envScene, 0, 0.1, 1000);
    scene.environment = rt.texture;
    envRT?.dispose();
    envRT = rt;
  };

  // --- lights
  const hemi = new THREE.HemisphereLight(0x6050a0, 0x101020, 0.6);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb0a0ff, 1.2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const S = 75;
  Object.assign(moon.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 500 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.05;
  moon.shadow.radius = 3;
  scene.add(moon, moon.target);
  // soft fill from over the viewer's shoulder so backlit figures keep their form
  const fill = new THREE.DirectionalLight(0x8090ff, 0.3);
  scene.add(fill, fill.target);
  const lightPool = new LightPool(scene, 8);

  scene.fog = new HeightFog(0x302050, 0.01, 0.05);

  // --- world + game state
  const world = await buildWorld({ scene, assets, region, lightPool });
  const atmosphere = new Atmosphere(region);
  const player = new Player(camera, input, world);
  const vitals = new Vitals();
  player.vitals = vitals;
  const quests = new QuestLog(questData);
  const spawn = region.spawn;
  player.teleport(spawn.at[0], spawn.at[1], (spawn.yaw ?? 0) * Math.PI / 180);
  const photo = new PhotoMode({ camera, player, world, region });

  const post = new PostFX(renderer, scene, camera);
  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    post.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  // ?quality=1.25 pins the pixel ratio (screenshots); otherwise it adapts to hold 60 fps
  const fixedRatio = params.has('quality');
  const setRatio = (pr) => { renderer.setPixelRatio(pr); resize(); };
  let preset = QUALITY[settings.get('quality')] || QUALITY.high;
  const grass = scene.getObjectByName('grass');
  const applyQuality = () => {
    preset = QUALITY[settings.get('quality')] || QUALITY.high;
    if (!fixedRatio) setRatio(Math.min(window.devicePixelRatio, preset.maxRatio));
    moon.castShadow = preset.shadow > 0;
    if (preset.shadow && moon.shadow.mapSize.x !== preset.shadow) {
      moon.shadow.mapSize.set(preset.shadow, preset.shadow);
      moon.shadow.map?.dispose();
      moon.shadow.map = null;
    }
    if (grass) grass.visible = preset.grass;
  };
  applyQuality();
  settings.onChange((k) => {
    if (k === 'quality') applyQuality();
    if (k === 'fov' && !photo.active) { camera.fov = settings.get('fov'); camera.updateProjectionMatrix(); }
  });
  if (fixedRatio) setRatio(Math.min(parseFloat(params.get('quality')) || 1, MAX_PIXEL_RATIO));
  resize();

  await assets.ready();

  // --- atmosphere application
  const applyAtmosphere = (a) => {
    sky.apply({ ...a.sky, fogColor: a.fog.color });
    scene.fog.color.copy(a.fog.color);
    scene.fog.density = a.fog.density;
    scene.fog.falloff = a.fog.falloff;
    hemi.color.copy(a.ambient.sky);
    hemi.groundColor.copy(a.ambient.ground);
    hemi.intensity = a.ambient.intensity;
    moon.color.copy(a.moonLight.color);
    moon.intensity = a.moonLight.intensity;
    moon.userData.dir = a.moonLight.dir || a.sky.moonDir;
    fill.color.copy(a.fill.color);
    fill.intensity = a.fill.intensity;
    shared.rimColor.value.copy(a.rim.color);
    shared.rimStrength.value = a.rim.strength;
    scene.environmentIntensity = a.env?.intensity ?? 1;
    roadSheen.value = a.road?.sheen ?? 0.8;
    if (a.water) {
      waterState.color.copy(a.water.color);
      waterState.glint.copy(a.water.glint);
      waterState.distortion = a.water.distortion;
      waterState.tint.copy(a.water.tint);
    }
    waterState.dir.copy(a.sky.moonDir);
    post.apply(a.post);
  };

  // --- UI + game flow
  const ui = new GameUI({ input, canvas, camera, player, world, region, quests, vitals, dialogues, photo });
  const hideUI = params.has('nohud');
  if (hideUI) document.getElementById('ui').style.display = 'none';
  $('loading').classList.add('ui-off');

  let envDirty = true;
  const enterPhoto = (key) => {
    if (!photo.enter(key)) return;
    ui.setState('photo');
    ui.hud.photo.textContent = `Photo mode ${key} · ${photo.active.name} · ${photo.active.ref}`;
    envDirty = true;
  };
  const leavePhoto = () => {
    photo.exit();
    ui.hud.photo.textContent = '';
    ui.setState('play');
  };
  input.on('keydown', (e) => {
    if (!['play', 'photo'].includes(ui.state)) return;
    if (/^Digit[1-9]$/.test(e.code)) enterPhoto(e.code.slice(5));
    else if (e.code === 'Digit0' && photo.active) leavePhoto();
  });

  // --- loop
  const timer = new THREE.Timer();
  timer.connect(document);
  let time = 0, envTimer = 0, frames = 0, fpsTimer = 0;
  const camXZ = new THREE.Vector3();
  const step = (dt) => {
    time += dt;
    shared.time.value = time;
    sky.uniforms.time.value = time;

    if (ui.state === 'photo' && player.isMoving()) leavePhoto();
    if (ui.playerControl) {
      player.update(dt);
      vitals.update(dt, player.events);
    }
    ui.update(dt, time);

    camXZ.copy(camera.position);
    const a = atmosphere.update(camXZ.x, camXZ.z, photo.active?.area);
    applyAtmosphere(a);

    // moon light + shadow camera follow the viewer (snapped to shadow texels)
    const texel = (2 * S) / moon.shadow.mapSize.x;
    const fx = Math.round(camXZ.x / texel) * texel, fz = Math.round(camXZ.z / texel) * texel;
    moon.target.position.set(fx, world.groundAt(fx, fz), fz);
    moon.position.copy(moon.target.position).addScaledVector(moon.userData.dir, 200);

    sky.position.copy(camera.position);
    fill.target.position.copy(camera.position);
    fill.position.set(-2, 3, 4).applyQuaternion(camera.quaternion).add(camera.position);
    world.update(dt, time, camera.position);
    lightPool.update(camera.position, time);

    envTimer -= dt;
    if (envDirty || envTimer <= 0) { refreshEnv(); envDirty = false; envTimer = 2.0; }
  };

  window.vaelmoor = {
    ready: false, scene, camera, renderer, assets, world, atmosphere, photo, player, region, ui, quests, vitals, settings,
    shot: (k) => enterPhoto(k),
    /** Advance the simulation deterministically (used by the screenshot tool). */
    advance: (seconds, fps = 30) => { for (let t = 0; t < seconds; t += 1 / fps) step(1 / fps); post.render(1 / fps, time); },
    info: () => ({ ratio: renderer.getPixelRatio(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length }),
  };

  if (params.has('shot')) enterPhoto(params.get('shot'));
  else if (params.has('play')) ui.startGame();
  else ui.showTitle();
  if (params.has('time')) time = parseFloat(params.get('time'));

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
