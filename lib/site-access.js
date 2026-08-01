(function exposeSubtleSiteAccess(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleSiteAccess = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleSiteAccess() {
  "use strict";

  const RUNTIME_FILES = Object.freeze([
    "lib/state.js",
    "lib/cues.js",
    "lib/native-caption-filters.js",
    "lib/native-caption-styles.js",
    "lib/adapters.js",
    "lib/platform-captions.js",
    "lib/overlay.js",
    "lib/runtime-context.js",
    "lib/runtime.js",
    "content.js"
  ]);

  const platforms = Object.freeze([
    Object.freeze({
      id: "youtube",
      label: "YouTube",
      hostnames: Object.freeze(["www.youtube.com", "www.youtube-nocookie.com"]),
      origins: Object.freeze(["https://www.youtube.com/*", "https://www.youtube-nocookie.com/*"]),
      pageBridge: "youtube-page-bridge.js"
    }),
    Object.freeze({
      id: "netflix",
      label: "Netflix",
      hostnames: Object.freeze(["www.netflix.com"]),
      origins: Object.freeze(["https://www.netflix.com/*"]),
      pageBridge: "netflix-page-bridge.js"
    }),
    Object.freeze({
      id: "bbc",
      label: "BBC iPlayer",
      hostnames: Object.freeze(["www.bbc.co.uk"]),
      origins: Object.freeze(["https://www.bbc.co.uk/*"])
    })
  ]);

  function all() {
    return platforms.slice();
  }

  function forId(platformId) {
    return platforms.find((platform) => platform.id === platformId) || null;
  }

  function forUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return null;
      return platforms.find((platform) => platform.hostnames.includes(url.hostname.toLowerCase())) || null;
    } catch (_error) {
      return null;
    }
  }

  function permissionFor(platform) {
    return { origins: platform ? platform.origins.slice() : [] };
  }

  function registrationIds(platform) {
    if (!platform) return [];
    return [
      ...(platform.pageBridge ? [`subtle-${platform.id}-page-bridge`] : []),
      `subtle-${platform.id}-runtime`
    ];
  }

  function registrationsFor(platform) {
    if (!platform) return [];
    const registrations = [];
    if (platform.pageBridge) {
      registrations.push({
        id: `subtle-${platform.id}-page-bridge`,
        matches: platform.origins.slice(),
        js: [platform.pageBridge],
        runAt: "document_start",
        world: "MAIN",
        persistAcrossSessions: true
      });
    }
    registrations.push({
      id: `subtle-${platform.id}-runtime`,
      matches: platform.origins.slice(),
      css: ["content.css"],
      js: RUNTIME_FILES.slice(),
      runAt: "document_start",
      world: "ISOLATED",
      persistAcrossSessions: true
    });
    return registrations;
  }

  return { all, forId, forUrl, permissionFor, registrationIds, registrationsFor };
});
