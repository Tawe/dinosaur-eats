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

chrome.runtime.onInstalled.addListener(async () => {
  await setEnabledState(await getEnabledState());
});

chrome.runtime.onStartup.addListener(async () => {
  await setEnabledState(await getEnabledState());
});

chrome.action.onClicked.addListener(async () => {
  const enabled = await getEnabledState();
  await setEnabledState(!enabled);
});
