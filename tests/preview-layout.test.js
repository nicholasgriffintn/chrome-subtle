const test = require("node:test");
const assert = require("node:assert/strict");
const SubtlePreviewLayout = require("../lib/preview-layout.js");

test("preview content scales down only when its configured style exceeds the stage", () => {
  assert.equal(SubtlePreviewLayout.scaleForBounds(80, 100), 1);
  assert.equal(SubtlePreviewLayout.scaleForBounds(200, 100), 0.5);
  assert.equal(SubtlePreviewLayout.scaleForBounds(800, 100), 0.25);
});

test("preview fitting writes a bounded scale using the actual rendered height", () => {
  const properties = new Map();
  const stage = { clientHeight: 146 };
  const windowLayer = {
    classList: { contains: () => false },
    style: { setProperty: (name, value) => properties.set(name, value) }
  };
  const content = { scrollHeight: 220 };

  assert.equal(SubtlePreviewLayout.fit(stage, windowLayer, content), 0.5);
  assert.equal(properties.get("--preview-content-scale"), "0.5");
});
