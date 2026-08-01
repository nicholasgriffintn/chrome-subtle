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
  assert.deepEqual(SubtleState.availableSecondarySources("unsupported"), ["upload"]);
  assert.equal(SubtleState.effectiveSecondarySource(platformPreference, "youtube"), "platform");
  assert.equal(SubtleState.effectiveSecondarySource(platformPreference, "netflix"), "platform");
  assert.equal(SubtleState.effectiveSecondarySource(uploadPreference, "netflix"), "upload");
});

test("the previous YouTube source value migrates to platform captions", () => {
  assert.equal(SubtleState.normaliseState({ secondarySource: "youtube" }).secondarySource, "platform");
});
