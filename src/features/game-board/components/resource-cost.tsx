import { DomainIcon, EnergyResource } from "@/features/card-presentation";

export function ResourceCost({ energy, powerCosts }: { energy: number; powerCosts: Array<{ amount: number; domains: string[] }> }) {
  return <span className="inline-flex flex-wrap items-center gap-1">
    <EnergyResource compact value={energy} />
    {powerCosts.filter((cost) => cost.amount > 0).flatMap((cost, costIndex) =>
      Array.from({ length: cost.amount }, (_, powerIndex) => (
        <span className="inline-flex items-center gap-0.5" key={`${costIndex}-${powerIndex}`}>
          {cost.domains.length > 0 ? cost.domains.map((domain, domainIndex) => (
            <span key={domain} className="inline-flex items-center gap-0.5">
              {domainIndex > 0 && "/"}<DomainIcon domain={domain} />
            </span>
          )) : <DomainIcon domain="rainbow" />}
        </span>
      )),
    )}
  </span>;
}
