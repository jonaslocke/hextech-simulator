"use client";

//TODO refactor this to use shadcn

import { Button } from "@/shared/components/button";
import { Input } from "@/shared/components/input";
import { Check, Copy, Link2, Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type { DeckId } from "@/shared/game";
import { loadOnlineDeckOptions } from "../api";
import {
  getOnlineSessionId,
  loadOnlinePlayerName,
  normalizeOnlinePlayerName,
  saveOnlinePlayerName,
  saveOnlinePlayerCredentials,
} from "../session";
import type {
  DeckOption,
  OnlinePlayerCredentials,
  OnlineRoomView,
} from "../types";

type LobbyMode = "choose" | "create" | "join";
type DeckInputMode = "catalog" | "temporary";

export function OnlineMatchmakingLobby() {
  const socketRef = useRef<Socket | null>(null);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [mode, setMode] = useState<LobbyMode>("choose");
  const [deckOptions, setDeckOptions] = useState<DeckOption[]>([]);
  const [deckId, setDeckId] = useState<DeckId | null>(null);
  const [deckInputMode, setDeckInputMode] = useState<DeckInputMode>("catalog");
  const [temporaryDeckText, setTemporaryDeckText] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<OnlineRoomView | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedRoomCode, setCopiedRoomCode] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");

  useEffect(() => {
    setPlayerName(loadOnlinePlayerName());
    void loadOnlineDeckOptions()
      .then((options) => {
        setDeckOptions(options);
        setDeckId(options[0]?.id ?? null);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load available decks.",
        );
      });

    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => {
      setConnected(false);
      setBusy(false);
      setCopiedRoomCode(null);
      setError("Connection lost. Return to the lobby and try again.");
    });

    socket.on("server:room:created", handleRoomAccepted);
    socket.on("server:room:joined", handleRoomAccepted);

    socket.on("server:room:stateChanged", (nextRoom: OnlineRoomView) => {
      setRoom(nextRoom);
      setBusy(false);
    });

    socket.on("server:room:closed", () => {
      setRoom(null);
      setBusy(false);
      setMode("choose");
      setCopiedRoomCode(null);
      setError("The room was closed.");
    });

    socket.on(
      "server:player:disconnected",
      ({ room: nextRoom }: { room: OnlineRoomView }) => {
        setRoom(nextRoom);
        setError(
          nextRoom.status === "closed"
            ? "The room owner disconnected."
            : "The other player disconnected.",
        );
      },
    );

    socket.on(
      "server:room:error",
      (roomError: { code: string; message: string }) => {
        setBusy(false);
        setError(roomError.message);
      },
    );

    socket.on(
      "server:room:gameCreated",
      (credentials: OnlinePlayerCredentials) => {
        saveOnlinePlayerCredentials(credentials);
        window.location.assign(`/matches/${credentials.matchId}`);
      },
    );

    return () => {
      clearCopyFeedbackTimeout();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  function clearCopyFeedbackTimeout() {
    if (copyFeedbackTimeoutRef.current) {
      clearTimeout(copyFeedbackTimeoutRef.current);
      copyFeedbackTimeoutRef.current = null;
    }
  }

  function handleRoomAccepted(nextRoom: OnlineRoomView) {
    setRoom(nextRoom);
    setBusy(false);
    setError(null);
    setCopiedRoomCode(null);
  }

  function submitRoom() {
    if (!socketRef.current?.connected) {
      setError("Wait for the realtime connection.");
      return;
    }
    if (deckInputMode === "catalog" && !deckId) {
      setError("Select a deck.");
      return;
    }
    if (deckInputMode === "temporary" && !temporaryDeckText.trim()) {
      setError("Paste a temporary deck list or choose a deck file.");
      return;
    }

    const displayName = normalizeOnlinePlayerName(playerName);

    if (!displayName) {
      setError("Enter your player name.");
      return;
    }

    setBusy(true);
    setError(null);
    setCopiedRoomCode(null);

    saveOnlinePlayerName(displayName);

    const identity = {
      deck:
        deckInputMode === "temporary"
          ? { kind: "temporary" as const, sourceText: temporaryDeckText }
          : { kind: "catalog" as const, deckId: deckId! },
      displayName,
      onlineSessionId: getOnlineSessionId(),
    };

    if (mode === "create") {
      socketRef.current.emit("client:room:create", identity);
    } else {
      socketRef.current.emit("client:room:join", {
        ...identity,
        code: roomCode,
      });
    }
  }

  function leaveRoom() {
    if (room && socketRef.current) {
      socketRef.current.emit("client:room:leave", {
        code: room.code,
        onlineSessionId: getOnlineSessionId(),
      });
    }

    clearCopyFeedbackTimeout();
    setCopiedRoomCode(null);
    setRoom(null);
    setMode("choose");
  }

  async function copyRoomCode(code: string) {
    try {
      await copyText(code);

      clearCopyFeedbackTimeout();
      setCopiedRoomCode(code);
      setError(null);

      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopiedRoomCode(null);
        copyFeedbackTimeoutRef.current = null;
      }, 1800);
    } catch {
      clearCopyFeedbackTimeout();
      setCopiedRoomCode(null);
      setError("Unable to copy the room code. Select and copy it manually.");
    }
  }

  function updatePlayerName(value: string) {
    setPlayerName(value);
    saveOnlinePlayerName(value);
  }

  if (room) {
    const waiting = !room.seats.player2.connected;
    const isRoomCodeCopied = copiedRoomCode === room.code;

    return (
      <LobbyShell>
        <div className="text-center">
          <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.2em]">
            Online room
          </p>
          <h1 className="mt-2 font-semibold text-2xl">
            {waiting ? "Waiting for opponent" : "Creating match"}
          </h1>
          <p className="mt-2 text-slate-400 text-sm">
            {waiting
              ? "Share this room code with the other player."
              : "Both players are connected. The game is being persisted."}
          </p>
        </div>

        <button
          aria-label={
            isRoomCodeCopied
              ? `Room code ${room.code} copied`
              : `Copy room code ${room.code}`
          }
          className={[
            "flex justify-between items-center mt-6 px-4 py-3 border rounded-lg w-full transition",
            "bg-slate-950 hover:bg-slate-900 focus-visible:outline focus-visible:outline-offset-2",
            isRoomCodeCopied
              ? "border-emerald-300/60 shadow-[0_0_24px_rgba(110,231,183,0.12)] focus-visible:outline-emerald-300"
              : "border-cyan-300/30 hover:border-cyan-300/55 focus-visible:outline-cyan-300",
          ].join(" ")}
          onClick={() => void copyRoomCode(room.code)}
          type="button"
        >
          <span className="gap-1 grid text-left">
            <span className="font-mono font-bold text-cyan-100 text-2xl tracking-[0.25em]">
              {room.code}
            </span>
            <span
              aria-live="polite"
              className={
                isRoomCodeCopied
                  ? "font-medium text-emerald-300 text-xs"
                  : "text-slate-500 text-xs"
              }
            >
              {isRoomCodeCopied
                ? "Copied to clipboard"
                : "Click to copy room code"}
            </span>
          </span>

          <span
            className={[
              "grid place-items-center border rounded-full size-8 transition",
              isRoomCodeCopied
                ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-300"
                : "border-cyan-300/20 bg-cyan-300/5 text-cyan-300",
            ].join(" ")}
          >
            {isRoomCodeCopied ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
          </span>
        </button>

        <div className="gap-3 grid mt-5">
          <SeatRow
            deckLabel={room.seats.player1.deckLabel}
            label={room.seats.player1.displayName || "Player 1"}
            ready
          />

          <SeatRow
            deckLabel={room.seats.player2.deckLabel}
            label={room.seats.player2.displayName || "Player 2"}
            ready={room.seats.player2.connected}
          />
        </div>

        {error && <ErrorMessage message={error} />}

        <Button
          className="mt-5 w-full"
          onClick={leaveRoom}
          type="button"
          variant="secondary"
        >
          Leave room
        </Button>
      </LobbyShell>
    );
  }

  return (
    <LobbyShell>
      <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.2em]">
        Riftbound Simulator
      </p>
      <h1 className="mt-2 font-semibold text-2xl">Play online</h1>
      <p className="mt-2 text-slate-400 text-sm">
        Choose your own deck, then create a room or join with a code.
      </p>

      {mode === "choose" ? (
        <div className="gap-3 grid sm:grid-cols-2 mt-6">
          <Button onClick={() => setMode("create")} type="button">
            <Users aria-hidden className="size-4" />
            Create room
          </Button>
          <Button
            onClick={() => setMode("join")}
            type="button"
            variant="secondary"
          >
            <Link2 aria-hidden className="size-4" />
            Join room
          </Button>
        </div>
      ) : (
        <>
          <label className="gap-2 grid mt-6 text-sm">
            <span className="text-slate-300">Your name</span>
            <Input
              autoComplete="name"
              disabled={busy}
              maxLength={32}
              onChange={(event) => updatePlayerName(event.currentTarget.value)}
              placeholder="Enter your name"
              value={playerName}
            />
          </label>

          <label className="gap-2 grid mt-4 text-sm">
            <span className="text-slate-300">Your deck</span>
            <select
              className="bg-slate-950 px-3 py-2 border border-white/10 rounded"
              disabled={busy}
              onChange={(event) =>
                setDeckInputMode(event.target.value as DeckInputMode)
              }
              value={deckInputMode}
            >
              <option value="catalog">Saved deck</option>
              <option value="temporary">Temporary test deck</option>
            </select>
          </label>

          {deckInputMode === "catalog" ? (
            <label className="gap-2 grid mt-4 text-sm">
              <span className="text-slate-300">Saved deck</span>
            <select
              className="bg-slate-950 px-3 py-2 border border-white/10 rounded"
              disabled={busy || deckOptions.length === 0}
              onChange={(event) => setDeckId(event.target.value as DeckId)}
              value={deckId ?? ""}
            >
              {deckOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            </label>
          ) : (
            <div className="gap-2 grid mt-4 text-sm">
              <span className="text-slate-300">Temporary deck list</span>
              <textarea
                className="bg-slate-950 px-3 py-2 border border-white/10 rounded min-h-48 font-mono text-xs"
                disabled={busy}
                onChange={(event) => setTemporaryDeckText(event.currentTarget.value)}
                placeholder="Paste a .dec.txt deck list"
                value={temporaryDeckText}
              />
              <input
                accept=".txt,.dec"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  void file.text().then(setTemporaryDeckText);
                }}
                type="file"
              />
              <span className="text-slate-500 text-xs">
                Validated for this room only; it is not added to the saved deck list.
              </span>
            </div>
          )}

          {mode === "join" && (
            <label className="gap-2 grid mt-4 text-sm">
              <span className="text-slate-300">Room code</span>
              <input
                autoComplete="off"
                className="bg-slate-950 px-3 py-2 border border-white/10 rounded font-mono uppercase tracking-[0.15em]"
                maxLength={12}
                onChange={(event) =>
                  setRoomCode(event.target.value.toUpperCase())
                }
                placeholder="ABC123"
                value={roomCode}
              />
            </label>
          )}

          <div className="gap-3 grid sm:grid-cols-2 mt-5">
            <Button
              disabled={
                busy ||
                !connected ||
                (deckInputMode === "catalog" && !deckId) ||
                (deckInputMode === "temporary" && !temporaryDeckText.trim()) ||
                !normalizeOnlinePlayerName(playerName) ||
                (mode === "join" && !roomCode.trim())
              }
              onClick={submitRoom}
              type="button"
            >
              {busy
                ? "Connecting..."
                : mode === "create"
                  ? "Create room"
                  : "Join room"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => setMode("choose")}
              type="button"
              variant="secondary"
            >
              Back
            </Button>
          </div>
        </>
      )}

      {error && <ErrorMessage message={error} />}
    </LobbyShell>
  );
}

function LobbyShell({ children }: { children: ReactNode }) {
  return (
    <main className="place-items-center grid bg-slate-950 p-6 min-h-screen text-slate-100 tabletop-background">
      <section className="bg-slate-900 shadow-2xl p-6 border border-cyan-300/20 rounded-xl w-full max-w-xl">
        {children}
      </section>
    </main>
  );
}

function SeatRow({
  deckLabel,
  label,
  ready,
}: {
  deckLabel?: string;
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex justify-between bg-white/5 px-3 py-2 border border-white/10 rounded text-sm">
      <span>{label}</span>
      <span className={ready ? "text-emerald-300" : "text-slate-500"}>
        {ready ? deckLabel : "Waiting"}
      </span>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="bg-red-950/60 mt-4 px-3 py-2 border border-red-400/40 rounded text-red-100 text-sm">
      {message}
    </p>
  );
}

async function copyText(value: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command was rejected.");
    }
  } finally {
    textArea.remove();
  }
}
