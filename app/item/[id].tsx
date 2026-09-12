import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../lib/session";
import { Accent, Theme } from "../../lib/theme";
import { getBackdropUrl, getEpisodes, getImageUrl, getItem, getLogoUrl, getSeasons, getSimilarItems } from "../../lib/jellyfin";
import { backdropSourceId, episodeLabel, formatRuntime, hasLogo, type Item } from "../../lib/types";
import { CarouselRow } from "../../components/CarouselRow";
import { PosterCard } from "../../components/PosterCard";
import { Glass, GlassButton, GlassPillButton, Icon } from "../../components/Glass";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const router = useRouter();
  const { height } = useWindowDimensions();

  const [item, setItem] = useState<Item | null>(null);
  const [seasons, setSeasons] = useState<Item[] | null>(null);
  const [nextEpisodes, setNextEpisodes] = useState<Item[] | null>(null);
  const [similarItems, setSimilarItems] = useState<Item[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const loaded = await getItem(session, id);
      if (cancelled) return;
      setItem(loaded);

      if (loaded.Type === "Series") {
        getSeasons(session, id).then((s) => !cancelled && setSeasons(s));
      } else if (loaded.Type === "Episode" && loaded.SeriesId && loaded.SeasonId) {
        getEpisodes(session, loaded.SeriesId, loaded.SeasonId).then((episodes) => {
          if (cancelled) return;
          setNextEpisodes(episodes.filter((ep) => ep.Id !== loaded.Id && (ep.IndexNumber ?? 0) > (loaded.IndexNumber ?? 0)));
        });
      }
      if (loaded.Type === "Movie" || loaded.Type === "Series") {
        getSimilarItems(session, id).then((s) => !cancelled && setSimilarItems(s));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, id]);

  if (!session) return null;

  if (!item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Theme.text} />
      </View>
    );
  }

  const backdropId = backdropSourceId(item) ?? item.Id;
  const isResume = !!item.UserData?.PlaybackPositionTicks;
  const played = item.UserData?.PlayedPercentage ?? 0;
  const heroHeight = Math.min(440, Math.round(height * 0.52));
  const seriesLink = item.Type === "Episode" && item.SeriesId ? `/item/${item.SeriesId}` : null;

  return (
    <>
      {/* Header stays transparent; the native back button floats over the
          backdrop as Liquid Glass on iOS 26. */}
      <Stack.Screen options={{ title: "", headerTransparent: true, headerBlurEffect: "none" }} />
      <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 48 }} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { height: heroHeight }]}>
          <Image source={{ uri: getBackdropUrl(session, backdropId) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          <LinearGradient colors={["rgba(10,10,14,0.45)", "transparent"]} locations={[0, 0.35]} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={["transparent", "rgba(10,10,14,0.7)", Theme.background]} locations={[0.35, 0.8, 1]} style={StyleSheet.absoluteFill} />
        </View>

        <View style={styles.info}>
          {hasLogo(item) ? (
            <Image source={{ uri: getLogoUrl(session, item.Id) }} style={styles.logo} contentFit="contain" contentPosition="left" />
          ) : (
            <Text style={styles.title}>{item.Name}</Text>
          )}

          {item.SeriesName ? (
            <Text style={styles.seriesLine} onPress={seriesLink ? () => router.push(seriesLink) : undefined}>
              {item.SeriesName}
              {item.IndexNumber ? `  ·  Episode ${item.IndexNumber}` : ""}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            {item.ProductionYear ? <Meta>{String(item.ProductionYear)}</Meta> : null}
            {item.RunTimeTicks ? <Meta>{formatRuntime(item.RunTimeTicks)}</Meta> : null}
            {item.OfficialRating ? <Chip>{item.OfficialRating}</Chip> : null}
            {item.CommunityRating ? (
              <View style={styles.rating}>
                <Icon sf="star.fill" ion="star" size={11} color={Accent.accentHover} />
                <Text style={styles.ratingText}>{item.CommunityRating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>

          {item.Type !== "Series" ? (
            <View style={{ gap: 10 }}>
              <View style={styles.actionRow}>
                <GlassPillButton label={isResume ? "Resume" : "Play"} icon={{ sf: "play.fill", ion: "play" }} prominent onPress={() => router.push(`/player/${item.Id}`)} style={{ flex: 1 }} />
                {isResume ? (
                  <GlassButton sf="arrow.counterclockwise" ion="refresh" onPress={() => router.push(`/player/${item.Id}?restart=1`)} diameter={46} accessibilityLabel="Play from beginning" />
                ) : null}
              </View>
              {played > 0 ? (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${played}%` }]} />
                </View>
              ) : null}
            </View>
          ) : seasons && seasons[0] ? (
            <GlassPillButton
              label="Browse Episodes"
              icon={{ sf: "list.bullet", ion: "list" }}
              prominent
              onPress={() => router.push(`/season/${seasons[0].Id}?seriesId=${item.Id}&name=${encodeURIComponent(seasons[0].Name)}`)}
            />
          ) : null}

          {item.Taglines?.[0] ? <Text style={styles.tagline}>{item.Taglines[0]}</Text> : null}

          {item.Overview ? (
            <Text style={styles.overview} numberOfLines={expanded ? undefined : 4} onPress={() => setExpanded((v) => !v)}>
              {item.Overview}
            </Text>
          ) : null}

          {item.Genres && item.Genres.length > 0 ? (
            <View style={styles.genreRow}>
              {item.Genres.map((genre) => (
                <Glass key={genre} variant="clear" radius={Theme.radius.pill} style={styles.genreChip}>
                  <Text style={styles.genreText}>{genre}</Text>
                </Glass>
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ gap: 30 }}>
          {item.Type === "Series" && seasons && seasons.length > 0 ? (
            <CarouselRow title="Seasons">
              {seasons.map((season) => (
                <PosterCard
                  key={season.Id}
                  title={season.Name}
                  imageUrl={getImageUrl(session, season.Id)}
                  onPress={() => router.push(`/season/${season.Id}?seriesId=${item.Id}&name=${encodeURIComponent(season.Name)}`)}
                />
              ))}
            </CarouselRow>
          ) : null}

          {item.Type === "Episode" && nextEpisodes && nextEpisodes.length > 0 ? (
            <CarouselRow title="Next Up">
              {nextEpisodes.map((episode) => (
                <EpisodeCard key={episode.Id} title={episodeLabel(episode)} runtime={formatRuntime(episode.RunTimeTicks)} imageUrl={getImageUrl(session, episode.Id, 640)} onPress={() => router.push(`/player/${episode.Id}`)} />
              ))}
            </CarouselRow>
          ) : null}

          {(item.Type === "Movie" || item.Type === "Series") && similarItems && similarItems.length > 0 ? (
            <CarouselRow title="More Like This">
              {similarItems.map((similar) => (
                <PosterCard key={similar.Id} title={similar.Name} subtitle={similar.ProductionYear ? String(similar.ProductionYear) : undefined} imageUrl={getImageUrl(session, similar.Id)} onPress={() => router.push(`/item/${similar.Id}`)} />
              ))}
            </CarouselRow>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

function Meta({ children }: { children: string }) {
  return <Text style={styles.meta}>{children}</Text>;
}

function Chip({ children }: { children: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{children}</Text>
    </View>
  );
}

function EpisodeCard({ title, runtime, imageUrl, onPress }: { title: string; runtime: string; imageUrl: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: 196, transform: [{ scale: pressed ? 0.97 : 1 }] }]} accessibilityRole="button" accessibilityLabel={title}>
      <View style={styles.episodeFrame}>
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        <Glass variant="clear" radius={Theme.radius.pill} style={styles.episodePlay}>
          <Icon sf="play.fill" ion="play" size={12} weight="bold" />
        </Glass>
      </View>
      <Text style={styles.episodeTitle} numberOfLines={1}>
        {title}
      </Text>
      {runtime ? <Text style={styles.episodeRuntime}>{runtime}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.background },
  hero: { backgroundColor: Theme.backgroundElevated },
  info: { paddingHorizontal: 18, marginTop: -72, gap: 14, marginBottom: 30 },
  logo: { width: 240, height: 84 },
  title: { fontSize: 30, fontWeight: "800", color: Theme.text, letterSpacing: -0.5 },
  seriesLine: { fontSize: 14, fontWeight: "600", color: Theme.textSecondary, marginTop: -6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  meta: { fontSize: 13, fontWeight: "600", color: Theme.textDim },
  chip: { borderWidth: 1, borderColor: Theme.glassRim, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: "700", color: Theme.textDim },
  rating: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 12.5, fontWeight: "700", color: Accent.accentHover },
  actionRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Theme.text },
  tagline: { fontSize: 14, fontStyle: "italic", color: Theme.textSecondary },
  overview: { fontSize: 14.5, lineHeight: 21, color: Theme.textSecondary },
  genreRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  genreChip: { paddingHorizontal: 13, paddingVertical: 7 },
  genreText: { fontSize: 12.5, fontWeight: "600", color: Theme.textSecondary },
  episodeFrame: {
    width: 196,
    height: 110,
    borderRadius: Theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: Theme.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassRim,
  },
  episodePlay: { position: "absolute", right: 10, bottom: 10, width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  episodeTitle: { marginTop: 7, fontSize: 12.5, fontWeight: "600", color: Theme.text },
  episodeRuntime: { marginTop: 2, fontSize: 11, color: Theme.textDim },
});
