const test = require("node:test");
const assert = require("node:assert/strict");
const SubtitleAdapters = require("../lib/adapters.js");

test("supported hostnames map to explicit site adapters", () => {
  assert.equal(SubtitleAdapters.forHostname("www.youtube.com").id, "youtube");
  assert.equal(SubtitleAdapters.forHostname("www.netflix.com").id, "netflix");
  assert.equal(SubtitleAdapters.forHostname("www.bbc.co.uk").id, "bbc");
  assert.equal(SubtitleAdapters.forHostname("www.disneyplus.com").id, "disney");
  assert.equal(SubtitleAdapters.forHostname("evil-youtube.com"), null);
});

test("YouTube selectors prefer a player-contained video", () => {
  const inside = { id: "inside" };
  const outside = { id: "outside" };
  const player = { querySelector: () => inside };
  const root = {
    querySelector(selector) {
      if (selector === "#movie_player") return player;
      if (selector.includes("video")) return outside;
      return null;
    }
  };

  assert.equal(SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.youtube, root), inside);
});

test("YouTube selects the Shorts player only on Shorts routes", () => {
  const movie = { id: "movie" };
  const shorts = { id: "shorts" };
  const root = {
    querySelector(selector) {
      if (selector === "#movie_player") return movie;
      if (selector === "#shorts-player") return shorts;
      return null;
    }
  };

  assert.equal(
    SubtitleAdapters.findPlayer(SubtitleAdapters.ADAPTERS.youtube, root, { pathname: "/watch" }),
    movie
  );
  assert.equal(
    SubtitleAdapters.findPlayer(SubtitleAdapters.ADAPTERS.youtube, root, { pathname: "/shorts/abc" }),
    shorts
  );
});

test("Netflix ignores a playing billboard and matches the title video", () => {
  const billboard = videoCandidate({ paused: false, closest: "billboard", area: 1920 * 1080 });
  const title = videoCandidate({ paused: true, area: 1280 * 720 });
  const root = { querySelectorAll: () => [billboard, title] };

  assert.equal(SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.netflix, root), title);
});

test("Netflix derives an overlay host when legacy player wrappers are absent", () => {
  const parent = { id: "video-parent" };
  const video = videoCandidate({ paused: false, parent });
  const root = { querySelectorAll: () => [video] };

  assert.equal(
    SubtitleAdapters.findPlayer(SubtitleAdapters.ADAPTERS.netflix, root, { video }),
    parent
  );
});

test("Netflix does not attach to disconnected or ended videos", () => {
  const disconnected = videoCandidate({ paused: false });
  disconnected.isConnected = false;
  const ended = videoCandidate({ paused: false });
  ended.ended = true;

  assert.equal(
    SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.netflix, { querySelectorAll: () => [disconnected, ended] }),
    null
  );
});

test("BBC iPlayer matches its playback video and shared caption host", () => {
  const captionLayer = captionCandidate("My business and my raised religion were at odds.", {
    left: 0, top: 0, right: 976, bottom: 549, width: 976, height: 549
  });
  const player = { contains: (candidate) => candidate === captionLayer };
  const video = videoCandidate({ paused: false, area: 976 * 549, parent: player });
  video.getBoundingClientRect = captionLayer.getBoundingClientRect;
  const root = {
    querySelectorAll(selector) {
      if (selector === "video") return [video];
      if (selector === "div[aria-live='polite']") return [captionLayer];
      return [];
    }
  };

  assert.equal(SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.bbc, root), video);
  assert.equal(SubtitleAdapters.findPlayer(SubtitleAdapters.ADAPTERS.bbc, root, { video }), player);
});

test("video mutations trigger rematching while unrelated subtitle mutations do not", () => {
  const video = { nodeName: "VIDEO" };
  const container = { nodeName: "DIV", querySelector: (selector) => selector === "video" ? video : null };
  const caption = { nodeName: "SPAN", querySelector: () => null };

  assert.equal(SubtitleAdapters.mutationsContainVideo([{ addedNodes: [container], removedNodes: [] }]), true);
  assert.equal(SubtitleAdapters.mutationsContainVideo([{ addedNodes: [caption], removedNodes: [] }]), false);
});

test("native caption discovery prefers the tight visible caption box", () => {
  const fullContainer = captionCandidate("full container");
  const captionWindow = captionCandidate("current caption");
  const root = {
    querySelectorAll(selector) {
      if (selector === ".caption-window") return [captionWindow];
      if (selector === ".ytp-caption-window-container") return [fullContainer];
      return [];
    }
  };

  assert.equal(
    SubtitleAdapters.findNativeCaption(SubtitleAdapters.ADAPTERS.youtube, root),
    captionWindow
  );
});

