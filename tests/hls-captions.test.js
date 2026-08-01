const test = require("node:test");
const assert = require("node:assert/strict");
const HlsCaptions = require("../lib/hls-captions.js");

test("Disney HLS masters expose bounded non-forced subtitle tracks", () => {
  const tracks = HlsCaptions.subtitleTracks(`
#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English, SDH",LANGUAGE="en-GB",FORCED=NO,URI="captions/en/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English Forced",LANGUAGE="en",FORCED=YES,URI="captions/forced.m3u8"
`, "https://media.dssott.com/title/master.m3u8");

  assert.deepEqual(tracks, [{
    languageCode: "en-GB",
    label: "English, SDH",
    isCaption: true,
    playlistUrl: "https://media.dssott.com/title/captions/en/index.m3u8"
  }]);
});

test("HLS media playlists retain segment offsets across discontinuities", () => {
  assert.deepEqual(HlsCaptions.mediaSegments(`
#EXTM3U
#EXTINF:2.5,
first.vtt
#EXT-X-DISCONTINUITY
#EXTINF:3,
second.vtt
`, "https://media.dssott.com/title/captions/index.m3u8"), [
    { url: "https://media.dssott.com/title/captions/first.vtt", start: 0, duration: 2.5 },
    { url: "https://media.dssott.com/title/captions/second.vtt", start: 2.5, duration: 3 }
  ]);
});

test("segmented WebVTT timestamp maps are assembled on the title timeline", () => {
  const text = HlsCaptions.assembleWebVtt([
    {
      start: 0,
      text: "WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\n00:00:00.500 --> 00:00:01.500\nFirst line"
    },
    {
      start: 12,
      text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nSecond line"
    }
  ]);

  assert.match(text, /00:00:10\.500 --> 00:00:11\.500\nFirst line/);
  assert.match(text, /00:00:12\.000 --> 00:00:13\.000\nSecond line/);
});
