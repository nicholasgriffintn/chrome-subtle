const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SiteAccess = require("../lib/site-access.js");
const State = require("../lib/state.js");

test("registration sync keeps granted scripts current and removes revoked platforms", async () => {
  const registered = SiteAccess.all().flatMap(SiteAccess.registrationsFor);
  const updates = [];
  const removals = [];
  const additions = [];
  const badgeTexts = [];
  const events = eventRegistry();
  const context = {
    console,
    importScripts() {
      context.SubtleState = State;
      context.SubtleSiteAccess = SiteAccess;
    },
    chrome: {
      action: { setBadgeText(value) { badgeTexts.push(value); }, setBadgeBackgroundColor() {} },
      storage: { local: { async get() { return { [State.STORAGE_KEY]: State.createDefaultState() }; }, async set() {} } },
      permissions: {
        async contains(permission) { return permission.origins.some((origin) => origin.includes("youtube")); },
        onAdded: events.event("permissionsAdded"),
        onRemoved: events.event("permissionsRemoved")
      },
      scripting: {
        async getRegisteredContentScripts() { return registered; },
        async updateContentScripts(scripts) { updates.push(...scripts); },
        async unregisterContentScripts({ ids }) { removals.push(...ids); },
        async registerContentScripts(scripts) { additions.push(...scripts); }
      },
      runtime: {
        onInstalled: events.event("installed"),
        onStartup: events.event("startup"),
        onMessage: events.event("message")
      }
    }
  };

  const source = fs.readFileSync(path.resolve(__dirname, "../service-worker.js"), "utf8");
  vm.runInNewContext(source, context);
  await settlePromises();

  const ungrantedIds = SiteAccess.all()
    .filter((platform) => platform.id !== "youtube")
    .flatMap(SiteAccess.registrationIds)
    .sort();
  assert.deepEqual(removals.sort(), ungrantedIds);
  assert.deepEqual(updates.map((script) => script.id).sort(), SiteAccess.registrationIds(SiteAccess.forId("youtube")).sort());
  assert.deepEqual(additions, []);

  events.emit("message", {
    type: "SUBTLE_STATUS",
    status: { playerFound: true, enabled: false }
  }, { tab: { id: 7 } });
  events.emit("message", {
    type: "SUBTLE_STATUS",
    status: { playerFound: true, enabled: true }
  }, { tab: { id: 7 } });
  assert.deepEqual(JSON.parse(JSON.stringify(badgeTexts.slice(-2))), [
    { tabId: 7, text: "" },
    { tabId: 7, text: "CC" }
  ]);
});

function eventRegistry() {
  const listeners = new Map();
  return {
    event(name) {
      return { addListener(listener) { listeners.set(name, listener); } };
    },
    emit(name, ...args) {
      return listeners.get(name)?.(...args);
    }
  };
}

async function settlePromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
