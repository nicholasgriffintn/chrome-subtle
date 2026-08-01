(function exposeSubtlePopupTabs(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtlePopupTabs = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtlePopupTabs() {
  "use strict";

  function create(tabList, documentRef = document) {
    const tabs = Array.from(tabList?.querySelectorAll?.('[role="tab"]') || []);
    const panels = new Map(tabs.map((tab) => [tab, documentRef.getElementById(tab.getAttribute("aria-controls"))]));

    function activate(tab, moveFocus = false) {
      if (!panels.has(tab)) return false;
      for (const candidate of tabs) {
        const active = candidate === tab;
        candidate.setAttribute("aria-selected", String(active));
        candidate.tabIndex = active ? 0 : -1;
        panels.get(candidate).hidden = !active;
      }
      if (moveFocus) tab.focus();
      return true;
    }

    function handleKeydown(event) {
      const current = tabs.indexOf(event.currentTarget);
      if (current < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      activate(tabs[next], true);
    }

    for (const tab of tabs) {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", handleKeydown);
    }
    activate(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0]);
    return { activate };
  }

  return { create };
});
