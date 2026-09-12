import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Theme } from "../lib/theme";

/** 2:3 poster with a continuous-curve corner and a hairline rim so it reads
 * as a physical card sitting on the glass surfaces around it. */
export function PosterCard({ title, subtitle, imageUrl, width = 108, onPress }: { title: string; subtitle?: string; imageUrl: string; width?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width, transform: [{ scale: pressed ? 0.97 : 1 }] }]} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[styles.frame, { width, height: width * 1.5 }]}>
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: Theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: Theme.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassRim,
  },
  title: { marginTop: 7, fontSize: 12, fontWeight: "600", color: Theme.text },
  subtitle: { marginTop: 2, fontSize: 11, color: Theme.textDim },
});
