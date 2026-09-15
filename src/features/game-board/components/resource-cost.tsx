import { DomainIcon, EnergyResource, formatDomain } from "@/features/card-presentation";

export function ResourceCost({ energy, powerCosts }: { energy: number; powerCosts: Array<{ amount: number; domains: string[] }> }) {
  return <span className="inline-flex flex-wrap items-center gap-1">
    <EnergyResource compact value={energy} />
    {powerCosts.filter((cost) => cost.amount > 0).map((cost, index) => <span className="inline-flex items-center gap-1" key={index}>
      {cost.amount} {cost.domains.length > 0 ? cost.domains.map((domain, domainIndex) => <span key={domain} className="inline-flex items-center gap-0.5">
        {domainIndex > 0 && "/"}<DomainIcon domain={domain} />
        <span className="sr-only">{formatDomain(domain)}</span>
      </span>) : <DomainIcon domain="rainbow" />}
    </span>)}
  </span>;
}
