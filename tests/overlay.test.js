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
  assert.match(SubtleOverlay.fontStack("youtube_sans"), /YouTube Noto/);
  assert.match(SubtleOverlay.fontStack("roboto"), /Roboto/);
  assert.match(SubtleOverlay.fontStack("open_sans"), /Open Sans/);
  assert.match(SubtleOverlay.fontStack("montserrat"), /Montserrat/);
  assert.match(SubtleOverlay.fontStack("lato"), /Lato/);
  assert.match(SubtleOverlay.fontStack("arial"), /Arial/);
  assert.match(SubtleOverlay.fontStack("typewriter"), /American Typewriter/);
  assert.match(SubtleOverlay.fontStack("tajawal"), /Tajawal/);
  assert.match(SubtleOverlay.fontStack("cairo"), /Cairo/);
  assert.match(SubtleOverlay.fontStack("almarai"), /Almarai/);
  assert.match(SubtleOverlay.fontStack("noto_kufi"), /Noto Kufi Arabic/);
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

test("edge styling respects configured colour, opacity and shadow intensity", () => {
  const edge = SubtleOverlay.edgeTreatment("outline", 4, "#123456", 50, 8);

  assert.equal(edge.stroke, "4px rgba(18, 52, 86, 0.5)");
  assert.match(edge.shadow, /0\.08em/);
  assert.match(SubtleOverlay.edgeTreatment("drop_shadow", 0, "#000000", 90, 8).shadow, /0\.08em/);
});

test("readability mode strengthens typography without overwriting stored preferences", () => {
  assert.deepEqual(
    SubtleOverlay.typography({
      fontFamily: "cursive",
      fontWeight: 400,
      lineHeight: 1.1,
      letterSpacing: -1,
      readabilityMode: true
    }),
    { fontFamily: "proportional_sans", fontWeight: 600, lineHeight: 1.5, letterSpacing: 0.5 }
  );
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

test("the second track keeps its configured scale and colour while sharing caption surfaces", () => {
  const originalDocument = global.document;
  global.document = { createElement: createFakeElement };
  try {
    const player = createFakeElement();
    player.querySelector = () => null;
    const host = SubtleOverlay.create(player);
    const state = {
      ...SubtleState.createDefaultState(),
      fontSize: 38,
      textColor: "#fefefe",
      secondaryScale: 55,
      secondaryColor: "#ff0000"
    };

    SubtleOverlay.render(host, { text: "Matching caption" }, state);

    assert.equal(host.style.properties.get("--subtle-overlay-size"), "21px");
    assert.equal(host.style.properties.get("--subtle-overlay-colour"), "rgba(255, 0, 0, 1)");
    assert.equal(host.style.properties.get("--subtle-overlay-background"), "rgba(11, 16, 19, 0.76)");
    assert.equal(host.style.properties.get("--subtle-overlay-window"), "rgba(0, 0, 0, 0)");
    assert.equal(host.style.properties.get("--subtle-overlay-stroke"), "3px rgba(0, 0, 0, 0.94)");
  } finally {
    global.document = originalDocument;
  }
});

test("movie-like layout and spacing controls reach the second-line overlay", () => {
  const originalDocument = global.document;
  global.document = { createElement: createFakeElement };
  try {
    const player = createFakeElement();
    player.querySelector = () => null;
    const host = SubtleOverlay.create(player);
    const state = {
      ...SubtleState.createDefaultState(),
      movieLike: true,
      movieWidth: 42,
      captionPadding: 8,
      captionRadius: 6,
      backgroundBlur: 4,
      textAlign: "left"
    };

    SubtleOverlay.render(host, { text: "A deliberately long caption line" }, state);

    assert.equal(host.dataset.movieLike, "true");
    assert.equal(host.style.properties.get("--subtle-overlay-max-width"), "42ch");
    assert.equal(host.style.properties.get("--subtle-overlay-padding"), "8px");
    assert.equal(host.style.properties.get("--subtle-overlay-radius"), "6px");
    assert.equal(host.style.properties.get("--subtle-overlay-blur"), "4px");
    assert.equal(host.style.properties.get("--subtle-overlay-align"), "left");
    assert.equal(host.style.properties.get("--subtle-overlay-row-gap"), "5px");
  } finally {
    global.document = originalDocument;
  }
});

test("second-line row spacing grows with padding, edge width and shadow", () => {
  const compact = SubtleOverlay.captionRowGap({ captionPadding: 2, outlineWidth: 1, shadowIntensity: 0 });
  const spacious = SubtleOverlay.captionRowGap({ captionPadding: 16, outlineWidth: 7, shadowIntensity: 20 });

  assert.ok(compact >= 2);
  assert.ok(spacious > compact);
});

test("native caption line height reserves space for window and edge paint", () => {
  const compact = SubtleOverlay.nativeCaptionLineHeight({
    ...SubtleState.createDefaultState(),
    fontSize: 40,
    lineHeight: 1.2,
    captionPadding: 0,
    edgeStyle: "none",
    outlineWidth: 0,
    shadowIntensity: 0
  });
  const styled = SubtleOverlay.nativeCaptionLineHeight({
    ...SubtleState.createDefaultState(),
    fontSize: 40,
    lineHeight: 1.2,
    captionPadding: 6,
    edgeStyle: "outline",
    outlineWidth: 3,
    shadowIntensity: 0
  });

  assert.equal(compact, 48);
  assert.equal(styled, 66);
});

test("the native caption gap clears styled multi-line caption overflow", () => {
  const gap = SubtleOverlay.captionGap(34);
  const placement = SubtleOverlay.calculateAnchoredPlacement(
    { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 },
    { left: 100, top: 60, right: 900, bottom: 230, width: 800, height: 170 },
    { width: 700, height: 100 },
    gap
  );

  assert.ok(gap >= 9);
  assert.equal(placement.top, 230 + gap);
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
      properties: new Map(),
      setProperty(name, value) { this.properties.set(name, value); this.writes += 1; },
      removeProperty(name) { this.properties.delete(name); this.writes += 1; }
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
