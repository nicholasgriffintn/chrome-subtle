# Subtle

Subtle makes captions easier to read on YouTube and Netflix. It styles each site's native captions and can add a synchronised second line from YouTube's available caption tracks or a local SRT/VTT file.

## What it does

- Restyle native captions with readable presets, seven local font families, independent text/backdrop/window colours and opacity, five edge styles, size and position controls.
- Add a translated second line on YouTube when the video supplies a caption track.
- Add a local SRT or VTT second line on YouTube or Netflix.
- Shift imported captions forwards or backwards to correct timing.
- Hide simple bracketed sound cues such as `[Music]` when requested.
- Keep all preferences and imported files on the device.

## Install locally

1. Run `pnpm package` or use the `subtle.zip` download from the companion site.
2. Extract the ZIP.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** and select **Load unpacked**.
5. Choose the extracted extension directory, then reload any open YouTube or Netflix tab.

The companion site is in `website/`. Its download is a development preview; the extension has not yet been published to the Chrome Web Store.

## Privacy

Subtle processes the current playback time, native caption elements and YouTube's own caption request on supported video pages. It reuses that request only to ask YouTube for the selected translated caption track. It stores preferences and an imported subtitle file in Chrome's local extension storage until they are changed, cleared or the extension is uninstalled.

Subtle has no accounts, analytics, advertising, remote scripts or translation service. Imported files are not uploaded. The extension runs only on `youtube.com`, `youtube-nocookie.com` and `netflix.com`; its sole Chrome permission is `storage`.

YouTube provides the caption response used for an optional second line. Netflix does not expose an equivalent stable interface, so Netflix dual subtitles require a local timed file. This privacy statement was last updated on 1 August 2026.

## Limitations

- YouTube translation availability depends on the caption tracks and translation support for each video.
- YouTube's player internals and Netflix's caption DOM are not public extension APIs and can change without notice.
- Netflix dual subtitles require a matching SRT or VTT file; Subtle does not extract protected Netflix subtitle tracks.
- Imported files must be smaller than 2 MB and contain valid timed cues.
- Creator-positioned or heavily styled captions may not preserve every original layout detail after styling.

## Development

The Manifest V3 extension has no runtime dependencies or build step. Site-specific behaviour lives behind adapters, while parsing, state, overlay rendering and YouTube caption loading remain independently testable. The YouTube bridge passively captures the player's proof-bearing timed-text request because tokenless URLs from player metadata now return empty responses. Netflix player matching scores connected video elements and excludes billboard and preview playback before deriving an overlay host.

The proof-token approach was informed by the MIT-licensed [yt-dual-subs](https://github.com/gythiro/yt-dual-subs) implementation. Subtle uses its own smaller bridge and keeps parsing and rendering in isolated extension modules.

```sh
pnpm check
pnpm test
pnpm package
pnpm --dir website install
pnpm --dir website check
```
