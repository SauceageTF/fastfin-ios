import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSession } from "../../../lib/session";
import { Theme } from "../../../lib/theme";
import { getImageUrl, search } from "../../../lib/jellyfin";
import type { Item } from "../../../lib/types";
import { PosterCard } from "../../../components/PosterCard";
import { Icon } from "../../../components/Glass";

const COLUMNS = 3;
const GUTTER = 12;
const H_PADDING = 18;

export default function SearchScreen() {
  const { session } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const posterWidth = Math.floor((width - H_PADDING * 2 - GUTTER * (COLUMNS - 1)) / COLUMNS);

  useEffect(() => {
    if (!session || !query.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      search(session, query.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, session]);

  if (!session) return null;

  return (
    <>
      {/* Native UISearchController in the header -- on iOS 26 it lives in
          the Liquid Glass tab bar's search slot. */}
      <Stack.SearchBar
        placeholder="Movies, shows, episodes"
        autoCapitalize="none"
        hideWhenScrolling={false}
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
        textColor={Theme.text}
        tintColor={Theme.text}
      />
      <FlatList
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        data={results}
        keyExtractor={(item) => item.Id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GUTTER, paddingHorizontal: H_PADDING }}
        contentContainerStyle={{ gap: 18, paddingTop: 12, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <PosterCard
            title={item.Name}
            subtitle={item.ProductionYear ? String(item.ProductionYear) : undefined}
            imageUrl={getImageUrl(session, item.Id)}
            width={posterWidth}
            onPress={() => router.push(`/item/${item.Id}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {query.trim() ? (
              isSearching ? null : (
                <>
                  <Icon sf="magnifyingglass" ion="search" size={30} color={Theme.textDim} weight="regular" />
                  <Text style={styles.emptyTitle}>No results for &ldquo;{query.trim()}&rdquo;</Text>
                  <Text style={styles.emptyText}>Check the spelling or try a shorter title.</Text>
                </>
              )
            ) : (
              <>
                <Icon sf="sparkle.magnifyingglass" ion="search" size={30} color={Theme.textDim} weight="regular" />
                <Text style={styles.emptyTitle}>Search your library</Text>
                <Text style={styles.emptyText}>Movies and series across every library on your server.</Text>
              </>
            )}
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.background },
  emptyState: { alignItems: "center", paddingTop: 90, paddingHorizontal: 40, gap: 8 },
  emptyTitle: { color: Theme.text, fontSize: 17, fontWeight: "700", marginTop: 6, textAlign: "center" },
  emptyText: { color: Theme.textDim, fontSize: 13.5, textAlign: "center", lineHeight: 19 },
});
