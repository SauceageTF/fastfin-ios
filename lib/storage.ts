import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Credential storage: the iOS Keychain (expo-secure-store) first, plain app
 * storage second. The Keychain can reject for reasons entirely outside the
 * app (a missing entitlement in the host binary, a locked device, an OS bug)
 * and we'd rather sign the user in with a visible warning than block them
 * behind a native error nobody can act on.
 */

let keychainFailure: string | null = null;

/** Human-readable reason the Keychain is being bypassed, or null when it's
 * working. Shown in Settings so a broken Keychain isn't silent. */
export function getKeychainFailure(): string | null {
  return keychainFailure;
}

function noteKeychainFailure(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  // Expo wraps native errors as "Calling the 'x' function has failed (at
  // Promise.swift:NN) → Caused by: <the useful part>". Keep the useful part.
  const causedBy = raw.split("Caused by:").pop()?.trim() ?? raw;
  const cleaned = causedBy.replace(/\s*\(at [^)]*\)\s*$/, "").trim();
  if (keychainFailure !== cleaned) {
    keychainFailure = cleaned;
    console.warn(`[FastFin] Keychain unavailable, falling back to app storage: ${cleaned}`);
  }
}

export async function getItem(key: string): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value !== null) return value;
  } catch (error) {
    noteKeychainFailure(error);
  }
  return AsyncStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
    // Keychain worked: make sure no stale plaintext copy lingers.
    await AsyncStorage.removeItem(key).catch(() => {});
    return;
  } catch (error) {
    noteKeychainFailure(error);
  }
  await AsyncStorage.setItem(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    noteKeychainFailure(error);
  }
  await AsyncStorage.removeItem(key).catch(() => {});
}
