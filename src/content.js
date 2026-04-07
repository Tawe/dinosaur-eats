const DINO_ACTIVE_ATTR = "data-dino-eats-active";
const PROCESSED_ATTR = "data-dino-eats-processed";
const ENABLED_STORAGE_KEY = "dinoEatsEnabled";
const MIN_TEXT_LENGTH = 28;
const MAX_LINES = 45;
const DINO_FRAME_COUNT = 8;
const DINO_BITE_MS = 70;
const DINO_SPRITE_PATH = chrome.runtime.getURL("assets/dino-chomp.png");
const TEAPOT_DINO_SPRITE_PATH = chrome.runtime.getURL("assets/teapot_dino_sprite_sheet_grey_pot_8x2_32.png");
const CHOMP_SOUND_PATH = chrome.runtime.getURL("assets/chomp.mp3");
const HERD_CHANCE = 1 / 5;
const HERD_SIZE = 15;
const HERD_PASSES = 2;
const RAMPAGE_RETRY_MIN_MS = 250;
const RAMPAGE_RETRY_MAX_MS = 500;
const MIN_TARGET_TEXT_LENGTH = 12;
const INPUT_EVENT_TYPES = ["pointerdown", "keydown", "touchstart", "click"];
const TARGET_TAGS = [
  "p",
  "li",
  "blockquote",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "article",
  "section",
  "main",
  "aside",
  "div",
  "span",
  "a",
  "em",
  "strong",
  "code",
  "small",
  "label",
  "td",
  "th"
];
const TARGET_SELECTOR = TARGET_TAGS.join(", ");
const DEBUG = false;
let stopRequested = false;
let activeSpritePath = DINO_SPRITE_PATH;
let recentKeySequence = "";

function dinoDebug(...args) {
  if (!DEBUG && !window.__DINO_EATS_DEBUG__) return;
  console.debug("[dino-eats]", ...args);
}

async function isDinoEatsEnabled() {
  try {
    const result = await chrome.storage.local.get(ENABLED_STORAGE_KEY);
    if (!(ENABLED_STORAGE_KEY in result)) return true;
    return result[ENABLED_STORAGE_KEY] !== false;
  } catch {
    return true;
  }
}

