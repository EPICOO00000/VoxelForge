# VoxelForge — 3D Modeler & Bloxd Schematic Studio

A fully client-side 3D modeling studio for the browser: an 82-shape modeler,
a procedural world studio, a permanent Bloxd block editor, and a **Bloxd
schematic splitter** that separates a multi-object `.bloxdschem` into individual
units.

There is no build step, no backend, and no upload: everything runs from static
files in your browser. The repository is laid out so it can be published
directly on GitHub Pages.

**Live site:** `https://<your-user>.github.io/VoxelForge/` (after enabling Pages
as described below).

---

## Host it on GitHub Pages

### Deploy from a branch (recommended — nothing to configure)

1. Merge this branch into `main`.
2. Open the repository's **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **`main`** and folder **`/ (root)`**, then **Save**.
5. Wait for the first build. The site is published at
   `https://<your-user>.github.io/VoxelForge/` and is rebuilt automatically on
   every push to `main`.

The root-level `index.html` is the entry point and `.nojekyll` keeps every asset
folder from being filtered by Jekyll. No build step runs.

### Deploy with GitHub Actions (optional)

If you prefer an explicit workflow, copy
[`docs/templates/github-actions-pages.yml`](docs/templates/github-actions-pages.yml)
to `.github/workflows/deploy-pages.yml` (the GitHub web editor can create
workflow files directly), then set **Settings → Pages → Source** to
**GitHub Actions**. The workflow stages the static files and publishes them on
every push to `main`, and can also be started manually from the **Actions** tab.

### Custom domain

Create a `CNAME` file at the repository root containing your domain (for
example `voxelforge.example.com`), then point a DNS `CNAME` record at
`<your-user>.github.io` and enable **Enforce HTTPS** in the Pages settings.

### Local preview

The site has no dependencies, so any static file server works. The included
launcher needs only Python 3:

```bash
python init.py            # serves on http://localhost:8000 and opens the browser
python init.py --port 9000 --no-browser
```

Or use Python's built-in server:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Opening `index.html` from `file://` does not work
because the Bloxd asset library is loaded with `fetch`.

---

## Exporting to Bloxd — never blocked by the 160-chunk limit

Bloxd refuses any schematic above **160 chunks** (32 × 32 × 32 blocks each).
VoxelForge never just says "too big":

### Export 3D → BLOXD (the editor)

1. **Export 3D → BLOXD** opens the conversion dialog.
2. The estimate tells you the result, for example
   *“512 chunks — above Bloxd's 160-chunk limit: exports as 4 parts (≤ 160 chunks each)”*.
3. **Split automatically above the limit** is on by default. The button becomes
   **Voxelize & split into 4 files**, and you get a ZIP containing:

```text
My_Build_part001_x0_z0.bloxdschem
My_Build_part002_x192_z0.bloxdschem
…
manifest.json            ← every part with its x / y / z position
GUIDE_IMPORTATION.txt    ← where to place each part in Bloxd
```

Every part is **at or below 160 chunks**, so each one loads in game. Place them
at the coordinates from the guide (or drag the ZIP back into the splitter, which
re-merges them from their `_x…_z…` names).

Optional **Max chunks per file** (1–160) lets you force smaller parts. If you
untick the option the dialog tells you the planned part count instead of
downloading a file Bloxd would reject — it never leaves you stuck.

The same treatment applies when exporting a **permanent Bloxd world** from the
block editor: above the limit you get the ZIP of parts instead of an error.

### ✂ Splitter workspace (top bar)

Open **✂ Splitter** for a dedicated workspace that leaves your scene untouched:

- **Chunk limiter** — import any `.bloxdschem` (from Bloxd, from this editor, or
  from another tool) and cut it into ≤160-chunk parts with the same naming,
  guide, and manifest.
- **Separate objects** — split a map containing several buildings, trees, or
  props into one file per object.

Preview, selection, per-unit download, merge/remove, and ZIP export are shared by
both modes. Detection can follow the upstream *Bloxd Map Editor* column rule
(8-connected X/Z, height ignored, so trunks stay with their canopy) or strict 3D
clusters, with automatic ground-platform removal and small-fragment merging.

### Limits worth knowing

- Splitting never changes block data: total blocks in the parts always equal the
  original build.
- Very tall builds (more than 160 chunks vertically) are also stacked on Y; the
  part names then carry `_y…` and the guide lists the Y position.
- Voxelization itself still stops at 2,000,000 blocks to protect the browser —
  lower **Blocks per model unit** if you hit that.
