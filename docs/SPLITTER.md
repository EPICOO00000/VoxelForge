# Bloxd schematic splitter

The splitter is a full-screen workspace opened with **✂ Splitter** in the top
project bar. It has two modes:

| Mode | Purpose |
| --- | --- |
| **Separate objects** | One `.bloxdschem` containing several buildings, trees, or props becomes one file per object. |
| **Chunk limiter** | One build above Bloxd's **160-chunk** limit is cut into several parts that you load side by side, so builds of any size can be exported. |

Both modes use the same preview, selection, and ZIP export pipeline.

- Core logic: `assets/js/bloxd-schematic-splitter.js` (DOM-free, also loaded by the tests)
- UI and 3D preview: `assets/js/bloxd-splitter-ui.js`
- Styles: `assets/css/bloxd-splitter.css`

Nothing is uploaded; files are decoded and re-encoded in the browser.

---

## Where it runs

The same core powers two entry points:

- **Export 3D → BLOXD** in the editor: when the model needs more than the limit,
  the dialog offers *Split automatically above the limit* and downloads a ZIP of
  parts (plus guide and manifest) instead of refusing. This also covers exports
  of a permanent Bloxd world.
- **✂ Splitter workspace**: dedicated, full-screen, works on imported
  `.bloxdschem` files with preview, selection, merging, and both modes.

`BloxdSchemSplitter.encodeVoxelMapForBloxd(voxelMap, { name, maxChunks, allowSplit })`
is the shared exporter used by the dialog; it returns `{ mode: 'single' }` or
`{ mode: 'split', files, zip, parts, plan }` and never throws for size reasons
(`allowSplit: false` returns `mode: 'single'` with `overLimit: true` so the caller
can propose splitting).

## Workflow

```
.bloxdschem file(s)
      │  parse (32³ chunks, Avro header, RLE block runs)
      ▼
 normalized voxel map
      │
      ├── Chunk limiter mode ──► tile into <=160-chunk parts
      │                          (X/Z grid, Y too when the build is taller)
      │
      └── Objects mode ─────────► remove platforms (optional)
                                 ► detect units (columns / clusters)
                                 ► merge fragments (optional)
                                 ► split any oversized unit into parts
      │
      ▼
 re-encode ──► .bloxdschem per file + manifest.json + GUIDE_IMPORTATION.txt (ZIP)
```

The preview is rebuilt after every detection change. Clicking a block in the
preview selects its unit; clicking the same unit again clears the selection.

### Importing several files

- If **every** file name carries a world offset (`name_x123_z-45.bloxdschem` or
  `name-x123-z-45.bloxdschem`), those offsets are honoured.
- Otherwise files are laid out side by side along **X** with a gap of 4 blocks so
  they cannot overwrite each other. Detection then still separates them.

---

## Detection rules

The behaviour follows the upstream **Bloxd Map Editor** splitter (V6.4.1,
Apache-2.0) with the UI rebuilt for VoxelForge.

### 1. Ground platform removal

For the bottom four layers of the model, each layer is split into
8-connected `(x, z)` regions. A region is deleted as a platform when:

- it spans at least **3 × 3** cells, and
- it fills at least **60 %** of its own bounding box.

This removes map floors and large flat bases without eating narrow walls. It is
a heuristic: a solid 3 × 3 tower base in those four layers is also removed, so
the option can be disabled. As a safeguard, the splitter never lets this step
delete an entire schematic — a flat prop such as a rock keeps all of its blocks
and is simply returned as one unit.

### 2. Column mode (default)

All blocks are grouped by their `(x, z)` column. Columns are connected with
8-neighbour adjacency in the XZ plane; each connected group of columns becomes
one unit and **every block of those columns belongs to it, regardless of Y**.

Consequences:

- a trunk always stays with its canopy,
- a chimney or decoration stacked above a roof stays with the house,
- two buildings never share a column, so they cannot merge accidentally.

### 3. 3D cluster mode

Blocks are grouped by full 26-neighbour adjacency in XYZ. Floating details become
separate units and are then merged by the next step (or manually).

### 4. Chunk limiter (Bloxd's 160-chunk limit)

Bloxd refuses a schematic above **160 chunks** (32 × 32 × 32 blocks each), which
is only 5120 blocks wide at full height. The chunk limiter makes bigger builds
exportable by cutting them into parts:

1. Count chunks on the X/Y/Z axes.
2. Keep the **full height** when it fits (so every part can be loaded at the
   same Y in game) and search the X/Z tile shape that yields the fewest parts.
3. If a single column of chunks is already too tall (> 160 chunks tall), parts
   are also stacked along **Y**.
4. Every part is encoded on its own, re-normalised to its corner, and named with
   the offset needed to line it up again:

```text
greycastle_part001_x0_z0.bloxdschem
greycastle_part002_x384_z0.bloxdschem
greycastle_part003_x0_z384.bloxdschem
greycastle_part004_x384_z384.bloxdschem
```

Re-importing those files together (drag them all into the splitter) merges them
back at the exact original position, because the importer reads the `_x…_z…`
offsets from the names — the same convention the Bloxd Map Editor uses.

The inspector shows each part's size, block count, chunks, and offsets. Empty
tiles are skipped. Parts above the limit are impossible by construction, so the
whole build can always be exported.

### 5. Oversized units in objects mode

If a detected unit is still above the limit (for example one giant castle),
exporting it writes a ZIP with `unit001_part001_x…_z…` files instead of one
invalid schematic, plus the same guide and manifest.

### 6. Small-fragment merging

