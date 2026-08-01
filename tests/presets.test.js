const test = require("node:test");
const assert = require("node:assert/strict");
const SubtlePresets = require("../lib/presets.js");
const SubtleState = require("../lib/state.js");

test("quick presets provide nine complete, valid visual starting points", () => {
  const presets = SubtlePresets.all();

  assert.equal(Object.keys(presets).length, 9);
  for (const [id, preset] of Object.entries(presets)) {
    assert.match(id, /^[a-z-]+$/);
    assert.equal(typeof preset.label, "string");
    assert.equal(typeof preset.patch, "object");
    assert.deepEqual(
      SubtleState.withPatch(SubtleState.createDefaultState(), preset.patch),
      { ...SubtleState.createDefaultState(), ...preset.patch }
    );
  }
});
