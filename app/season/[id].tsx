import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../lib/session";
import { Theme } from "../../lib/theme";
import { getEpisodes, getImageUrl, getSeasons } from "../../lib/jellyfin";
import { formatRuntime, type Item } from "../../lib/types";
import { Glass, Icon } from "../../components/Glass";

export default function SeasonEpisodesScreen() {
  const { id, seriesId, name } = useLocalSearchParams<{ id: string; seriesId: string; name?: string }>();
  const { session } = useSession();
  const router = useRouter();
  const [seasonId, setSeasonId] = useState(id);
  const [seasonName, setSeasonName] = useState(name ?? "Season");
  const [seasons, setSeasons] = useState<Item[]>([]);
  const [episodes, setEpisodes] = useState<Item[] | null>(null);

  useEffect(() => {
    if (!session) return;
    getSeasons(session, seriesId).then(setSeasons).catch(() => {});
  }, [session, seriesId]);

  useEffect(() => {
    if (!session) return;
    setEpisodes(null);
    getEpisodes(session, seriesId, seasonId)
      .then(setEpisodes)
      .catch(() => setEpisodes([]));
  }, [session, seriesId, seasonId]);

  if (!session) return null;

  return (
    <>
      <Stack.Screen options={{ title: seasonName }} />

      {!episodes ? (
        <View style={styles.center}>
          <ActivityIndicator color={Theme.text} />
        </View>
      ) : (
        <FlatList
          style={styles.root}
          contentInsetAdjustmentBehavior="automatic"
          data={episodes}
          keyExtractor={(episode) => episode.Id}
          contentContainerStyle={{ paddingHorizontal: 18, gap: 12, paddingTop: 8, paddingBottom: 40 }}
          ListHeaderComponent={
            seasons.length > 1 ? (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={seasons}
                keyExtractor={(s) => s.Id}
                contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
                renderItem={({ item: s }) => {
                  const selected = s.Id === seasonId;
                  return (
                    <Pressable
                      onPress={() => {
                        setSeasonId(s.Id);
                        setSeasonName(s.Name);
                      }}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                    >
                      {selected ? (
                        <View style={[styles.seasonChip, { backgroundColor: Theme.text }]}>
                          <Text style={[styles.seasonChipText, { color: "#141018" }]}>{s.Name}</Text>
                        </View>
                      ) : (
                        <Glass interactive variant="clear" radius={Theme.radius.pill} style={styles.seasonChip}>
                          <Text style={styles.seasonChipText}>{s.Name}</Text>
                        </Glass>
                      )}
                    </Pressable>
                  );
                }}
              />
            ) : null
          }
          renderItem={({ item: episode }) => {
            const played = episode.UserData?.PlayedPercentage ?? 0;
            const watched = played >= 95 || (episode.UserData as { Played?: boolean } | null)?.Played;
            return (
              <Pressable onPress={() => router.push(`/player/${episode.Id}`)} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }] }]} accessibilityRole="button" accessibilityLabel={episode.Name}>
                <Glass interactive radius={Theme.radius.lg} style={styles.row}>
                  <View style={styles.thumbFrame}>
                    <Image source={{ uri: getImageUrl(session, episode.Id, 480) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                    {played > 0 && played < 95 ? (
                      <View style={styles.thumbProgress}>
                        <View style={[styles.thumbProgressFill, { width: `${played}%` }]} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.episodeNumber}>{episode.IndexNumber ? `EPISODE ${episode.IndexNumber}` : ""}</Text>
                    <Text style={styles.name} numberOfLines={2}>
                      {episode.Name}
                    </Text>
                    <Text style={styles.runtime}>
                      {formatRuntime(episode.RunTimeTicks)}
                      {watched ? "  ·  Watched" : ""}
                    </Text>
                  </View>
                  <Icon sf={watched ? "checkmark.circle.fill" : "play.circle.fill"} ion={watched ? "checkmark-circle" : "play-circle"} size={26} color={watched ? Theme.textDim : Theme.text} weight="regular" />
                </Glass>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No episodes in this season.</Text>}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.background },
  seasonChip: { paddingHorizontal: 14, height: 34, justifyContent: "center", borderRadius: Theme.radius.pill },
  seasonChipText: { fontSize: 13, fontWeight: "700", color: Theme.text },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 10, paddingRight: 14 },
  thumbFrame: { width: 132, height: 74, borderRadius: Theme.radius.md, borderCurve: "continuous", overflow: "hidden", backgroundColor: Theme.background },
  thumbProgress: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  thumbProgressFill: { height: "100%", backgroundColor: Theme.text },
  episodeNumber: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6, color: Theme.textDim },
  name: { fontSize: 14.5, fontWeight: "600", color: Theme.text, lineHeight: 19 },
  runtime: { fontSize: 12, color: Theme.textDim },
  empty: { color: Theme.textDim, textAlign: "center", marginTop: 60 },
});
