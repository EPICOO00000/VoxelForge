# Bloxd schematic splitter

The splitter turns one `.bloxdschem` that contains several buildings, trees, or
props into individual `.bloxdschem` files. It is a full-screen workspace opened
with **✂ Splitter** in the top project bar.

- Core logic: `assets/js/bloxd-schematic-splitter.js` (DOM-free, also loaded by the tests)
- UI and 3D preview: `assets/js/bloxd-splitter-ui.js`
- Styles: `assets/css/bloxd-splitter.css`

Nothing is uploaded; files are decoded and re-encoded in the browser.

---

## Workflow

```
.bloxdschem file(s)
      │  parse (32³ chunks, Avro header, RLE block runs)
      ▼
 normalized voxel map  ──►  remove ground platforms (optional)
      │
      ▼
 unit detection (columns by default, 3D clusters optional)
      │
      ▼
 merge small fragments (optional, threshold in blocks)
      │
      ▼
 re-encode each unit  ──►  .bloxdschem files + manifest.json in a ZIP
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

### 4. Small-fragment merging

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
<prefix><number>.bloxdschem
<prefix><number>.bloxdschem
…
manifest.json
```

`manifest.json` uses the shape understood by Bloxd map tools:

```json
{
  "schematics": [
    { "file": "unit001.bloxdschem", "name": "unit001", "type": "auto", "biome": "classic" }
  ]
}
```

The ZIP writer is local (`createZip` in the core) — no JSZip or other dependency
is bundled, and every standard unzip tool can open it.

---

## Limits

| Limit | Value | Behaviour |
| --- | --- | --- |
| Blocks per import | 3,000,000 | import stops with an explicit error |
| Chunks per unit | 160 (Bloxd) | unit row is flagged; export still allowed |
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

---

## Attribution

The splitter's detection approach, platform-removal rule, and output conventions
are adapted from [Souls-equal/Bloxd_Map_Editor](https://github.com/Souls-equal/Bloxd_Map_Editor)
(Apache License 2.0), specifically its `schem_splitter.js`. This implementation
uses the locally bundled Three.js for previews and a local ZIP writer instead of
JSZip/Babylon.js, and was rewritten for this codebase. See
`licenses/Bloxd_Map_Editor-LICENSE.txt` and `THIRD_PARTY_NOTICES.md`.
