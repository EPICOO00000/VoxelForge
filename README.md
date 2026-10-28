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

## Bloxd schematic splitter (new)

Open it with the **✂ Splitter** button in the top project bar. It is a
full-screen workspace and leaves your 3D scene untouched.

1. **Import** one or several `.bloxdschem` files (button or drag & drop).
   Multi-file imports are merged using world offsets in the file names
   (`house_x128_z-64.bloxdschem`) or packed side by side along X otherwise.
2. **Detect & split** removes full ground platforms and finds separate objects.
   Detection runs automatically after import and whenever a setting changes.
3. **Inspect** the result in the 3D preview: drag to orbit, right-drag to pan,
   wheel to zoom, click a block (or a row) to highlight one unit. Switch between
   per-unit colors and real Bloxd block colors.
4. **Export**:

   - the ⬇ button on a row downloads that single unit;
   - **Download ZIP** writes one `.bloxdschem` per unit plus a Bloxd
     `manifest.json` (prefix, start number, and ZIP name are configurable).

### Detection modes

- **Columns (X/Z, recommended)** — the upstream *Bloxd Map Editor* rule. Height
  is ignored: every 8-connected `(x, z)` column group becomes one unit and all
  blocks of those columns belong to it. A trunk therefore always stays with its
  canopy, and a small block stacked above a roof stays with the building.
- **3D clusters (strict)** — 26-connected block clusters. Good for maps where
  objects are physically separated and floating pieces must become their own
  units.

Two safety nets match the upstream tool: full ground platforms are removed from
the bottom layers, and fragments smaller than a configurable threshold (100
blocks by default) are merged into the large unit they overlap, with a manual
🔗 merge button for the rest.

### Limits worth knowing

- Bloxd accepts at most **160 chunks** per schematic. A unit above that limit is
  highlighted in the list so you can merge/split differently; exports are still
  written (they simply cannot be imported into Bloxd).
- Imports are capped at **3,000,000 blocks** to keep the browser responsive.
- Platform removal is a heuristic: it deletes any ≥3 × 3 area that fills at least
  60 % of its own bounding box within the bottom four layers. Turn it off if a
  low structure is being eaten. A schematic is never emptied by this step — a
  flat prop such as a rock stays intact as one unit.
- Splitting operates on block data only. It does not read Minecraft `.schem` or
  `.litematic` files — convert them to `.bloxdschem` first.

See [docs/SPLITTER.md](docs/SPLITTER.md) for the file format, algorithm details,
and the programmatic API.

---

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
and compatibility with the editor's own schematic decoder.

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
