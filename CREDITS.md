# Credits

Every third-party asset in Vaelmoor is CC0 (public domain) or MIT. Nothing here
requires attribution, but it is given gladly.

## Code

| What | Where | License |
| --- | --- | --- |
| [three.js](https://threejs.org) r186: core, EffectComposer, UnrealBloomPass, OutputPass, ShaderPass, Water, GLTFLoader, BufferGeometryUtils | `vendor/three/` (copied by `tools/vendor-three.mjs`) | MIT (`vendor/three/LICENSE`) |

## Textures: [Poly Haven](https://polyhaven.com) (CC0)

Downloaded at 1k through the Poly Haven API, then recompressed by `tools/optimize-textures.mjs`.

| Texture | Used for |
| --- | --- |
| [cobblestone_floor_01](https://polyhaven.com/a/cobblestone_floor_01) | the road (wet, iridescent cobbles) |
| [leafy_grass](https://polyhaven.com/a/leafy_grass) | terrain ground layer |
| [rock_face](https://polyhaven.com/a/rock_face) | terrain cliffs, scattered rocks (triplanar) |
| [rock_wall_10](https://polyhaven.com/a/rock_wall_10) | crags, boulders, house foundations, chimneys |
| [castle_wall_slates](https://polyhaven.com/a/castle_wall_slates) | dark spired castle, manor chimneys |
| [large_sandstone_blocks](https://polyhaven.com/a/large_sandstone_blocks) | sandstone castle |
| [roof_slates_02](https://polyhaven.com/a/roof_slates_02) | castle spires, manor and house roofs |
| [thatch_roof_angled](https://polyhaven.com/a/thatch_roof_angled) | storybook cottage roofs |
| [plastered_wall_02](https://polyhaven.com/a/plastered_wall_02) | cottage and timber-house plaster |
| [dark_wooden_planks](https://polyhaven.com/a/dark_wooden_planks) | manor siding, timber beams |
| [bark_brown_02](https://polyhaven.com/a/bark_brown_02) | dead tree, great oak |
| [velour_velvet](https://polyhaven.com/a/velour_velvet) (normal map only) | robe fabric weave |
| [metal_plate](https://polyhaven.com/a/metal_plate) (normal + roughness) | knight armour |

`assets/textures/waternormals.jpg` comes from the three.js examples (MIT).

## Models: [Kenney](https://kenney.nl) (CC0)

Kept as their original glTF geometry and restyled at load time with Vaelmoor's
own materials (`kenney` and `lantern` builders in `src/world/props.js`).
Licences are kept beside the files.

| Kit | Models used | Folder |
| --- | --- | --- |
| [Graveyard Kit 5.0](https://kenney.nl/assets/graveyard-kit) | bench, iron-fence, gravestone-cross, gravestone-round | `assets/models/kenney-graveyard/` |
| [Fantasy Town Kit 2.0](https://kenney.nl/assets/fantasy-town-kit) | lantern (street lanterns), cart | `assets/models/kenney-town/` |

## Built procedurally (original work)

Everything else is generated in code: the sky, terrain, road, pines, crags,
the dark spired castle, the sandstone castle, the manor, the timber house,
the storybook cottages, the dead tree and great oak, all characters (wizards,
gnome, knights, skeleton, golden skull), grass, water placement, mist, smoke and
fireflies.

The CC0 character packs that were checked (Quaternius RPG / Knight, Kenney
graveyard characters) use chibi proportions, which fight the tall, robed,
PS2-era silhouettes the brief asks for. So the characters are built on a small
procedural rig instead (`src/world/characters.js`).
