(function exposeSubtlePopupAccess(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtlePopupAccess = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtlePopupAccess() {
  "use strict";

  function view(platform, granted) {
    if (platform && granted) return { kind: "full" };
    if (platform) {
      return {
        kind: "request",
        eyebrow: "Site access",
        title: `Enable Subtle on ${platform.label}`,
        detail: "Allow access to this service so Subtle can style and add captions.",
        action: `Enable on ${platform.label}`
      };
    }
    return {
      kind: "unsupported",
      eyebrow: "Not supported yet",
      title: "Subtle doesn’t work with this site yet",
      detail: "Open a supported video site to use Subtle."
    };
  }

  function errorView() {
    return {
      kind: "error",
      eyebrow: "Unable to start",
      title: "Subtle couldn’t open",
      detail: "Close and reopen the popup. If the problem continues, reload the extension."
    };
  }

  return { view, errorView };
});
