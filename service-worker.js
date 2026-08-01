importScripts("lib/state.js", "lib/site-access.js");

let registrationSync = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => initialise().catch(reportError));
chrome.runtime.onStartup.addListener(() => queueRegistrationSync());
chrome.permissions.onAdded.addListener(() => queueRegistrationSync());
chrome.permissions.onRemoved.addListener(() => queueRegistrationSync());

async function initialise() {
  const stored = await chrome.storage.local.get(SubtleState.STORAGE_KEY);
  if (!stored[SubtleState.STORAGE_KEY]) {
    await chrome.storage.local.set({ [SubtleState.STORAGE_KEY]: SubtleState.createDefaultState() });
  }
  await queueRegistrationSync();
}

function queueRegistrationSync() {
  registrationSync = registrationSync.then(syncRegistrations, syncRegistrations);
  return registrationSync;
}

async function syncRegistrations() {
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const registeredIds = new Set(registered.map((script) => script.id));
  const wanted = [];

  for (const platform of SubtleSiteAccess.all()) {
    const granted = await chrome.permissions.contains(SubtleSiteAccess.permissionFor(platform));
    if (granted) wanted.push(...SubtleSiteAccess.registrationsFor(platform));
  }

  const wantedIds = new Set(wanted.map((script) => script.id));
  const obsoleteIds = SubtleSiteAccess.all()
    .flatMap(SubtleSiteAccess.registrationIds)
    .filter((id) => registeredIds.has(id) && !wantedIds.has(id));
  if (obsoleteIds.length) await chrome.scripting.unregisterContentScripts({ ids: obsoleteIds });

  const existing = wanted.filter((script) => registeredIds.has(script.id));
  if (existing.length) await chrome.scripting.updateContentScripts(existing);

  const missing = wanted.filter((script) => !registeredIds.has(script.id));
  if (missing.length) await chrome.scripting.registerContentScripts(missing);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SYNC_SUBTLE_SITE_ACCESS") {
    queueRegistrationSync()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "SUBTLE_STATUS" && sender.tab?.id) {
    const active = message.status?.enabled && message.status?.playerFound;
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: active ? "CC" : "" });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#f2b84b" });
  }
});

function reportError(error) {
  console.error("Subtle could not initialise site access.", error);
}

queueRegistrationSync().catch(reportError);
