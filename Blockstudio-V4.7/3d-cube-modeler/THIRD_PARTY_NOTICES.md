# Third-party notices

## Bloxd Map Editor

The Bloxd schematic binary-format implementation and block metadata were researched from:

- Project: `Souls-equal/Bloxd_Map_Editor`
- Source: <https://github.com/Souls-equal/Bloxd_Map_Editor>
- License: Apache License 2.0
- Copyright: the Bloxd Map Editor contributors

The modeler's encoder, decoder, and voxelizer are implemented locally in `assets/js/bloxd-schematic.js`. The authoritative block-name/ID catalog and shared color-approximation logic are adapted into `assets/js/bloxd-block-catalog.js` and `assets/js/bloxd-block-colors.js` for the permanent Bloxd editor.

The 922 `.bloxdschem` examples in `assets/bloxd-assets/` are redistributed from the upstream project's `schems/` library under Apache License 2.0. `assets/js/bloxd-asset-catalog.js` is locally generated metadata for those files. The local asset browser/placement implementation is new, while its library organization and schematic parsing behavior are based on the upstream Asset Placer. A copy of the upstream license is included at `licenses/Bloxd_Map_Editor-LICENSE.txt`.

Bloxd.io is a third-party game. This project is independent and is not endorsed by or affiliated with Bloxd.io.
