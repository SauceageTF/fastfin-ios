import { Stack, SplashScreen } from "expo-router";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SessionProvider, useSession } from "../lib/session";
import { Accent, Theme } from "../lib/theme";
import { hasLiquidGlass } from "../components/Glass";

SplashScreen.preventAutoHideAsync();

/** React Navigation theme so native headers/tab bars pick up our palette
 * (and so header buttons don't flicker between tab switches). */
const FastFinTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Accent.accent,
    background: Theme.background,
    card: Theme.backgroundElevated,
    text: Theme.text,
    border: Theme.border,
  },
};

function SplashScreenController() {
  const { isRestoring } = useSession();
  if (!isRestoring) SplashScreen.hide();
  return null;
}

function RootNavigator() {
  const { session } = useSession();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: Theme.background },
        // Transparent, glass-backed headers: on iOS 26 the back button and
        // large title render as floating Liquid Glass; older iOS falls back
        // to a system material blur.
        headerTransparent: true,
        headerBlurEffect: hasLiquidGlass ? "none" : "systemUltraThinMaterialDark",
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: "transparent" },
        headerTintColor: Theme.text,
        headerTitleStyle: { color: Theme.text },
        headerLargeTitleStyle: { color: Theme.text },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: "", headerLargeTitleEnabled: false }} />
        <Stack.Screen name="library/[id]" options={{ headerLargeTitleEnabled: true }} />
        <Stack.Screen name="season/[id]" options={{ headerLargeTitleEnabled: true }} />
        <Stack.Screen name="player/[id]" options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade", autoHideHomeIndicator: true }} />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Theme.background }}>
      <ThemeProvider value={FastFinTheme}>
        <SessionProvider>
          <StatusBar style="light" />
          <SplashScreenController />
          <RootNavigator />
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
