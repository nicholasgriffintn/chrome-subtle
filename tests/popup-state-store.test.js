const test = require("node:test");
const assert = require("node:assert/strict");
const PopupStateStore = require("../lib/popup-state-store.js");

test("continuous changes are coalesced and the latest state is persisted", async () => {
  const harness = createHarness();
  const store = PopupStateStore.create(harness.options);

  store.queue({ fontSize: 35 });
  store.queue({ fontSize: 36 });

  assert.equal(harness.writes.length, 0);
  await harness.runLatestTimer();
  assert.deepEqual(harness.writes, [{ subtleState: { fontSize: 36 } }]);
});

test("discrete changes start saving immediately", async () => {
  const harness = createHarness();
  const store = PopupStateStore.create(harness.options);

  const saved = store.save({ enabled: false });

  assert.deepEqual(harness.writes, [{ subtleState: { enabled: false } }]);
  await saved;
});

test("only the latest write controls save status", async () => {
  const writes = [];
  const statuses = [];
  const resolvers = [];
  const store = PopupStateStore.create({
    storageArea: {
      set(value) {
        writes.push(value);
        return new Promise((resolve) => resolvers.push(resolve));
      }
    },
    storageKey: "subtleState",
    onStatus: (status) => statuses.push(status),
    timers: { setTimeout: () => 1, clearTimeout() {} }
  });

  const first = store.save({ mode: "single" });
  const second = store.save({ mode: "dual" });
  resolvers[0]();
  await first;
  assert.notEqual(statuses.at(-1), "Saved");
  resolvers[1]();
  await second;

  assert.deepEqual(writes, [
    { subtleState: { mode: "single" } },
    { subtleState: { mode: "dual" } }
  ]);
  assert.equal(statuses.at(-1), "Saved");
});

function createHarness() {
  const writes = [];
  const timers = [];
  const statuses = [];
  const options = {
    storageArea: { async set(value) { writes.push(value); } },
    storageKey: "subtleState",
    onStatus: (status) => statuses.push(status),
    timers: {
      setTimeout(callback) {
        const timer = { callback, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout(timer) {
        if (timer) timer.cleared = true;
      }
    }
  };
  return {
    options,
    writes,
    statuses,
    async runLatestTimer() {
      const timer = timers.findLast((candidate) => !candidate.cleared);
      await timer.callback();
    }
  };
}
