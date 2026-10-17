# Vaelmoor

A first-person fantasy RPG for the browser, built with Three.js. It uses ES modules and an import map, has no build step, and can be hosted as-is on GitHub Pages.

This first milestone covers graphics only. **The Gloaming** is a hidden realm of nine walkable places, joined by one cobblestone road, in an "early-2000s fantasy RPG remembered in a dream" look. There are no quests or game systems yet.

![comparison sheet](docs/compare/sheet.jpg)

## Run it

```sh
npx serve .
```

Open the URL it prints (for example http://localhost:3000). Any static file server works; the game only needs to be served over http(s), not opened from `file://`.

## Controls

| Key | Action |
| --- | --- |
| Click | enter (locks the mouse pointer) |
| W A S D / arrows | walk |
| Mouse | look |
| Shift | sprint |
| Space | jump |
| 1 to 9 | photo mode: jump to a reference shot |
| 0 | leave photo mode |
| Esc | release the mouse |

The whole road is about 1.1 km, roughly three minutes of walking with some sprinting.

## Photo mode

Number keys 1 to 9 put the camera at the framing that matches each reference shot. Each shot's position, target and field of view live in `data/regions/gloaming.json` under `shot`. While a shot is active, the area's sky, fog and lighting are pinned to that area. Pressing any movement key drops you into normal play from that spot. `?shot=N` in the URL opens straight into a shot.

| Key | Place | Reference |
| --- | --- | --- |
| 1 | Crimsonreach Manor | ref_01 |
| 2 | The Road to Vaelmoor Keep | ref_02 |
| 3 | The Hollow Pines | ref_03 |
| 4 | The Conclave House | ref_04 / ref_05 |
| 5 | Castle Ambermere | ref_06 |
| 6 | The Pale Shore | ref_07 |
| 7 | Glasswater | ref_08 |
| 8 | Lanternholt | ref_09 |
| 9 | The Sentinel Oak | ref_10 |

URL flags: `?nohud` hides the HUD, `?quality=1.25` pins the pixel ratio (by default it adapts to hold 60 fps, capped at 1.5), and `?capture` keeps the drawing buffer for screenshots.

## How it is built

```
index.html              import map + canvas + overlays
src/main.js             bootstrap, frame loop, atmosphere -> uniforms
src/engine/             renderer, asset loading, input, noise
src/render/             post FX (bloom, ACES, grade), height fog, light pool, material helpers
src/shaders/            painterly sky dome, shared GLSL noise
src/world/              terrain, road, vegetation, grass, water, buildings, characters, particles
src/player/             first-person controller, photo mode
data/regions/*.json     the world, as data
tools/                  screenshot, perf, walk and compare-sheet scripts
```

The world is data-driven. `data/regions/gloaming.json` lists the terrain features, the road's control points and every area: its centre, palette (sky, fog, ambient, moonlight, rim, water, post grade), props, characters, lights, ground glows, fireflies, mist, scatter rules and photo-mode shot. Code builds the world from that file, so a new region is a new JSON file loaded with `?region=<name>`.

Highlights:
- **Sky:** a shader dome with domain-warped fbm clouds that self-shadow toward the moon, brush-stroke streaks, two star layers, a crescent or full moon with halo, aurora curtains and a distant mountain silhouette.
- **Blending:** every palette value blends by distance between areas.
- **Look:** HDR, then UnrealBloom, then ACES tone mapping, then a display-space grade (saturation and vibrance, S-curve, blacks sunk into a tinted deep blue or purple, split-toning, vignette, grain, slight lens fringe).
- **Height fog:** analytic exponential fog, patched into three's fog chunks so every material gets it.
- **Lights:** a moon directional light with a 2048 shadow map that follows the player, and a camera fill light. Unlimited window and lantern light anchors are served by a pool of 8 real point lights, with additive light pools on the ground.
- **Road:** `MeshPhysicalMaterial` with clearcoat, physical iridescence and a stylized per-stone thin-film sheen (orange, pink, teal).
- **Water:** three's planar-reflection `Water` with a reflection tint, so the lake keeps its own teal.
- **Vegetation:** procedural pines with two LODs in chunked instanced meshes, triplanar crags and rocks, and a single-draw-call grass field that wraps around the camera (height and density baked to textures).
- **Characters:** procedural, on a small rig with named poses, baked to one mesh per material.

## Tools

```sh
npm install                 # playwright + sharp (dev only)
node tools/shoot.mjs        # photo-mode screenshots -> docs/compare/shot_N.jpg (+ console check)
node tools/compare.mjs      # comparison sheet -> docs/compare/index.html + sheet.jpg
node tools/perf.mjs --size=1920x1080 --dpr=1.5   # fps sweep along the whole road
node tools/walk.mjs         # checks the road is walkable end to end
```

The tools run headless Chromium on the real GPU (ANGLE/D3D11); pass `--swiftshader` to `shoot.mjs` on machines without one. Drop the original reference images into `refs/` (`ref_01.png` … `ref_10.png`) and `compare.mjs` will put them side by side with the shots. Until then it shows the written brief for each one.

Assets and licences: see [CREDITS.md](CREDITS.md).
