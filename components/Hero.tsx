import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme } from "../lib/theme";
import { getImageUrl } from "../lib/jellyfin";
import type { SessionInfo } from "../lib/session";
import { formatRuntime, type Item } from "../lib/types";
import { Glass, GlassButton, GlassPillButton } from "./Glass";

const POSTER_ASPECT = 2 / 3;
/** Poster width as a fraction of the screen; the rest is breathing room. */
const POSTER_WIDTH_FRACTION = 0.7;
const AUTO_ADVANCE_MS = 6000;

export interface HeroSlide {
  /** Drives the artwork, metadata and the play action. */
  item: Item;
  /** The show itself when `item` is an episode. Only used for the poster
   * choice and accessibility label now that the wordmark is gone. */
  titleItem: Item;
}

/** Featured slideshow at the top of Home: the poster itself, full 2:3 and
 * undimmed, floating in front of a blurred copy of the same art. Swipeable,
 * auto-advancing, Play/Info underneath. */
export function Hero({ slides, session }: { slides: HeroSlide[]; session: SessionInfo }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const posterWidth = Math.round(width * POSTER_WIDTH_FRACTION);
  const posterHeight = Math.round(posterWidth / POSTER_ASPECT);
  // top chrome + poster + meta/buttons + page dots
  const topPadding = insets.top + 64;
  const height = topPadding + posterHeight + 132;

  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const userInteracting = useRef(false);

  const goTo = useCallback(
    (next: number, animated = true) => {
      const clamped = ((next % slides.length) + slides.length) % slides.length;
      scrollRef.current?.scrollTo({ x: clamped * width, animated });
      indexRef.current = clamped;
      setIndex(clamped);
    },
    [slides.length, width]
  );

  // Auto-advance, paused while a finger is on the carousel.
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => {
      if (!userInteracting.current) goTo(indexRef.current + 1);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [slides.length, goTo]);

  // Keep the current page aligned if the window rotates/resizes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: indexRef.current * width, animated: false });
  }, [width]);

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    userInteracting.current = false;
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    indexRef.current = page;
    setIndex(page);
  }

  return (
    <View style={{ height, backgroundColor: Theme.background }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScrollBeginDrag={() => (userInteracting.current = true)}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
      >
        {slides.map((slide) => (
          <HeroSlideView key={slide.item.Id} slide={slide} session={session} width={width} height={height} topPadding={topPadding} posterWidth={posterWidth} posterHeight={posterHeight} />
        ))}
      </ScrollView>

      {/* Fixed chrome: brand, search, page dots. */}
      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Glass variant="clear" radius={Theme.radius.pill} style={styles.brandPill}>
          <Text style={styles.brand}>FastFin</Text>
        </Glass>
        <GlassButton sf="magnifyingglass" ion="search" onPress={() => router.navigate("/search")} variant="clear" accessibilityLabel="Search" />
      </View>

      {slides.length > 1 ? (
        <View style={styles.dotsRow} pointerEvents="box-none">
          <Glass variant="clear" radius={Theme.radius.pill} style={styles.dotsPill}>
            {slides.map((slide, i) => (
              <Pressable key={slide.item.Id} onPress={() => goTo(i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Slide ${i + 1} of ${slides.length}`}>
                <View style={[styles.dot, i === index && styles.dotActive]} />
              </Pressable>
            ))}
          </Glass>
        </View>
      ) : null}
    </View>
  );
}

function HeroSlideView({
  slide,
  session,
  width,
  height,
  topPadding,
  posterWidth,
  posterHeight,
}: {
  slide: HeroSlide;
  session: SessionInfo;
  width: number;
  height: number;
  topPadding: number;
  posterWidth: number;
  posterHeight: number;
}) {
  const router = useRouter();
  const { item, titleItem } = slide;

  // The *poster* (Primary image). An episode's own Primary is a 16:9
  // thumbnail, so episodes borrow their series' poster.
  const posterId = item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id;
  const posterUrl = getImageUrl(session, posterId, 1200);

  function primaryAction() {
    if (item.Type === "Series") router.push(`/item/${item.Id}`);
    else router.push(`/player/${item.Id}`);
  }

  const isResume = !!item.UserData?.PlaybackPositionTicks;
  const primaryLabel = item.Type === "Series" ? "View Episodes" : isResume ? "Resume" : "Play";
  const played = item.UserData?.PlayedPercentage ?? 0;
  const metaParts = [
    item.SeriesName && item.Name !== titleItem.Name ? item.Name : null,
    item.ProductionYear ? String(item.ProductionYear) : null,
    item.RunTimeTicks ? formatRuntime(item.RunTimeTicks) : null,
  ].filter(Boolean);

  return (
    <View style={{ width, height }}>
      {/* Ground: the same art, blurred and darkened. The dimming lives here
          and only here -- the poster in front is drawn at full brightness. */}
      <Image source={{ uri: getImageUrl(session, posterId, 240) }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} transition={300} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,14,0.55)" }]} pointerEvents="none" />
      <LinearGradient colors={["transparent", Theme.background]} locations={[0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={{ paddingTop: topPadding, alignItems: "center" }} pointerEvents="box-none">
        <Pressable
          onPress={primaryAction}
          accessibilityRole="button"
          accessibilityLabel={`Open ${titleItem.Name}`}
          style={({ pressed }) => [styles.posterCard, { width: posterWidth, height: posterHeight, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} recyclingKey={posterId} />
          {isResume && played > 0 ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${played}%` }]} />
            </View>
          ) : null}
        </Pressable>

        <View style={[styles.below, { width: posterWidth }]} pointerEvents="box-none">
          {metaParts.length > 0 ? (
            <Text style={styles.meta} numberOfLines={1}>
              {metaParts.join("  ·  ")}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <GlassPillButton label={primaryLabel} icon={{ sf: "play.fill", ion: "play" }} prominent onPress={primaryAction} style={{ flex: 1 }} />
            <GlassButton sf="info" ion="information" onPress={() => router.push(`/item/${item.Id}`)} diameter={46} accessibilityLabel="Details" />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: "absolute", left: 18, right: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandPill: { paddingHorizontal: 16, height: 40, justifyContent: "center" },
  brand: { fontSize: 17, fontWeight: "800", color: Theme.text, letterSpacing: -0.2 },
  posterCard: {
    borderRadius: Theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: Theme.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
  },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: "rgba(0,0,0,0.45)" },
  progressFill: { height: "100%", backgroundColor: Theme.text },
  below: { marginTop: 14, gap: 12 },
  meta: { fontSize: 12.5, fontWeight: "600", color: Theme.textSecondary, textAlign: "center" },
  buttonRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dotsRow: { position: "absolute", left: 0, right: 0, bottom: 10, alignItems: "center" },
  dotsPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 22 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { width: 18, backgroundColor: Theme.text },
});
