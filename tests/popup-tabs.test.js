const test = require("node:test");
const assert = require("node:assert/strict");
const SubtlePopupTabs = require("../lib/popup-tabs.js");

test("popup tabs switch panels and support arrow-key navigation", () => {
  const panels = [fakePanel(), fakePanel(), fakePanel()];
  const tabs = panels.map((_, index) => fakeTab(`panel-${index}`, index === 0));
  const documentRef = { getElementById: (id) => panels[Number(id.at(-1))] };
  const tabList = { querySelectorAll: () => tabs };

  SubtlePopupTabs.create(tabList, documentRef);
  tabs[0].dispatch("keydown", { key: "ArrowRight", currentTarget: tabs[0] });

  assert.equal(tabs[1].attributes.get("aria-selected"), "true");
  assert.equal(tabs[1].focused, true);
  assert.deepEqual(panels.map((panel) => panel.hidden), [true, false, true]);
});

function fakePanel() {
  return { hidden: false };
}

function fakeTab(panelId, selected) {
  const listeners = new Map();
  return {
    attributes: new Map([["aria-controls", panelId], ["aria-selected", String(selected)]]),
    tabIndex: 0,
    focused: false,
    getAttribute(name) { return this.attributes.get(name); },
    setAttribute(name, value) { this.attributes.set(name, value); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    focus() { this.focused = true; },
    dispatch(type, event) {
      listeners.get(type)({ preventDefault() {}, ...event });
    }
  };
}
