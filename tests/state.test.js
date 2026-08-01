const test = require("node:test");
const assert = require("node:assert/strict");
const SubtleState = require("../lib/state.js");

test("state normalisation preserves valid preferences and clamps unsafe values", () => {
  const state = SubtleState.normaliseState({
    enabled: false,
    mode: "dual",
    fontSize: 400,
    delayMs: -9000,
    textColor: "javascript:alert(1)",
    textOpacity: 140,
    windowColor: "#123456",
    windowOpacity: -20,
    edgeStyle: "raised",
    fontFamily: "cursive",
    targetLanguage: "pt-BR"
  });

  assert.equal(state.enabled, false);
  assert.equal(state.mode, "dual");
  assert.equal(state.fontSize, 64);
  assert.equal(state.delayMs, -5000);
  assert.equal(state.textColor, SubtleState.DEFAULT_STATE.textColor);
  assert.equal(state.textOpacity, 100);
  assert.equal(state.windowColor, "#123456");
  assert.equal(state.windowOpacity, 0);
  assert.equal(state.edgeStyle, "raised");
  assert.equal(state.fontFamily, "cursive");
  assert.equal(state.targetLanguage, "pt-br");
});

test("uploaded subtitle data must be named, non-empty and reasonably sized", () => {
  assert.equal(SubtleState.normaliseState({ uploadedTrack: { name: "", text: "cue" } }).uploadedTrack, null);
  assert.equal(SubtleState.normaliseState({ uploadedTrack: { name: "subs.srt", text: "" } }).uploadedTrack, null);
  assert.deepEqual(
    SubtleState.normaliseState({ uploadedTrack: { name: " lesson.srt ", text: "cue" } }).uploadedTrack,
    { name: "lesson.srt", text: "cue" }
  );
});

test("patching state cannot introduce unknown enum values", () => {
  const state = SubtleState.withPatch(SubtleState.createDefaultState(), {
    mode: "immersive",
    position: "middle",
    fontFamily: "remote-font",
    edgeStyle: "glow"
  });

  assert.equal(state.mode, SubtleState.DEFAULT_STATE.mode);
  assert.equal(state.position, "bottom");
  assert.equal(state.fontFamily, "proportional_sans");
  assert.equal(state.edgeStyle, "outline");
});

test("legacy font choices migrate to the expanded family set", () => {
  assert.equal(SubtleState.normaliseState({ fontFamily: "humanist" }).fontFamily, "proportional_sans");
  assert.equal(SubtleState.normaliseState({ fontFamily: "rounded" }).fontFamily, "casual");
  assert.equal(SubtleState.normaliseState({ fontFamily: "serif" }).fontFamily, "proportional_serif");
  assert.equal(SubtleState.normaliseState({ fontFamily: "mono" }).fontFamily, "monospaced_sans");
});

test("secondary subtitle sources follow platform capabilities", () => {
  const platformPreference = SubtleState.normaliseState({ secondarySource: "platform" });
  const uploadPreference = SubtleState.normaliseState({ secondarySource: "upload" });

  assert.deepEqual(SubtleState.availableSecondarySources("youtube"), ["platform", "upload"]);
  assert.deepEqual(SubtleState.availableSecondarySources("netflix"), ["platform", "upload"]);
  assert.deepEqual(SubtleState.availableSecondarySources("bbc"), ["upload"]);
  assert.deepEqual(SubtleState.availableSecondarySources("unsupported"), ["upload"]);
  assert.equal(SubtleState.effectiveSecondarySource(platformPreference, "youtube"), "platform");
  assert.equal(SubtleState.effectiveSecondarySource(platformPreference, "netflix"), "platform");
  assert.equal(SubtleState.effectiveSecondarySource(uploadPreference, "netflix"), "upload");
  assert.equal(SubtleState.effectiveSecondarySource(platformPreference, "bbc"), "upload");
});

test("the previous YouTube source value migrates to platform captions", () => {
  assert.equal(SubtleState.normaliseState({ secondarySource: "youtube" }).secondarySource, "platform");
});

test("advanced caption controls are bounded and unknown alignment is rejected", () => {
  const state = SubtleState.normaliseState({
    fontWeight: 1200,
    lineHeight: 0.2,
    letterSpacing: 99,
    captionPadding: -3,
    captionRadius: 90,
    backgroundBlur: 99,
    shadowIntensity: -2,
    strokeColor: "not-a-colour",
    strokeOpacity: 140,
    textAlign: "justify",
    movieWidth: 200
  });

  assert.equal(state.fontWeight, 900);
  assert.equal(state.lineHeight, 1);
  assert.equal(state.letterSpacing, 4);
  assert.equal(state.captionPadding, 0);
  assert.equal(state.captionRadius, 20);
  assert.equal(state.backgroundBlur, 20);
  assert.equal(state.shadowIntensity, 0);
  assert.equal(state.strokeColor, SubtleState.DEFAULT_STATE.strokeColor);
  assert.equal(state.strokeOpacity, 100);
  assert.equal(state.textAlign, "auto");
  assert.equal(state.movieWidth, 64);
});

test("legacy bottom placement keeps the site's position while legacy top remains manual", () => {
  assert.equal(SubtleState.normaliseState({ position: "bottom" }).followNativePosition, true);
  assert.equal(SubtleState.normaliseState({ position: "top" }).followNativePosition, false);
  assert.equal(SubtleState.normaliseState({ position: "top", followNativePosition: true }).followNativePosition, true);
});

test("custom blocked terms are stored as bounded plain text", () => {
  const state = SubtleState.normaliseState({ customBlockedTerms: `  sponsor\u0000\n${"x".repeat(1200)}  ` });

  assert.equal(state.customBlockedTerms.includes("\u0000"), false);
  assert.equal(state.customBlockedTerms.length, 1000);
});

test("custom block-filter editing preserves spaces and new lines", () => {
  assert.equal(
    SubtleState.normaliseState({ customBlockedTerms: "sponsored by\n" }).customBlockedTerms,
    "sponsored by\n"
  );
});

test("Shorts geometry preferences are bounded independently of regular video style", () => {
  const state = SubtleState.normaliseState({
    shortsOptimised: false,
    shortsScale: 200,
    shortsWidth: 20,
    shortsOffset: 90
  });

  assert.equal(state.shortsOptimised, false);
  assert.equal(state.shortsScale, 110);
  assert.equal(state.shortsWidth, 55);
  assert.equal(state.shortsOffset, 40);
});

test("expanded local font choices survive normalisation", () => {
  for (const fontFamily of [
    "youtube_sans", "roboto", "open_sans", "montserrat", "lato", "arial", "typewriter",
    "tajawal", "cairo", "almarai", "noto_kufi"
  ]) {
    assert.equal(SubtleState.normaliseState({ fontFamily }).fontFamily, fontFamily);
  }
});