function collectFragmentsForElement(element) {
  if (!(element instanceof HTMLElement)) return [];
  if (element.classList.contains("dino-eats-empty")) return [];

  const tag = element.tagName.toLowerCase();
  if (!TARGET_TAGS.includes(tag)) {
    return [];
  }

  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return [];

  const rect = element.getBoundingClientRect();
  if (rect.width < 70 || rect.height < 14) return [];

  if (element.querySelector(".dino-eats-char")) {
    return buildFragmentsFromCharSpans(element);
  }

  if (element.hasAttribute(PROCESSED_ATTR)) return [];
  if (element.childElementCount > 0) return [];

  const text = element.textContent?.trim() ?? "";
  if (text.length < MIN_TARGET_TEXT_LENGTH) return [];
  return extractLineFragments(element);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function extractLineFragments(element) {
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  if (!text) return [];

  const originalText = element.textContent;
  element.dataset.dinoEatsOriginal = originalText ?? "";
  element.setAttribute(PROCESSED_ATTR, "true");

  element.innerHTML = text
    .split("")
    .map((character) => {
      if (character === " ") {
        return '<span class="dino-eats-char is-space">&nbsp;</span>';
      }

      return `<span class="dino-eats-char">${escapeHtml(character)}</span>`;
    })
    .join("");

  return buildFragmentsFromCharSpans(element);
}

function buildFragmentsFromCharSpans(element) {
  const charSpans = Array.from(element.querySelectorAll(".dino-eats-char"));
  const lines = [];
  let currentLine = null;

  for (const span of charSpans) {
    const rect = span.getBoundingClientRect();
    const top = Math.round(rect.top);

    if (!currentLine || Math.abs(currentLine.top - top) > 2) {
      currentLine = {
        top,
        nodes: [span]
      };
      lines.push(currentLine);
    } else {
      currentLine.nodes.push(span);
    }
  }

  const parentRect = element.getBoundingClientRect();

  return lines
    .map((line) => {
      const first = line.nodes[0];
      const last = line.nodes[line.nodes.length - 1];
      const firstRect = first.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      const textValue = line.nodes.map((node) => node.textContent ?? "").join("").replace(/\u00a0/g, " ").trim();
      const biteNodes = line.nodes.filter((node) => !node.classList.contains("is-space"));

      return {
        element,
        text: textValue,
        top: firstRect.top + window.scrollY,
        left: firstRect.left + window.scrollX,
        width: lastRect.right - firstRect.left,
        height: Math.max(firstRect.height, 18),
        offsetTop: firstRect.top - parentRect.top,
        nodes: line.nodes,
        biteNodes
      };
    })
    .filter((line) => line.width > 0 && line.text.length > 0 && line.biteNodes.length > 0);
}

function collectTargets() {
  const candidates = Array.from(document.body.querySelectorAll(TARGET_SELECTOR));
  const allLines = [];

  for (const element of candidates) {
    allLines.push(...collectFragmentsForElement(element));
    if (allLines.length >= MAX_LINES) break;
  }

  return shuffle(allLines).slice(0, MAX_LINES);
}

function restorePreviouslyEatenContent() {
  if (!document.body) return 0;
  const processed = Array.from(document.body.querySelectorAll(`[${PROCESSED_ATTR}]`));
  let restored = 0;

  for (const element of processed) {
    if (!(element instanceof HTMLElement)) continue;
    const original = element.dataset.dinoEatsOriginal ?? "";
    if (!original.trim()) continue;
    element.textContent = original;
    element.classList.remove("dino-eats-empty");
    element.removeAttribute(PROCESSED_ATTR);
    restored += 1;
  }

  return restored;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createDinoElement() {
  const dino = document.createElement("div");
  dino.className = "dino-eats-dino is-hidden";
  dino.setAttribute("aria-hidden", "true");
  dino.innerHTML = `<div class="dino-eats-sprite"></div>`;
  return dino;
}

function createStampedeBanner() {
  const root = document.createElement("div");
  root.className = "dino-eats-stampede-root";
  const inner = document.createElement("div");
  inner.className = "dino-eats-stampede-banner";
  inner.textContent = "Oh no! Its a stampede!";
  root.appendChild(inner);
  document.body.appendChild(root);
  return root;
}

function willHaveAnotherChompAfter(targets, currentLine, pass, passCount) {
  const idx = targets.indexOf(currentLine);
  if (idx === -1) return false;
  for (let j = idx + 1; j < targets.length; j += 1) {
    const t = targets[j];
    if (!document.body.contains(t.element)) continue;
    if (t.biteNodes.some((n) => document.documentElement.contains(n))) return true;
  }
  if (pass < passCount - 1) {
    for (const t of targets) {
      if (!document.body.contains(t.element)) continue;
      if (t.biteNodes.some((n) => document.documentElement.contains(n))) return true;
    }
  }
  return false;
}

function herdSlotOffset(slot) {
  const spread = 10;
  const baseX = (slot - (HERD_SIZE - 1) / 2) * spread;
  const baseY = (slot % 2) * -spread + Math.floor(slot / 2) * (spread * 0.55);
  const jitter = () => Math.random() * 20 - 10;
  return { x: baseX + jitter(), y: baseY + jitter() };
}

function applyDinoThemeVars() {
  const root = document.documentElement;
  root.style.setProperty("--dino-sprite-url", `url("${activeSpritePath}")`);
  root.style.setProperty("--dino-frame-count", String(DINO_FRAME_COUNT));
}

function clearDinoThemeVars() {
  const root = document.documentElement;
  root.style.removeProperty("--dino-sprite-url");
  root.style.removeProperty("--dino-frame-count");
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Chomp uses HTMLAudioElement only (no AudioContext). Chrome often blocks Web Audio in MV3
 * content scripts even when the user interacts with the page; <audio> follows normal media autoplay.
 */
const chompActiveAudios = new Set();
let chompMediaPrimed = false;

/** One inaudible play() during a real gesture unlocks this tab for chomp audio from timers. */
function primeChompMediaOnUserGesture() {
  if (chompMediaPrimed) return;
  chompMediaPrimed = true;
  try {
    const a = new Audio(CHOMP_SOUND_PATH);
    a.muted = true;
    void a.play().then(
      () => {
        releaseAudioElement(a);
      },
      () => {}
    );
  } catch {
    /* ignore */
  }
}

function releaseAudioElement(audio) {
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();
}

function forceStopActiveEffects() {
  for (const el of chompActiveAudios) {
    if (el instanceof HTMLAudioElement) {
      releaseAudioElement(el);
    }
  }
  chompActiveAudios.clear();

  for (const d of document.querySelectorAll(".dino-eats-dino")) {
    d.remove();
  }
  for (const banner of document.querySelectorAll(".dino-eats-stampede-root")) {
    banner.remove();
  }

  clearDinoThemeVars();
  document.documentElement.removeAttribute(DINO_ACTIVE_ATTR);
}

function kickChompAudiosFromUserInput() {
  try {
    for (const el of chompActiveAudios) {
      if (!(el instanceof HTMLAudioElement)) continue;
      if (el.paused) {
        void el.play().catch(() => {});
      }
    }
  } catch {
    /* never throw from audio kick — would break host page input in capture phase */
  }
}

/**
 * Retries `play()` on paused chomp tracks. Browsers often:
 * - allow the first play after you click/type, then
 * - block `play()` started from timers (later rampage lines), and
 * - pause audio when the tab is in the background.
 * So we kick again on input, tab focus, and visibility.
 */
function installChompKickOnUserInput() {
  const onInput = () => {
    primeChompMediaOnUserGesture();
    kickChompAudiosFromUserInput();
  };
  for (const t of INPUT_EVENT_TYPES) {
    document.addEventListener(t, onInput, { capture: true, passive: true });
  }
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") {
        kickChompAudiosFromUserInput();
      }
    },
    { passive: true }
  );
  window.addEventListener("focus", kickChompAudiosFromUserInput, { passive: true });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      kickChompAudiosFromUserInput();
    }
  });
}

