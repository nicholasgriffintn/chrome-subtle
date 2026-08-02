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
  const PRIME_DOMAINS = Object.freeze([
    "amazon.ae",
    "amazon.ca",
    "amazon.co.jp",
    "amazon.co.uk",
    "amazon.co.za",
    "amazon.com",
    "amazon.com.au",
    "amazon.com.be",
    "amazon.com.br",
    "amazon.com.mx",
    "amazon.com.tr",
    "amazon.de",
    "amazon.eg",
    "amazon.es",
    "amazon.fr",
    "amazon.ie",
    "amazon.in",
    "amazon.it",
    "amazon.nl",
    "amazon.pl",
    "amazon.sa",
    "amazon.se",
    "amazon.sg",
    "primevideo.com"
  ]);
  const PRIME_HOSTNAMES = Object.freeze(PRIME_DOMAINS.flatMap((domain) => [domain, `www.${domain}`]));
  const PRIME_ORIGINS = Object.freeze(PRIME_HOSTNAMES.map((hostname) => `https://${hostname}/*`));

  const platforms = Object.freeze([
    Object.freeze({
      id: "youtube",
      label: "YouTube",
      hostnames: Object.freeze(["www.youtube.com", "www.youtube-nocookie.com"]),
      origins: Object.freeze(["https://www.youtube.com/*", "https://www.youtube-nocookie.com/*"]),
      pageBridgeFiles: Object.freeze(["youtube-page-bridge.js"])
    }),
    Object.freeze({
      id: "netflix",
      label: "Netflix",
      hostnames: Object.freeze(["www.netflix.com"]),
      origins: Object.freeze(["https://www.netflix.com/*"]),
      pageBridgeFiles: Object.freeze(["netflix-page-bridge.js"])
    }),
    Object.freeze({
      id: "bbc",
      label: "BBC iPlayer",
      hostnames: Object.freeze(["www.bbc.co.uk"]),
      origins: Object.freeze(["https://www.bbc.co.uk/*"])
    }),
    Object.freeze({
      id: "disney",
      label: "Disney+",
      hostnames: Object.freeze(["disneyplus.com", "www.disneyplus.com"]),
      origins: Object.freeze(["https://disneyplus.com/*", "https://www.disneyplus.com/*"]),
      pageBridgeFiles: Object.freeze(["lib/hls-captions.js", "disney-page-bridge.js"])
    }),
    Object.freeze({
      id: "prime",
      label: "Prime Video",
      hostnames: PRIME_HOSTNAMES,
      origins: PRIME_ORIGINS,
      pageBridgeFiles: Object.freeze(["prime-page-bridge.js"])
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
