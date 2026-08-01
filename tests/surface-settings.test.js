const test = require("node:test");
const assert = require("node:assert/strict");
const SubtleState = require("../lib/state.js");

test("surface detection distinguishes Shorts routes from regular YouTube video routes", () => {
  assert.equal(SubtleState.surfaceForPathname("/shorts/abc123"), "shorts");
  assert.equal(SubtleState.surfaceForPathname("/watch"), "video");
  assert.equal(SubtleState.surfaceForUrl("https://www.youtube.com/shorts/abc123"), "shorts");
});

test("Shorts inherits visual style while applying bounded vertical-video geometry", () => {
  const state = SubtleState.normaliseState({
    fontSize: 40,
    captionPadding: 14,
    movieLike: false,
    movieWidth: 52,
    textAlign: "auto",
    offset: 9,
    shortsOptimised: true,
    shortsScale: 75,
    shortsWidth: 72,
    shortsOffset: 18
  });
  const effective = SubtleState.effectiveSurfaceState(state, "shorts");

  assert.equal(effective.surface, "shorts");
  assert.equal(effective.fontSize, 30);
  assert.equal(effective.captionPadding, 8);
  assert.equal(effective.movieLike, true);
  assert.equal(effective.movieWidth, 44);
  assert.equal(effective.textAlign, "center");
  assert.equal(effective.offset, 18);
  assert.equal(effective.shortsWidth, 72);
  assert.equal(state.fontSize, 40);
});

test("disabling Shorts optimisation preserves the regular style", () => {
  const state = SubtleState.normaliseState({ shortsOptimised: false, fontSize: 40, offset: 9 });
  const effective = SubtleState.effectiveSurfaceState(state, "shorts");

  assert.equal(effective.surface, "shorts");
  assert.equal(effective.fontSize, 40);
  assert.equal(effective.offset, 9);
});
