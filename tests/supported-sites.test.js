const test = require("node:test");
const assert = require("node:assert/strict");
const SupportedSites = require("../lib/supported-sites.js");

test("all supported page hosts and derived origins come from one registry", () => {
  assert.deepEqual(SupportedSites.all().map((site) => site.id), [
    "youtube", "netflix", "bbc", "disney", "prime"
  ]);
  assert.equal(SupportedSites.forHostname("www.youtube.com").id, "youtube");
  assert.equal(SupportedSites.forHostname("netflix.com").id, "netflix");
  assert.equal(SupportedSites.forHostname("www.amazon.co.uk").id, "prime");
  assert.ok(SupportedSites.forId("prime").origins.includes("https://www.amazon.co.uk/*"));
  assert.equal(SupportedSites.forHostname("video.amazon.co.uk"), null);
});

test("trusted service subdomains are matched only within the selected site's domains", () => {
  assert.equal(SupportedSites.isServiceHostname("prime", "atv-ps-eu.amazon.co.uk"), true);
  assert.equal(SupportedSites.isServiceHostname("prime", "amazon.co.uk.attacker.example"), false);
  assert.equal(SupportedSites.isServiceHostname("youtube", "www.youtube.com"), true);
  assert.equal(SupportedSites.isServiceHostname("unsupported", "www.youtube.com"), false);
});
