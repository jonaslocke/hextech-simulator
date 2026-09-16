import { SideboardingPlayground } from "@/features/sideboarding/components/sideboarding-playground";
import { createSideboardingPlaygroundFixture } from "@/features/sideboarding/playground-fixture";

export default async function SideboardingPlaygroundPage() {
  const { projection, session, deckNamesByRegisteredId } = await createSideboardingPlaygroundFixture();

  return <SideboardingPlayground projection={projection} session={session} deckNamesByRegisteredId={deckNamesByRegisteredId} />;
}