function chompVolumeForLineSize(count) {
  if (count <= 1) return 1;
  return Math.min(0.4, 3 / count);
}

function startChompSound(volume = 1) {
  const vol = Math.min(1, Math.max(0, volume));
  const audio = new Audio(CHOMP_SOUND_PATH);
  audio.loop = true;
  audio.volume = vol;
  audio.preload = "auto";
  chompActiveAudios.add(audio);
  void audio.play().catch(() => {});

  return {
    stop() {
      chompActiveAudios.delete(audio);
      releaseAudioElement(audio);
    }
  };
}

function stopChompSound(handle) {
  if (handle && typeof handle.stop === "function") handle.stop();
}

function moveDino(dino, target, facing, offsetX = 0, offsetY = 0) {
  if (!(dino instanceof HTMLElement) || !(target instanceof HTMLElement)) return;

  const spriteWidth = 64;
  const mouthFromSpriteTop = 24;
  const rect = target.getBoundingClientRect();
  const biteX = facing === 1 ? rect.right : rect.left;
  const charMidY = rect.top + rect.height / 2;
  const y = charMidY - mouthFromSpriteTop + offsetY;
  const x =
    Math.max(0, facing === 1 ? biteX - spriteWidth * 0.86 : biteX - spriteWidth * 0.14) + offsetX;
  dino.style.transform = `translate(${x}px, ${y}px) scaleX(${facing})`;
}

