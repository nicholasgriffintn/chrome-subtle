importScripts("lib/state.js");

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(SubtleState.STORAGE_KEY);
  if (!stored[SubtleState.STORAGE_KEY]) {
    await chrome.storage.local.set({ [SubtleState.STORAGE_KEY]: SubtleState.createDefaultState() });
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "SUBTLE_STATUS" || !sender.tab?.id) return;
  const active = message.status?.playerFound;
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: active ? "CC" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#f2b84b" });
});