- The splitter reads `.bloxdschem` only; convert Minecraft `.schem` or
  `.litematic` files first.

See [docs/SPLITTER.md](docs/SPLITTER.md) for the format, algorithm, and API.

## Editor highlights

- **Modeling:** 82-form geometry library, import of `.glb` / `.gltf` / `.obj` /
  `.stl`, transform gizmos, sculpt brushes, vertex/edge/face editing, booleans,
  arrays, hierarchy, measurements, materials and textures.
- **Procedural studio:** 16 generator families (terrain, islands, canyons,
  cities, castles, trees, coral, crystals, mazes, pipes, orbital stations…),
  layered compositions, deterministic seeds, live WebGL preview.
- **Bloxd mode:** a permanent block world using the real 2,090-name/ID catalog,
  chunked instanced rendering, terrain and biome painting, palette texture
  studio, a 922-schematic asset library, and direct `.bloxdschem` export.
- **Projects:** autosave and crash recovery, undo/redo, `.shapeproject`
  save/open, GLB/OBJ/STL export.

The complete reference lives in [docs/FEATURES.md](docs/FEATURES.md).

### Controls (3D editor)

`Q` select · `X` box select · `G` move · `R` rotate · `S` scale · `B` sculpt ·
`E` edit geometry · `M` measure · `N` add shape · `P` procedural studio ·
`D` duplicate · `Delete` remove · `Escape` deselect · `Ctrl/Cmd+Z` undo ·
`Ctrl/Cmd+S` save project · `Ctrl/Cmd+O` open project.

---

## Project structure

```text
VoxelForge/
├── index.html                      # the whole application (GitHub Pages entry point)
├── init.py                         # optional local static-file launcher
├── .nojekyll                       # keep every folder when serving from a branch
├── assets/
│   ├── css/
│   │   ├── styles.css              # main editor styles
│   │   ├── bloxd-*.css             # Bloxd editor panels + splitter workspace
│   ├── js/
│   │   ├── app.js                  # 3D editor, projects, exports
│   │   ├── bloxd-schematic.js      # .bloxdschem encoder/decoder + mesh voxelizer
│   │   ├── bloxd-schematic-splitter.js  # splitter core (detection, encode, ZIP)
│   │   ├── bloxd-splitter-ui.js         # splitter workspace UI + Three.js preview
│   │   ├── bloxd-*.js              # block catalog, colors, voxel editor, tools
│   │   ├── island-world-system.js  # procedural island engine
│   │   └── vendor/                 # Three.js r128, loaders, exporters, CSG
│   └── bloxd-assets/               # 922 Apache-2.0 .bloxdschem assets
├── docs/
│   ├── FEATURES.md                 # full feature reference
│   ├── SPLITTER.md                 # splitter format/algorithm documentation
│   └── templates/
│       └── github-actions-pages.yml  # optional Actions deployment template
├── licenses/
├── tests/                          # dependency-free Node test scripts
├── THIRD_PARTY_NOTICES.md
└── README.md
```

---

## Tests

All tests are plain Node scripts (Node 18+) with no npm dependencies:

```bash
node tests/test-bloxd-splitter.js
# or run everything:
for test in tests/*.js; do node "$test" || exit 1; done
```

`tests/test-bloxd-splitter.js` covers decoding, platform removal, both detection
modes, fragment merging, unit encoding, multi-file merging, ZIP/CRC structure,
and compatibility with the editor's own schematic decoder. It also covers the
chunk limiter: tile planning under 160 chunks, splitting oversized builds,
vertical splitting, part naming, and exact reassembly from the file names.

---

## Browser support

Recent versions of Chrome, Edge, Firefox, and Safari with WebGL enabled. The
site bundles Three.js r128 locally, so it does not depend on any CDN.

---

## Third-party code and attribution

- **Three.js r128**, its loaders/exporters, `TransformControls`, and
  `ShapeCSG` are bundled under `assets/js/vendor/`.
- **Bloxd Map Editor** (`Souls-equal/Bloxd_Map_Editor`, Apache License 2.0)
  documented the `.bloxdschem` format. The schematic encoder/decoder, block
  catalog, color approximation, asset library, and the splitter's detection
  rules are adapted from that project. The splitter itself is a local
  re-implementation (Three.js preview, no Babylon.js, no JSZip).
- The **922 `.bloxdschem` assets** in `assets/bloxd-assets/` are redistributed
  from the upstream project under Apache License 2.0.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/` for details.

Bloxd.io is a third-party game. VoxelForge is independent and is not endorsed by
or affiliated with Bloxd.io.
