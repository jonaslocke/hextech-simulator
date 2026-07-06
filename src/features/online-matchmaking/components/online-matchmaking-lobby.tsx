"use client";

import { Button } from "@/shared/components/button";
import { Copy, Link2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { DeckId } from "@/shared/game";
import { loadOnlineDeckOptions } from "../api";
import {
  getOnlineSessionId,
  saveOnlinePlayerCredentials,
} from "../session";
import type {
  DeckOption,
  OnlinePlayerCredentials,
  OnlineRoomView,
} from "../types";

type LobbyMode = "choose" | "create" | "join";

export function OnlineMatchmakingLobby() {
  const socketRef = useRef<Socket | null>(null);
  const [mode, setMode] = useState<LobbyMode>("choose");
  const [deckOptions, setDeckOptions] = useState<DeckOption[]>([]);
  const [deckId, setDeckId] = useState<DeckId | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<OnlineRoomView | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  function handleRoomAccepted(nextRoom: OnlineRoomView) {
    setRoom(nextRoom);
    setBusy(false);
    setError(null);
  }

  function submitRoom() {
    if (!deckId || !socketRef.current?.connected) {
      setError("Select a deck and wait for the realtime connection.");
      return;
    }

    setBusy(true);
    setError(null);
    const identity = { deckId, onlineSessionId: getOnlineSessionId() };
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
    setRoom(null);
    setMode("choose");
  }

  async function copyRoomCode(code: string) {
    try {
      await copyText(code);
      setError(null);
    } catch {
      setError("Unable to copy the room code. Select and copy it manually.");
    }
  }

  if (room) {
    const waiting = !room.seats.player2.connected;
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
          className="flex justify-between items-center bg-slate-950 mt-6 px-4 py-3 border border-cyan-300/30 rounded-lg w-full"
          onClick={() => void copyRoomCode(room.code)}
          type="button"
        >
          <span className="font-mono font-bold text-cyan-100 text-2xl tracking-[0.25em]">
            {room.code}
          </span>
          <Copy aria-hidden className="size-4 text-cyan-300" />
        </button>
        <div className="gap-3 grid mt-5">
          <SeatRow
            deckId={room.seats.player1.deckId}
            label="Player 1"
            ready
          />
          <SeatRow
            deckId={room.seats.player2.deckId}
            label="Player 2"
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
            <span className="text-slate-300">Your deck</span>
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
          {mode === "join" && (
            <label className="gap-2 grid mt-4 text-sm">
              <span className="text-slate-300">Room code</span>
              <input
                autoComplete="off"
                className="bg-slate-950 px-3 py-2 border border-white/10 rounded font-mono uppercase tracking-[0.15em]"
                maxLength={12}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
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
                !deckId ||
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
      <Link className="block mt-5 text-slate-400 hover:text-slate-200 text-sm" href="/">
        Use local simulator instead
      </Link>
    </LobbyShell>
  );
}

function LobbyShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="place-items-center grid bg-slate-950 p-6 min-h-screen text-slate-100 tabletop-background">
      <section className="bg-slate-900 shadow-2xl p-6 border border-cyan-300/20 rounded-xl w-full max-w-xl">
        {children}
      </section>
    </main>
  );
}

function SeatRow({
  deckId,
  label,
  ready,
}: {
  deckId?: DeckId;
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex justify-between bg-white/5 px-3 py-2 border border-white/10 rounded text-sm">
      <span>{label}</span>
      <span className={ready ? "text-emerald-300" : "text-slate-500"}>
        {ready ? deckId : "Waiting"}
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
