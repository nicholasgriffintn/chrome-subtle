const test = require("node:test");
const assert = require("node:assert/strict");
const RuntimeContext = require("../lib/runtime-context.js");

test("a synchronous invalidated-context error is contained and stops the caller", async () => {
  let stopped = 0;
  const runtime = {
    id: "extension-id",
    sendMessage() {
      throw new Error("Extension context invalidated.");
    }
  };

  const sent = await RuntimeContext.sendMessageSafely(runtime, { type: "STATUS" }, () => { stopped += 1; });

  assert.equal(sent, false);
  assert.equal(stopped, 1);
});

test("an asynchronous invalidated-context rejection is contained", async () => {
  let stopped = 0;
  const runtime = {
    id: "extension-id",
    sendMessage: async () => { throw new Error("Extension context invalidated."); }
  };

  const sent = await RuntimeContext.sendMessageSafely(runtime, { type: "STATUS" }, () => { stopped += 1; });

  assert.equal(sent, false);
  assert.equal(stopped, 1);
});

test("ordinary delivery failures are ignored without invalidating the caller", async () => {
  let stopped = 0;
  const runtime = {
    id: "extension-id",
    sendMessage: async () => { throw new Error("Receiving end does not exist."); }
  };

  const sent = await RuntimeContext.sendMessageSafely(runtime, { type: "STATUS" }, () => { stopped += 1; });

  assert.equal(sent, false);
  assert.equal(stopped, 0);
});

test("a missing runtime id is treated as an invalidated context", async () => {
  let stopped = 0;
  const sent = await RuntimeContext.sendMessageSafely({ sendMessage() {} }, {}, () => { stopped += 1; });

  assert.equal(sent, false);
  assert.equal(stopped, 1);
});
