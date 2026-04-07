# Dinosaur Eats

A tiny Manifest V3 Chrome extension for the DEV April Fools challenge. It injects a cartoon dinosaur that wanders onto the page and eats visible text line by line in a random order.

## What it does

- Waits for the first real user interaction on a page (click/tap/key) so chomp audio can play reliably.
- Scans visible readable blocks (`p`, `li`, `blockquote`, `figcaption`, headings, plus common containers like `div`, `section`, `article`, `td`, `th`).
- Also catches common inline rich-text elements (`a`, `em`, `strong`, `code`, `small`, `label`) when they are standalone text targets.
- Splits each block into rendered lines based on the page's actual layout.
- Randomizes the line order.
- Animates either a single dino or a herd stampede, with looping chomp audio while dinos are on screen.
- Keeps rampaging on a timer and can restore previously eaten content to keep the effect running.
- Supports extension action toggle (click toolbar icon to turn ON/OFF).

## Assets

Add these under **`assets/`** before loading the extension:

- **`assets/dino-chomp.png`** — sprite sheet (layout and pixel size must match [src/dino.css](src/dino.css)).
- **`assets/chomp.mp3`** — chomp sound (loops while dinos are on screen).

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Choose the **project root** (the directory that contains `manifest.json`).

## Publish to GitHub

1. Create a new empty GitHub repo (for example, `dinosaur-eats`).
2. In this project directory, run:
   - `git add .`
   - `git commit -m "Initial commit"`
   - `git branch -M main`
   - `git remote add origin <your-repo-url>`
   - `git push -u origin main`
3. Reload `chrome://extensions` after pulling changes on other machines.

## Current constraints

- It still works at the element level, not true text-node-level parsing, so heavily nested/complex rich text can be skipped.
- It favors readable visible content and skips hidden or tiny elements.
- Browser autoplay rules still apply; the extension primes audio on user input and retries when tabs regain focus/visibility.

## Tuning knobs

Edit these constants in `src/content.js`:

- `HERD_CHANCE`, `HERD_SIZE`, `HERD_PASSES`
- `RAMPAGE_RETRY_MIN_MS`, `RAMPAGE_RETRY_MAX_MS`
- `MAX_LINES`, `DINO_BITE_MS`
- `DEBUG` (or set `window.__DINO_EATS_DEBUG__ = true` in DevTools)

## Good next steps

- Replace the CSS dinosaur with a pixel-art sprite and a real bite mask.
- Move from element-level replacement to pure text-node wrapping for safer rich-text preservation.
