(function exposeSubtleSiteAccess(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./supported-sites.js"));
  else root.SubtleSiteAccess = factory(root.SubtleSupportedSites);
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubtleSiteAccess(SubtleSupportedSites) {
  "use strict";

  const RUNTIME_FILES = Object.freeze([
    "lib/state.js",
    "lib/supported-sites.js",
    "lib/cues.js",
    "lib/transcript.js",
    "lib/native-caption-filters.js",
    "lib/native-caption-styles.js",
    "lib/adapters.js",
    "lib/platform-captions.js",
    "lib/overlay.js",
    "lib/runtime-context.js",
    "lib/runtime.js",
    "content.js"
  ]);

  function all() {
    return SubtleSupportedSites.all();
  }

  function forId(platformId) {
    return SubtleSupportedSites.forId(platformId);
  }

  function forUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return null;
      return SubtleSupportedSites.forHostname(url.hostname);
    } catch (_error) {
      return null;
    }
  }

  function permissionFor(platform, pageUrl) {
    if (!platform) return { origins: [] };
    if (!pageUrl) return { origins: platform.origins.slice() };
    try {
      const url = new URL(pageUrl);
      const origin = `${url.origin}/*`;
      return { origins: platform.origins.includes(origin) ? [origin] : [] };
    } catch (_error) {
      return { origins: [] };
    }
  }

  function registrationIds(platform) {
    if (!platform) return [];
    return [
      ...(platform.pageBridgeFiles?.length ? [`subtle-${platform.id}-page-bridge`] : []),
      `subtle-${platform.id}-runtime`
    ];
  }

  function registrationsFor(platform, grantedOrigins) {
    if (!platform) return [];
    const allowedOrigins = Array.isArray(grantedOrigins) ? grantedOrigins : platform.origins;
    const matches = platform.origins.filter((origin) => allowedOrigins.includes(origin));
    if (!matches.length) return [];
    const registrations = [];
    if (platform.pageBridgeFiles?.length) {
      registrations.push({
        id: `subtle-${platform.id}-page-bridge`,
        matches: matches.slice(),
        js: platform.pageBridgeFiles.slice(),
        runAt: "document_start",
        world: "MAIN",
        persistAcrossSessions: true
      });
    }
    registrations.push({
      id: `subtle-${platform.id}-runtime`,
      matches: matches.slice(),
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
