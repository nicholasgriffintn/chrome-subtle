(function exposeSubtleSupportedSites(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtleSupportedSites = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSupportedSites() {
  "use strict";

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

  const sites = Object.freeze([
    defineSite({
      id: "youtube",
      label: "YouTube",
      serviceDomains: ["youtube.com", "youtube-nocookie.com"],
      hostnames: ["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"],
      pageBridgeFiles: ["youtube-page-bridge.js"]
    }),
    defineSite({
      id: "netflix",
      label: "Netflix",
      serviceDomains: ["netflix.com"],
      hostnames: ["netflix.com", "www.netflix.com"],
      pageBridgeFiles: ["netflix-page-bridge.js"]
    }),
    defineSite({
      id: "bbc",
      label: "BBC iPlayer",
      serviceDomains: ["bbc.co.uk"],
      hostnames: ["bbc.co.uk", "www.bbc.co.uk"]
    }),
    defineSite({
      id: "disney",
      label: "Disney+",
      serviceDomains: ["disneyplus.com"],
      hostnames: ["disneyplus.com", "www.disneyplus.com"],
      pageBridgeFiles: ["lib/hls-captions.js", "disney-page-bridge.js"]
    }),
    defineSite({
      id: "prime",
      label: "Prime Video",
      serviceDomains: PRIME_DOMAINS,
      hostnames: PRIME_DOMAINS.flatMap((domain) => [domain, `www.${domain}`]),
      pageBridgeFiles: ["lib/supported-sites.js", "prime-page-bridge.js"]
    })
  ]);

  function defineSite(input) {
    const hostnames = Object.freeze(input.hostnames.slice());
    return Object.freeze({
      id: input.id,
      label: input.label,
      serviceDomains: Object.freeze(input.serviceDomains.slice()),
      hostnames,
      origins: Object.freeze(hostnames.map((hostname) => `https://${hostname}/*`)),
      ...(input.pageBridgeFiles
        ? { pageBridgeFiles: Object.freeze(input.pageBridgeFiles.slice()) }
        : {})
    });
  }

  function all() {
    return sites.slice();
  }

  function forId(siteId) {
    return sites.find((site) => site.id === siteId) || null;
  }

  function forHostname(value) {
    const hostname = String(value || "").toLowerCase();
    return sites.find((site) => site.hostnames.includes(hostname)) || null;
  }

  function isServiceHostname(siteId, value) {
    const site = forId(siteId);
    const hostname = String(value || "").toLowerCase();
    return Boolean(site?.serviceDomains.some((domain) => (
      hostname === domain || hostname.endsWith(`.${domain}`)
    )));
  }

  return { all, forId, forHostname, isServiceHostname };
});
