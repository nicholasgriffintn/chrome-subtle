const test = require("node:test");
const assert = require("node:assert/strict");
const PopupAccess = require("../lib/popup-access.js");

test("granted supported sites receive the full popup", () => {
  assert.deepEqual(PopupAccess.view({ label: "YouTube" }, true), { kind: "full" });
});

test("supported sites without access receive only a platform grant action", () => {
  const view = PopupAccess.view({ label: "Netflix" }, false);
  assert.equal(view.kind, "request");
  assert.equal(view.title, "Enable Subtle on Netflix");
  assert.equal(view.action, "Enable on Netflix");
});

test("unsupported sites receive a compact unavailable message", () => {
  const view = PopupAccess.view(null, false);
  assert.equal(view.kind, "unsupported");
  assert.match(view.title, /doesn’t work with this site yet/);
  assert.equal("action" in view, false);
});
