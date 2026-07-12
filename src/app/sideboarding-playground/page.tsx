import { SideboardingPlayground } from "@/features/sideboarding/components/sideboarding-playground";
import { createSideboardingPlaygroundFixture } from "@/features/sideboarding/playground-fixture";

export default async function SideboardingPlaygroundPage() {
  const { projection, session } = await createSideboardingPlaygroundFixture();

  return <SideboardingPlayground projection={projection} session={session} />;
}
