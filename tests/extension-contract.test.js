const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("manifest keeps permissions narrow and loads reusable modules before orchestration", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const access = require("../lib/site-access.js");
  const registrations = access.all().flatMap(access.registrationsFor);
  const isolated = registrations.find((script) => script.js.includes("content.js"));
  const mainWorldScripts = registrations.filter((script) => script.world === "MAIN");

  assert.equal(manifest.version, "0.2.0");
  assert.deepEqual(manifest.permissions, ["storage", "activeTab", "scripting"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal("content_scripts" in manifest, false);
  assert.deepEqual(manifest.optional_host_permissions, access.all().flatMap((platform) => platform.origins));
  assert.ok(isolated.js.indexOf("lib/state.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.includes("lib/runtime-context.js"));
  assert.ok(isolated.js.indexOf("lib/runtime-context.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.indexOf("lib/platform-captions.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.indexOf("lib/runtime.js") < isolated.js.indexOf("content.js"));
  assert.ok(mainWorldScripts.some((script) => script.js.includes("youtube-page-bridge.js") && script.matches.some((match) => match.includes("youtube"))));
  assert.ok(mainWorldScripts.some((script) => script.js.includes("netflix-page-bridge.js") && script.matches.some((match) => match.includes("netflix"))));
  assert.match(read("service-worker.js"), /permissions[.]onRemoved/);
  assert.match(read("service-worker.js"), /unregisterContentScripts/);
});

test("the page bridge has no extension API access and the content entry point only orchestrates", () => {
  const bridge = read("youtube-page-bridge.js");
  const netflixBridge = read("netflix-page-bridge.js");
  assert.doesNotMatch(bridge, /chrome[.](storage|runtime|tabs)/);
  assert.doesNotMatch(netflixBridge, /chrome[.](storage|runtime|tabs)/);
  assert.match(bridge, /XMLHttpRequest/);
  assert.match(bridge, /PerformanceObserver/);
  assert.match(bridge, /globalThis[.]fetch/);
  assert.match(bridge, /[/]api[/]timedtext/);
  assert.match(bridge, /subtle_client/);
  assert.match(bridge, /getOption[?][.]\("captions", "tracklist"\)/);
  assert.doesNotMatch(bridge, /ytInitialPlayerResponse/);
  assert.match(netflixBridge, /showAllSubDubTracks/);
  assert.match(netflixBridge, /ttDownloadables/);
  assert.match(netflixBridge, /CONTENT_REQUEST_EVENT/);
  assert.match(read("content.js"), /SubtleRuntime[.]start/);
  assert.ok(read("content.js").split("\n").length < 10);
  assert.match(read("popup.js"), /SubtlePopup[.]start/);
  assert.ok(read("popup.js").split("\n").length < 10);
});

test("popup exposes dual mode, local import and privacy status", () => {
  const popup = read("popup.html");
  const popupCss = read("popup.css");
  const controller = read("lib/popup-controller.js");
  const settings = read("lib/caption-settings.js");
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
  assert.match(popup, /id="platform-source-option"/);
  assert.match(popup, /id="enable-site"/);
  assert.match(popup, /id="limited-view"/);
  assert.match(popup, /id="full-popup" hidden/);
  assert.match(popup, /value="platform"/);
  assert.match(controller, /SubtleCaptionSettings[.]sourceView\(state, pageStatus/);
  assert.match(settings, /pageStatus[?][.]availableTracks/);
  assert.match(settings, /Second language/);
  assert.match(controller, /message[?][.]type !== "SUBTLE_STATUS"/);
  assert.match(controller, /chrome[.]permissions[.]request/);
  assert.match(controller, /SubtlePopupAccess[.]view/);
  assert.match(read("popup.js"), /catch\(SubtlePopup[.]showStartError\)/);
  assert.match(popup, /id="source-note"[^>]*role="status"/);
  assert.match(popupCss, /[.]upload-button:focus-within/);
  assert.match(popupCss, /[.]power:has\(input:focus-visible\)/);
  assert.match(popupCss, /[.]check-row:has\(input:focus-visible\)/);
  assert.doesNotMatch(popupCss, /[.]upload-button input[^}]*pointer-events:\s*none/s);
  assert.doesNotMatch(controller, /Netflix does not expose a stable second track/);
});

test("dual captions follow native captions without displacing site containers", () => {
  const runtime = read("lib/runtime.js");
  const css = read("content.css");
  const overlay = read("lib/overlay.js");
  assert.match(runtime, /dataset[.]subtleMode = state[.]mode/);
  assert.match(runtime, /--subtle-offset/);
  assert.doesNotMatch(runtime, /--subtle-primary-offset/);
  assert.doesNotMatch(css, /caption-visual-line/);
  assert.match(css, /box-shadow: 0 0 0 var\(--subtle-window-padding\) var\(--subtle-window-background\)/);
  assert.doesNotMatch(css, /caption-window[^\{]*\{\s*background: var\(--subtle-window-background\)/);
  assert.match(runtime, /SubtleRuntimeContext[.]hasContext/);
  assert.match(runtime, /effectiveSecondarySource\(state, adapter[.]id\)/);
  assert.match(runtime, /platformId: adapter[.]id/);
  assert.match(runtime, /captionProvider[.]loadCues/);
  assert.match(runtime, /pendingCueSourceKey/);
  assert.doesNotMatch(css, /[.]player-timedtext\s*\{[^}]*\bbottom:/s);
  assert.doesNotMatch(css, /[.]ytp-caption-window-container\s*\{[^}]*\b(?:top|bottom):/s);
  assert.match(css, /data-subtle-position="top"[^\{]*[.]caption-window\s*\{[^}]*\btop: var\(--subtle-offset\)/s);
  assert.match(css, /data-subtle-position="top"[^\{]*[.]caption-window\s*\{[^}]*\bbottom: auto/s);
  assert.match(overlay, /:host \{[^}]*overflow: hidden;/s);
  assert.match(overlay, /[.]window \{[^}]*box-sizing: border-box;/s);
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