Units smaller than the threshold (default **100 blocks**) are merged into the
large unit that shares the most `(x, z)` columns with them. If no column
overlap exists, the nearest large unit is suggested. The loop repeats until
stable. Rows that still qualify show a 🔗 button for a manual merge, and every
row has a × button to exclude it from the export.

Units are listed largest first.

---

## Output format

Every unit is written as a standalone Bloxd schematic:

- 4 leading zero bytes, then Avro-encoded fields (zig-zag varints,
  length-prefixed strings/bytes);
- header: name, origin `(0, 0, 0)`, unit size in `(x, y, z)`, chunk count;
- chunks of 32 × 32 × 32, block index `x * 1024 + y * 32 + z`, each chunk
  run-length encoded as `(runLength, blockId)` uvarint pairs;
- coordinates are normalised so the unit starts at `(0, 0, 0)`.

The full padded chunk grid is emitted (including empty chunks), matching the
upstream splitter output.

### ZIP bundle

`Download ZIP` produces an uncompressed (store method) ZIP with UTF-8 names:

```
<prefix><number>.bloxdschem              # objects mode, one per unit
<prefix>_part001_x0_z0.bloxdschem        # chunk-limited parts
<prefix><number>_part001_x0_z0.bloxdschem  # oversized unit cut into parts
…
manifest.json
GUIDE_IMPORTATION.txt                    # only when parts are present
```

`manifest.json` uses the shape understood by Bloxd map tools:

```json
{
  "schematics": [
    { "file": "greycastle_part001_x0_z0.bloxdschem", "name": "greycastle_part001_x0_z0", "type": "auto", "biome": "classic", "x": 0, "y": 0, "z": 0 },
    { "file": "greycastle_part002_x384_z0.bloxdschem", "name": "greycastle_part002_x384_z0", "type": "auto", "biome": "classic", "x": 384, "y": 0, "z": 0 }
  ]
}
```

`GUIDE_IMPORTATION.txt` lists every part with the `x / y / z` position to load it
at, in English and French.

The ZIP writer is local (`createZip` in the core) — no JSZip or other dependency
is bundled, and every standard unzip tool can open it.

---

## Limits

| Limit | Value | Behaviour |
| --- | --- | --- |
| Blocks per import | 3,000,000 | import stops with an explicit error |
| Chunks per file | 160 (Bloxd) | chunk limiter keeps every part below it; oversized units are split into parts |
| Listed units | 500 rows | all units are still exported |
| ZIP entries | 60,000 | guard in the ZIP writer |

Large imports hold the voxel map in memory twice during detection (original +
working copy). For very large maps, split in Bloxd first.

---

## Programmatic API

`window.BloxdSchemSplitter` (and `module.exports` under Node):

| Function | Purpose |
| --- | --- |
| `parseSchematic(arrayBuffer)` | decode → `{ name, voxels: VoxelSet, stats }` |
| `VoxelSet` | linear-key voxel storage with `key/decode/get/set/has`, `clone()`, `fromStringMap()`, `toStringMap()` |
| `mergeSources([{ schematic, filename }])` | merge files with offsets or side-by-side packing |
| `removePlatforms(voxels, options)` | delete ground platforms, returns removed count |
| `detectUnits(voxels, { mode })` | `columns` or `clusters`, sorted largest first |
| `mergeSmallUnits(units, { threshold })` | fuse fragments, returns merged count |
| `findParentUnit(units, index, threshold)` | suggested merge target |
| `mergeUnits(units, source, target)` | manual merge |
| `encodeUnit(unit, name)` | standalone `.bloxdschem` bytes |
| `encodeVoxels(voxels, name)` | encode a whole voxel set |
| `createZip([{ name, data }])` | ZIP archive bytes |
| `planTiles(size, { maxChunks })` | tile plan: `tileX/Y/Z`, `cols/rows/layers`, `parts`, `splitY` |
| `splitUnitIntoParts(unit, { maxChunks })` | `{ plan, parts: [{ unit, offset, number, chunks }] }` |
| `splitVoxelsIntoParts(voxels, options)` | same, for a whole voxel set |
| `partFileName(base, number, offset)` | `base_part001_x0_z64.bloxdschem` (+ `_y…`) |
| `buildPartsGuide(info)` | plain-text placement guide |
| `chunkCounts(size)` | chunk counts on X/Y/Z |
| `unitColor(index)` | stable per-unit preview color |
| `unitSize(unit)`, `unitChunkCount(unit)`, `describeUnit(unit)` | metrics |

Units contain `{ id, voxels, keys, count, aabb }`; `keys` are linear voxel keys
in the shared `VoxelSet` coordinate space.

---

## Tests

```bash
node tests/test-bloxd-splitter.js
```

Covers encoding/decoding round-trips, decoder compatibility with the editor's
`bloxd-schematic.js`, platform removal, both detection modes, fragment merging,
per-unit origin normalisation, multi-file offsets/packing, error messages, and
ZIP structure including CRC32 checks.

It also covers the chunk limiter: tile planning under the limit, custom limits,
splitting an oversized build, exact reassembly through the generated file names,
vertical (Y) splitting for extremely tall builds, part naming, the placement
guide, and the single-file case at exactly 160 chunks.

---

## Attribution

The splitter's detection approach, platform-removal rule, the 160-chunk
auto-split, part naming (`_x…_z…`), and output conventions are adapted from [Souls-equal/Bloxd_Map_Editor](https://github.com/Souls-equal/Bloxd_Map_Editor)
(Apache License 2.0), specifically its `schem_splitter.js`. This implementation
uses the locally bundled Three.js for previews and a local ZIP writer instead of
JSZip/Babylon.js, and was rewritten for this codebase. See
`licenses/Bloxd_Map_Editor-LICENSE.txt` and `THIRD_PARTY_NOTICES.md`.
