"use client";

import { MatchSimulator } from "@/features/match-simulator";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadOnlinePlayerCredentials } from "../session";
import type { OnlinePlayerCredentials } from "../types";

export function OnlineMatchGameLoader({ matchId }: { matchId: string }) {
  const [credentials, setCredentials] =
    useState<OnlinePlayerCredentials | null | undefined>(undefined);

  useEffect(() => {
    setCredentials(loadOnlinePlayerCredentials(matchId));
  }, [matchId]);

  if (credentials === undefined) {
    return <MatchStatus message="Loading match..." />;
  }

  if (!credentials || credentials.matchId !== matchId) {
    return (
      <MatchStatus message="This browser does not have a player seat for this match." />
    );
  }

  return <MatchSimulator onlineMatch={credentials} />;
}

function MatchStatus({ message }: { message: string }) {
  return (
    <main className="place-items-center grid bg-slate-950 p-6 min-h-screen text-slate-100 tabletop-background">
      <section className="bg-slate-900 p-6 border border-white/10 rounded-xl text-center">
        <p>{message}</p>
        <Link className="inline-block mt-4 text-cyan-300" href="/">
          Return to online matchmaking
        </Link>
      </section>
    </main>
  );
}
