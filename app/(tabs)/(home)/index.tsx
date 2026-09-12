import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../../lib/session";
import { Theme } from "../../../lib/theme";
import { getImageUrl, getLatestItems, getLibraries, getRandomItems, getResumeItems } from "../../../lib/jellyfin";
import type { Item, Library } from "../../../lib/types";
import { Hero, type HeroSlide } from "../../../components/Hero";
import { CarouselRow } from "../../../components/CarouselRow";
import { ContinueWatchingCard } from "../../../components/ContinueWatchingCard";
import { PosterCard } from "../../../components/PosterCard";
import { Glass } from "../../../components/Glass";

const HERO_SLIDE_COUNT = 8;

export default function HomeScreen() {
  const { session } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [libraries, setLibraries] = useState<Library[]>([]);
  const [libraryItems, setLibraryItems] = useState<Record<string, Item[]>>({});
  const [continueWatching, setContinueWatching] = useState<Item[]>([]);
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      // Hero slideshow: a random spread of movies and series (never the
      // Continue Watching items -- those already have their own row).
      const [libs, resume, random] = await Promise.all([
        getLibraries(session),
        getResumeItems(session),
        getRandomItems(session, HERO_SLIDE_COUNT).catch(() => [] as Item[]),
      ]);
      setLibraries(libs);
      setContinueWatching(resume);
      setSlides(random.map((item) => ({ item, titleItem: item })));

      const itemsMap: Record<string, Item[]> = {};
      const results = await Promise.all(libs.map((lib) => getLatestItems(session, lib.Id).catch(() => [] as Item[])));
      libs.forEach((lib, i) => (itemsMap[lib.Id] = results[i]));
      setLibraryItems(itemsMap);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`Couldn't load your library: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  if (isLoading && slides.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Theme.text} />
      </View>
    );
  }

  if (errorMessage && slides.length === 0) {
    return (
      <View style={styles.center}>
        <Glass radius={Theme.radius.xl} style={{ padding: 22 }}>
          <Text style={styles.error} selectable>
            {errorMessage}
          </Text>
        </Glass>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      // The hero owns the top edge, so opt out of the automatic safe-area
      // inset and pad the bottom for the floating tab bar by hand.
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          tintColor={Theme.text}
          refreshing={isRefreshing}
          onRefresh={async () => {
            setIsRefreshing(true);
            await load();
            setIsRefreshing(false);
          }}
        />
      }
    >
      {slides.length > 0 ? <Hero slides={slides} session={session} /> : null}

      <View style={{ paddingTop: 22, gap: 30 }}>
        {continueWatching.length > 0 ? (
          <CarouselRow title="Continue Watching">
            {continueWatching.map((item) => (
              <ContinueWatchingCard key={item.Id} item={item} imageUrl={getImageUrl(session, item.Id)} onPress={() => router.push(`/player/${item.Id}`)} />
            ))}
          </CarouselRow>
        ) : null}

        {libraries.map((library) =>
          libraryItems[library.Id]?.length ? (
            <CarouselRow key={library.Id} title={`New in ${library.Name}`} onSeeAll={() => router.push(`/library/${library.Id}?name=${encodeURIComponent(library.Name)}`)}>
              {libraryItems[library.Id].map((item) => (
                <PosterCard
                  key={item.Id}
                  title={item.SeriesName ?? item.Name}
                  subtitle={item.SeriesName ? item.Name : item.ProductionYear ? String(item.ProductionYear) : undefined}
                  imageUrl={getImageUrl(session, item.SeriesId ?? item.Id)}
                  onPress={() => router.push(`/item/${item.Id}`)}
                />
              ))}
            </CarouselRow>
          ) : null
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.background, padding: 32 },
  error: { color: Theme.danger, textAlign: "center" },
});
