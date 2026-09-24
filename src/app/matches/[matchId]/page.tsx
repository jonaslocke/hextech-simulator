import { OnlineMatchGameLoader } from "@/features/online-matchmaking";

export default async function OnlineMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return (
    <>
      <div
        className="flex justify-center py-4 font-mono font-semibold text-[9px] truncate uppercase tracking-wide"
        style={{
          backgroundColor: "var(--riftbound-keyword-background)",
          color: "var(--riftbound-keyword-foreground)",
          
        }}
      >
        Assault 3
      </div>

      <OnlineMatchGameLoader matchId={(await params).matchId} />
    </>
  );
}
