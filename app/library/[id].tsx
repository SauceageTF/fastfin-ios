import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../../lib/session";
import { Theme } from "../../lib/theme";
import { getImageUrl, getItems } from "../../lib/jellyfin";
import type { Item } from "../../lib/types";
import { PosterCard } from "../../components/PosterCard";

const COLUMNS = 3;
const GUTTER = 12;
const H_PADDING = 18;

export default function LibraryGridScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { session } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Item[] | null>(null);
  const [query, setQuery] = useState("");

  const posterWidth = Math.floor((width - H_PADDING * 2 - GUTTER * (COLUMNS - 1)) / COLUMNS);

  useEffect(() => {
    if (!session) return;
    getItems(session, id)
      .then(setItems)
      .catch(() => setItems([]));
  }, [session, id]);

  if (!session) return null;

  const visible = query.trim() ? (items ?? []).filter((item) => item.Name.toLowerCase().includes(query.trim().toLowerCase())) : items ?? [];

  return (
    <>
      <Stack.Screen options={{ title: name ?? "Library" }} />
      <Stack.SearchBar placeholder={`Filter ${name ?? "library"}`} autoCapitalize="none" hideWhenScrolling onChangeText={(e) => setQuery(e.nativeEvent.text)} onCancelButtonPress={() => setQuery("")} textColor={Theme.text} tintColor={Theme.text} />

      {!items ? (
        <View style={styles.center}>
          <ActivityIndicator color={Theme.text} />
        </View>
      ) : (
        <FlatList
          style={styles.root}
          contentInsetAdjustmentBehavior="automatic"
          data={visible}
          keyExtractor={(item) => item.Id}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GUTTER, paddingHorizontal: H_PADDING }}
          contentContainerStyle={{ gap: 18, paddingTop: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <PosterCard title={item.Name} subtitle={item.ProductionYear ? String(item.ProductionYear) : undefined} imageUrl={getImageUrl(session, item.Id)} width={posterWidth} onPress={() => router.push(`/item/${item.Id}`)} />
          )}
          ListEmptyComponent={<Text style={styles.empty}>{query ? `Nothing matches “${query.trim()}”.` : "This library is empty."}</Text>}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.background },
  empty: { color: Theme.textDim, textAlign: "center", marginTop: 60 },
});