async function chompLine(dinos, line, herdOffsets = null) {
  const list = Array.isArray(dinos) ? dinos : [dinos];
  if (!list.length || !list.every((el) => el instanceof HTMLElement)) return;
  if (!line?.nodes?.length || !line?.biteNodes?.length || !(line.element instanceof HTMLElement)) return;
  if (stopRequested) return;

  const chompAudios = [];
  const chompVol = chompVolumeForLineSize(list.length);

  try {
    const offsets =
      herdOffsets ?? list.map(() => ({ x: 0, y: 0 }));
    const herd = list.length > 1;

    for (let i = 0; i < list.length; i += 1) {
      if (stopRequested) break;
      const d = list[i];
      document.body.appendChild(d);
      d.style.zIndex = String(2147483646 + i);
    }

    const facing = Math.random() > 0.5 ? 1 : -1;
    const orderedNodes = facing === 1 ? [...line.biteNodes] : [...line.biteNodes].reverse();

    let currentTarget = orderedNodes[0];
    const syncPosition = () => {
      if (!currentTarget || !document.documentElement.contains(currentTarget)) return;
      for (let i = 0; i < list.length; i += 1) {
        moveDino(list[i], currentTarget, facing, offsets[i].x, offsets[i].y);
      }
    };
    const scrollOpts = { capture: true, passive: true };
    window.addEventListener("scroll", syncPosition, scrollOpts);
    window.addEventListener("resize", syncPosition);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("scroll", syncPosition);
      vv.addEventListener("resize", syncPosition);
    }

    try {
      for (const d of list) {
        d.classList.remove("is-eating");
      }
      void list[0].offsetWidth;

      for (let i = 0; i < list.length; i += 1) {
        moveDino(list[i], currentTarget, facing, offsets[i].x, offsets[i].y);
      }
      if (herd) {
        for (let i = 0; i < list.length; i += 1) {
          if (stopRequested) break;
          chompAudios.push(startChompSound(chompVol));
          list[i].classList.remove("is-hidden");
          await wait(28 + Math.floor(Math.random() * 52));
        }
      } else {
        chompAudios.push(startChompSound(chompVol));
        list[0].classList.remove("is-hidden");
      }

      await wait(herd ? 95 : 120);
      if (stopRequested) return;
      for (const d of list) {
        d.classList.add("is-eating");
      }

      for (const node of orderedNodes) {
        if (stopRequested) break;
        currentTarget = node;
        syncPosition();
        node.classList.add("is-being-eaten");
        await wait(DINO_BITE_MS + Math.random() * 35);
      }
    } finally {
      window.removeEventListener("scroll", syncPosition, scrollOpts);
      window.removeEventListener("resize", syncPosition);
      if (vv) {
        vv.removeEventListener("scroll", syncPosition);
        vv.removeEventListener("resize", syncPosition);
      }
    }

    if (stopRequested) return;
    const lineBox = document.createElement("span");
    lineBox.className = "dino-eats-line-vanish";
    lineBox.style.top = `${line.offsetTop}px`;
    lineBox.style.left = `${line.nodes[0].offsetLeft}px`;
    lineBox.style.width = `${line.width}px`;
    lineBox.style.height = `${line.height}px`;
    line.element.appendChild(lineBox);

    await wait(110);

    for (const node of line.nodes) {
      node.remove();
    }

    lineBox.remove();

    if (!line.element.textContent?.trim()) {
      line.element.classList.add("dino-eats-empty");
    }

    await wait(60);
    if (stopRequested) return;
    for (const d of list) {
      d.classList.remove("is-eating");
      d.remove();
    }
  } finally {
    for (const audio of chompAudios) {
      stopChompSound(audio);
    }
  }
}

function scheduleNextRampage() {
  if (!document.body) return;
  const span = RAMPAGE_RETRY_MAX_MS - RAMPAGE_RETRY_MIN_MS;
  const ms = RAMPAGE_RETRY_MIN_MS + Math.random() * span;
  window.setTimeout(() => {
    void runDinoRampage();
  }, ms);
}

function scheduleDisabledRetry() {
  window.setTimeout(() => {
    void runDinoRampage();
  }, 2000);
}

/** If a timer fires while a rampage is still running, retry soon instead of dropping the chain. */
function scheduleRampageRetryWhenBusy() {
  window.setTimeout(() => {
    void runDinoRampage();
  }, 900 + Math.random() * 1100);
}

