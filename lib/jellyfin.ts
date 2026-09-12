import { authHeaderFor, type SessionInfo } from "./session";
import { DEVICE_PROFILE } from "./device-profile";
import type { Item, Library } from "./types";

type Query = Record<string, string | number | boolean | undefined>;

function buildUrl(session: SessionInfo, path: string, query: Query): string {
  const url = new URL(session.serverUrl + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function get<T>(session: SessionInfo, path: string, query: Query = {}): Promise<T> {
  const response = await fetch(buildUrl(session, path, query), { headers: { Authorization: authHeaderFor(session) } });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

async function post<T>(session: SessionInfo, path: string, body: unknown, query: Query = {}): Promise<T> {
  const response = await fetch(buildUrl(session, path, query), {
    method: "POST",
    headers: { Authorization: authHeaderFor(session), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

/** Fire-and-forget request for endpoints that answer 204 No Content. Never
 * throws -- reporting must not be able to take the player down with it. */
async function send(session: SessionInfo, method: "POST" | "DELETE", path: string, body?: unknown, query: Query = {}): Promise<void> {
  try {
    await fetch(buildUrl(session, path, query), {
      method,
      headers: { Authorization: authHeaderFor(session), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Offline / server restarting: nothing useful to do about it here.
  }
}

export async function getLibraries(session: SessionInfo): Promise<Library[]> {
  const result = await get<{ Items: Library[] }>(session, "/UserViews", { userId: session.userId });
  return result.Items ?? [];
}

export async function getLatestItems(session: SessionInfo, libraryId: string, limit = 16): Promise<Item[]> {
  return get<Item[]>(session, "/Items/Latest", { userId: session.userId, parentId: libraryId, limit });
}

export async function getItems(session: SessionInfo, libraryId: string, limit = 500): Promise<Item[]> {
  const result = await get<{ Items: Item[] }>(session, "/Items", {
    userId: session.userId,
    parentId: libraryId,
    recursive: true,
    includeItemTypes: "Movie,Series",
    sortBy: "SortName",
    limit,
  });
  return result.Items ?? [];
}

export async function search(session: SessionInfo, query: string, limit = 50): Promise<Item[]> {
  if (!query) return [];
  const result = await get<{ Items: Item[] }>(session, "/Items", {
    userId: session.userId,
    searchTerm: query,
    recursive: true,
    includeItemTypes: "Movie,Series",
    sortBy: "SortName",
    limit,
  });
  return result.Items ?? [];
}

/** A fresh random pick of movies and series across every library -- the
 * server shuffles (SortBy=Random), so each launch gets a different set. */
export async function getRandomItems(session: SessionInfo, limit = 8): Promise<Item[]> {
  const result = await get<{ Items: Item[] }>(session, "/Items", {
    userId: session.userId,
    recursive: true,
    includeItemTypes: "Movie,Series",
    sortBy: "Random",
    imageTypes: "Primary",
    limit,
  });
  return result.Items ?? [];
}

export async function getResumeItems(session: SessionInfo, limit = 16): Promise<Item[]> {
  const result = await get<{ Items: Item[] }>(session, "/UserItems/Resume", { userId: session.userId, limit });
  return result.Items ?? [];
}

export async function getItem(session: SessionInfo, id: string): Promise<Item> {
  return get<Item>(session, `/Items/${id}`, { userId: session.userId });
}

export async function getSeasons(session: SessionInfo, seriesId: string): Promise<Item[]> {
  const result = await get<{ Items: Item[] }>(session, `/Shows/${seriesId}/Seasons`, { userId: session.userId });
  return result.Items ?? [];
}

export async function getEpisodes(session: SessionInfo, seriesId: string, seasonId: string): Promise<Item[]> {
  const result = await get<{ Items: Item[] }>(session, `/Shows/${seriesId}/Episodes`, { userId: session.userId, seasonId });
  return result.Items ?? [];
}

export async function getSimilarItems(session: SessionInfo, itemId: string, limit = 16): Promise<Item[]> {
  const result = await get<{ Items: Item[] }>(session, `/Items/${itemId}/Similar`, { userId: session.userId, limit });
  return result.Items ?? [];
}

// MARK: - Images (api_key query param, same as the Swift build -- these
// URLs get handed directly to <Image>/expo-video, which can't attach a
// custom Authorization header).

export function getImageUrl(session: SessionInfo, itemId: string, maxWidth = 480): string {
  return `${session.serverUrl}/Items/${itemId}/Images/Primary?api_key=${session.accessToken}&maxWidth=${maxWidth}`;
}

export function getBackdropUrl(session: SessionInfo, itemId: string, maxWidth = 1920): string {
  return `${session.serverUrl}/Items/${itemId}/Images/Backdrop/0?api_key=${session.accessToken}&maxWidth=${maxWidth}`;
}

export function getLogoUrl(session: SessionInfo, itemId: string, maxWidth = 800): string {
  return `${session.serverUrl}/Items/${itemId}/Images/Logo?api_key=${session.accessToken}&maxWidth=${maxWidth}`;
}

// MARK: - Playback
//
// We describe what AVPlayer can decode (lib/device-profile.ts) and let the
// server pick the delivery method, the same way Swiftfin and jellyfin-web do:
//
//   1. Direct play  -- an MP4/MOV the phone can open as-is, streamed with
//                      `Static=true`. Zero server CPU, instant seeking.
//   2. Remux        -- an MKV whose streams are already compatible (HEVC
//                      HDR10/DV included). The server copies them into fMP4
//                      HLS segments untouched; audio alone may be converted.
//   3. Transcode    -- anything else (VC-1, 10-bit H.264, burned-in PGS...).
//
// The previous build forced (3) for *everything* by hand-building the
// master.m3u8 URL, and never told the server when playback stopped, so
// orphaned ffmpeg jobs piled up until the server refused new ones. That is
// the "only some videos work" failure mode.

export interface TrackOption {
  index: number;
  title: string;
  codec?: string;
  isDefault?: boolean;
}

export type PlayMethod = "DirectPlay" | "DirectStream" | "Transcode";

export interface PlaybackSource {
  /** Fully-qualified URL handed to expo-video. */
  url: string;
  /** "hls" for master.m3u8 URLs, "progressive" for static file streams. */
  contentType: "hls" | "progressive";
  playMethod: PlayMethod;
  mediaSourceId: string;
  playSessionId: string;
  /** Position (seconds) the player should seek to once the source loads. */
  resumeSeconds: number;
  audioTracks: TrackOption[];
  subtitleTracks: TrackOption[];
  selectedAudioIndex?: number;
  selectedSubtitleIndex?: number;
  /** Server's stated reasons for transcoding, surfaced in the diagnostics UI. */
  transcodeReasons: string[];
  /** Container/codec summary for the diagnostics UI. */
  summary: string;
}

interface MediaStreamInfo {
  Index: number;
  Type: string;
  Codec?: string;
  DisplayTitle?: string;
  Language?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  VideoRangeType?: string;
  BitDepth?: number;
}

interface MediaSourceInfo {
  Id: string;
  Container?: string;
  ETag?: string;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string;
  TranscodingSubProtocol?: string;
  TranscodingContainer?: string;
  TranscodeReasons?: string[] | string;
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
  MediaStreams?: MediaStreamInfo[];
}

interface PlaybackInfoResponse {
  PlaySessionId?: string;
  ErrorCode?: string;
  MediaSources?: MediaSourceInfo[];
}

export class PlaybackError extends Error {
  constructor(message: string, readonly reasons: string[] = []) {
    super(message);
  }
}

const TICKS_PER_SECOND = 10_000_000;

/** Pass as `subtitleStreamIndex` to explicitly disable subtitles. Leaving it
 * undefined means "server default", which may well turn them back on. */
export const SUBTITLES_OFF = -1;

export function secondsToTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds * TICKS_PER_SECOND));
}

export function ticksToSeconds(ticks: number | null | undefined): number {
  return ticks ? ticks / TICKS_PER_SECOND : 0;
}

function trackTitle(stream: MediaStreamInfo): string {
  if (stream.DisplayTitle) return stream.DisplayTitle;
  const parts = [stream.Language, stream.Codec?.toUpperCase()].filter(Boolean);
  return parts.length ? parts.join(" · ") : `${stream.Type} ${stream.Index}`;
}

export async function getPlaybackSource(
  session: SessionInfo,
  itemId: string,
  startTicks: number,
  audioStreamIndex?: number,
  subtitleStreamIndex?: number
): Promise<PlaybackSource> {
  // A manually chosen audio/subtitle track has to be applied server-side:
  // AVPlayer's own track list for a direct-played MP4 doesn't map back to
  // Jellyfin stream indices, so we let the server remux (stream copy --
  // still cheap) whenever the user has overridden a track.
  const userPickedTrack = audioStreamIndex !== undefined || subtitleStreamIndex !== undefined;

  const response = await post<PlaybackInfoResponse>(
    session,
    `/Items/${itemId}/PlaybackInfo`,
    {
      UserId: session.userId,
      DeviceProfile: DEVICE_PROFILE,
      MaxStreamingBitrate: DEVICE_PROFILE.MaxStreamingBitrate,
      StartTimeTicks: startTicks,
      AudioStreamIndex: audioStreamIndex,
      SubtitleStreamIndex: subtitleStreamIndex,
      EnableDirectPlay: !userPickedTrack,
      EnableDirectStream: true,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      AutoOpenLiveStream: true,
    },
    { userId: session.userId }
  );

  if (response.ErrorCode) {
    throw new PlaybackError(`The server refused playback (${response.ErrorCode}).`);
  }

  const sources = response.MediaSources ?? [];
  // Prefer a version the phone can play without touching the server.
  const mediaSource = sources.find((s) => s.SupportsDirectPlay) ?? sources.find((s) => s.TranscodingUrl) ?? sources[0];
  if (!mediaSource) throw new PlaybackError("The server didn't return a media source for this item.");

  const playSessionId = response.PlaySessionId ?? Math.random().toString(36).slice(2);
  const transcodeReasons = Array.isArray(mediaSource.TranscodeReasons)
    ? mediaSource.TranscodeReasons
    : mediaSource.TranscodeReasons
      ? mediaSource.TranscodeReasons.split(",").map((r) => r.trim())
      : [];

  const audioTracks: TrackOption[] = [];
  const subtitleTracks: TrackOption[] = [];
  let videoSummary = mediaSource.Container?.toUpperCase() ?? "";
  for (const stream of mediaSource.MediaStreams ?? []) {
    const option: TrackOption = { index: stream.Index, title: trackTitle(stream), codec: stream.Codec ?? undefined, isDefault: stream.IsDefault };
    if (stream.Type === "Audio") audioTracks.push(option);
    else if (stream.Type === "Subtitle") subtitleTracks.push(option);
    else if (stream.Type === "Video" && stream.Codec) {
      videoSummary += ` · ${stream.Codec.toUpperCase()}`;
      if (stream.BitDepth && stream.BitDepth > 8) videoSummary += ` ${stream.BitDepth}-bit`;
      if (stream.VideoRangeType && stream.VideoRangeType !== "SDR") videoSummary += ` ${stream.VideoRangeType}`;
    }
  }

  const selectedAudioIndex = audioStreamIndex ?? mediaSource.DefaultAudioStreamIndex ?? audioTracks[0]?.index;
  // -1 is how Jellyfin spells "no subtitles", both in what we send
  // (SUBTITLES_OFF) and in DefaultSubtitleStreamIndex.
  const effectiveSubtitle = subtitleStreamIndex ?? mediaSource.DefaultSubtitleStreamIndex;
  const selectedSubtitleIndex = effectiveSubtitle !== undefined && effectiveSubtitle >= 0 ? effectiveSubtitle : undefined;

  const common = {
    mediaSourceId: mediaSource.Id,
    playSessionId,
    resumeSeconds: ticksToSeconds(startTicks),
    audioTracks,
    subtitleTracks,
    selectedAudioIndex,
    selectedSubtitleIndex,
    transcodeReasons,
  };

  if (mediaSource.SupportsDirectPlay && !userPickedTrack) {
    // ffprobe reports some containers as a list ("mov,mp4,m4a,3gp,3g2,mj2");
    // the route only accepts one extension.
    const container = (mediaSource.Container ?? "mp4").split(",")[0].trim() || "mp4";
    const url = new URL(`${session.serverUrl}/Videos/${itemId}/stream.${container}`);
    url.searchParams.set("Static", "true");
    url.searchParams.set("MediaSourceId", mediaSource.Id);
    url.searchParams.set("DeviceId", session.deviceId);
    url.searchParams.set("PlaySessionId", playSessionId);
    url.searchParams.set("api_key", session.accessToken);
    if (mediaSource.ETag) url.searchParams.set("Tag", mediaSource.ETag);
    return { ...common, url: url.toString(), contentType: "progressive", playMethod: "DirectPlay", summary: `Direct play · ${videoSummary}` };
  }

  if (mediaSource.TranscodingUrl) {
    const url = new URL(
      mediaSource.TranscodingUrl.startsWith("http") ? mediaSource.TranscodingUrl : `${session.serverUrl}${mediaSource.TranscodingUrl}`
    );
    if (!url.searchParams.has("api_key")) url.searchParams.set("api_key", session.accessToken);
    const isHls = (mediaSource.TranscodingSubProtocol ?? "").toLowerCase() === "hls" || url.pathname.endsWith(".m3u8");
    // TranscodeReasons tell us which streams are actually being re-encoded.
    // Anything video-related (or a burned-in subtitle, or a bitrate cap)
    // means a real transcode; otherwise the video is copied bit-for-bit.
    const videoReencoded = transcodeReasons.some((r) => /^Video|Anamorphic|Interlaced|RefFrames|SubtitleCodec|BitrateExceeds|Unknown|DirectPlayError/i.test(r));
    const audioReencoded = transcodeReasons.some((r) => /^Audio/i.test(r));
    const isRemux = !videoReencoded && !audioReencoded;
    const playMethod: PlayMethod = isRemux ? "DirectStream" : "Transcode";
    const target = (mediaSource.TranscodingContainer ?? url.searchParams.get("SegmentContainer") ?? "ts").toLowerCase();
    const targetLabel = target === "mp4" ? "fMP4" : target.toUpperCase();
    const label = isRemux ? "Remux" : videoReencoded ? "Transcode" : "Video copy · audio → AAC";
    return {
      ...common,
      url: url.toString(),
      contentType: isHls ? "hls" : "progressive",
      playMethod,
      summary: `${label} · ${videoSummary} → ${targetLabel}`,
    };
  }

  // The server declined to hand us a URL (usually ffmpeg missing/disabled, or
  // the transcoding limit hit). Fall back to the hand-built HLS URL that
  // worked in the Swift build so the user still has a chance.
  if (mediaSource.SupportsTranscoding !== false) {
    return {
      ...common,
      url: buildFallbackHlsUrl(session, itemId, mediaSource.Id, playSessionId, startTicks, audioStreamIndex, subtitleStreamIndex),
      contentType: "hls",
      playMethod: "Transcode",
      summary: `Transcode (fallback) · ${videoSummary}`,
    };
  }

  throw new PlaybackError("This file can't be played on this device and the server won't transcode it.", transcodeReasons);
}

/** Last-resort explicit H.264/AAC HLS URL, used when PlaybackInfo comes back
 * without a TranscodingUrl or when the negotiated source fails to load. */
export function buildFallbackHlsUrl(
  session: SessionInfo,
  itemId: string,
  mediaSourceId: string,
  playSessionId: string,
  startTicks: number,
  audioStreamIndex?: number,
  subtitleStreamIndex?: number
): string {
  const url = new URL(`${session.serverUrl}/Videos/${itemId}/master.m3u8`);
  url.searchParams.set("api_key", session.accessToken);
  url.searchParams.set("DeviceId", session.deviceId);
  url.searchParams.set("MediaSourceId", mediaSourceId);
  url.searchParams.set("PlaySessionId", playSessionId);
  // Exactly the parameter set that played in the original Swift build --
  // this is the "known good" path, so it stays minimal on purpose.
  url.searchParams.set("VideoCodec", "h264");
  url.searchParams.set("AudioCodec", "aac");
  url.searchParams.set("TranscodingMaxAudioChannels", "2");
  url.searchParams.set("SegmentContainer", "ts");
  url.searchParams.set("StartTimeTicks", String(startTicks));
  if (audioStreamIndex !== undefined) url.searchParams.set("AudioStreamIndex", String(audioStreamIndex));
  if (subtitleStreamIndex !== undefined) {
    url.searchParams.set("SubtitleStreamIndex", String(subtitleStreamIndex));
    url.searchParams.set("SubtitleMethod", "Encode");
  }
  return url.toString();
}

// MARK: - Diagnostics

/** Strips the token so URLs can be logged and shown on screen. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]api_key=)[^&]+/i, "$1…");
}

/** AVPlayer only ever says "resource unavailable" when the server rejects a
 * media URL. Fetch it ourselves and report what the server actually said. */
export async function probeUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-256" } });
    const type = response.headers.get("content-type") ?? "";
    let body = "";
    if (!response.ok || type.includes("text") || type.includes("json") || type.includes("mpegurl")) {
      body = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 240);
    }
    return `HTTP ${response.status}${type ? ` ${type.split(";")[0]}` : ""}${body ? ` — ${body}` : ""}`;
  } catch (error) {
    return `no response: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// MARK: - Session reporting
//
// Tells the server what we're doing. Progress is what feeds Continue
// Watching / resume positions; Stopped + ActiveEncodings is what kills the
// ffmpeg process so the transcoder isn't left running until the server's
// idle timeout (which, with a couple of orphaned jobs, is the point where a
// modest server stops accepting new ones).

export interface ReportState {
  itemId: string;
  source: PlaybackSource;
  positionSeconds: number;
  isPaused: boolean;
}

function reportBody(state: ReportState) {
  return {
    ItemId: state.itemId,
    MediaSourceId: state.source.mediaSourceId,
    PlaySessionId: state.source.playSessionId,
    PlayMethod: state.source.playMethod,
    PositionTicks: secondsToTicks(state.positionSeconds),
    IsPaused: state.isPaused,
    IsMuted: false,
    CanSeek: true,
    AudioStreamIndex: state.source.selectedAudioIndex,
    SubtitleStreamIndex: state.source.selectedSubtitleIndex,
    RepeatMode: "RepeatNone",
    PlaybackOrder: "Default",
  };
}

export function reportPlaybackStart(session: SessionInfo, state: ReportState): Promise<void> {
  return send(session, "POST", "/Sessions/Playing", reportBody(state));
}

export function reportPlaybackProgress(session: SessionInfo, state: ReportState): Promise<void> {
  return send(session, "POST", "/Sessions/Playing/Progress", reportBody(state));
}

export async function reportPlaybackStopped(session: SessionInfo, state: ReportState): Promise<void> {
  await send(session, "POST", "/Sessions/Playing/Stopped", {
    ItemId: state.itemId,
    MediaSourceId: state.source.mediaSourceId,
    PlaySessionId: state.source.playSessionId,
    PositionTicks: secondsToTicks(state.positionSeconds),
  });
  if (state.source.playMethod !== "DirectPlay") await stopTranscoding(session, state.source.playSessionId);
}

export function stopTranscoding(session: SessionInfo, playSessionId: string): Promise<void> {
  return send(session, "DELETE", "/Videos/ActiveEncodings", undefined, { deviceId: session.deviceId, playSessionId });
}

