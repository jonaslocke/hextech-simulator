import type { OnlinePlayerCredentials } from "./types";

const ONLINE_SESSION_ID_KEY = "online-matchmaking:session-id";
const ONLINE_PLAYER_NAME_KEY = "online-matchmaking:player-name";

export function getOnlineSessionId(): string {
  const current = window.sessionStorage.getItem(ONLINE_SESSION_ID_KEY);
  if (current) return current;

  const created = createSessionId();
  window.sessionStorage.setItem(ONLINE_SESSION_ID_KEY, created);
  return created;
}

export function saveOnlinePlayerCredentials(
  credentials: OnlinePlayerCredentials,
): void {
  window.sessionStorage.setItem(
    credentialsKey(credentials.matchId),
    JSON.stringify(credentials),
  );
}

export function loadOnlinePlayerCredentials(
  matchId: string,
): OnlinePlayerCredentials | null {
  const serialized = window.sessionStorage.getItem(credentialsKey(matchId));
  if (!serialized) return null;

  try {
    return JSON.parse(serialized) as OnlinePlayerCredentials;
  } catch {
    return null;
  }
}

function credentialsKey(matchId: string): string {
  return `online-matchmaking:match:${matchId}`;
}

function createSessionId(): string {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof window.crypto?.getRandomValues === "function") {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function loadOnlinePlayerName(): string {
  return window.localStorage.getItem(ONLINE_PLAYER_NAME_KEY) ?? "";
}

export function saveOnlinePlayerName(name: string): void {
  window.localStorage.setItem(ONLINE_PLAYER_NAME_KEY, name);
}

export function normalizeOnlinePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 32);
}
