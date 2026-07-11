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
    return <MatchStatus message="Restoring match..." />;
  }

  if (!credentials || credentials.matchId !== matchId) {
    return (
      <MatchStatus
        message="This browser does not have a player seat for this match."
        showReturnLink
      />
    );
  }

  return <MatchSimulator onlineMatch={credentials} />;
}

function MatchStatus({
  message,
  showReturnLink = false,
}: {
  message: string;
  showReturnLink?: boolean;
}) {
  return (
    <main className="place-items-center grid bg-slate-950 p-6 min-h-screen text-slate-100 tabletop-background">
      <section
        aria-live="polite"
        className="bg-slate-900 p-6 border border-white/10 rounded-xl text-center"
        role="status"
      >
        <p className="font-medium text-sm">{message}</p>
        {showReturnLink && (
          <Link className="inline-block mt-4 text-cyan-300" href="/">
            Return to online matchmaking
          </Link>
        )}
      </section>
    </main>
  );
}
