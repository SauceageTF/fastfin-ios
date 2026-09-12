import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import type { ReactNode } from "react";
import { Theme } from "../lib/theme";
import { Icon } from "./Glass";

export function CarouselRow({ title, onSeeAll, children }: { title: string; onSeeAll?: () => void; children: ReactNode }) {
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAll} accessibilityRole="button">
            <Text style={styles.seeAllText}>See all</Text>
            <Icon sf="chevron.right" ion="chevron-forward" size={11} color={Theme.textDim} weight="bold" />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} decelerationRate="fast">
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, marginBottom: 12 },
  title: { fontSize: 19, fontWeight: "700", color: Theme.text, letterSpacing: -0.3 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  seeAllText: { fontSize: 13, fontWeight: "600", color: Theme.textDim },
  row: { flexDirection: "row", paddingHorizontal: 18, gap: 12 },
});
