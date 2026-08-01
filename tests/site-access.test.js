const test = require("node:test");
const assert = require("node:assert/strict");
const SiteAccess = require("../lib/site-access.js");

test("site access maps exact supported HTTPS hosts", () => {
  assert.equal(SiteAccess.forUrl("https://www.youtube.com/watch?v=123").id, "youtube");
  assert.equal(SiteAccess.forUrl("https://www.youtube-nocookie.com/embed/123").id, "youtube");
  assert.equal(SiteAccess.forUrl("https://www.netflix.com/watch/123").id, "netflix");
  assert.equal(SiteAccess.forUrl("https://www.bbc.co.uk/iplayer/episode/p0gd2b0j/example").id, "bbc");
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
    if (platform.pageBridge) {
      assert.equal(bridge.runAt, "document_start");
      assert.deepEqual(bridge.js, [platform.pageBridge]);
    } else {
      assert.equal(bridge, undefined);
    }
  }
});
