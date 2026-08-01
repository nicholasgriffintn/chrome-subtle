const test = require("node:test");
const assert = require("node:assert/strict");
const SubtlePreviewBackground = require("../lib/preview-background.js");

test("preview capture requests one bounded JPEG from the active window", async () => {
  const calls = [];
  const tabs = {
    async captureVisibleTab(windowId, options) {
      calls.push({ windowId, options });
      return "data:image/jpeg;base64,ZmFrZQ==";
    }
  };

  assert.equal(await SubtlePreviewBackground.capture(tabs, 42), "data:image/jpeg;base64,ZmFrZQ==");
  assert.deepEqual(calls, [{ windowId: 42, options: { format: "jpeg", quality: 45 } }]);
});

test("preview capture fails quietly on restricted pages or invalid responses", async () => {
  const denied = { captureVisibleTab: async () => { throw new Error("Not permitted"); } };
  const invalid = { captureVisibleTab: async () => "https://example.com/image.jpg" };

  assert.equal(await SubtlePreviewBackground.capture(denied, 1), null);
  assert.equal(await SubtlePreviewBackground.capture(invalid, 1), null);
  assert.equal(await SubtlePreviewBackground.capture(null, 1), null);
});
