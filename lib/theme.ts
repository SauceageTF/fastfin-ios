/** Ported from the desktop app's app.css tokens, extended with the surfaces
 * and radii the Liquid Glass redesign leans on. Dark-first: the app pins
 * `userInterfaceStyle: "dark"` so glass always sits on a dark ground. */
export const Theme = {
  background: "#0a0a0e",
  backgroundElevated: "#18181c",
  backgroundHover: "#232327",
  text: "#f2f1f6",
  textSecondary: "#c9c7d1",
  textDim: "#a9a7b5",
  danger: "#ff5c5c",
  border: "#2c2c30",

  /** Hairline rim drawn on glass surfaces when real Liquid Glass isn't
   * available -- approximates the specular edge iOS 26 renders itself. */
  glassRim: "rgba(255,255,255,0.14)",
  glassFill: "rgba(255,255,255,0.08)",
  glassFillStrong: "rgba(255,255,255,0.16)",
  /** Solid fallback for Reduce Transparency. */
  glassOpaque: "rgba(28,28,34,0.96)",

  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
    pill: 999,
  },
} as const;

export type ThemeColorName = "white" | "teal" | "ember";

export const THEME_COLORS: Record<ThemeColorName, { accent: string; accentHover: string; label: string }> = {
  white: { accent: "#f2f1f6", accentHover: "#d8d7db", label: "Frost" },
  teal: { accent: "#2dd4c8", accentHover: "#55e0d6", label: "Teal" },
  ember: { accent: "#ff5a1f", accentHover: "#ff7a3d", label: "Ember" },
};

/** Accent the redesign uses everywhere until the theme picker is wired to
 * persisted state. Kept as a single export so that is a one-line change. */
export const Accent = THEME_COLORS.ember;
