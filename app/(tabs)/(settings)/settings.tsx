import { useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { THEME_COLORS, Theme, type ThemeColorName } from "../../../lib/theme";
import { useSession } from "../../../lib/session";
import { Glass, Icon } from "../../../components/Glass";
import { updateSettings, useSettings, type PlayerControls } from "../../../lib/settings";

export default function SettingsScreen() {
  const { session, signOut, storageWarning } = useSession();
  const [themeColor, setThemeColor] = useState<ThemeColorName>("ember");
  const { playerControls } = useSettings();

  const serverHost = session ? session.serverUrl.replace(/^https?:\/\//, "") : "";

  function confirmSignOut() {
    Alert.alert("Sign out of FastFin?", `You'll need your ${serverHost} credentials to sign back in.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => signOut() },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Section title="Server" footer={storageWarning ? `Keychain unavailable, so credentials are kept in app storage instead. (${storageWarning})` : undefined}>
        <Row icon={{ sf: "server.rack", ion: "server" }} label="Address" value={serverHost} />
        <Divider />
        <Row icon={{ sf: "person.crop.circle", ion: "person-circle" }} label="User ID" value={session ? `${session.userId.slice(0, 8)}…` : ""} />
        <Divider />
        <Row icon={{ sf: "iphone", ion: "phone-portrait" }} label="Device ID" value={session ? `${session.deviceId.slice(0, 8)}…` : ""} />
      </Section>

      <Section title="Accent" footer="Colours the tab bar, progress bars and highlights.">
        <View style={styles.swatches}>
          {(Object.keys(THEME_COLORS) as ThemeColorName[]).map((name) => {
            const selected = themeColor === name;
            return (
              <Pressable
                key={name}
                onPress={() => {
                  if (process.env.EXPO_OS === "ios") Haptics.selectionAsync().catch(() => {});
                  setThemeColor(name);
                }}
                style={styles.swatchWrap}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={THEME_COLORS[name].label}
              >
                <View style={[styles.swatchRing, selected && { borderColor: Theme.text }]}>
                  <View style={[styles.swatch, { backgroundColor: THEME_COLORS[name].accent }]} />
                </View>
                <Text style={[styles.swatchLabel, selected && { color: Theme.text }]}>{THEME_COLORS[name].label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Player controls" footer={playerControls === "native" ? "The system player: Picture in Picture, AirPlay, playback speed and scrubbing come from iOS itself. FastFin adds the back button and the audio/subtitle switcher." : "FastFin's glass HUD with scrubbing, ±10s, Picture in Picture and the audio/subtitle switcher."}>
        <View style={styles.segmentRow}>
          {(
            [
              { value: "glass", label: "FastFin", sf: "sparkles", ion: "sparkles" },
              { value: "native", label: "Native", sf: "play.rectangle.fill", ion: "logo-apple" },
            ] as const
          ).map((option) => {
            const selected = playerControls === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  if (process.env.EXPO_OS === "ios") Haptics.selectionAsync().catch(() => {});
                  updateSettings({ playerControls: option.value as PlayerControls });
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
              >
                <Icon sf={option.sf} ion={option.ion} size={15} color={selected ? "#141018" : Theme.text} weight="bold" />
                <Text style={[styles.segmentText, selected && { color: "#141018" }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Playback" footer="MP4/MOV files stream untouched. MKV has no iOS demuxer, so HEVC and HDR streams are copied bit-for-bit into fMP4 HLS segments (a remux, not a re-encode). Only unsupported codecs and burned-in subtitles trigger a real transcode.">
        <Row icon={{ sf: "waveform", ion: "pulse" }} label="Direct play" value="MP4 · MOV · H.264 · HEVC" />
        <Divider />
        <Row icon={{ sf: "sparkles.tv", ion: "tv" }} label="HDR" value="HDR10 · HDR10+ · HLG · Dolby Vision 5/8" />
        <Divider />
        <Row icon={{ sf: "shippingbox", ion: "cube" }} label="MKV remux" value="fMP4 HLS · stream copy" />
        <Divider />
        <Row icon={{ sf: "arrow.triangle.2.circlepath", ion: "sync" }} label="Transcode target" value="HEVC/H.264 · AAC" />
        <Divider />
        <Row icon={{ sf: "captions.bubble", ion: "chatbox-ellipses" }} label="Subtitles" value="Native VTT, burn-in for PGS" />
      </Section>

      <Section title="About">
        <Row icon={{ sf: "info.circle", ion: "information-circle" }} label="Version" value={Constants.expoConfig?.version ?? "1.0.0"} />
      </Section>

      <Pressable onPress={confirmSignOut} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]} accessibilityRole="button">
        <Glass interactive radius={Theme.radius.lg} style={styles.signOut}>
          <Icon sf="rectangle.portrait.and.arrow.right" ion="log-out-outline" size={17} color={Theme.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Glass>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionLabel}>{title.toUpperCase()}</Text>
      <Glass radius={Theme.radius.lg}>{children}</Glass>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

function Row({ icon, label, value }: { icon: { sf: Parameters<typeof Icon>[0]["sf"]; ion: Parameters<typeof Icon>[0]["ion"] }; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon {...icon} size={17} color={Theme.textSecondary} weight="medium" />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.background },
  content: { padding: 18, paddingTop: 8, gap: 26, paddingBottom: 40 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: Theme.textDim, letterSpacing: 0.6, paddingHorizontal: 12 },
  sectionFooter: { fontSize: 12.5, color: Theme.textDim, paddingHorizontal: 12, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, minHeight: 50 },
  rowIcon: { width: 26, alignItems: "center" },
  rowLabel: { flex: 1, fontSize: 15, color: Theme.text },
  rowValue: { fontSize: 14, color: Theme.textDim, maxWidth: "55%", fontVariant: ["tabular-nums"] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.glassRim, marginLeft: 52 },
  segmentRow: { flexDirection: "row", gap: 8, padding: 10 },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 40, borderRadius: Theme.radius.pill, backgroundColor: Theme.glassFill },
  segmentSelected: { backgroundColor: Theme.text },
  segmentText: { fontSize: 14, fontWeight: "700", color: Theme.text },
  swatches: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 16, paddingHorizontal: 8 },
  swatchWrap: { alignItems: "center", gap: 8 },
  swatchRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  swatchLabel: { fontSize: 12, fontWeight: "600", color: Theme.textDim },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52 },
  signOutText: { color: Theme.danger, fontWeight: "700", fontSize: 15 },
});
