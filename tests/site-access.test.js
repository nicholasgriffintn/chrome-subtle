const test = require("node:test");
const assert = require("node:assert/strict");
const SiteAccess = require("../lib/site-access.js");

test("site access maps exact supported HTTPS hosts", () => {
  assert.equal(SiteAccess.forUrl("https://www.youtube.com/watch?v=123").id, "youtube");
  assert.equal(SiteAccess.forUrl("https://www.youtube-nocookie.com/embed/123").id, "youtube");
  assert.equal(SiteAccess.forUrl("https://www.netflix.com/watch/123").id, "netflix");
  assert.equal(SiteAccess.forUrl("https://www.bbc.co.uk/iplayer/episode/p0gd2b0j/example").id, "bbc");
  assert.equal(SiteAccess.forUrl("https://www.disneyplus.com/en-gb/play/14ca4815-0611-45d5-948c-d911d78efcf2").id, "disney");
  assert.equal(SiteAccess.forUrl("https://www.amazon.co.uk/gp/video/detail/B0GWM2TV7P").id, "prime");
  assert.equal(SiteAccess.forUrl("https://amazon.de/gp/video/detail/B012345678").id, "prime");
  assert.equal(SiteAccess.forUrl("https://www.amazon.co.jp/gp/video/detail/B012345678").id, "prime");
  assert.equal(SiteAccess.forUrl("https://www.primevideo.com/detail/0ABCDEF1234567890").id, "prime");
  assert.equal(SiteAccess.forUrl("https://video.amazon.co.uk/gp/video/detail/B012345678"), null);
  assert.equal(SiteAccess.forUrl("http://www.youtube.com/watch?v=123"), null);
  assert.equal(SiteAccess.forUrl("https://www.youtube.com.example.test/watch?v=123"), null);
  assert.equal(SiteAccess.forUrl("not a url"), null);
});

test("each platform produces an isolated runtime and only private APIs require a page bridge", () => {
  for (const platform of SiteAccess.all()) {
    const registrations = SiteAccess.registrationsFor(platform);
    const bridge = registrations.find((script) => script.world === "MAIN");
    const runtime = registrations.find((script) => script.world === "ISOLATED");
    assert.deepEqual(runtime.matches, platform.origins);
    assert.equal(runtime.world, "ISOLATED");
    assert.equal(runtime.runAt, "document_start");
    assert.ok(runtime.js.includes("lib/platform-captions.js"));
    assert.ok(runtime.js.indexOf("lib/cues.js") < runtime.js.indexOf("lib/platform-captions.js"));
    assert.ok(runtime.js.indexOf("lib/platform-captions.js") < runtime.js.indexOf("lib/runtime.js"));
    assert.ok(runtime.js.indexOf("lib/runtime.js") < runtime.js.indexOf("content.js"));
    if (platform.pageBridgeFiles?.length) {
      assert.equal(bridge.runAt, "document_start");
      assert.deepEqual(bridge.js, platform.pageBridgeFiles);
    } else {
      assert.equal(bridge, undefined);
    }
  }
});

test("multi-region services request and register only the active site origin", () => {
  const prime = SiteAccess.forId("prime");
  const permission = SiteAccess.permissionFor(
    prime,
    "https://www.amazon.co.uk/gp/video/detail/B0GWM2TV7P"
  );

  assert.deepEqual(permission, { origins: ["https://www.amazon.co.uk/*"] });
  const registrations = SiteAccess.registrationsFor(prime, permission.origins);
  assert.ok(registrations.every((registration) => (
    registration.matches.length === 1 && registration.matches[0] === "https://www.amazon.co.uk/*"
  )));
});
