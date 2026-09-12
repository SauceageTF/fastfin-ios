import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Accent, Theme } from "../lib/theme";
import { useSession } from "../lib/session";
import { Glass, Icon } from "../components/Glass";

export default function LoginScreen() {
  const { signIn, errorMessage } = useSession();
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleSignIn() {
    setIsSigningIn(true);
    await signIn(serverUrl, username, password);
    setIsSigningIn(false);
  }

  const canSubmit = serverUrl.length > 0 && username.length > 0 && !isSigningIn;

  return (
    <View style={styles.root}>
      {/* Soft ember bloom for the glass card to refract. */}
      <LinearGradient colors={["#5a1e0a", Theme.background, Theme.background]} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 0.9 }} style={StyleSheet.absoluteFill} />
      <View style={styles.orbA} />
      <View style={styles.orbB} />

      <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
          <Glass radius={Theme.radius.xl} style={styles.card}>
            <LinearGradient colors={[Accent.accentHover, Accent.accent]} style={styles.logoMark}>
              <Icon sf="play.fill" ion="play" size={22} weight="bold" />
            </LinearGradient>

            <Text style={styles.title}>FastFin</Text>
            <Text style={styles.subtitle}>Sign in to your Jellyfin server</Text>

            <View style={{ gap: 14, width: "100%" }}>
              <Field label="Server" value={serverUrl} onChangeText={setServerUrl} placeholder="media.example.com" autoCapitalize="none" keyboardType="url" textContentType="URL" />
              <Field label="Username" value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" textContentType="username" />
              <Field label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry textContentType="password" onSubmitEditing={canSubmit ? handleSignIn : undefined} />
            </View>

            {errorMessage ? (
              <Text style={styles.error} selectable>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable onPress={handleSignIn} disabled={!canSubmit} style={({ pressed }) => [{ width: "100%", opacity: canSubmit ? 1 : 0.55, transform: [{ scale: pressed ? 0.98 : 1 }] }]} accessibilityRole="button">
              <View style={styles.button}>{isSigningIn ? <ActivityIndicator color="#141018" /> : <Text style={styles.buttonText}>Sign In</Text>}</View>
            </Pressable>
          </Glass>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "default" | "url";
  textContentType?: "URL" | "username" | "password";
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{props.label.toUpperCase()}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize ?? "sentences"}
        autoCorrect={false}
        keyboardType={props.keyboardType ?? "default"}
        textContentType={props.textContentType}
        returnKeyType={props.onSubmitEditing ? "go" : "next"}
        onSubmitEditing={props.onSubmitEditing}
        selectionColor={Accent.accentHover}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.background },
  orbA: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: "rgba(255,90,31,0.22)", top: -80, right: -90 },
  orbB: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(45,212,200,0.10)", bottom: 60, left: -110 },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, padding: 28, alignItems: "center" },
  logoMark: { width: 56, height: 56, borderRadius: 18, borderCurve: "continuous", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "0 8px 24px rgba(255,90,31,0.35)" },
  title: { fontSize: 26, fontWeight: "800", color: Theme.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13.5, color: Theme.textDim, marginTop: 6, marginBottom: 26, textAlign: "center" },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: Theme.textDim, letterSpacing: 0.6, paddingHorizontal: 2 },
  input: {
    height: 46,
    borderRadius: Theme.radius.md,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    fontSize: 15,
    color: Theme.text,
    backgroundColor: Theme.glassFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.glassRim,
  },
  button: { height: 50, borderRadius: Theme.radius.pill, alignItems: "center", justifyContent: "center", marginTop: 20, backgroundColor: Theme.text },
  buttonText: { fontSize: 15.5, fontWeight: "700", color: "#141018" },
  error: { color: Theme.danger, fontSize: 12.5, fontWeight: "600", textAlign: "center", marginTop: 14 },
});
