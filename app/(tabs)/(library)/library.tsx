import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import type { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../../lib/session";
import { Theme } from "../../../lib/theme";
import { getLatestItems, getLibraries, getImageUrl } from "../../../lib/jellyfin";
import type { Item, Library } from "../../../lib/types";
import { Glass, Icon } from "../../../components/Glass";

type IonName = keyof typeof Ionicons.glyphMap;

function iconFor(type: string | null): { sf: SFSymbol; ion: IonName } {
  switch (type) {
    case "movies":
      return { sf: "film.fill", ion: "film" };
    case "tvshows":
      return { sf: "tv.fill", ion: "tv" };
    case "music":
      return { sf: "music.note", ion: "musical-notes" };
    case "homevideos":
      return { sf: "video.fill", ion: "videocam" };
    case "photos":
      return { sf: "photo.fill", ion: "images" };
    case "books":
      return { sf: "book.fill", ion: "book" };
    default:
      return { sf: "folder.fill", ion: "folder" };
  }
}

export default function LibraryScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [libraries, setLibraries] = useState<Library[] | null>(null);
  const [covers, setCovers] = useState<Record<string, Item[]>>({});

  useEffect(() => {
    if (!session) return;
    getLibraries(session)
      .then(async (libs) => {
        setLibraries(libs);
        const results = await Promise.all(libs.map((lib) => getLatestItems(session, lib.Id, 3).catch(() => [] as Item[])));
        const map: Record<string, Item[]> = {};
        libs.forEach((lib, i) => (map[lib.Id] = results[i]));
        setCovers(map);
      })
      .catch(() => setLibraries([]));
  }, [session]);

  if (!session) return null;

  if (!libraries) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Theme.text} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24, gap: 14 }}
      data={libraries}
      keyExtractor={(library) => library.Id}
      renderItem={({ item: library }) => {
        const icon = iconFor(library.CollectionType);
        const backdrop = covers[library.Id]?.[0];
        return (
          <Pressable
            onPress={() => router.push(`/library/${library.Id}?name=${encodeURIComponent(library.Name)}`)}
            style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            accessibilityRole="button"
            accessibilityLabel={library.Name}
          >
            {backdrop ? (
              <Image source={{ uri: getImageUrl(session, backdrop.SeriesId ?? backdrop.Id, 800) }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={2} transition={300} />
            ) : null}
            <LinearGradient colors={["rgba(10,10,14,0.15)", "rgba(10,10,14,0.85)"]} style={StyleSheet.absoluteFill} />
            <View style={styles.cardContent}>
              <Glass variant="clear" radius={Theme.radius.pill} style={styles.iconBadge}>
                <Icon {...icon} size={18} />
              </Glass>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{library.Name}</Text>
                <Text style={styles.cardSubtitle}>{labelFor(library.CollectionType)}</Text>
              </View>
              <Icon sf="chevron.right" ion="chevron-forward" size={14} color={Theme.textDim} weight="bold" />
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>No libraries found.</Text>}
    />
  );
}

function labelFor(type: string | null): string {
  switch (type) {
    case "movies":
      return "Movies";
    case "tvshows":
      return "TV Shows";
    case "music":
      return "Music";
    case "homevideos":
      return "Home Videos";
    case "photos":
      return "Photos";
    case "books":
      return "Books";
    default:
      return "Mixed content";
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.background },
  card: {
    height: 128,
    borderRadius: Theme.radius.xl,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: Theme.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassRim,
    justifyContent: "flex-end",
  },
  cardContent: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  iconBadge: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 18, fontWeight: "700", color: Theme.text, letterSpacing: -0.2 },
  cardSubtitle: { fontSize: 12.5, color: Theme.textSecondary, marginTop: 2 },
  empty: { color: Theme.textDim, textAlign: "center", marginTop: 40 },
});
