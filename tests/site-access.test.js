const test = require("node:test");
const assert = require("node:assert/strict");
const SiteAccess = require("../lib/site-access.js");

test("site access maps exact supported HTTPS hosts", () => {
  assert.equal(SiteAccess.forUrl("https://www.youtube.com/watch?v=123").id, "youtube");
  assert.equal(SiteAccess.forUrl("https://www.youtube-nocookie.com/embed/123").id, "youtube");
  assert.equal(SiteAccess.forUrl("https://www.netflix.com/watch/123").id, "netflix");
  assert.equal(SiteAccess.forUrl("http://www.youtube.com/watch?v=123"), null);
  assert.equal(SiteAccess.forUrl("https://www.youtube.com.example.test/watch?v=123"), null);
  assert.equal(SiteAccess.forUrl("not a url"), null);
});

test("each platform produces separate main-world bridge and isolated runtime registrations", () => {
  for (const platform of SiteAccess.all()) {
    const [bridge, runtime] = SiteAccess.registrationsFor(platform);
    assert.deepEqual(bridge.matches, platform.origins);
    assert.deepEqual(runtime.matches, platform.origins);
    assert.equal(bridge.world, "MAIN");
    assert.equal(runtime.world, "ISOLATED");
    assert.equal(bridge.runAt, "document_start");
    assert.equal(runtime.runAt, "document_start");
    assert.deepEqual(bridge.js, [platform.pageBridge]);
    assert.ok(runtime.js.includes("lib/platform-captions.js"));
    assert.ok(runtime.js.indexOf("lib/cues.js") < runtime.js.indexOf("lib/platform-captions.js"));
    assert.ok(runtime.js.indexOf("lib/platform-captions.js") < runtime.js.indexOf("lib/runtime.js"));
    assert.ok(runtime.js.indexOf("lib/runtime.js") < runtime.js.indexOf("content.js"));
  }
});
