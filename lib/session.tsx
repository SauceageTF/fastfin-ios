import { deleteItem, getItem, getKeychainFailure, setItem } from "./storage";
import Constants from "expo-constants";
import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { Platform } from "react-native";

function randomId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export interface SessionInfo {
  serverUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
}

interface SessionContextValue {
  session: SessionInfo | null;
  isRestoring: boolean;
  errorMessage: string | null;
  /** Non-null when credentials had to be kept outside the Keychain. */
  storageWarning: string | null;
  signIn: (serverUrl: string, username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const KEYS = { serverUrl: "serverUrl", accessToken: "accessToken", userId: "userId", deviceId: "deviceId" };

let inMemoryDeviceId: string | null = null;

/** Stable per-install id Jellyfin uses to tell sessions apart. If storage is
 * completely unavailable we still hand back a per-launch id rather than
 * failing sign-in over it. */
async function getDeviceId(): Promise<string> {
  try {
    const existing = await getItem(KEYS.deviceId);
    if (existing) return existing;
    const generated = randomId();
    await setItem(KEYS.deviceId, generated);
    return generated;
  } catch {
    inMemoryDeviceId ??= randomId();
    return inMemoryDeviceId;
  }
}

function authHeader(deviceId: string, accessToken?: string): string {
  const fields: Record<string, string> = {
    DeviceId: deviceId,
    Device: Platform.OS === "ios" ? "iPhone" : "Android",
    Client: "FastFin",
    Version: Constants.expoConfig?.version ?? "1.0.0",
  };
  if (accessToken) fields.Token = accessToken;
  return `MediaBrowser ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(", ")}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [serverUrl, accessToken, userId] = await Promise.all([getItem(KEYS.serverUrl), getItem(KEYS.accessToken), getItem(KEYS.userId)]);
        if (serverUrl && accessToken && userId) {
          const deviceId = await getDeviceId();
          setSession({ serverUrl, accessToken, userId, deviceId });
        }
      } catch (error) {
        // Storage is unreadable: land on the login screen instead of crashing.
        console.warn("[FastFin] Couldn't restore the saved session:", error);
      } finally {
        setStorageWarning(getKeychainFailure());
        setIsRestoring(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (rawServerUrl: string, username: string, password: string) => {
    setErrorMessage(null);
    let serverUrl = rawServerUrl.trim();
    if (!serverUrl) {
      setErrorMessage("Enter your server address.");
      return;
    }
    if (!serverUrl.includes("://")) serverUrl = `https://${serverUrl}`;
    serverUrl = serverUrl.replace(/\/+$/, "");

    const deviceId = await getDeviceId();

    let accessToken: string | undefined;
    let userId: string | undefined;
    try {
      const response = await fetch(`${serverUrl}/Users/AuthenticateByName`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader(deviceId),
        },
        body: JSON.stringify({ Username: username, Pw: password }),
      });
      if (!response.ok) {
        setErrorMessage(`Sign in failed (${response.status}). Check your server address and credentials.`);
        return;
      }
      const data = await response.json();
      accessToken = data.AccessToken;
      userId = data.User?.Id;
    } catch (error) {
      setErrorMessage(`Couldn't reach that server: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!accessToken || !userId) {
      setErrorMessage("Sign in didn't return a session.");
      return;
    }

    // The server said yes; from here on nothing local is allowed to block
    // sign-in. A storage failure just means the next launch asks again.
    try {
      await Promise.all([setItem(KEYS.serverUrl, serverUrl), setItem(KEYS.accessToken, accessToken), setItem(KEYS.userId, userId)]);
    } catch (error) {
      console.warn("[FastFin] Signed in, but couldn't save the session:", error);
    }
    setStorageWarning(getKeychainFailure());
    setSession({ serverUrl, accessToken, userId, deviceId });
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all([deleteItem(KEYS.serverUrl), deleteItem(KEYS.accessToken), deleteItem(KEYS.userId)]).catch(() => {});
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, isRestoring, errorMessage, storageWarning, signIn, signOut }),
    [session, isRestoring, errorMessage, storageWarning, signIn, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}

export function authHeaderFor(session: SessionInfo): string {
  return authHeader(session.deviceId, session.accessToken);
}
