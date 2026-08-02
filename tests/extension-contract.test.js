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
  assert.ok(isolated.js.indexOf("lib/cues.js") < isolated.js.indexOf("lib/native-caption-filters.js"));
  assert.ok(isolated.js.indexOf("lib/native-caption-filters.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.indexOf("lib/native-caption-styles.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.indexOf("lib/runtime-context.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.indexOf("lib/platform-captions.js") < isolated.js.indexOf("lib/runtime.js"));
  assert.ok(isolated.js.indexOf("lib/runtime.js") < isolated.js.indexOf("content.js"));
  assert.ok(mainWorldScripts.some((script) => script.js.includes("youtube-page-bridge.js") && script.matches.some((match) => match.includes("youtube"))));
  assert.ok(mainWorldScripts.some((script) => script.js.includes("netflix-page-bridge.js") && script.matches.some((match) => match.includes("netflix"))));
  assert.ok(mainWorldScripts.some((script) => script.js.includes("disney-page-bridge.js") && script.matches.some((match) => match.includes("disneyplus"))));
  assert.ok(mainWorldScripts.some((script) => script.js.includes("prime-page-bridge.js") && script.matches.some((match) => match.includes("amazon.co.uk"))));
  assert.equal(mainWorldScripts.some((script) => script.matches.some((match) => match.includes("bbc.co.uk"))), false);
  assert.ok(registrations.some((script) => script.world === "ISOLATED" && script.matches.some((match) => match.includes("bbc.co.uk"))));
  assert.match(read("service-worker.js"), /permissions[.]onRemoved/);
  assert.match(read("service-worker.js"), /unregisterContentScripts/);
});

test("the page bridge has no extension API access and the content entry point only orchestrates", () => {
  const bridge = read("youtube-page-bridge.js");
  const netflixBridge = read("netflix-page-bridge.js");
  const disneyBridge = read("disney-page-bridge.js");
  const primeBridge = read("prime-page-bridge.js");
  assert.doesNotMatch(bridge, /chrome[.](storage|runtime|tabs)/);
  assert.doesNotMatch(netflixBridge, /chrome[.](storage|runtime|tabs)/);
  assert.doesNotMatch(disneyBridge, /chrome[.](storage|runtime|tabs)/);
  assert.doesNotMatch(primeBridge, /chrome[.](storage|runtime|tabs)/);
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
  assert.match(disneyBridge, /stream[?][.]sources/);
  assert.match(disneyBridge, /CONTENT_REQUEST_EVENT/);
  assert.match(primeBridge, /GetVodPlaybackResources/);
  assert.match(primeBridge, /subtitleUrls/);
  assert.match(primeBridge, /CONTENT_REQUEST_EVENT/);
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

test("popup organises parity controls into accessible main, style and custom tabs", () => {
  const popup = read("popup.html");
  const controller = read("lib/popup-controller.js");
  const presets = require("../lib/presets.js");

  assert.match(popup, /role="tablist"/);
  assert.match(popup, /role="tab"[^>]*>Main</);
  assert.match(popup, /role="tab"[^>]*>Style</);
  assert.match(popup, /role="tab"[^>]*>Custom</);
  assert.match(popup, /id="follow-native-position"/);
  assert.match(popup, /id="youtube-position-controls"/);
  assert.match(popup, /id="shorts-settings"/);
  assert.match(popup, /id="shorts-scale"/);
  assert.match(popup, /id="shorts-width"/);
  assert.match(popup, /id="shorts-offset"/);
  assert.match(popup, /id="movie-like"/);
  assert.match(popup, /id="text-align"/);
  assert.match(popup, /id="readability-mode"/);
  assert.match(popup, /id="custom-blocked-terms"/);
  assert.match(popup, /data-mode="single">Single</);
  assert.match(controller, /confirm\("Reset all settings and remove the imported subtitle file[?]"\)/);
  assert.match(controller, /finally\s*\{\s*elements[.]subtitleFile[.]value = "";/s);
  assert.equal(Object.keys(presets.all()).length, 9);
  assert.equal((popup.match(/<h2>Set the voice<\/h2>/g) || []).length, 1);
});

test("font picker expands through local fallback stacks without remote font loading", () => {
  const popup = read("popup.html");
  const overlay = read("lib/overlay.js");

  for (const value of ["youtube_sans", "roboto", "open_sans", "montserrat", "lato", "arial", "typewriter", "tajawal", "cairo", "almarai", "noto_kufi"]) {
    assert.match(popup, new RegExp(`value="${value}"`));
  }
  assert.doesNotMatch(overlay, /fonts[.]googleapis[.]com|https?:\/\//);
});

test("live preview remains visible, clips safely and can use an active-tab snapshot", () => {
  const popup = read("popup.html");
  const popupCss = read("popup.css");
  const controller = read("lib/popup-controller.js");

  assert.match(popup, /class="preview-dock"/);
  assert.match(popup, /lib[/]preview-background[.]js/);
  assert.match(popup, /lib[/]preview-layout[.]js/);
  assert.match(popupCss, /[.]preview-dock\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
  assert.match(popupCss, /[.]preview-window\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(popupCss, /[.]preview-lines\s*\{[^}]*min-width:\s*0;/s);
  assert.match(popupCss, /overflow-x:\s*clip/);
  assert.doesNotMatch(popupCss, /overflow-x:\s*hidden/);
  assert.match(controller, /SubtlePreviewBackground[.]capture/);
  assert.match(controller, /SubtlePreviewLayout[.]fit/);
});

test("dual captions follow native captions without displacing site containers", () => {
  const runtime = read("lib/runtime.js");
  const css = read("content.css");
  const overlay = read("lib/overlay.js");
  assert.match(runtime, /dataset[.]subtleMode = state[.]mode/);
  assert.match(runtime, /--subtle-offset/);
  assert.doesNotMatch(runtime, /--subtle-primary-offset/);
  assert.match(css, /box-shadow: 0 0 0 var\(--subtle-window-padding\) var\(--subtle-window-background\)/);
  assert.match(css, /line-height: var\(--subtle-native-line-height\)/);
  assert.match(css, /padding: 0 var\(--subtle-window-padding\)/);
  assert.match(runtime, /--subtle-native-line-height/);
  assert.match(runtime, /SubtleOverlay[.]nativeCaptionLineHeight/);
  assert.doesNotMatch(css, /caption-window[^\{]*\{\s*background: var\(--subtle-window-background\)/);
  assert.match(runtime, /SubtleRuntimeContext[.]hasContext/);
  assert.match(runtime, /effectiveSecondarySource\(state, adapter[.]id\)/);
  assert.match(runtime, /platformId: adapter[.]id/);
  assert.match(runtime, /captionProvider[.]loadCues/);
  assert.match(runtime, /pendingCueSourceKey/);
  assert.doesNotMatch(css, /[.]player-timedtext\s*\{[^}]*\bbottom:/s);
  assert.doesNotMatch(css, /[.]ytp-caption-window-container\s*\{[^}]*\b(?:top|bottom):/s);
  assert.match(css, /data-subtle-follow-position="false"[^\{]*data-subtle-position="top"[^\{]*[.]caption-window\s*\{[^}]*\btop: var\(--subtle-offset\)/s);
  assert.match(css, /data-subtle-follow-position="false"[^\{]*data-subtle-position="bottom"[^\{]*[.]caption-window\s*\{[^}]*\bbottom: var\(--subtle-offset\)/s);
  assert.match(css, /data-subtle-movie-like="true"/);
  assert.match(css, /--subtle-movie-width/);
  assert.match(runtime, /dataset[.]subtleFollowPosition/);
  assert.match(runtime, /SubtleState[.]surfaceForPathname/);
  assert.match(runtime, /SubtleState[.]effectiveSurfaceState/);
  assert.match(runtime, /nativeCaptionElements/);
  assert.match(css, /[.]subtle-blocked-caption/);
  assert.match(overlay, /:host \{[^}]*overflow: hidden;/s);
  assert.match(overlay, /[.]window \{[^}]*box-sizing: border-box;/s);
  assert.match(overlay, /[.]row \{[^}]*display: flex;/s);
  assert.match(overlay, /[.]segment \{[^}]*display: inline-block;/s);
  assert.match(overlay, /data-surface="shorts"\]\[data-shorts-optimised="true"/);
  assert.match(css, /data-subtle-surface="shorts"/);
  assert.match(css, /--subtle-shorts-width/);
});

test("Netflix styling targets only the innermost caption span", () => {
  const css = read("content.css");

  assert.match(css, /[.]player-timedtext-text-container span:not\(:has\(\*\)\)/);
  assert.match(css, /\[data-uia="timed-text-container"\] span:not\(:has\(\*\)\)/);
  assert.doesNotMatch(css, /[.]player-timedtext-text-container span,/);
  assert.doesNotMatch(css, /\[data-uia="timed-text-container"\] span\s*\{/);
});

test("Prime Video styling targets its stable caption class and clears only the redundant wrapper", () => {
  const css = read("content.css");

  assert.match(css, /[.]atvwebplayersdk-captions-text/);
  assert.match(css, /[.]atvwebplayersdk-captions-overlay p > span:not\([.]atvwebplayersdk-captions-text\)/);
  assert.match(css, /[.]atvwebplayersdk-captions-overlay p > span:not\([.]atvwebplayersdk-captions-text\)[^{]*\{[^}]*background:\s*transparent\s*!important/s);
});

test("BBC styling keeps site-provided speaker colours on caption leaves", () => {
  const styles = read("lib/native-caption-styles.js");
  const popup = read("popup.html");
  const controller = read("lib/popup-controller.js");

  assert.match(styles, /CAPTION_LEAF/);
  assert.match(styles, /background: var\(--subtle-caption-background\)/);
  assert.match(styles, /font-family: var\(--subtle-font-family\)/);
  const bbcStyles = styles.slice(styles.indexOf("function bbcStylesheet"), styles.indexOf("function disneyStylesheet"));
  assert.doesNotMatch(bbcStyles, /(?:^|\s)color:/);
  assert.match(popup, /id="bbc-colour-note"[^>]*hidden/);
  assert.match(controller, /activePlatform[?][.]id === "bbc"/);
  assert.match(controller, /primaryColourField[.]hidden = preservesNativeColour/);
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
