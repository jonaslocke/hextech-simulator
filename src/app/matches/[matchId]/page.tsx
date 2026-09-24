import { OnlineMatchGameLoader } from "@/features/online-matchmaking";

export default async function OnlineMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return <OnlineMatchGameLoader matchId={(await params).matchId} />;
}
