import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { VideoView, isPictureInPictureSupported, useVideoPlayer, type VideoSource } from "expo-video";
import { useEvent } from "expo";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession, type SessionInfo } from "../../lib/session";
import { Accent, Theme } from "../../lib/theme";
import {
  PlaybackError,
  buildFallbackHlsUrl,
  getItem,
  getPlaybackSource,
  probeUrl,
  redactUrl,
  reportPlaybackProgress,
  reportPlaybackStart,
  reportPlaybackStopped,
  SUBTITLES_OFF,
  secondsToTicks,
  stopTranscoding,
  type PlaybackSource,
} from "../../lib/jellyfin";
import { episodeLabel, type Item } from "../../lib/types";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { Glass, GlassButton, Icon } from "../../components/Glass";
import { useSettings } from "../../lib/settings";

const CONTROLS_TIMEOUT_MS = 4000;
const PROGRESS_REPORT_MS = 10_000;

/** Server-side track choice. `subtitle` is a stream index, SUBTITLES_OFF, or
 * undefined for "whatever the server picks". */
interface Selection {
  audio?: number;
  subtitle?: number;
}

export default function PlayerScreen() {
  const { id, restart } = useLocalSearchParams<{ id: string; restart?: string }>();
  const { session } = useSession();
  const router = useRouter();

  const [item, setItem] = useState<Item | null>(null);
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  // Position to hand to the *next* source; starts as the server-side resume
  // point and is overwritten with the live position when tracks change so a
  // subtitle switch never restarts the video from zero.
  const positionRef = useRef<number | null>(null);
  // Sticks across track changes so switching audio never silently re-enables
  // subtitles the user turned off (and vice versa).
  const selectionRef = useRef<Selection>({});

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const load = useCallback(
    async (selection: Partial<Selection> = {}) => {
      if (!session) return;
      setError(null);
      selectionRef.current = { ...selectionRef.current, ...selection };
      try {
        const loaded = item ?? (await getItem(session, id));
        if (!item) setItem(loaded);

        // `?restart=1` (the "play from beginning" button) ignores the saved position.
        const startSeconds = positionRef.current ?? (restart ? 0 : (loaded.UserData?.PlaybackPositionTicks ?? 0) / 10_000_000);
        const { audio, subtitle } = selectionRef.current;
        const next = await getPlaybackSource(session, id, secondsToTicks(startSeconds), audio, subtitle);
        setSource(next);
      } catch (e) {
        const reasons = e instanceof PlaybackError && e.reasons.length ? e.reasons.join(", ") : undefined;
        setError({ message: e instanceof Error ? e.message : String(e), detail: reasons });
      }
    },
    [session, id, item, restart]
  );

  useEffect(() => {
    load();
    // Only on mount / item change: track changes call load() themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, id]);

  if (!session) return null;

  return (
    // Own SafeAreaProvider: the root one measures the portrait window this
    // modal was launched from, so its insets go stale after we force landscape.
    <SafeAreaProvider style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden />
      {source && item ? (
        <PlayerCore
          session={session}
          item={item}
          source={source}
          onChangeTracks={(selection, currentPosition) => {
            positionRef.current = currentPosition;
            load(selection);
          }}
          onFatalError={(message, detail) => setError({ message, detail })}
          onClose={() => router.back()}
        />
      ) : null}

      {!source && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorOverlay}>
          <Glass radius={Theme.radius.xl} style={styles.errorCard}>
            <Icon sf="exclamationmark.triangle.fill" ion="warning" size={28} color={Accent.accentHover} />
            <Text style={styles.errorTitle}>Couldn't play this video</Text>
            <Text style={styles.errorText} selectable>
              {error.message}
            </Text>
            {error.detail ? (
              <Text style={styles.diagnostic} selectable>
                {error.detail}
              </Text>
            ) : null}
            <Text style={styles.diagnostic}>item {id.slice(0, 8)}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable onPress={() => router.back()} style={styles.errorButton}>
                <Text style={styles.errorButtonText}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSource(null);
                  load();
                }}
                style={[styles.errorButton, { backgroundColor: Theme.text }]}
              >
                <Text style={[styles.errorButtonText, { color: "#141018" }]}>Try Again</Text>
              </Pressable>
            </View>
          </Glass>
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}

// MARK: - Core

function toVideoSource(source: PlaybackSource, item: Item): VideoSource {
  return {
    uri: source.url,
    contentType: source.contentType,
    metadata: {
      title: item.SeriesName ? episodeLabel(item) : item.Name,
      artist: item.SeriesName ?? undefined,
    },
  };
}

function PlayerCore({
  session,
  item,
  source,
  onChangeTracks,
  onFatalError,
  onClose,
}: {
  session: SessionInfo;
  item: Item;
  source: PlaybackSource;
  onChangeTracks: (selection: Partial<Selection>, currentPosition: number) => void;
  onFatalError: (message: string, detail?: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<VideoView>(null);
  // System player chrome (with its own PiP/AirPlay/scrubber) vs FastFin's
  // glass HUD. See lib/settings.ts for why native is the iOS default.
  const { playerControls } = useSettings();
  const useNativeChrome = playerControls === "native";
  const player = useVideoPlayer(toVideoSource(source, item), (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.preservesPitch = true;
    // Deliberately false: with the "keep playing audio in background" policy
    // set, iOS never auto-enters Picture in Picture on backgrounding. PiP is
    // the background experience we want for video.
    p.staysActiveInBackground = false;
    p.showNowPlayingNotification = true;
    p.play();
  });

  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { status, error } = useEvent(player, "statusChange", { status: player.status });
  const { currentTime, bufferedPosition } = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
    bufferedPosition: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });

  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPiPActive, setIsPiPActive] = useState(false);
  // AVPlayerViewController's PiP entry point fails *silently* when iOS
  // refuses (e.g. inside Expo Go), so we watch for the start event ourselves
  // and tell the user if it never arrives.
  const pipStarted = useRef(false);
  const pipTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [overlayVisible, setOverlayVisible] = useState(true);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), CONTROLS_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    showOverlay();
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, [showOverlay]);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekedToResume = useRef(false);
  // Where the next loaded source should seek to. Normally the server-side
  // resume point; the in-place transcode fallback overwrites it with the
  // position playback had reached when the negotiated source failed.
  const resumeTargetRef = useRef(source.resumeSeconds);
  // Last known good position, used for progress/stop reports. Seeded with the
  // resume point so a report fired before the first timeUpdate (e.g. a track
  // switch tearing the previous player down) never writes 0 to the server.
  const positionRef = useRef(source.resumeSeconds);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  // -- Source lifecycle -----------------------------------------------------
  // `useVideoPlayer` builds a fresh player whenever the source object changes
  // (track switch, retry), so per-source state just needs resetting here.

  useEffect(() => {
    seekedToResume.current = false;
    resumeTargetRef.current = source.resumeSeconds;
    positionRef.current = source.resumeSeconds;
    setFallbackUsed(false);
  }, [source.url, source.resumeSeconds]);

  useEffect(() => {
    // A fresh player reports 0 until the resume seek lands; ignore that.
    if (seekedToResume.current && scrubTime === null) positionRef.current = currentTime;
  }, [currentTime, scrubTime]);

  useEffect(() => {
    const sub = player.addListener("sourceLoad", ({ duration: loadedDuration }) => {
      if (loadedDuration) setDuration(loadedDuration);

      // Jellyfin's HLS playlist always spans the whole file from 0, and a
      // static MP4 obviously does too, so resume is a client-side seek. The
      // StartTimeTicks we passed just tells ffmpeg where to start encoding.
      const target = resumeTargetRef.current;
      if (!seekedToResume.current && target > 2 && loadedDuration > target + 5) {
        player.currentTime = target;
      }
      seekedToResume.current = true;

      // Text subtitles arrive as a native HLS track; Jellyfin only includes
      // the one that was selected, so if any exist, switch it on.
      const subtitleTracks = player.availableSubtitleTracks;
      if (source.selectedSubtitleIndex !== undefined && subtitleTracks.length > 0) {
        player.subtitleTrack = subtitleTracks[0];
      }
    });
    return () => sub.remove();
  }, [player, source]);

  // -- Error handling with one automatic fallback ---------------------------

  // URL the player is *actually* loading (differs from source.url once the
  // fallback has kicked in), so diagnostics probe the right thing.
  const activeUrlRef = useRef(source.url);
  const probeLog = useRef<string[]>([]);

  useEffect(() => {
    activeUrlRef.current = source.url;
    probeLog.current = [];
    console.log(`[FastFin] ▶ ${source.summary} ${redactUrl(source.url)}`);
  }, [source.url, source.summary]);

  useEffect(() => {
    if (status !== "error") return;
    const message = error?.message ?? "Unknown playback error";
    let cancelled = false;

    (async () => {
      // AVPlayer's "resource unavailable" hides the HTTP status; get it.
      const probe = await probeUrl(activeUrlRef.current);
      const line = `${fallbackUsed ? "fallback" : source.playMethod}: ${probe}`;
      probeLog.current.push(line);
      console.warn(`[FastFin] ✖ ${message}\n  ${redactUrl(activeUrlRef.current)}\n  → ${probe}`);
      if (cancelled) return;

      const alreadyFallback = source.summary.startsWith("Transcode (fallback)");
      if (!fallbackUsed && !alreadyFallback) {
        // The negotiated source didn't load. An explicit H.264/AAC transcode
        // of the same item -- the URL shape the Swift build proved out --
        // nearly always does. Same PlaySessionId so the server swaps jobs.
        setFallbackUsed(true);
        await stopTranscoding(session, source.playSessionId);
        resumeTargetRef.current = positionRef.current;
        seekedToResume.current = false;
        const fallbackUrl = buildFallbackHlsUrl(
          session,
          item.Id,
          source.mediaSourceId,
          source.playSessionId,
          secondsToTicks(positionRef.current),
          source.selectedAudioIndex,
          source.selectedSubtitleIndex
        );
        activeUrlRef.current = fallbackUrl;
        console.log(`[FastFin] ▶ Transcode (fallback) ${redactUrl(fallbackUrl)}`);
        player.replaceAsync({ uri: fallbackUrl, contentType: "hls" }).then(() => player.play()).catch(() => {});
        return;
      }

      onFatalError(message, [source.summary, ...source.transcodeReasons, ...probeLog.current].filter(Boolean).join("\n"));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // -- Server reporting -----------------------------------------------------

  useEffect(() => {
    // Read from refs only: this cleanup runs after the native player has been
    // released, and touching `player.*` then throws NotFoundException.
    const state = () => ({ itemId: item.Id, source, positionSeconds: positionRef.current, isPaused: !isPlayingRef.current });
    reportPlaybackStart(session, state());
    const interval = setInterval(() => {
      reportPlaybackProgress(session, state());
    }, PROGRESS_REPORT_MS);
    return () => {
      clearInterval(interval);
      reportPlaybackStopped(session, state());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.playSessionId]);

  useEffect(() => {
    // Pause/resume are the moments the server most wants to know about.
    reportPlaybackProgress(session, { itemId: item.Id, source, positionSeconds: positionRef.current, isPaused: !isPlaying });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    const sub = player.addListener("playToEnd", () => {
      reportPlaybackStopped(session, { itemId: item.Id, source, positionSeconds: duration || positionRef.current, isPaused: true });
      onClose();
    });
    return () => sub.remove();
  }, [player, session, item.Id, source, duration, onClose]);

  // -- Orientation while in Picture in Picture -----------------------------

  useEffect(() => {
    if (!isPiPActive) return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    };
  }, [isPiPActive]);

  // -- Controls visibility --------------------------------------------------

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (controlsVisible && isPlaying && scrubTime === null) scheduleHide();
    else if (hideTimer.current) clearTimeout(hideTimer.current);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [controlsVisible, isPlaying, scrubTime, scheduleHide]);

  function showControls() {
    setControlsVisible(true);
    scheduleHide();
  }

  function toggleControls() {
    setControlsVisible((v) => !v);
  }

  function haptic() {
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  function skip(seconds: number) {
    haptic();
    const target = player.currentTime + seconds;
    player.currentTime = Math.max(0, duration > 0 ? Math.min(duration - 0.5, target) : target);
    showControls();
  }

  function togglePlay() {
    haptic();
    if (isPlaying) player.pause();
    else player.play();
    showControls();
  }

  function clearPipTimers() {
    pipTimers.current.forEach(clearTimeout);
    pipTimers.current = [];
  }

  function showNotice(text: string) {
    setNotice(text);
    pipTimers.current.push(setTimeout(() => setNotice(null), 2800));
  }

  async function tryStartPiP(label: string) {
    try {
      await videoRef.current?.startPictureInPicture();
      console.log(`[FastFin] PiP: start requested (${label})`);
    } catch (e) {
      console.warn(`[FastFin] PiP: start threw (${label}):`, e);
    }
  }

  function requestPiP() {
    haptic();
    clearPipTimers();
    pipStarted.current = false;
    console.log(`[FastFin] PiP: supported=${isPictureInPictureSupported()} status=${status} playing=${isPlaying}`);
    tryStartPiP("custom HUD");
    pipTimers.current.push(
      setTimeout(() => {
        if (pipStarted.current) return;
        console.warn("[FastFin] PiP: no start event after 1.5s (Expo Go can't do PiP; use the sideloaded build)");
        showNotice("Picture in Picture isn't available in Expo Go");
      }, 1500)
    );
  }

  function leavePiP() {
    haptic();
    videoRef.current?.stopPictureInPicture().catch((e: unknown) => console.warn("[FastFin] PiP: stop threw:", e));
  }

  useEffect(() => {
    console.log(`[FastFin] PiP supported on this device: ${isPictureInPictureSupported()}`);
    return clearPipTimers;
  }, []);

  const displayTime = scrubTime ?? currentTime;
  const isBuffering = status === "loading";
  const showTitle = item.SeriesName ?? item.Name;
  const showSubtitle = item.SeriesName ? episodeLabel(item) : null;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={StyleSheet.absoluteFill} onTouchStart={useNativeChrome ? showOverlay : undefined}>
      <VideoView
        ref={videoRef}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={useNativeChrome}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        onPictureInPictureStart={() => {
          console.log("[FastFin] PiP: started");
          pipStarted.current = true;
          clearPipTimers();
          setIsPiPActive(true);
        }}
        onPictureInPictureStop={() => {
          console.log("[FastFin] PiP: stopped");
          pipStarted.current = false;
          setIsPiPActive(false);
        }}
      />
      </View>

      {useNativeChrome ? (
        // Native mode: the system draws transport, scrubbing, PiP, AirPlay and
        // speed, with its own buttons in the top corners. We keep out of the
        // corners with one centered cluster -- a way out, the title, and the
        // server-side audio/subtitle switcher -- shown on tap, gone after 4s.
        overlayVisible ? (
          <View style={[styles.nativeOverlayRow, { top: insets.top + 6 }]} pointerEvents="box-none">
            <Glass variant="clear" radius={Theme.radius.pill} style={[styles.nativeCluster, { maxWidth: windowWidth * 0.6 }]}>
              <GlassButton sf="chevron.left" ion="chevron-back" onPress={onClose} variant="clear" diameter={36} size={15} accessibilityLabel="Close player" />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.hudTitle} numberOfLines={1}>
                  {showTitle}
                </Text>
                {showSubtitle ? (
                  <Text style={styles.hudSubtitle} numberOfLines={1}>
                    {showSubtitle}
                  </Text>
                ) : null}
              </View>
              <TrackDropdown
                source={source}
                compact
                onSelectAudio={(index) => onChangeTracks({ audio: index }, player.currentTime)}
                onSelectSubtitle={(index) => onChangeTracks({ subtitle: index ?? SUBTITLES_OFF }, player.currentTime)}
              />
            </Glass>
          </View>
        ) : null
      ) : (
        <Pressable style={StyleSheet.absoluteFill} onPress={toggleControls} accessibilityLabel="Toggle player controls" />
      )}

      {!useNativeChrome && isBuffering && !controlsVisible ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}

      {!useNativeChrome && controlsVisible ? (
        <View style={[styles.hud, { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 10), paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]} pointerEvents="box-none">
          {/* Top bar */}
          <View style={styles.hudTop} pointerEvents="box-none">
            <GlassButton sf="chevron.left" ion="chevron-back" onPress={onClose} variant="clear" diameter={42} accessibilityLabel="Close player" />
            <Glass variant="clear" radius={Theme.radius.pill} style={styles.titlePill}>
              <Text style={styles.hudTitle} numberOfLines={1}>
                {showTitle}
              </Text>
              {showSubtitle ? (
                <Text style={styles.hudSubtitle} numberOfLines={1}>
                  {showSubtitle}
                </Text>
              ) : null}
            </Glass>
            {isPictureInPictureSupported() ? (
              <GlassButton
                sf={isPiPActive ? "pip.exit" : "pip.enter"}
                ion="albums-outline"
                onPress={() => (isPiPActive ? leavePiP() : requestPiP())}
                variant="clear"
                diameter={42}
                accessibilityLabel={isPiPActive ? "Exit Picture in Picture" : "Picture in Picture"}
              />
            ) : null}
            <TrackDropdown
              source={source}
              onSelectAudio={(index) => onChangeTracks({ audio: index }, player.currentTime)}
              onSelectSubtitle={(index) => onChangeTracks({ subtitle: index ?? SUBTITLES_OFF }, player.currentTime)}
            />
          </View>

          {/* Center transport */}
          <View style={styles.hudCenter} pointerEvents="box-none">
            <GlassButton sf="gobackward.10" ion="play-back" onPress={() => skip(-10)} variant="clear" diameter={56} size={24} accessibilityLabel="Back 10 seconds" />
            <Pressable onPress={togglePlay} accessibilityRole="button" accessibilityLabel={isPlaying ? "Pause" : "Play"} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
              <Glass interactive variant="regular" radius={40} style={styles.playButton}>
                {isBuffering ? <ActivityIndicator color="#fff" /> : <Icon sf={isPlaying ? "pause.fill" : "play.fill"} ion={isPlaying ? "pause" : "play"} size={30} weight="bold" />}
              </Glass>
            </Pressable>
            <GlassButton sf="goforward.10" ion="play-forward" onPress={() => skip(10)} variant="clear" diameter={56} size={24} accessibilityLabel="Forward 10 seconds" />
          </View>

          {notice ? (
            <View style={styles.noticeRow} pointerEvents="none">
              <Glass radius={Theme.radius.pill} style={styles.noticePill}>
                <Text style={styles.noticeText}>{notice}</Text>
              </Glass>
            </View>
          ) : null}

          {/* Bottom bar */}
          <Glass variant="clear" radius={Theme.radius.xl} style={styles.hudBottom}>
            <Text style={styles.time}>{formatSeconds(displayTime)}</Text>
            <Scrubber
              duration={duration}
              position={displayTime}
              buffered={bufferedPosition}
              onScrubStart={() => {
                setScrubTime(currentTime);
                if (hideTimer.current) clearTimeout(hideTimer.current);
              }}
              onScrub={setScrubTime}
              onScrubEnd={(t) => {
                player.currentTime = t;
                setScrubTime(null);
                showControls();
              }}
            />
            <Text style={[styles.time, { textAlign: "right" }]}>-{formatSeconds(Math.max(0, duration - displayTime))}</Text>
          </Glass>
        </View>
      ) : null}

    </View>
  );
}

// MARK: - Scrubber

function Scrubber({
  duration,
  position,
  buffered,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: {
  duration: number;
  position: number;
  buffered: number;
  onScrubStart: () => void;
  onScrub: (seconds: number) => void;
  onScrubEnd: (seconds: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const fraction = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const bufferedFraction = duration > 0 ? Math.min(1, Math.max(0, buffered / duration)) : 0;

  const toSeconds = (x: number) => (width > 0 && duration > 0 ? Math.min(duration - 0.5, Math.max(0, (x / width) * duration)) : 0);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .onBegin((e) => {
      onScrubStart();
      onScrub(toSeconds(e.x));
    })
    .onUpdate((e) => onScrub(toSeconds(e.x)))
    .onEnd((e) => onScrubEnd(toSeconds(e.x)))
    .onFinalize((e, success) => {
      if (!success) onScrubEnd(toSeconds(e.x));
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{ flex: 1, height: 36, justifyContent: "center", minWidth: windowWidth * 0.3 }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
      >
        <View style={styles.track}>
          <View style={[styles.trackBuffered, { width: `${bufferedFraction * 100}%` }]} />
          <View style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
        </View>
        <View style={[styles.knob, { left: Math.max(0, fraction * width - 7) }]} />
      </View>
    </GestureDetector>
  );
}

// MARK: - Track menu
//
// Native dropdown (SwiftUI Menu on iOS, Compose DropdownMenu on Android) via
// @expo/ui. The trigger is a plain glass disc rather than a Pressable so the
// native menu, not React Native, owns the tap.

function TrackDropdown({
  source,
  compact = false,
  onSelectAudio,
  onSelectSubtitle,
}: {
  source: PlaybackSource;
  /** Smaller trigger for use inside a pill cluster. */
  compact?: boolean;
  onSelectAudio: (index: number) => void;
  onSelectSubtitle: (index: number | undefined) => void;
}) {
  const size = compact ? 36 : 42;
  const actions: MenuAction[] = [];
  if (source.audioTracks.length > 0) {
    actions.push({
      id: "audio",
      title: "Audio",
      displayInline: true,
      subactions: source.audioTracks.map((track) => ({
        id: `audio:${track.index}`,
        title: track.title,
        image: "waveform",
        state: track.index === source.selectedAudioIndex ? "on" : "off",
      })),
    });
  }
  if (source.subtitleTracks.length > 0) {
    actions.push({
      id: "subtitles",
      title: "Subtitles",
      displayInline: true,
      subactions: [
        { id: "subtitle:off", title: "Off", image: "xmark.circle", state: source.selectedSubtitleIndex === undefined ? "on" : "off" },
        ...source.subtitleTracks.map((track) => ({
          id: `subtitle:${track.index}`,
          title: track.title,
          image: "captions.bubble" as const,
          state: (track.index === source.selectedSubtitleIndex ? "on" : "off") as "on" | "off",
        })),
      ],
    });
  }
  actions.push({ id: "info", title: source.summary, image: "info.circle", attributes: { disabled: true } });

  const disabled = source.audioTracks.length === 0 && source.subtitleTracks.length === 0;

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const [kind, value] = nativeEvent.event.split(":");
        if (kind === "audio") {
          const index = Number(value);
          if (index !== source.selectedAudioIndex) onSelectAudio(index);
        } else if (kind === "subtitle") {
          if (value === "off") {
            if (source.selectedSubtitleIndex !== undefined) onSelectSubtitle(undefined);
          } else {
            const index = Number(value);
            if (index !== source.selectedSubtitleIndex) onSelectSubtitle(index);
          }
        }
      }}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Glass interactive variant="clear" radius={size / 2} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Icon sf="captions.bubble" ion="chatbox-ellipses-outline" size={compact ? 15 : 18} />
      </Glass>
    </MenuView>
  );
}

// MARK: - Helpers

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}` : `${minutes}:${secs.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },

  errorOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "rgba(0,0,0,0.6)" },
  errorCard: { width: "100%", maxWidth: 420, padding: 24, alignItems: "center" },
  errorTitle: { color: Theme.text, fontSize: 17, fontWeight: "700", marginTop: 12 },
  errorText: { color: Theme.textSecondary, fontSize: 13.5, textAlign: "center", marginTop: 8, lineHeight: 19 },
  diagnostic: { color: Theme.textDim, fontSize: 11, textAlign: "center", marginTop: 8, fontFamily: process.env.EXPO_OS === "ios" ? "Menlo" : "monospace" },
  errorButton: { paddingHorizontal: 22, height: 42, borderRadius: Theme.radius.pill, backgroundColor: Theme.glassFillStrong, alignItems: "center", justifyContent: "center" },
  errorButtonText: { color: Theme.text, fontWeight: "700", fontSize: 14 },

  hud: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "space-between" },
  hudTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  titlePill: { flex: 1, paddingHorizontal: 18, paddingVertical: 8, minHeight: 42, justifyContent: "center" },
  hudTitle: { color: Theme.text, fontSize: 14.5, fontWeight: "700" },
  hudSubtitle: { color: Theme.textSecondary, fontSize: 11.5, marginTop: 1 },

  hudCenter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 36 },
  playButton: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },

  nativeOverlayRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  nativeCluster: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4, paddingRight: 4, paddingVertical: 4 },
  noticeRow: { position: "absolute", left: 0, right: 0, bottom: 84, alignItems: "center" },
  noticePill: { paddingHorizontal: 16, paddingVertical: 9 },
  noticeText: { color: Theme.text, fontSize: 13, fontWeight: "600" },
  hudBottom: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 6 },
  time: { color: Theme.text, fontSize: 12.5, fontWeight: "600", fontVariant: ["tabular-nums"], minWidth: 44 },
  track: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  trackBuffered: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.35)" },
  trackFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: Theme.text },
  knob: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: Theme.text, boxShadow: "0 1px 4px rgba(0,0,0,0.45)" },

});
