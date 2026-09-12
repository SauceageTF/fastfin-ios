import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Which chrome the player draws over the video. `glass` is FastFin's own
 * Liquid Glass HUD (default). `native` is the system AVPlayerViewController
 * UI (iOS) / ExoPlayer UI (Android) for people who prefer it. Note that
 * Picture in Picture only works in a real build of the app -- Expo Go on
 * iOS 26 refuses it for either mode. */
export type PlayerControls = "native" | "glass";

interface Settings {
  playerControls: PlayerControls;
}

const DEFAULTS: Settings = {
  playerControls: "glass",
};

const STORAGE_KEY = "fastfin.settings";

let current: Settings = { ...DEFAULTS };
let loaded = false;
const listeners = new Set<() => void>();

const loading = AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (raw) current = { ...DEFAULTS, ...JSON.parse(raw) };
  })
  .catch(() => {})
  .finally(() => {
    loaded = true;
    listeners.forEach((l) => l());
  });

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => {});
}

/** Subscribes a component to the settings; `isReady` is false until the
 * persisted values have been read so screens don't flash the defaults. */
export function useSettings(): Settings & { isReady: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    if (!loaded) loading.then(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { ...current, isReady: loaded };
}
