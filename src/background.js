const ENABLED_STORAGE_KEY = "dinoEatsEnabled";

async function getEnabledState() {
  const result = await chrome.storage.local.get(ENABLED_STORAGE_KEY);
  if (!(ENABLED_STORAGE_KEY in result)) return true;
  return result[ENABLED_STORAGE_KEY] !== false;
}

async function setEnabledState(enabled) {
  await chrome.storage.local.set({ [ENABLED_STORAGE_KEY]: enabled });
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  await chrome.action.setTitle({
    title: enabled ? "Dinosaur Eats: ON" : "Dinosaur Eats: OFF"
  });
}

async function injectOnTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["src/dino.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content.js"]
    });
  } catch {
    // Ignore unsupported pages like chrome:// and extension store pages.
  }
}

async function syncActionFromStorage() {
  await setEnabledState(await getEnabledState());
}

chrome.runtime.onInstalled.addListener(syncActionFromStorage);
chrome.runtime.onStartup.addListener(syncActionFromStorage);

chrome.action.onClicked.addListener(async (tab) => {
  const enabled = await getEnabledState();
  const nextEnabled = !enabled;
  await setEnabledState(nextEnabled);
  if (nextEnabled && tab?.id) {
    await injectOnTab(tab.id);
  }
});
