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
| [grey_stone_path](https://polyhaven.com/a/grey_stone_path) | flagstone paving, walkways |
| [rock_tile_floor](https://polyhaven.com/a/rock_tile_floor) | the Green King's courtyard |
| [cobblestone_floor_08](https://polyhaven.com/a/cobblestone_floor_08) | alley cobbles |
| [rustic_stone_wall](https://polyhaven.com/a/rustic_stone_wall) | surface ruins, alley houses |
| [stony_dirt_path](https://polyhaven.com/a/stony_dirt_path) | the surface road |
| [snow_02](https://polyhaven.com/a/snow_02) | snow on the surface |
| [mossy_rock](https://polyhaven.com/a/mossy_rock) | the stone cottage, barrow, pillar |

`assets/textures/waternormals.jpg` comes from the three.js examples (MIT).

## Fonts (SIL Open Font License 1.1)

Self-hosted from Google Fonts; licences beside the files in `assets/fonts/`.

| Font | Used for |
| --- | --- |
| [Barlow Condensed](https://github.com/jpt/barlow) 300/400/500 | all UI text |
| [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) | titles, place names, journal text |

## Textures: [ambientCG](https://ambientcg.com) (CC0)

| Texture | Used for |
| --- | --- |
| [Paper001](https://ambientcg.com/view?id=Paper001) | journal parchment (`assets/ui/paper.jpg`, resized) |
| [LeafSet016](https://ambientcg.com/view?id=LeafSet016) | oak leaves, composed into a clump card (`assets/textures/oak_leaf_clump.png`, `tools/make-leaf-clump.mjs`) |
| [LeafSet019](https://ambientcg.com/view?id=LeafSet019) | fir needles, composed into a drooping bough card (`assets/textures/fir_branch.png`, `tools/make-fir-branch.mjs`) |

## Characters: [Quaternius](https://quaternius.com) (CC0)

Every person in the game is a rigged, animated model from three free CC0
packs that share one 65-bone skeleton. They were downloaded from itch.io with
`tools/fetch-itch.mjs`, then converted to GLB. Licences are beside the files in
`assets/models/humans/`.

| Pack | What is used |
| --- | --- |
| [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) | heads, eyes and brows (cut from the Superhero bodies by skin weight), Hair_Long, Hair_Beard, light skin textures |
| [Modular Character Outfits - Fantasy](https://quaternius.itch.io/modular-character-outfits-fantasy) | Ranger and Peasant outfits (male and female) as the clothed bodies |
| [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) and [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2) | 48 clips merged into `anims.glb` (meshes stripped): idle, talking, torch, spell, sitting, kneeling, sword attacks and block, shield, hits, zombie walk and scratch, death... |
| [Animal Pack Vol. 2](https://opengameart.org/content/animated-animales-low-poly) | the wolf (`assets/models/animals/Wolf.glb`, converted from FBX) |

`src/world/humans.js` assembles each figure. It grafts the head and hair onto
the outfit's skeleton and re-dyes the textures. It adds robes and cloaks as
procedural skinned meshes and attaches hats, helms, plate, staffs, swords,
torches and crowns to bones.

## Models: [Kenney](https://kenney.nl) (CC0)

Kept as their original glTF geometry and restyled at load time with Vaelmoor's
own materials (`kenney` and `lantern` builders in `src/world/props.js`).
Licences are kept beside the files.

| Kit | Models used | Folder |
| --- | --- | --- |
| [Graveyard Kit 5.0](https://kenney.nl/assets/graveyard-kit) | bench, iron-fence, gravestone-cross, gravestone-round | `assets/models/kenney-graveyard/` |
| [Fantasy Town Kit 2.0](https://kenney.nl/assets/fantasy-town-kit) | lantern (street lanterns), cart | `assets/models/kenney-town/` |

## Built procedurally (original work)

Everything else is generated in code: the sky (moons, planets, nebula), terrain (peaks, snow, trenches), road, pines, crags,
the dark spired castle, the sandstone castle, the manor, the timber house,
the storybook cottages, the dead tree and great oak, every surface ruin, tower,
cathedral, barrow and cottage, the tree houses, tents, pillar cabin and throne,
the characters' robes, cloaks, hats, helms, plate and props, the skulls (golden
skull, the keeper's skull, the horned skull), grass, water placement, mist, smoke and
fireflies.
