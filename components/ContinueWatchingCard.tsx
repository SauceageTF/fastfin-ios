import { StyleSheet, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Theme } from "../lib/theme";
import type { Item } from "../lib/types";
import { episodeLabel, formatRuntime } from "../lib/types";
import { Glass, Icon } from "./Glass";

export function ContinueWatchingCard({ item, imageUrl, onPress, width = 196 }: { item: Item; imageUrl: string; onPress: () => void; width?: number }) {
  const subtitle = item.SeriesName ? episodeLabel(item) : formatRuntime(item.RunTimeTicks);
  const played = item.UserData?.PlayedPercentage ?? 0;
  const remainingMinutes = item.RunTimeTicks ? Math.max(1, Math.round(((item.RunTimeTicks * (1 - played / 100)) / 10_000_000) / 60)) : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { width, height: (width * 9) / 16, transform: [{ scale: pressed ? 0.97 : 1 }] }]} accessibilityRole="button" accessibilityLabel={`Resume ${item.SeriesName ?? item.Name}`}>
      <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.82)"]} start={{ x: 0.5, y: 0.3 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />

      <Glass variant="clear" radius={Theme.radius.pill} style={styles.playBadge}>
        <Icon sf="play.fill" ion="play" size={12} weight="bold" />
      </Glass>

      <View style={styles.textBlock}>
        <Text style={styles.name} numberOfLines={1}>
          {item.SeriesName ?? item.Name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
          {remainingMinutes ? `  ·  ${remainingMinutes}m left` : ""}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${played}%` }]} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: Theme.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassRim,
  },
  playBadge: { position: "absolute", top: 10, right: 10, width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  textBlock: { position: "absolute", left: 12, right: 12, bottom: 10 },
  name: { fontSize: 13, fontWeight: "700", color: Theme.text },
  subtitle: { fontSize: 11, color: Theme.textSecondary, marginTop: 2, marginBottom: 7 },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2, backgroundColor: Theme.text },
});
