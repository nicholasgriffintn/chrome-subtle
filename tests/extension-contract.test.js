const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("manifest keeps permissions narrow and loads reusable modules before orchestration", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const isolated = manifest.content_scripts.find((script) => script.js.includes("content.js"));

  assert.equal(manifest.version, "0.1.3");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
  assert.ok(isolated.js.indexOf("lib/state.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.includes("lib/runtime-context.js"));
  assert.ok(isolated.js.indexOf("lib/runtime-context.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.indexOf("lib/runtime.js") < isolated.js.indexOf("content.js"));
});

test("the page bridge has no extension API access and the content entry point only orchestrates", () => {
  const bridge = read("page-bridge.js");
  assert.doesNotMatch(bridge, /chrome[.](storage|runtime|tabs)/);
  assert.match(bridge, /XMLHttpRequest/);
  assert.match(bridge, /PerformanceObserver/);
  assert.match(bridge, /globalThis[.]fetch/);
  assert.match(bridge, /[/]api[/]timedtext/);
  assert.match(bridge, /subtle_client/);
  assert.doesNotMatch(bridge, /getPlayerResponse|ytInitialPlayerResponse/);
  assert.match(read("content.js"), /SubtleRuntime[.]start/);
  assert.ok(read("content.js").split("\n").length < 10);
  assert.match(read("popup.js"), /SubtlePopup[.]start/);
  assert.ok(read("popup.js").split("\n").length < 10);
});

test("popup exposes dual mode, local import and privacy status", () => {
  const popup = read("popup.html");
  const controller = read("lib/popup-controller.js");
  assert.match(popup, /data-mode="dual"/);
  assert.match(popup, /accept="[^"]*[.]srt/);
  assert.match(popup, /No account, analytics or subtitle uploads/);
  assert.match(popup, /id="target-language"/);
  assert.match(popup, /id="text-opacity"/);
  assert.match(popup, /id="background-colour"/);
  assert.match(popup, /id="window-colour"/);
  assert.match(popup, /id="window-opacity"/);
  assert.match(popup, /id="edge-style"/);
  assert.match(popup, /value="monospaced_serif"/);
  assert.match(popup, /value="cursive"/);
  assert.match(popup, /id="youtube-source-option"/);
  assert.match(controller, /effectiveSecondarySource\(state, pageStatus[?][.]platformId\)/);
  assert.match(controller, /youtubeSourceOption[.]hidden = isNetflix/);
  assert.doesNotMatch(controller, /Netflix does not expose a stable second track/);
});

test("dual mode separates the native and secondary caption lines", () => {
  const runtime = read("lib/runtime.js");
  const css = read("content.css");
  assert.match(runtime, /dataset[.]subtleMode = state[.]mode/);
  assert.match(runtime, /--subtle-primary-offset/);
  assert.match(css, /data-subtle-mode="dual"/);
  assert.doesNotMatch(css, /caption-visual-line/);
  assert.match(css, /box-shadow: 0 0 0 var\(--subtle-window-padding\) var\(--subtle-window-background\)/);
  assert.doesNotMatch(css, /caption-window[^\{]*\{\s*background: var\(--subtle-window-background\)/);
  assert.match(runtime, /SubtleRuntimeContext[.]hasContext/);
  assert.match(runtime, /effectiveSecondarySource\(state, adapter[.]id\)/);
  assert.match(runtime, /platformId: adapter[.]id/);
  assert.match(runtime, /adapter[.]id !== "youtube"\) await loadCues\(\)/);
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
