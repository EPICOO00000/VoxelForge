# Full feature reference

This is the detailed reference for every part of the VoxelForge website: the 3D
modeler, the procedural studios, the permanent Bloxd block editor, and the
project/export formats.

New to the project? Start with the [README](../README.md) for hosting on GitHub
Pages and for the [schematic splitter](SPLITTER.md).

## Projects, history, and export

- **Undo/redo:** the top bar and `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, or `Ctrl/Cmd+Shift+Z` cover adding, importing, deleting, duplicating, moving, rotating, scaling, coloring, sculpting, clearing, and advanced numeric edits. The most recent 30 scene states are retained.
- **Save project:** use **Save** or `Ctrl/Cmd+S` to download a `.shapeproject` file. It preserves object hierarchy, geometry (including sculpting), transforms, materials, colors, and imported models.
- **Open project:** use **Open** or `Ctrl/Cmd+O` to restore a `.shapeproject` file and continue editing.
- **Export 3D:** export the visible modeled scene as binary `.glb`, `.obj`, or binary `.stl`. GLB is recommended when materials and colors need to be preserved; STL is intended for geometry/3D printing, while OBJ is a broadly compatible mesh format.
- **Export to Bloxd.io:** choose **BLOXD** from Export 3D to voxelize all visible world-space triangle meshes and download a real `.bloxdschem`. Choose 0.5–12 blocks per model unit, a hollow shell or approximate solid fill, one explicit Bloxd block, or nearest-block matching from model material colors. Model X/Y/Z maps directly to Bloxd X/Y/Z, with Y remaining vertical; coordinates are normalized into nonnegative schematic space.

### Bloxd schematic conversion notes

The converter writes Bloxd's chunked binary format (32×32×32 chunks, Avro-style fields, and block-ID run-length encoding), not a renamed mesh file. The dialog estimates block bounds before conversion and reports exact dimensions, block count, and chunk count after conversion. It prevents exports over Bloxd's 160-chunk limit and stops unusually expensive conversions at 25 million triangle/voxel checks or 2,000,000 occupied blocks.

Smooth and diagonal surfaces necessarily become stair-stepped blocks. Shell mode is the best choice for openings and hollow models. Solid mode fills vertically between shell extrema and can overfill concave shapes, stacked disconnected surfaces, or intentional cavities. Material color matching uses a curated opaque Bloxd palette and does not reproduce image textures, transparency, UVs, lighting, or arbitrary shader properties.


## 3D and permanent Bloxd modes

A compact **3D / BLOXD** switch is available in the project bar. Entering Bloxd mode performs a true, permanent voxel conversion: visible world-space triangle meshes are voxelized, the original smooth scene is disposed, and the project becomes an editable block world. A confirmation dialog requires an explicit acknowledgement and offers global blocks-per-unit, shell/solid conversion, nearest-color matching, or a single selected Bloxd block. Returning to 3D view changes only the viewing workspace—the discarded smooth geometry does not return.

Bloxd projects store real game block IDs, not arbitrary colors. The searchable palette includes the complete **2,090-name/ID catalog** researched from `Souls-equal/Bloxd_Map_Editor`; renderer colors use its shared approximation system. The active block, global grid resolution, selection, clipboard, voxel history, and complete block map are maintained separately from the former mesh scene.

### Palette Texture Studio

The Bloxd editor includes a block-native texture synthesizer. Players can build a reusable palette by adding the currently active official block, adjusting each block's relative weight, removing entries, or clearing the list. They can also choose an RGB color and automatically generate 2–16 visually nearby placeable blocks, constrained to safe, natural, concrete, wool, glass/ice, wood, or colored-building families and a configurable perceptual color-distance radius.

Nine deterministic spatial patterns are available: fractal Perlin, classic Perlin, ridged multifractal, smooth value noise, cellular/Worley noise, seeded random speckle, checker, stripes, and axis-aligned gradient. Controls include seed, feature size, octave count, contrast, bias, inversion, and XYZ axis. Patterns can affect the current selection, only its exposed surface, the entire exposed world surface, or every block. An optional filter changes only occurrences of the currently active block ID.

The Texture block brush applies the same composed palette and noise field locally with the normal 0–8 block brush radius, including click-and-drag painting. Since sampling uses absolute integer block coordinates, brush strokes join seamlessly and regenerating with the same seed is deterministic. Palette weights, noise settings, and generated palettes are stored in project files and autosaves. Every application creates one voxel-history state and works directly on official IDs—there is no image material or mesh conversion stage.

### Advanced procedural controls and role materials

When a permanent Bloxd world opens the procedural generator, an **Advanced native Bloxd controls** section appears for every generator family. It exposes each algorithm-specific parameter rather than only Size, Height, Detail, Density, and Variation. Examples include terrain noise scales and octaves, canyon gorge width and terraces, tunnel turns/radius/branching, city cells/roads/building heights/windows, tower taper/tiers/supports, castle walls/towers/keep/gate, coral recursion, crystal dimensions, rock distributions, maze cells/walls/braiding, pipe walkers and segments, fractal recursion, and station rings/spokes/modules. The native Bloxd tree and village generators are intentionally removed; smooth mode retains its original tree, village, forest, and civilization systems.

A complete layer JSON page exposes every stored property for users who need exact values. Applying JSON validates the layer type, merges defaults, reloads friendly controls, and refreshes the native block preview.

Every generator also exposes semantic material roles, such as terrain surface/subsurface/rock, beach, water, snow, trunks, leaves, roads, windows, walls, masonry, supports, and accents. The material page begins with a three-step explanation, shows the role's normal block with a colored swatch, and continuously displays a plain-language result such as **Terrain surface → choose among 5 palette blocks using Fractal Perlin noise**. Each role can independently use:

1. The generator's normal official block.
2. One exact official block selected by name or ID.
3. A weighted block palette sampled with fractal Perlin, Perlin, ridged, value, cellular, random, checker, stripe, or gradient noise.

The one-block mode includes a searchable official-block field and a **Use active editor block** shortcut. Palette mode is presented as two explicit steps: first build/capture the palette, then choose its distribution noise. Palette entries show block names, colors, editable weights, and remove buttons. Players can add the active block, capture the current Palette Texture Studio palette, or generate six nearby official blocks from the layer's primary/accent RGB. Every role has an independent noise seed and feature size. Toolbar actions can reset every role to its original blocks or assign the editor palette to every visible role at once. These rules are stored inside each composition layer, survive presets/project save/load, appear in native previews, and are resolved directly while block coordinates are generated.

### Chunked world engine

The block renderer is partitioned into configurable 8³, 16³, or 32³ chunks, with 16³ as the default. `set` and `delete` operations mark only affected chunks dirty; the next render disposes and rebuilds those chunk batches without touching unrelated chunk groups. The sparse block map maintains a chunk index, chunk-level visual groups, per-ID instancing inside each chunk, and a flattened picking list. Undo/redo, loading, external bulk writes, hidden groups, and world-clearing detect stale indices and safely request a full index rebuild. Worlds above the display ceiling use chunked exposed-surface LOD instead of arbitrary insertion-order truncation. The Statistics panel reports chunk count, chunk dimensions, and active render mode.

### Terrain and biome painter

The block-native terrain studio provides 13 direct operations: raise, lower, flatten, smooth, erode, terrace, river, road, cliff, beach, biome layering, vegetation, and snow. Brushes support radius, strength/height, smooth/linear/hard falloff, material depth, seed, vegetation density, water, and six biome presets: tropical, temperate, arid, alpine, volcanic, and alien. A stroke keeps one flattening plane, regenerates only dirty chunks, and creates one voxel-history state when released.

Biome painting updates coordinated surface, subsurface, stone, beach, road, water, snow, trunk, and leaf roles rather than changing only the top block. Terrain surfaces can capture the weighted Palette Texture Studio palette and distribute it with deterministic noise.

### Procedural asset scattering

The asset library can populate an existing block world without converting through meshes. Five terrain-aware rules are available: trees respond to normalized altitude and nearby water moisture, rocks favor slopes, houses stay near saved road paths, docks seek water edges, and ruins use seeded regional noise. Every run supports a maximum count, density, minimum spacing, altitude/moisture/slope limits, biome-aware catalog subsets, deterministic seeds, random quarter-turn rotation, mirroring, and custom weighted collections such as `tree001:3, tree025:1`.

Each schematic is loaded lazily, aligned at the terrain surface, transformed as official blocks, and rejected if any asset voxel collides with the world or an asset placed earlier in the same run. The entire accepted scatter is committed as one undo state, and its settings persist with the voxel world.

### Roads, rivers, and live spline paths

The Paths tool stores editable procedural objects directly in the Bloxd world. Start a path and click terrain to add control points; the road or bridge is rebuilt immediately after the second point, and every later point updates it live. Shift-click relocates the nearest point. Roads flatten their complete cross-section, remove blocking terrain, fill gaps with structural material, and apply the visible road surface. Bridges default to a raised deck and generate edge rails plus terrain-reaching supports. Catmull–Rom sampling creates a smooth curve, while width, elevation offset, height/depth, smoothness, terrain conformance, seed, and role palettes remain editable. Surface roles can use the weighted Texture Studio palette, with separate edge and fill/water block roles.

Live path types include roads, rivers, walls, bridges with supports, carved tunnels, hollow pipes, and fences with posts and rails. Rebuilding restores the blocks below the previous result, regenerates all overlapping live paths in layer order, and creates a history state. Paths, control points, settings, generated-key ownership, and restoration data persist in project saves; selecting a saved path restores its controls for later rebuilding or deletion.

### Placeable Bloxd asset library

Bloxd mode includes the **922-asset** schematic library from `Souls-equal/Bloxd_Map_Editor` V6.4.1: 315 houses, 217 trees, 385 rocks, and 5 stands. The library provides search, category, favorites and recent filtering, pagination, exact block/dimension metadata, lazy on-demand loading, Y rotation, X/Z mirroring, optional auto-foundations, and click-to-place behavior. It also imports arbitrary local `.bloxdschem` files as custom placement assets.

Selecting an asset creates a translucent, block-accurate placement ghost that follows voxel surfaces (or the ground plane in an empty world). Collision cells are colored separately and summarized live. Bottom-center, bottom-corner, center, and top-center anchors are available; the mouse wheel adjusts vertical offset before placement. Merge, air-only, replace-volume, and subtract paste modes support construction as well as carving.

Assets are decoded directly to official-ID sparse block maps and merged into the voxel world; no mesh or voxelization stage is involved. Placement creates one voxel undo state and selects the newly placed asset blocks. The local decoder and asset-browser behavior follow the linked Apache-2.0 reference implementation; attribution and redistribution details are recorded in `THIRD_PARTY_NOTICES.md`.

### 2D Bloxd island generation map and 40 biomes

Bloxd island generation includes an interactive 512×512 planning map. Players can outline polygonal biome zones, draw roads, rivers, and raised bridges with control points, paint raise/lower/flatten terrain operations, erase features, and undo or clear the plan before generating. Map plans stay live in the procedural layer, participate in preview generation, and persist in recipes and presets.

The map and overall-biome selector expose 40 built-in biome definitions, including temperate, tropical, savanna, several deserts and forests, alpine/tundra/glacier regions, swamps and coasts, volcanic/ash/lava terrain, crystal and alien regions, fungal and coral zones, badlands, mesas, oases, enchanted terrain, and more. The overall biome defaults to **Procedural biome mix (automatic)**: unselected map areas generate their own biomes procedurally using temperature, moisture, elevation, and rarity noise, so the generator invents believable varied biomes on its own; picking a specific biome forces it only when no zones are drawn. Every polygon changes surface, subsurface, foundation, beach, snow, and water roles in the resulting direct-block island.

Each biome has its own terrain function — dunes, terraced mesas and badlands, ridged alpine and crystal spires, low mangrove/swamp/marsh flats, volcanic cones with craters, oasis basins, plateau steps, and more — and the planner canvas previews the automatic biome layout live before generating. Selected zones blend smoothly into the surrounding automatic terrain across a transition band, so a mountain beside a mangrove rises gradually instead of forming a hard cliff. Map-authored rivers descend along the graded terrain and fill with water, roads flatten and fill their complete smoothed cross-section, and bridges build raised decks with rails and terrain-reaching supports.

**Fast texturing** is a single toggle whose palettes are deliberately locked. It applies independent five-octave Fractal Perlin sampling to grass, soil, stone, sand, snow, water, road, primary, and secondary layers using preselected official Bloxd blocks, and every biome family (cold, dry, volcanic, fantasy, temperate) receives its own curated palette set. User material rules remain available when Fast texturing is off, but cannot override its curated palettes while it is on.

The native island generator no longer emits procedural trees, houses, settlements, or villages. Manual asset placement and the separate optional scattering studio remain available.

### Native Bloxd procedural engine

Bloxd mode has a separate procedural engine in `assets/js/bloxd-procedural-generators.js`. It shares only mathematical ideas such as seeded random numbers, interpolated noise, recursive growth, and parametric placement; it does **not** call the smooth `ProceduralGenerators.generate`, `IslandWorldSystem.generate`, Three.js geometry constructors, mesh traversal, or `BloxdSchematic.voxelizeObject`.

The native engine writes directly to a sparse `Map<"x,y,z", officialBlockId>`. Its primitive writer provides block boxes, hollow shells, spheres, ellipsoids, cylinders, lines, rings, and cones. Its 14 Bloxd-native families are terrain, island, canyon, tunnel, city, tower, castle, coral, crystals, rocks, maze, pipes, fractal, and orbital station. Layer scattering, ring/grid/random compositions, seed determinism, XYZ placement, integer-grid rotation, scaling, 40-biome map materials, island water, rivers, map-authored roads and bridges, reefs, rock outcrops, and safety limits are handled before blocks merge into the editable world.

The preview is native too: it generates a performance-limited block map and displays instanced block cubes. Full generation reports direct block count, instance count, elapsed milliseconds, and limit clipping. The 3D-mode procedural engine remains unchanged and is used only for ordinary smooth projects.

Island rivers use bounded shallow channel carving. A river can lower a terrain column by only a depth derived from the River Depth control, never replace an interior mountain column with a sea-level sand column. River beds use stone away from beaches and optionally receive a water-block surface one block above the bed. This prevents the long black/sand fissures produced by the earlier zero-height carving rule.

The editor renders complete worlds up to 750,000 blocks, covering large worlds such as the 313,356-block example without insertion-order gaps. Above that threshold it first extracts and renders exposed surface blocks instead of truncating arbitrary internal and external blocks together; the block counter explicitly reports when exposed-surface display fallback is active.

### Improved color conversion

Material matching now uses perceptual CIE Lab color distance instead of raw RGB distance. Saturated colors receive semantic hue protection so, for example, a strongly red surface prefers Red Concrete instead of a numerically nearby Orange Concrete. Unsafe inventory items, weapons, projectiles, spawn orbs, charging states, metadata variants, and foods are excluded from automatic placement palettes.

Conversion evaluates the material assigned to each triangle group rather than only the first material on a mesh. It multiplies base material color by averaged vertex colors, which preserves procedural terrain elevation palettes, and can sample imported/uploaded texture images. Transparent materials automatically prefer glass and ice families. Optional deterministic dithering alternates between the two closest blocks without changing between project sessions.

Palette filters include safe placeable blocks, natural terrain, concrete, wool, glass/ice, wood, and colored building materials. These controls are available in both permanent-mode conversion and ordinary `.bloxdschem` export.

### Dedicated block editor

Bloxd mode replaces mesh-oriented controls with block-native operations:

- **Place, remove, paint, and eyedropper** for individual blocks.
- **Filled box, hollow box, line, and connected flood fill** using two-click anchors where applicable.
- **Box selection and connected same-type selection**, with Shift for additive selection.
- **Copy, cut, paste, and delete**, retaining every source block ID.
- **Six-axis nudging**, 90-degree X/Y/Z rotation, and X/Y/Z mirroring.
- **Global or selected-region block replacement** using the active official block.
- Independent **24-state block undo/redo** and autosave-aware project persistence.
- Block counts, type counts, selected counts, dimensions, grid resolution, and history statistics.

The mode renderer batches equal block IDs into instanced cube meshes and displays a one-block world grid plus wireframe selected-block overlays. Left-click performs the active block operation while right-drag preserves camera orbit. Shortcuts `1`–`8` select common block tools; Ctrl/Cmd+C/X/V controls the block clipboard, Delete removes selected blocks, and Escape clears anchors and selection.

Every main editor entry point has a dedicated block-native behavior in Bloxd mode; none of the left-toolbar tools is disabled:

- **Select** toggles individual blocks; **Box Select** selects a two-corner block region.
- **Move** uses source/destination block anchors and also exposes six-axis integer nudging.
- **Rotate** applies exact 90° voxel rotations; **Scale** opens a discrete nearest-neighbor block resampler with independent XYZ factors.
- **Sculpt** provides draggable spherical inflate, deflate, surface-smooth, and flatten brushes with a 1–8-block radius and voxel undo.
- **Edit** maps vertex mode to individual-block paint, edge mode to block lines, and face mode to region selection plus integer extrusion.
- **Measure** performs exact block distance and angle measurements and reports world or selection dimensions.
- **Add Shape** and imported GLB/glTF/OBJ/STL files voxelize directly into the current world.
- **Duplicate** copies the selection and activates position-based paste; **Color** selects a real official block ID; **Delete** removes selected unlocked blocks.
- **Reset View** and **Fit All** remain camera-aware for the voxel bounds.
- **Array** supports both linear and radial block arrays through the existing array dialog.
- **Procedural Generators** use the separate native Bloxd engine to write official block IDs directly into the sparse world; no smooth generator or mesh voxelizer is invoked.
- **Hierarchy** supports persistent named block groups, parenting, unparenting, renaming, locking, hiding/showing, deletion, and block-type browsing.
- **Materials & Textures** maps colors and uploaded texture averages to the nearest safe official block, paints selections, and picks their dominant block ID.
- **Modifiers & Booleans** provides block hollow, dilate, erode, material smoothing, ×2 subdivision, XYZ mirror, and clipboard-based union/difference/intersection.
- **Statistics** reports block-native counts and dimensions.
- **Advanced Editor** becomes a complete block selection inspector with numeric XYZ move, discrete XYZ scale, rotation, mirroring, duplicate, delete, and clear-world controls.

The equivalent keyboard commands are adapted too: Q, X, G, R, S, B, E, M, N, P, D, Delete, Escape, 1–8, Ctrl/Cmd+C/X/V, and project undo/redo/save shortcuts all route to voxel behavior while Bloxd mode is active.

### Exporting builds above the 160-chunk limit

Bloxd refuses a schematic above 160 chunks. Two paths handle that:

- **Inside the block editor**, `.bloxdschem` export still enforces the limit and
  explains how many chunks the world needs.
- **The schematic splitter** (top bar ✂ Splitter) has a **Chunk limiter** mode
  that cuts any `.bloxdschem` — imported from Bloxd, the editor, or another
  tool — into the fewest parts that each stay at or below 160 chunks. Parts keep
  their position in the name (`map_part002_x336_z0.bloxdschem`), so a ZIP of
  parts can be re-imported and merged back, or loaded part by part in game at
  the coordinates listed in `GUIDE_IMPORTATION.txt`. See [SPLITTER.md](SPLITTER.md).

### Bloxd-mode projects and export

Project save/load and crash recovery serialize the full block map and restore permanent Bloxd mode. `.bloxdschem` export writes the block map directly without voxelizing it again, preserving exact IDs. GLB keeps instanced block batches; OBJ and STL expand manageable worlds into ordinary cube meshes. The schematic encoder still enforces Bloxd's 160-chunk limit.

## Procedural generation studio

Open **Procedural generators** from the left toolbar (`P`) to create deterministic, parameter-driven geometry. The studio includes **16 generator families** in five categories:

- **Worlds:** mountain terrain, the advanced Island World Studio, canyon landscapes, and organic tunnels.
- **Architecture:** city districts, parametric towers, fortified castles, and villages.
- **Organic:** recursive trees, coral colonies, crystal clusters, and rock formations.
- **Systems:** perfect mazes and connected industrial pipe networks.
- **Abstract:** Sierpiński structures and orbital ring stations.

Every generator supports a reusable seed, overall size, height, detail, density, variation, primary/accent colors, and Draft/Balanced/Detailed quality presets. The same recipe always produces deterministic geometry. The studio includes a rotating **live WebGL preview** that uses capped preview quality so even detailed recipes remain responsive.

The procedural composer supports up to **8 editable layers** in one selectable object. Each layer can use a different generator and has its own scale, vertical offset, rotation, and seed. Layers can create one object or scatter up to 25 seeded instances in random, ring, or grid distributions. Full compositions are limited to 80 instances for safety. Layer tabs allow adding, duplicating, switching, and removing layers without losing the other recipes.

Four mutation controls explore deterministic seed variants while preserving the other parameters. Complete multi-layer recipes can be named and saved in browser storage, reloaded later, or deleted from the preset library. Select a generated composition and reopen the studio to regenerate it in place while preserving its scene transform and hierarchy. Choose **Bake selected to mesh** to remove all procedural recipes and keep ordinary editable geometry.

Visual generation includes vertex-colored terrain elevation bands, richer city façades, detailed village houses, rooted recursive trees, deformed boulders, and the existing family-specific structures and growth systems. Preview generation caps density and instance counts independently from the full-quality result.

### Island World Studio

Selecting **Island World Studio** reveals a dedicated world-building interface with five complete starting presets—Tropical, Volcanic, Atoll, Alpine, and Alien—plus a randomized **Surprise me** world. It goes beyond a displaced plane and builds a complete deterministic island scene:

- **Landmass:** natural island, archipelago, volcano, atoll, or cliff formation; 1–9 islands; independent 24–112 terrain resolution; domain-warped coastline roughness; mountain strength; peak sharpness; terracing; erosion channels; and volcanic crater depth.
- **Hydrology:** customizable beaches and ocean depth, optional transparent ocean surface with custom color, 0–10 terrain-carved rivers, river depth, and shallow coastal reef density.
- **Climate:** tropical, temperate, arid, alpine, or alien elevation palettes; moisture, temperature, and snow-line controls.
- **Ecosystem and habitation:** deterministic vegetation, roots/canopies, rock outcrops, reef structures, and coastal settlements with separate density controls.
- **Terrain rendering:** per-vertex biome colors respond to elevation and slope, including seabed, beach, lowland, highland, exposed rock, and climate-dependent snow. Terrain extends below sea level to a closed seabed base.

Every island setting is retained in live recipes, composition layers, saved presets, duplication, undo/redo, and project files. Islands can be combined with other procedural layers, scattered into island chains, baked for manual editing, exported as regular 3D geometry, or voxelized for Bloxd. Preview mode independently caps island resolution and ecosystem density while final generation uses the requested full quality.

#### Massive-world engine

The dedicated `island-world-system.js` engine supports a **1×–100× world scale**. At the maximum base size, terrain can span 2,400 model units. It divides terrain into 1×1 through 16×16 chunks, each with 8–48 vertices per edge. Optional Three.js LOD objects retain a full-detail mesh and a reduced distant mesh per chunk, with configurable switching distance. A 16×16 world at 48 vertices per chunk contains more than 600,000 high-detail terrain vertices while remaining cullable as separate chunks.

The live preview independently caps chunk count, chunk resolution, houses, and settlements. Final generation uses the requested values. Full exports automatically select high-detail terrain and expand instanced ecosystem meshes so GLB, OBJ, STL, and Bloxd conversion receive the complete visible world instead of a single representative tree. Baking similarly expands instances and removes LOD wrappers for normal mesh editing.

#### Realistic ecosystem engine

The ecosystem system includes oak, pine, palm, birch, cedar, acacia, mangrove, deadwood, and biome-aware mixed forests. Five forest presets provide Old Growth, Dense Jungle, Fruit Orchard, Haunted Forest, and Giant Fantasy starting points.

Tree controls cover maximum population, clustering, overall scale, age/maturity, trunk taper, trunk twist, 1–5 recursive branch levels, branch spread, branch droop, root spread, canopy fullness, 1–9 canopy clusters, leaf-cluster scale, per-instance color variation, season, fruit/blossom density, hanging vines, fallen logs, stumps, dead-tree ratio, giant-tree probability, and giant-tree scale.

Every tree now combines tapered trunks, first-order radial limbs, recursive secondary/tertiary branches, surface and buttress roots, optional canopy clusters, branch-attached leaf cards, optional fruit or blossoms, and optional hanging vines. Forest-floor generation adds fallen logs and weathered stumps. Dead trees retain roots and branching but lose foliage. Giant-tree mutations can independently scale rare trees up to 8×.

#### Branch-attached textured foliage spheres

Leaves are generated only after the recursive branch skeleton has produced terminal branch positions. Each terminal point now receives a configurable rosette of **1–32 small textured foliage spheres**, with a higher default count and substantially larger minimum size. Foliage therefore follows the generated branches instead of relying on one unrelated canopy sphere. Up to 300,000 terminal foliage instances are supported.

The spherical foliage texture is created in-browser with radial shading, mottled leaf detail, curved vein bands, seasonal coloration, and per-instance color variation. Round, oval, pointed, and serrated volume proportions are available. A **Leaf volume** control can switch from the new textured spheres back to circular textured cards when a flatter stylized result is preferred.

Controls cover leaf rendering mode, volume type, shape, leaves per branch tip, size, opacity, vein strength, orientation jitter, and texture enablement. Rendering modes are **textured leaf spheres**, **leaf spheres plus canopy clusters**, **canopy clusters only**, and **bare branches**. Disabling procedural texture retains small geometric spheres with a plain material; bare mode produces no terminal foliage batch.

Summer, spring blossom, autumn, winter, and fantasy seasons apply distinct per-instance leaf and canopy colors. Fantasy vegetation can use emissive fruit, while orchard settings maximize fruit-bearing clusters. These features use separate instanced batches, so thousands of complex trees remain practical without creating one draw call per branch or leaf cluster. The explicit stable species catalog contains 520 profiles covering trunk width, crown proportions, lift, branching bias, trunk color, and leaf color.

#### Civilization engine

Biome-aware cultures include tropical, medieval, alpine, desert, and alien architecture. Controls cover settlement count, houses per settlement, 1–5 stories, roof pitch, roads, farms, docks, defenses, and ruins. Houses contain separate multi-story walls, culture-specific roofs, window rows, doors, contrasting trim, and optional chimneys. Settlements are placed on buildable coastal lowlands, connected with curved road geometry, and supplemented with terraced farms, harbor planks, defense towers, and scattered ancient ruins. The stable architecture catalog includes 180 house profiles with cultural materials, roof geometry, windows, porches, and ornament values.

The dedicated island subsystem currently contains more than **7,700 lines** of island-only engine and stable profile code. The profile catalogs are explicit rather than random at runtime, so a saved seed and recipe continue to produce the same species and architectural variants across sessions.

Live procedural metadata is preserved by project save/load, autosave, duplication, undo/redo, and hierarchy operations. Generated geometry works with transforms, materials, sculpting, component editing, arrays, measurements, GLB/OBJ/STL export, and Bloxd voxel conversion. Manual vertex/sculpt/material changes are replaced when a live composition is regenerated, so bake first when those edits should become final.

## Advanced modeling tools

- **Objects & hierarchy:** open the hierarchy from the left toolbar. Click an object to select it, or Ctrl/Cmd-click for multi-selection. Objects can be grouped, ungrouped, parented to the active object, and unparented. Parent transforms move their children, and hierarchy is preserved in projects, undo/redo, and GLB export.
- **Vertex / edge / face editing:** press `E`, choose a component mode, click a mesh component, and drag the XYZ gizmo. Geometry changes are undoable and remain intact when saving or exporting.
- **Array tool:** select an object and open Array from the toolbar. Create 2–50 copies in a configurable linear XYZ array or a radial X/Y/Z array.
- **Measurements:** press `M` for object dimensions, point-to-point distances, and three-point angles. Measurement overlays are editor helpers and are intentionally excluded from project geometry and 3D exports.


## Extended feature suite

- **Object properties:** rename objects, lock them against transforms/editing, and toggle visibility from the hierarchy.
- **Autosave and crash recovery:** scene-changing actions are saved to browser storage after a short delay. A recovery prompt appears when a previous session is available.
- **Face extrusion:** in Edit mode, switch to Face, select a triangle, choose an amount, and extrude it into new geometry.
- **Mirror:** duplicate and mirror selected geometry across local X, Y, or Z.
- **Subdivision:** split every triangle into four triangles, with one or two levels per operation.
- **Materials and textures:** edit base color, metalness, roughness, opacity, wireframe state, and upload or remove PNG/JPEG/WebP textures.
- **Boolean modeling:** Union, Difference, and Intersection are available for two selected, overlapping solid mesh objects. For Difference, the active/last-selected object is the base.
- **Orthographic views:** Perspective, Front, Right, and Top view buttons are available above the canvas.
- **Box selection:** press `X` and drag a rectangle over object centers; Ctrl/Cmd-drag adds to the selection.
- **Project statistics:** inspect object, group, mesh, vertex, triangle, material, selected, hidden, and locked counts.

### Sculpting and component-editing improvements

Sculpting now welds coincident vertices while applying a brush. This prevents the separate sides of cubes—and UV seams on spheres—from pulling apart. Vertex and edge editing also expands selection across coincident seam vertices, while clearer highlights and face extrusion make Edit mode more predictable.

## Controls

- Use **Add shape** or `N` to open the searchable library of 82 forms across seven categories.
- The same Add Shape window can import local `.glb`, `.gltf`, `.obj`, and `.stl` models. For a glTF model with separate resources, select its `.gltf`, `.bin`, and texture files together. GLB is the simplest recommended format.
- Imported models are centered and resized automatically, and remain local in your browser—they are not uploaded anywhere.
- Every built-in or imported form supports selection, movement, rotation, scaling, sculpting, component editing, grouping/parenting, arrays, measurement, coloring, duplication, deletion, and numeric editing.
- Use the left toolbar to select, move, rotate, and scale shapes directly with an on-canvas gizmo.
- **Sculpt** (`B`) provides Inflate, Deflate, Smooth, and Flatten brushes with adjustable radius and strength. Left-drag sculpts; right-drag continues to orbit. Sculpt strokes can be undone with the panel button or `Ctrl/Cmd+Z`.
- The **Advanced editor** button at the bottom of the toolbar opens the numeric editor on the right.
- Left-drag or right-drag on empty canvas space orbits the camera; the mouse wheel zooms.
- A stationary left-click selects a shape.
- Shortcuts: `Q` select, `X` box select, `G` move, `R` rotate, `S` scale, `B` sculpt, `E` edit vertices/edges/faces, `M` measure, `N` open the shape library, `P` open procedural generators, `D` duplicate, `Delete` remove, and `Escape` deselect.
- Three.js r128, TransformControls, loaders, exporters, and the CSG engine are bundled locally, so the editor does not require a CDN connection.

## Format research and attribution

The `.bloxdschem` implementation was developed from format behavior documented and implemented by [Souls-equal/Bloxd_Map_Editor](https://github.com/Souls-equal/Bloxd_Map_Editor), licensed under Apache License 2.0. The upstream application is not bundled. See `THIRD_PARTY_NOTICES.md` and `licenses/Bloxd_Map_Editor-LICENSE.txt`. Bloxd.io is a third-party game; this independent modeler is not affiliated with Bloxd.io.
