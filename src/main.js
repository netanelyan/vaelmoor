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

const params = new URLSearchParams(location.search);
const REGION = params.get('region') || 'gloaming';
const $ = (id) => document.getElementById(id);

async function main() {
  const canvas = $('view');
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
  const input = new Input(canvas);
  const assets = new Assets(renderer);
  assets.onProgress = (f) => { $('loading-fill').style.width = `${Math.round(f * 100)}%`; };

  const region = await (await fetch(`data/regions/${REGION}.json`)).json();

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

  // --- world
  const world = await buildWorld({ scene, assets, region, lightPool });
  const atmosphere = new Atmosphere(region);
  const player = new Player(camera, input, world);
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
  // ?quality=1.5 pins the pixel ratio (screenshots); otherwise it adapts to hold 60 fps
  const fixedRatio = params.has('quality');
  const setRatio = (pr) => { renderer.setPixelRatio(pr); resize(); };
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

  // --- UI
  const hud = { area: $('area-name'), photo: $('photo-label'), fps: $('fps') };
  let lastArea = null, areaTimer = 0;
  const showHud = !params.has('nohud');
  const startScreen = $('start');
  $('loading').classList.add('hidden');
  if (!params.has('shot')) startScreen.classList.remove('hidden');
  if (showHud) $('hud').classList.remove('hidden');
  startScreen.addEventListener('click', () => input.requestLock());
  input.on('lock', (locked) => {
    startScreen.classList.toggle('hidden', locked || !!photo.active);
  });
  canvas.addEventListener('click', () => { if (!input.locked) input.requestLock(); });

  const jump = (key) => {
    if (photo.enter(key)) {
      hud.photo.textContent = `photo mode ${key}: ${photo.active.name} (${photo.active.ref}) - move to walk from here, 0 to exit`;
      envDirty = true;
      startScreen.classList.add('hidden');
    }
  };
  input.on('keydown', (e) => {
    if (/^Digit[1-9]$/.test(e.code)) jump(e.code.slice(5));
    else if (e.code === 'Digit0') { photo.exit(); hud.photo.textContent = ''; }
  });

  // --- loop
  const timer = new THREE.Timer();
  timer.connect(document);
  let time = 0, envTimer = 0, envDirty = true, frames = 0, fpsTimer = 0;
  const camXZ = new THREE.Vector3();
  const step = (dt) => {
    time += dt;
    shared.time.value = time;
    sky.uniforms.time.value = time;

    if (photo.active && player.isMoving()) { photo.exit(); hud.photo.textContent = ''; }
    if (!photo.active) player.update(dt);

    camXZ.copy(camera.position);
    const a = atmosphere.update(camXZ.x, camXZ.z, photo.active?.area);
    applyAtmosphere(a);

    // moon light + shadow camera follow the viewer (snapped to shadow texels)
    const texel = (2 * S) / moon.shadow.mapSize.x;
    const fx = Math.round(camXZ.x / texel) * texel, fz = Math.round(camXZ.z / texel) * texel;
    const fy = world.groundAt(fx, fz);
    moon.target.position.set(fx, fy, fz);
    moon.position.copy(moon.target.position).addScaledVector(moon.userData.dir, 200);

    sky.position.copy(camera.position);
    fill.target.position.copy(camera.position);
    fill.position.set(-2, 3, 4).applyQuaternion(camera.quaternion).add(camera.position);
    world.update(dt, time, camera.position);
    lightPool.update(camera.position, time);

    envTimer -= dt;
    if (envDirty || envTimer <= 0) { refreshEnv(); envDirty = false; envTimer = 2.0; }

    if (atmosphere.dominant !== lastArea) {
      lastArea = atmosphere.dominant;
      const area = region.areas.find((x) => x.id === lastArea);
      hud.area.textContent = area?.name ?? '';
      hud.area.classList.add('show');
      areaTimer = 3.5;
    }
    if ((areaTimer -= dt) <= 0) hud.area.classList.remove('show');
  };

  window.vaelmoor = {
    ready: false, scene, camera, renderer, assets, world, atmosphere, photo, player, region,
    shot: (k) => jump(k),
    /** Advance the simulation deterministically (used by the screenshot tool). */
    advance: (seconds, fps = 30) => { for (let t = 0; t < seconds; t += 1 / fps) step(1 / fps); post.render(1 / fps, time); },
    info: () => ({ ratio: renderer.getPixelRatio(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length }),
  };

  if (params.has('shot')) jump(params.get('shot'));
  if (params.has('time')) time = parseFloat(params.get('time'));

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    renderer.info.reset();
    step(dt);
    post.render(dt, time);
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      const fps = frames / fpsTimer;
      if (showHud) hud.fps.textContent = `${Math.round(fps)} fps · ${renderer.info.render.calls} calls · ${renderer.getPixelRatio().toFixed(2)}x`;
      window.vaelmoor.fps = fps;
      frames = 0; fpsTimer = 0;
      // adaptive resolution: trade pixels for a steady 60 (never above MAX_PIXEL_RATIO)
      if (!fixedRatio) {
        const pr = renderer.getPixelRatio();
        const maxPr = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
        if (fps < 50 && pr > 0.75) setRatio(Math.max(0.75, pr - 0.1));
        else if (fps > 58.5 && pr < maxPr) setRatio(Math.min(maxPr, pr + 0.05));
      }
    }
  });
  window.vaelmoor.ready = true;
}

main().catch((e) => {
  console.error(e);
  $('loading').querySelector('.sub').textContent = `failed to load: ${e.message}`;
});