test("native caption measurement covers multiple YouTube caption windows", () => {
  const first = captionCandidate("First", { left: 300, top: 480, right: 500, bottom: 520, width: 200, height: 40 });
  const second = captionCandidate("Second", { left: 510, top: 480, right: 710, bottom: 520, width: 200, height: 40 });
  const root = { querySelectorAll: (selector) => selector === ".caption-window" ? [first, second] : [] };

  assert.deepEqual(
    SubtitleAdapters.measureNativeCaption(SubtitleAdapters.ADAPTERS.youtube, root),
    {
      rect: { left: 300, top: 480, right: 710, bottom: 520, width: 410, height: 40 },
      alignment: "center"
    }
  );
});

test("native caption discovery ignores empty and hidden boxes", () => {
  const empty = captionCandidate("");
  const hidden = captionCandidate("old caption", { width: 0, height: 0 });
  const root = { querySelectorAll: () => [empty, hidden] };

  assert.equal(SubtitleAdapters.findNativeCaption(SubtitleAdapters.ADAPTERS.netflix, root), null);
});

test("Netflix native caption measurement covers every simultaneously positioned line", () => {
  const first = captionCandidate("I thought they'd", {
    left: 180, top: 390, right: 716, bottom: 485, width: 536, height: 95
  });
  const second = captionCandidate("go away, but they're not.", {
    left: 180, top: 490, right: 1010, bottom: 584, width: 830, height: 94
  });
  const root = {
    querySelectorAll(selector) {
      return selector === ".player-timedtext-text-container" ? [first, second] : [];
    }
  };

  assert.deepEqual(
    SubtitleAdapters.measureNativeCaption(SubtitleAdapters.ADAPTERS.netflix, root),
    {
      rect: { left: 180, top: 390, right: 1010, bottom: 584, width: 830, height: 194 },
      alignment: "center"
    }
  );
});

test("Netflix native caption measurement ignores fading stale lines", () => {
  const active = captionCandidate("Current line", {
    left: 300, top: 500, right: 700, bottom: 550, width: 400, height: 50
  });
  const stale = captionCandidate("Previous line", {
    left: 20, top: 40, right: 980, bottom: 100, width: 960, height: 60
  });
  stale.style = { opacity: "0" };
  const root = { querySelectorAll: () => [active, stale] };

  assert.deepEqual(
    SubtitleAdapters.measureNativeCaption(SubtitleAdapters.ADAPTERS.netflix, root),
    {
      rect: { left: 300, top: 500, right: 700, bottom: 550, width: 400, height: 50 },
      alignment: "center"
    }
  );
});

test("native caption mutations can refresh anchoring without rematching the video", () => {
  const caption = {
    nodeName: "DIV",
    matches: (selector) => selector === ".player-timedtext-text-container",
    querySelector: () => null
  };

  assert.equal(
    SubtitleAdapters.mutationsContainNativeCaptions(
      SubtitleAdapters.ADAPTERS.netflix,
      [{ addedNodes: [caption], removedNodes: [] }]
    ),
    true
  );
});

test("text changes inside a native caption refresh anchoring", () => {
  const caption = {};
  const span = {
    nodeType: 1,
    matches: () => false,
    querySelector: () => null,
    closest: (selector) => selector === ".player-timedtext-text-container" ? caption : null
  };
  const text = { nodeType: 3, parentElement: span };

  assert.equal(
    SubtitleAdapters.mutationsContainNativeCaptions(
      SubtitleAdapters.ADAPTERS.netflix,
      [{ target: text, addedNodes: [], removedNodes: [] }]
    ),
    true
  );
});

test("native caption filtering targets individual YouTube segments", () => {
  const soundCue = captionCandidate("[singing]");
  const dialogue = captionCandidate(">> Now or what?");
  const captionWindow = captionCandidate("[singing] >> Now or what?");
  const root = {
    querySelectorAll(selector) {
      if (selector === ".ytp-caption-segment") return [soundCue, dialogue];
      if (selector === ".caption-window") return [captionWindow];
      return [];
    }
  };

  assert.deepEqual(
    SubtitleAdapters.nativeCaptionElements(SubtitleAdapters.ADAPTERS.youtube, root),
    [soundCue, dialogue]
  );
});

test("native caption filtering targets Netflix leaf spans instead of styled containers", () => {
  const leaf = captionCandidate("Dialogue [music]");
  const container = captionCandidate("Dialogue [music]");
  const root = {
    querySelectorAll(selector) {
      if (selector === ".player-timedtext-text-container span:not(:has(*))") return [leaf];
      if (selector === ".player-timedtext-text-container") return [container];
      return [];
    }
  };

  assert.deepEqual(
    SubtitleAdapters.nativeCaptionElements(SubtitleAdapters.ADAPTERS.netflix, root),
    [leaf]
  );
});

test("BBC caption discovery and filtering target the supplied rendered caption leaves", () => {
  const paragraph = captionCandidate("My business and my raised religion were at odds.");
  const firstLine = captionCandidate("My business and my");
  const secondLine = captionCandidate("raised religion were at odds.");
  const root = {
    querySelectorAll(selector) {
      if (selector === "div[aria-live='polite'] [lang] p") return [paragraph];
      if (selector === "div[aria-live='polite'] [lang] p > span > span:not(:has(*))") {
        return [firstLine, secondLine];
      }
      return [];
    }
  };

  assert.equal(SubtitleAdapters.findNativeCaption(SubtitleAdapters.ADAPTERS.bbc, root), paragraph);
  assert.deepEqual(
    SubtitleAdapters.nativeCaptionElements(SubtitleAdapters.ADAPTERS.bbc, root),
    [firstLine, secondLine]
  );
});

