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

test("unchanged captions do not rewrite the overlay on every animation frame", () => {
  const originalDocument = global.document;
  global.document = { createElement: createFakeElement };
  try {
    const player = createFakeElement();
    player.querySelector = () => null;
    const host = SubtleOverlay.create(player);
    const state = SubtleState.createDefaultState();

    assert.equal(SubtleOverlay.render(host, { text: "Stable caption" }, state), true);
    const replacements = host._subtleLine.replaceWrites;
    const styleWrites = host.style.writes;

    assert.equal(SubtleOverlay.render(host, { text: "Stable caption" }, state), false);
    assert.equal(host._subtleLine.replaceWrites, replacements);
    assert.equal(host.style.writes, styleWrites);
  } finally {
    global.document = originalDocument;
  }
});

test("authored caption lines retain separate foreground backgrounds", () => {
  const originalDocument = global.document;
  global.document = { createElement: createFakeElement };
  try {
    const player = createFakeElement();
    player.querySelector = () => null;
    const host = SubtleOverlay.create(player);

    SubtleOverlay.render(
      host,
      { text: "I thought they'd\ngo away, but they're not." },
      SubtleState.createDefaultState()
    );

    assert.equal(host._subtleLine.children.length, 2);
    assert.equal(host._subtleLine.children[0].children[0].textContent, "I thought they'd");
    assert.equal(host._subtleLine.children[1].children[0].textContent, "go away, but they're not.");
  } finally {
    global.document = originalDocument;
  }
});

function createFakeElement() {
  let textContent = "";
  const element = {
    dataset: {},
    hidden: false,
    children: [],
    replaceWrites: 0,
    style: {
      writes: 0,
      setProperty() { this.writes += 1; },
      removeProperty() { this.writes += 1; }
    },
    setAttribute() {},
    attachShadow() { return createFakeElement(); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) {
      this.children = children;
      this.replaceWrites += 1;
    }
  };
  Object.defineProperty(element, "textContent", {
    get() { return textContent; },
    set(value) { textContent = String(value); }
  });
  return element;
}
