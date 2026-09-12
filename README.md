# FastFin (Expo)

React Native / Expo port of the FastFin Jellyfin client, replacing the
native Swift attempt in [`../ios`](../ios) -- that approach needed a Mac
for every build and a manual AltStore sideload for every test, which made
iterating on real bugs painfully slow. This runs live on your phone via
Expo Go with no build step at all.

## Run it

```bash
cd mobile
npx expo start
```

Install **Expo Go** from the App Store, scan the QR code the command
prints, and the app loads and live-reloads over your WiFi. No Xcode, no
CI, no sideloading.

## Real build for Picture in Picture (no Mac needed)

Expo Go can't do Picture in Picture on this iOS build -- AVKit judges PiP
"not possible" for its embedded player, so neither the programmatic entry
nor the native PiP button appears. Your own build doesn't have that
limitation. `.github/workflows/ios-sideload.yml` produces an **unsigned
.ipa** on GitHub's macOS runners that you sideload with AltStore or
Sideloadly using a free Apple ID:

1. Push this repo to GitHub, open **Actions → iOS sideload build → Run
   workflow**, leave the variant on `dev-client`.
2. Download the `FastFin-dev-client-ipa` artifact and install the .ipa
   with AltStore.
3. On your PC run `npx expo start --dev-client` and open the app -- it
   finds the dev server on your WiFi and live-reloads exactly like Expo Go.
   Rebuild the .ipa only when native dependencies change.

The `release` variant embeds the JS for a self-contained app (no dev
server), at the cost of a rebuild per change. Free Apple IDs re-sign every
7 days; AltStore refreshes that automatically while it's on the same WiFi.

## What's here

- **`lib/session.tsx`** -- auth via `expo-secure-store`, and the
  `MediaBrowser DeviceId=..., Client=..., Version=..., Token=...`
  Authorization header format Jellyfin expects (verified against the
  official `jellyfin-sdk-swift` source, not guessed).
- **`lib/device-profile.ts`** -- the `DeviceProfile` describing what
  AVFoundation on iOS can actually decode: MP4/MOV direct play with
  H.264 (8-bit, <= level 5.2) and HEVC (Main/Main 10; HDR10, HDR10+, HLG,
  Dolby Vision 5/8), an **fMP4 HLS** transcoding profile that lets the
  server *copy* HEVC/H.264 out of an MKV instead of re-encoding it (Apple
  only allows HEVC in fMP4 segments, never TS), and text subtitles
  delivered as a native WebVTT HLS track (bitmap subs fall back to burn-in,
  the one case where an HEVC file is still re-encoded).
- **`lib/jellyfin.ts`** -- the REST client: libraries, items, search,
  resume, seasons/episodes, similar items, image URLs, and the playback
  pipeline. `getPlaybackSource` posts the profile to `PlaybackInfo` and
  uses the server's verdict -- `Static=true` direct play, the negotiated
  `TranscodingUrl` (remux or transcode), or a hand-built H.264/AAC
  `master.m3u8` as a last resort. `reportPlaybackStart/Progress/Stopped`
  keep Continue Watching in sync and `DELETE /Videos/ActiveEncodings`
  kills the ffmpeg job on exit so transcodes don't pile up on the server.
- **`components/Glass.tsx`** -- the design primitives: `Glass` (real
  Liquid Glass via `expo-glass-effect` on iOS 26+, system-material blur
  below that and on Android, a solid panel under Reduce Transparency),
  `GlassButton`, `GlassPillButton`, and `Icon` (SF Symbols via
  `expo-symbols`, Ionicons fallback off-iOS). Plus `Hero`, `CarouselRow`,
  `PosterCard`, `ContinueWatchingCard`.
- **`app/`** -- file-based routes via `expo-router`. `(tabs)` is a
  `NativeTabs` layout (UITabBarController: floating glass bar that
  minimises on scroll, search tab morphs into the search field on iOS 26)
  with a native `Stack` per tab for large-title transparent headers.
  `item/[id]`, `library/[id]` (with a header filter bar) and `season/[id]`
  (season switcher, watched state) sit on the root stack so they cover the
  tab bar. `player/[id]` is a full-screen modal on `expo-video`: forced
  landscape, PiP (orientation unlocked while active), lock-screen
  Now Playing metadata, glass HUD with scrubbing, ±10s, auto-hide, an
  audio/subtitle menu that switches tracks server-side without losing the
  position, one automatic fallback to an explicit transcode if the
  negotiated source fails to load, and a diagnostics card that shows the
  delivery method and the server's `TranscodeReasons` when it can't.

## Known gaps

- The accent picker in Settings is local state only; `Accent` in
  `lib/theme.ts` is the single place to wire persisted selection into.
- Audio/subtitle switches always go through the server (remux/transcode)
  rather than picking a track inside a direct-played MP4 -- reliable, but
  costs a reload of a couple of seconds.
- No app icon/splash assets customized yet -- using Expo's defaults.
- Verified via `tsc --noEmit` (clean) and a real Metro bundle compile
  (succeeded), but not run on a device from a Windows session -- treat
  the first real launch as the smoke test. Liquid Glass needs iOS 26 on
  the phone; older iOS gets the blur fallback everywhere.
