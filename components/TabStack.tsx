import { Stack } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Theme } from "../lib/theme";
import { hasLiquidGlass } from "./Glass";

type StackScreenOptions = NonNullable<ComponentProps<typeof Stack>["screenOptions"]>;

/** Header options shared by every tab's stack: a transparent bar with a large
 * title that floats over content as glass on iOS 26 (system blur before). */
export const glassHeaderOptions: StackScreenOptions = {
  headerTransparent: true,
  // iOS 26 draws its own glass scroll-edge effect; a blur on top overlaps it.
  headerBlurEffect: hasLiquidGlass ? "none" : "systemUltraThinMaterialDark",
  headerShadowVisible: false,
  headerLargeTitleEnabled: true,
  headerLargeTitleShadowVisible: false,
  headerLargeStyle: { backgroundColor: "transparent" },
  headerTintColor: Theme.text,
  headerTitleStyle: { color: Theme.text },
  headerLargeTitleStyle: { color: Theme.text },
  headerBackButtonDisplayMode: "minimal",
  contentStyle: { backgroundColor: Theme.background },
};

/** Stack wrapper each tab uses so NativeTabs (which draws no headers of its
 * own) gets a native navigation bar. */
export function TabStack({ children }: { children?: ReactNode }) {
  return <Stack screenOptions={glassHeaderOptions}>{children}</Stack>;
}