async function runDinoRampage() {
  if (!document.body) return;
  stopRequested = false;
  if (!(await isDinoEatsEnabled())) {
    dinoDebug("disabled; retrying");
    scheduleDisabledRetry();
    return;
  }
  if (document.documentElement.hasAttribute(DINO_ACTIVE_ATTR)) {
    scheduleRampageRetryWhenBusy();
    return;
  }

  let targets = collectTargets();
  if (!targets.length && restorePreviouslyEatenContent() > 0) {
    targets = collectTargets();
  }
  if (!targets.length) {
    scheduleNextRampage();
    return;
  }

  document.documentElement.setAttribute(DINO_ACTIVE_ATTR, "");
  applyDinoThemeVars();

  const herdMode = Math.random() < HERD_CHANCE;
  const dinos = herdMode
    ? Array.from({ length: HERD_SIZE }, () => createDinoElement())
    : [createDinoElement()];
  const herdOffsets = herdMode
    ? Array.from({ length: HERD_SIZE }, (_, slot) => herdSlotOffset(slot))
    : null;

  let stampedeRoot = null;
  try {
    await wait(450 + Math.random() * 850);

    if (herdMode) {
      stampedeRoot = createStampedeBanner();
    }

    const passCount = herdMode ? HERD_PASSES : 1;
    for (let pass = 0; pass < passCount; pass += 1) {
      if (stopRequested) break;
      for (const line of targets) {
        if (stopRequested) break;
        if (!document.body.contains(line.element)) continue;
        const aliveBites = line.biteNodes.filter((n) => document.documentElement.contains(n));
        if (!aliveBites.length) continue;
        try {
          await chompLine(dinos, { ...line, biteNodes: aliveBites }, herdOffsets);
        } catch {}
        if (willHaveAnotherChompAfter(targets, line, pass, passCount)) {
          await wait(180 + Math.random() * 900);
        }
      }
    }
  } finally {
    stampedeRoot?.remove();
    for (const d of dinos) {
      d.remove();
    }
    clearDinoThemeVars();
    document.documentElement.removeAttribute(DINO_ACTIVE_ATTR);
    if (stopRequested || !(await isDinoEatsEnabled())) {
      scheduleDisabledRetry();
    } else {
      scheduleNextRampage();
    }
  }
}

function scheduleRampage() {
  window.setTimeout(runDinoRampage, 600);
}

function attachFirstInteractionToStartRampage() {
  function onFirstInteraction() {
    for (const t of INPUT_EVENT_TYPES) {
      document.removeEventListener(t, onFirstInteraction, true);
    }
    primeChompMediaOnUserGesture();
    scheduleRampage();
  }
  for (const t of INPUT_EVENT_TYPES) {
    document.addEventListener(t, onFirstInteraction, { capture: true });
  }
}

function listenForEnableStateChanges() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ENABLED_STORAGE_KEY]) return;
    const enabled = changes[ENABLED_STORAGE_KEY].newValue !== false;
    dinoDebug("enabled changed:", enabled);
    if (enabled) {
      stopRequested = false;
      scheduleRampage();
    } else {
      stopRequested = true;
      forceStopActiveEffects();
    }
  });
}

function installSpriteEasterEggListener() {
  document.addEventListener(
    "keydown",
    async (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1) return;
      if (!/[0-9]/.test(event.key)) return;
      if (!(await isDinoEatsEnabled())) return;

      recentKeySequence = `${recentKeySequence}${event.key}`.slice(-3);
      if (recentKeySequence === "418") {
        activeSpritePath = TEAPOT_DINO_SPRITE_PATH;
        recentKeySequence = "";
        applyDinoThemeVars();
        dinoDebug("Sprite switched to teapot dino");
        return;
      }
      if (recentKeySequence === "814") {
        activeSpritePath = DINO_SPRITE_PATH;
        recentKeySequence = "";
        applyDinoThemeVars();
        dinoDebug("Sprite switched to default dino");
      }
    },
    { passive: true }
  );
}

installChompKickOnUserInput();
attachFirstInteractionToStartRampage();
listenForEnableStateChanges();
installSpriteEasterEggListener();
