const test = require("node:test");
const assert = require("node:assert/strict");
const SubtleOverlay = require("../lib/overlay.js");
const SubtleState = require("../lib/state.js");

test("expanded font families resolve to local system stacks", () => {
  assert.match(SubtleOverlay.fontStack("monospaced_serif"), /Courier/);
  assert.match(SubtleOverlay.fontStack("proportional_serif"), /Times New Roman/);
  assert.match(SubtleOverlay.fontStack("monospaced_sans"), /DejaVu Sans Mono/);
  assert.match(SubtleOverlay.fontStack("proportional_sans"), /Avenir Next/);
  assert.match(SubtleOverlay.fontStack("casual"), /Chalkboard/);
  assert.match(SubtleOverlay.fontStack("cursive"), /Apple Chancery/);
  assert.equal(SubtleOverlay.fontVariant("small_caps"), "small-caps");
});

test("edge styles produce distinct stroke and shadow treatments", () => {
  assert.equal(SubtleOverlay.edgeTreatment("none", 3).shadow, "none");
  assert.match(SubtleOverlay.edgeTreatment("drop_shadow", 3).shadow, /0\.12em/);
  assert.notEqual(
    SubtleOverlay.edgeTreatment("raised", 3).shadow,
    SubtleOverlay.edgeTreatment("depressed", 3).shadow
  );
  assert.equal(SubtleOverlay.edgeTreatment("outline", 4).stroke, "4px rgba(0, 0, 0, 0.94)");
});

test("dual captions anchor directly below the native caption box", () => {
  const placement = SubtleOverlay.calculateAnchoredPlacement(
    { left: 100, top: 50, right: 1100, bottom: 650, width: 1000, height: 600 },
    { left: 350, top: 500, right: 750, bottom: 550, width: 400, height: 50 },
    { width: 300, height: 40 },
    4
  );

  assert.deepEqual(placement, { left: 450, top: 504 });
});

test("dual captions stay inside the player when there is no room below", () => {
  const placement = SubtleOverlay.calculateAnchoredPlacement(
    { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 },
    { left: 300, top: 550, right: 700, bottom: 590, width: 400, height: 40 },
    { width: 320, height: 48 },
    4
  );

  assert.deepEqual(placement, { left: 500, top: 498 });
});

test("dual captions follow a native left alignment instead of forcing centre", () => {
  const placement = SubtleOverlay.calculateAnchoredPlacement(
    { left: 100, top: 50, right: 1100, bottom: 650, width: 1000, height: 600 },
    { left: 350, top: 500, right: 750, bottom: 550, width: 400, height: 50 },
    { width: 300, height: 40 },
    4,
    "left"
  );

  assert.deepEqual(placement, { left: 250, top: 504 });
});

test("an absent cue hides the complete window layer", () => {
  const originalDocument = global.document;
  global.document = { createElement: createFakeElement };
  try {
    const player = createFakeElement();
    player.querySelector = () => null;
    const host = SubtleOverlay.create(player);
    const state = SubtleState.createDefaultState();

    SubtleOverlay.render(host, { text: "Attached line" }, state);
    assert.equal(host._subtleWindow.hidden, false);
    SubtleOverlay.render(host, null, state);
    assert.equal(host._subtleWindow.hidden, true);
  } finally {
    global.document = originalDocument;
  }
});

function createFakeElement() {
  return {
    dataset: {},
    hidden: false,
    style: { setProperty() {}, removeProperty() {} },
    setAttribute() {},
    attachShadow() { return createFakeElement(); },
    append(...children) { this.children = [...(this.children || []), ...children]; }
  };
}