test("BBC discovery traverses the open Toucan player shadow root", () => {
  const paragraph = captionCandidate("Caption inside shadow DOM");
  const leaf = captionCandidate("Caption inside shadow DOM");
  const video = videoCandidate({ paused: false });
  const shadowRoot = {
    querySelectorAll(selector) {
      if (selector === "smp-toucan-player") return [];
      if (selector === "video") return [video];
      if (selector === "div[aria-live='polite'] [lang] p") return [paragraph];
      if (selector === "div[aria-live='polite'] [lang] p > span > span:not(:has(*))") return [leaf];
      return [];
    }
  };
  const playerHost = { shadowRoot };
  const root = {
    querySelectorAll(selector) {
      return selector === "smp-toucan-player" ? [playerHost] : [];
    }
  };

  assert.deepEqual(SubtitleAdapters.captionRoots(SubtitleAdapters.ADAPTERS.bbc, root), [root, shadowRoot]);
  assert.equal(SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.bbc, root), video);
  assert.equal(SubtitleAdapters.findNativeCaption(SubtitleAdapters.ADAPTERS.bbc, root), paragraph);
  assert.deepEqual(SubtitleAdapters.nativeCaptionElements(SubtitleAdapters.ADAPTERS.bbc, root), [leaf]);
});

test("Disney discovery traverses its open player shadow root", () => {
  const line = captionCandidate("Caption inside Disney player");
  const video = videoCandidate({ paused: false });
  const player = { querySelector: () => null };
  video.closest = (selector) => selector.includes(".btm-media-client") ? player : null;
  const shadowRoot = {
    host: null,
    querySelectorAll(selector) {
      if (selector === "disney-web-player") return [];
      if (selector.includes("video.hive-video")) return [video];
      if (selector.includes(".dss-subtitle-renderer-line")) return [line];
      return [];
    }
  };
  const playerHost = { shadowRoot };
  shadowRoot.host = playerHost;
  const root = {
    querySelectorAll(selector) {
      return selector === "disney-web-player" ? [playerHost] : [];
    }
  };

  assert.deepEqual(SubtitleAdapters.captionRoots(SubtitleAdapters.ADAPTERS.disney, root), [root, shadowRoot]);
  assert.equal(SubtitleAdapters.findVideo(SubtitleAdapters.ADAPTERS.disney, root), video);
  assert.equal(SubtitleAdapters.findPlayer(SubtitleAdapters.ADAPTERS.disney, root, { video }), player);
  assert.equal(SubtitleAdapters.findNativeCaption(SubtitleAdapters.ADAPTERS.disney, root), line);
});

test("Disney discovery traverses the newer player UI shadow root", () => {
  const line = captionCandidate("Caption inside Disney UI");
  const shadowRoot = {
    host: null,
    querySelectorAll(selector) {
      if (selector.includes(".hive-subtitle-renderer-line")) return [line];
      return [];
    }
  };
  const playerUi = { shadowRoot };
  shadowRoot.host = playerUi;
  const root = {
    querySelectorAll(selector) {
      return selector === "disney-web-player-ui" ? [playerUi] : [];
    }
  };

  assert.deepEqual(SubtitleAdapters.captionRoots(SubtitleAdapters.ADAPTERS.disney, root), [root, shadowRoot]);
  assert.equal(SubtitleAdapters.findNativeCaption(SubtitleAdapters.ADAPTERS.disney, root), line);
});

test("filtered native captions remain discoverable so filters can be removed", () => {
  const hiddenCaption = captionCandidate("[Music]");
  hiddenCaption.style = { visibility: "hidden" };
  const root = {
    querySelectorAll: (selector) => selector === ".caption-window" ? [hiddenCaption] : []
  };

  assert.deepEqual(
    SubtitleAdapters.nativeCaptionElements(SubtitleAdapters.ADAPTERS.youtube, root),
    [hiddenCaption]
  );
});

function videoCandidate({ paused, closest, area = 640 * 360, parent = null }) {
  return {
    isConnected: true,
    ended: false,
    paused,
    parentElement: parent,
    clientWidth: Math.sqrt(area),
    clientHeight: Math.sqrt(area),
    closest(selector) {
      if (closest === "billboard" && selector.includes("billboard")) return {};
      if (closest === "preview" && selector.includes("preview")) return {};
      return null;
    },
    getBoundingClientRect: () => ({ width: Math.sqrt(area), height: Math.sqrt(area) })
  };
}

function captionCandidate(text, rect = { width: 240, height: 44 }) {
  return {
    isConnected: true,
    textContent: text,
    getBoundingClientRect: () => rect,
    closest: () => null
  };
}
