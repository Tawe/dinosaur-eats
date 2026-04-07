Place your sprite and audio in this folder:

- **`dino-chomp.png`** — 8-frame chomp sprite sheet (see layout below).
- **`chomp.mp3`** — looping chomp sound (optional but referenced by the extension).

Expected sprite layout:

- 8 frames in a single horizontal strip (or a grid matching `src/dino.css`).
- Transparent background.
- Each frame the same width and height.

Dimensions must match the extension: update **`--dino-sheet-*`**, **`--dino-frame-*`**, and related variables in **`../src/dino.css`** if your PNG size or grid differs.

Relevant CSS variables include:

- `--dino-sheet-width` / `--dino-sheet-height`
- `--dino-frame-stride`, `--dino-frame-width`, `--dino-frame-height`
- `--dino-row-count`, `--dino-active-row`
- `--dino-scale`
