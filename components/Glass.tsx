import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable, type GlassStyle } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Theme } from "../lib/theme";

/** True on iOS 26+ (and not on the handful of betas that shipped without the
 * API). Evaluated once -- it can't change while the app is running. */
export const hasLiquidGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

let reduceTransparency = false;
AccessibilityInfo.isReduceTransparencyEnabled?.().then((v) => (reduceTransparency = v)).catch(() => {});

function useReduceTransparency(): boolean {
  const [value, setValue] = useState(reduceTransparency);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (v) => {
      reduceTransparency = v;
      setValue(v);
    });
    return () => sub.remove();
  }, []);
  return value;
}

export interface GlassProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `regular` is the frosted default; `clear` is the near-transparent
   * variant Apple uses over media (our player HUD). */
  variant?: GlassStyle;
  /** Set on tappable surfaces so iOS renders the press bulge/shimmer. */
  interactive?: boolean;
  tintColor?: ColorValue;
  /** Corner radius; glass clips itself, blur needs overflow hidden. */
  radius?: number;
}

/**
 * The one surface every piece of chrome in the app is built on. Renders real
 * Liquid Glass on iOS 26+, a system-material blur below that (and on
 * Android), and a solid panel when Reduce Transparency is on.
 *
 * Deliberately never animates its own opacity -- iOS drops the glass effect
 * the moment an ancestor's opacity is anything but 1.
 */
export function Glass({ children, style, variant = "regular", interactive = false, tintColor, radius = Theme.radius.lg }: GlassProps) {
  const solid = useReduceTransparency();
  const shape = { borderRadius: radius, borderCurve: radius >= 100 ? undefined : ("continuous" as const) };

  if (solid) {
    return <View style={[shape, { backgroundColor: Theme.glassOpaque, borderWidth: StyleSheet.hairlineWidth, borderColor: Theme.glassRim }, style]}>{children}</View>;
  }

  if (hasLiquidGlass) {
    return (
      <GlassView glassEffectStyle={variant} isInteractive={interactive} tintColor={tintColor} colorScheme="dark" style={[shape, style]}>
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      tint={variant === "clear" ? "systemUltraThinMaterialDark" : "systemThinMaterialDark"}
      intensity={variant === "clear" ? 45 : 70}
      style={[shape, { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: Theme.glassRim, backgroundColor: tintColor ?? Theme.glassFill }, style]}
    >
      {children}
    </BlurView>
  );
}

export interface IconProps {
  /** SF Symbol used on iOS. */
  sf: SFSymbol;
  /** Ionicons glyph used on Android/web, where SF Symbols don't exist. */
  ion: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: ColorValue;
  weight?: "regular" | "medium" | "semibold" | "bold";
}

export function Icon({ sf, ion, size = 20, color = Theme.text, weight = "semibold" }: IconProps) {
  return (
    <SymbolView
      name={sf}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
      fallback={<Ionicons name={ion} size={size} color={color} />}
    />
  );
}

export interface GlassButtonProps extends IconProps {
  onPress: () => void;
  /** Diameter of the circular button. */
  diameter?: number;
  variant?: GlassStyle;
  tintColor?: ColorValue;
  haptic?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** Circular glass icon button -- the iOS 26 "back", "info", "search" chrome. */
export function GlassButton({ onPress, diameter = 44, variant = "regular", tintColor, haptic = true, accessibilityLabel, style, disabled, ...icon }: GlassButtonProps) {
  return (
    <Pressable
      onPress={() => {
        if (haptic && process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [{ opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed && !hasLiquidGlass ? 0.94 : 1 }] }, style]}
    >
      <Glass interactive variant={variant} tintColor={tintColor} radius={diameter / 2} style={{ width: diameter, height: diameter, alignItems: "center", justifyContent: "center" }}>
        <Icon {...icon} size={icon.size ?? Math.round(diameter * 0.42)} />
      </Glass>
    </Pressable>
  );
}

export interface GlassPillButtonProps {
  label: string;
  onPress: () => void;
  icon?: Pick<IconProps, "sf" | "ion">;
  /** Filled = the primary action (solid light fill, dark text). */
  prominent?: boolean;
  style?: StyleProp<ViewStyle>;
  height?: number;
}

/** Capsule button. `prominent` is the white "Play" button; the default is a
 * glass capsule with light text (secondary actions). */
export function GlassPillButton({ label, onPress, icon, prominent = false, style, height = 46 }: GlassPillButtonProps) {
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height, paddingHorizontal: 20 }}>
      {icon ? <Icon {...icon} size={15} color={prominent ? "#141018" : Theme.text} weight="bold" /> : null}
      <Text style={{ fontSize: 15, fontWeight: "700", color: prominent ? "#141018" : Theme.text }}>{label}</Text>
    </View>
  );

  return (
    <Pressable
      onPress={() => {
        if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}
    >
      {prominent ? (
        <View style={{ borderRadius: Theme.radius.pill, backgroundColor: Theme.text }}>{content}</View>
      ) : (
        <Glass interactive radius={Theme.radius.pill}>
          {content}
        </Glass>
      )}
    </Pressable>
  );
}
