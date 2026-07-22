"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ImageOff,
  Layers3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import ognData from "@data/implementation-status/ogn.json";
import ogsData from "@data/implementation-status/ogs.json";
import sfdData from "@data/implementation-status/sfd.json";
import unlData from "@data/implementation-status/unl.json";
import ognCardsData from "@data/sets/ogn.json";
import ogsCardsData from "@data/sets/ogs.json";
import sfdCardsData from "@data/sets/sfd.json";
import unlCardsData from "@data/sets/unl.json";

import {
  updateCardImplementationStatus,
  type CardImplementationStatusUpdateResponse,
} from "../api";
import { Badge } from "@/shared/components/badge";
import { Button } from "@/shared/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/dialog";
import { Input } from "@/shared/components/input";
import { Progress } from "@/shared/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/select";
import { Separator } from "@/shared/components/separator";
import { cn } from "@/shared/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type FamilyStatus = {
  familyId: string;
  status: string;
  updatedAt: string;
  note?: string;
};

type HistoryEntry = {
  at: string;
  event: string;
  status: string;
  familyId?: string;
  note?: string;
};

type CardImplementation = {
  gameplayIdentity: string;
  name: string;
  cleanName: string;
  printingCodes: string[];
  sourceCardIds: string[];
  printings: Array<{ sourceCardId: string; cardCode: string; name: string }>;
  status: string;
  canonicalModel: null | { cardCode: string; approvedAt: string };
  familyStatuses: FamilyStatus[];
  history: HistoryEntry[];
  updatedAt: string;
  imageUrl?: string;
  media?: { image_url?: string; accessibility_text?: string; artist?: string };
};

type CardArtwork = {
  imageUrl: string;
  accessibilityText?: string;
  artist?: string;
  publicCode?: string;
  orientation?: string;
  type?: string | null;
  supertype?: string | null;
  rarity?: string | null;
  domains: string[];
  rulesText?: string;
  tags: string[];
  energy?: number | null;
  might?: number | null;
  power?: number | null;
};

type ImplementationSet = {
  schemaVersion: number;
  setCode: string;
  updatedAt: string;
  cards: CardImplementation[];
};

type SourceCard = {
  id: string;
  name: string;
  public_code?: string;
  attributes?: {
    energy?: number | null;
    might?: number | null;
    power?: number | null;
  };
  classification?: {
    type?: string | null;
    supertype?: string | null;
    rarity?: string | null;
    domain?: string[];
  };
  text?: { plain?: string };
  media?: {
    image_url?: string;
    artist?: string;
    accessibility_text?: string;
  };
  tags?: string[];
  orientation?: string;
  metadata?: {
    clean_name?: string;
    alternate_art?: boolean;
    overnumbered?: boolean;
    signature?: boolean;
  };
};

type CatalogCard = CardImplementation & {
  setCode: string;
  setUpdatedAt: string;
  implemented: boolean;
  primaryCode: string;
  artwork: CardArtwork | null;
};

type SortOption = "code-asc" | "name-asc" | "updated-desc" | "status-desc";
type FamilyDraft = { status: string; note: string };
type SaveFeedback = { kind: "error" | "success"; message: string } | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 40;

const STATUS_ORDER = [
  "accepted",
  "manual_family_passed",
  "ready_for_manual_validation",
  "implemented",
  "unreviewed",
];

const STATUS_META: Record<
  string,
  { label: string; description: string; className: string; dotClassName: string }
> = {
  accepted: {
    label: "Accepted",
    description: "Implementation and validation accepted.",
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
    dotClassName: "bg-emerald-400",
  },
  manual_family_passed: {
    label: "Manual family passed",
    description: "The reusable behavior family passed manual validation.",
    className: "border-cyan-500/25 bg-cyan-500/10 text-cyan-400",
    dotClassName: "bg-cyan-400",
  },
  ready_for_manual_validation: {
    label: "Ready for validation",
    description: "Implemented and waiting for manual validation.",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-400",
    dotClassName: "bg-amber-400",
  },
  implemented: {
    label: "Implemented",
    description: "A canonical behavior model is available.",
    className: "border-blue-500/25 bg-blue-500/10 text-blue-400",
    dotClassName: "bg-blue-400",
  },
  unreviewed: {
    label: "Unreviewed",
    description: "No canonical implementation has been approved yet.",
    className: "border-white/10 bg-white/5 text-muted-foreground",
    dotClassName: "bg-muted-foreground/50",
  },
};

// ─── Demo data (replace with real imports in your project) ─────────────────────

/*
const DEMO_CARDS: CatalogCard[] = [
  { name: "Annie, Fiery", cleanName: "Annie Fiery", primaryCode: "OGS-001/024", setCode: "OGS", status: "implemented", implemented: true },
  { name: "Firestorm", cleanName: "Firestorm", primaryCode: "OGS-002/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Incinerate", cleanName: "Incinerate", primaryCode: "OGS-003/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Master Yi, Meditative", cleanName: "Master Yi", primaryCode: "OGS-004/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Zephyr Sage", cleanName: "Zephyr Sage", primaryCode: "OGS-005/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Lux, Illuminated", cleanName: "Lux", primaryCode: "OGS-006/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Garen, Rugged", cleanName: "Garen", primaryCode: "OGS-007/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Gentleman's Duel", cleanName: "Gentlemans Duel", primaryCode: "OGS-008/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Master Yi, Honored", cleanName: "Master Yi", primaryCode: "OGS-009/024", setCode: "OGS", status: "implemented", implemented: true },
  { name: "Annie, Stubborn", cleanName: "Annie", primaryCode: "OGS-010/024", setCode: "OGS", status: "implemented", implemented: true },
  { name: "Flash", cleanName: "Flash", primaryCode: "OGS-011/024", setCode: "OGS", status: "implemented", implemented: true },
  { name: "Blast of Power", cleanName: "Blast of Power", primaryCode: "OGS-012/024", setCode: "OGS", status: "implemented", implemented: true },
  { name: "Garen, Commander", cleanName: "Garen", primaryCode: "OGS-013/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Lux, Crownguard", cleanName: "Lux", primaryCode: "OGS-014/024", setCode: "OGS", status: "implemented", implemented: true },
  { name: "Recruit the Vanguard", cleanName: "Recruit Vanguard", primaryCode: "OGS-015/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Vanguard Attendant", cleanName: "Vanguard Attendant", primaryCode: "OGS-016/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Dark Child — Starter", cleanName: "Dark Child", primaryCode: "OGS-017/024", setCode: "OGS", status: "implemented", implemented: true },
  { name: "Tibbers", cleanName: "Tibbers", primaryCode: "OGS-018/024", setCode: "OGS", status: "implemented", implemented: true },
  { name: "Wuju Bladesman — Starter", cleanName: "Wuju Bladesman", primaryCode: "OGS-019/024", setCode: "OGS", status: "ready_for_manual_validation", implemented: true },
  { name: "Highlander", cleanName: "Highlander", primaryCode: "OGS-020/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Lady of Luminosity — Star...", cleanName: "Lady Luminosity", primaryCode: "OGS-021/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Final Spark", cleanName: "Final Spark", primaryCode: "OGS-022/024", setCode: "OGS", status: "accepted", implemented: true },
  { name: "Might of Demacia — Star...", cleanName: "Might Demacia", primaryCode: "OGS-023/024", setCode: "OGS", status: "ready_for_manual_validation", implemented: true },
  { name: "Decisive Strike", cleanName: "Decisive Strike", primaryCode: "OGS-024/024", setCode: "OGS", status: "accepted", implemented: true },
].map((c, i) => ({
  ...c,
  gameplayIdentity: `${c.setCode}-${c.cleanName.replace(/\s/g, "-").toLowerCase()}`,
  printingCodes: [c.primaryCode],
  sourceCardIds: [],
  printings: [],
  canonicalModel: c.implemented ? { cardCode: c.primaryCode, approvedAt: "2024-07-22T00:00:00Z" } : null,
  familyStatuses: i % 4 === 0 ? [{ familyId: "basic-attack", status: c.status, updatedAt: "2024-07-22T00:00:00Z" }] : [],
  history: [{ at: "2024-07-22T00:00:00Z", event: "status_updated", status: c.status }],
  updatedAt: "2024-07-22T00:00:00Z",
  setUpdatedAt: "2024-07-22T04:05:00Z",
  artwork: null,
}));
*/

const REAL_SET_FILES = [
  ogsData as ImplementationSet,
  ognData as ImplementationSet,
  sfdData as ImplementationSet,
  unlData as ImplementationSet,
];

const SOURCE_CARDS_BY_SET: Record<string, SourceCard[]> = {
  OGS: ogsCardsData as SourceCard[],
  OGN: ognCardsData as SourceCard[],
  SFD: sfdCardsData as SourceCard[],
  UNL: unlCardsData as SourceCard[],
};

function normalizeCardCode(value?: string) {
  if (!value) return "";

  return value
    .trim()
    .toUpperCase()
    .replace(/\/\d+$/, "")
    .replace(/\*$/, "");
}

function normalizeName(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLocaleLowerCase();
}

function sourceCardScore(sourceCard: SourceCard, implementation: CardImplementation) {
  const sourceIds = new Set([
    ...implementation.sourceCardIds,
    ...implementation.printings.map((printing) => printing.sourceCardId),
  ]);
  const printingCodes = new Set(
    [
      ...implementation.printingCodes,
      ...implementation.printings.map((printing) => printing.cardCode),
    ].map(normalizeCardCode),
  );
  const canonicalCode = normalizeCardCode(implementation.canonicalModel?.cardCode);
  const sourceCode = normalizeCardCode(sourceCard.public_code);
  const sourceName = normalizeName(sourceCard.metadata?.clean_name ?? sourceCard.name);
  const implementationName = normalizeName(implementation.cleanName ?? implementation.name);

  let score = 0;
  if (canonicalCode && sourceCode === canonicalCode) score += 25_000;
  if (sourceCode && printingCodes.has(sourceCode)) score += 20_000;
  if (sourceIds.has(sourceCard.id)) score += 10_000;
  if (sourceName && sourceName === implementationName) score += 1_000;
  if (sourceCard.public_code && /^[A-Z]+-\d+\/\d+$/i.test(sourceCard.public_code.trim())) score += 100;
  if (sourceCard.metadata?.alternate_art === false) score += 40;
  if (sourceCard.metadata?.overnumbered === false) score += 20;
  if (sourceCard.metadata?.signature === false) score += 10;
  if (sourceCard.metadata?.alternate_art) score -= 100;
  if (sourceCard.metadata?.overnumbered) score -= 60;
  if (sourceCard.metadata?.signature) score -= 30;

  return score;
}

function toArtwork(sourceCard: SourceCard): CardArtwork | null {
  const imageUrl = sourceCard.media?.image_url;
  if (!imageUrl) return null;

  return {
    imageUrl,
    accessibilityText: sourceCard.media?.accessibility_text,
    artist: sourceCard.media?.artist,
    publicCode: sourceCard.public_code,
    orientation: sourceCard.orientation,
    type: sourceCard.classification?.type,
    supertype: sourceCard.classification?.supertype,
    rarity: sourceCard.classification?.rarity,
    domains: sourceCard.classification?.domain ?? [],
    rulesText: sourceCard.text?.plain,
    tags: sourceCard.tags ?? [],
    energy: sourceCard.attributes?.energy,
    might: sourceCard.attributes?.might,
    power: sourceCard.attributes?.power,
  };
}

function resolveArtwork(implementation: CardImplementation, setCode: string): CardArtwork | null {
  const implementationImage = implementation.imageUrl ?? implementation.media?.image_url;
  if (implementationImage) {
    return {
      imageUrl: implementationImage,
      accessibilityText: implementation.media?.accessibility_text,
      artist: implementation.media?.artist,
      domains: [],
      tags: [],
    };
  }

  const rankedCandidates = (SOURCE_CARDS_BY_SET[setCode] ?? [])
    .map((sourceCard) => ({ sourceCard, score: sourceCardScore(sourceCard, implementation) }))
    .filter(({ score, sourceCard }) => score > 0 && sourceCard.media?.image_url)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (left.sourceCard.public_code ?? "").localeCompare(
        right.sourceCard.public_code ?? "",
        undefined,
        { numeric: true },
      );
    });

  return rankedCandidates.length ? toArtwork(rankedCandidates[0].sourceCard) : null;
}

const REAL_CATALOG: CatalogCard[] = REAL_SET_FILES.flatMap((set) =>
  set.cards.map((card) => ({
    ...card,
    setCode: set.setCode,
    setUpdatedAt: set.updatedAt,
    implemented: Boolean(card.canonicalModel),
    primaryCode: card.printingCodes[0] ?? card.canonicalModel?.cardCode ?? "—",
    artwork: resolveArtwork(card, set.setCode),
  })),
);

const REAL_SET_SUMMARIES = REAL_SET_FILES.map((set) => ({
  setCode: set.setCode,
  cards: set.cards.length,
  implemented: set.cards.filter((card) => card.canonicalModel).length,
  updatedAt: set.updatedAt,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function getStatusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: humanize(status),
      description: "Custom implementation workflow status.",
      className: "border-violet-500/25 bg-violet-500/10 text-violet-400",
      dotClassName: "bg-violet-400",
    }
  );
}

function shouldWarnBeforeStatusChange(current: string, next: string) {
  if (current === next) return false;
  if (current === "accepted") return true;
  if (current === "manual_family_passed") return next !== "accepted";
  return false;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status);
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", meta.className)}>
      <span className={cn("rounded-full size-1.5 shrink-0", meta.dotClassName)} />
      {meta.label}
    </Badge>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Card className="relative bg-white/[0.04] backdrop-blur-md border-white/[0.06] overflow-hidden">
      <CardContent className="flex justify-between items-start gap-4 p-5">
        <div className="space-y-1 min-w-0">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">{title}</p>
          <p className="font-semibold text-foreground text-2xl tracking-tight">{value}</p>
          <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
        </div>
        <div className="bg-white/[0.06] p-2.5 border border-white/[0.08] rounded-lg text-primary shrink-0">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function CardArtworkImage({
  card,
  className = "",
}: {
  card: CatalogCard;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const imageUrl = card.artwork?.imageUrl;

  if (!imageUrl || failed) {
    return (
      <div
        className={cn(
          "flex flex-col justify-center items-center gap-2 bg-white/[0.03] px-4 w-full h-full text-muted-foreground text-center",
          className,
        )}
      >
        <ImageOff className="opacity-40 size-7" />
        <div>
          <p className="font-medium text-foreground/60 text-xs">No image</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">{card.primaryCode}</p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={card.artwork?.accessibilityText ?? `${card.name} card artwork`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("w-full h-full object-contain", className)}
    />
  );
}

function CatalogCardTile({
  card,
  onSelect,
}: {
  card: CatalogCard;
  onSelect: (card: CatalogCard) => void;
}) {
  const statusMeta = getStatusMeta(card.status);

  return (
    <button
      type="button"
      onClick={() => onSelect(card)}
      aria-label={`View ${card.name} implementation details`}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background min-w-0 text-left"
    >
      <div className="bg-white/[0.03] group-hover:bg-white/[0.06] group-hover:shadow-black/30 group-hover:shadow-lg backdrop-blur-sm border border-white/[0.07] group-hover:border-primary/30 rounded-xl h-full overflow-hidden transition-all group-hover:-translate-y-0.5 duration-200">
        {/* Artwork */}
        <div className="relative bg-black/20 p-1.5 aspect-[744/1039] overflow-hidden">
          <CardArtworkImage
            card={card}
            className="rounded-md group-hover:scale-[1.012] transition-transform duration-300"
          />

          {/* Top badges */}
          <div className="top-2 absolute inset-x-2 flex justify-between items-start gap-2 pointer-events-none">
            <span className="bg-black/60 backdrop-blur-sm px-1.5 py-0.5 border border-white/15 rounded-md font-mono font-medium text-[9px] text-white/80">
              {card.setCode}
            </span>
            <span
              title={statusMeta.label}
              className={cn(
                "shadow-sm border-2 border-background/80 rounded-full size-2.5",
                statusMeta.dotClassName,
              )}
            />
          </div>

          {/* Implemented checkmark */}
          {card.implemented && (
            <div className="right-2 bottom-2 absolute bg-black/70 backdrop-blur-sm p-1 border border-emerald-500/30 rounded-full pointer-events-none">
              <CheckCircle2 className="size-3 text-emerald-400" />
            </div>
          )}
        </div>

        {/* Card info */}
        <div className="space-y-1.5 p-2.5">
          <div className="min-w-0">
            <p className="font-semibold text-[13px] text-foreground/90 truncate leading-tight" title={card.name}>
              {card.name}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70 truncate">
              {card.artwork?.publicCode ?? card.primaryCode}
            </p>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "gap-1 px-1.5 py-0 h-5 font-normal text-[10px] whitespace-nowrap",
              statusMeta.className,
            )}
          >
            <span className={cn("rounded-full size-1.5 shrink-0", statusMeta.dotClassName)} />
            {statusMeta.label}
          </Badge>

          <p className="text-[10px] text-muted-foreground/50 truncate">
            {card.familyStatuses.length
              ? `${card.familyStatuses.length} behavior famil${card.familyStatuses.length === 1 ? "y" : "ies"}`
              : "No behavior family"}
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────────

export default function CardImplementationDashboard() {
  const [catalog, setCatalog] = useState<CatalogCard[]>(REAL_CATALOG);
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [implementationFilter, setImplementationFilter] = useState("all");
  const [imageFilter, setImageFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [sort, setSort] = useState<SortOption>("code-asc");
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [cardStatusDraft, setCardStatusDraft] = useState("");
  const [cardNoteDraft, setCardNoteDraft] = useState("");
  const [familyDrafts, setFamilyDrafts] = useState<Record<string, FamilyDraft>>({});
  const [savingTarget, setSavingTarget] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);
  const [setUpdatedAtByCode, setSetUpdatedAtByCode] = useState<Record<string, string>>(
    () => Object.fromEntries(REAL_SET_SUMMARIES.map((set) => [set.setCode, set.updatedAt])),
  );

  const selectCard = (card: CatalogCard) => {
    setSelectedCard(card);
    setCardStatusDraft(card.status as string);
    setCardNoteDraft("");
    setFamilyDrafts(
      Object.fromEntries(
        card.familyStatuses.map((f) => [f.familyId, { status: f.status, note: f.note ?? "" }]),
      ),
    );
    setSaveFeedback(null);
  };

  const updateCatalogCard = (
    response: Extract<CardImplementationStatusUpdateResponse, { accepted: true }>,
  ) => {
    setCatalog((current) =>
      current.map((card) =>
        card.gameplayIdentity === response.card.gameplayIdentity
          ? {
              ...card,
              status: response.card.status,
              familyStatuses: response.card.familyStatuses,
              history: response.card.history,
              updatedAt: response.card.updatedAt,
              canonicalModel: response.card.canonicalModel,
            }
          : card,
      ),
    );
    setSetUpdatedAtByCode((current) => ({
      ...current,
      [selectedCard?.setCode ?? ""]: response.setUpdatedAt,
    }));
    setSelectedCard((current) =>
      current && current.gameplayIdentity === response.card.gameplayIdentity
        ? {
            ...current,
            status: response.card.status,
            familyStatuses: response.card.familyStatuses,
            history: response.card.history,
            updatedAt: response.card.updatedAt,
            canonicalModel: response.card.canonicalModel,
          }
        : current,
    );
  };

  const readSaveError = (
    response: Extract<CardImplementationStatusUpdateResponse, { accepted: false }>,
  ) => response.error.message;

  const statusCounts = useMemo(
    () =>
      catalog.reduce<Record<string, number>>((acc, card) => {
        acc[card.status] = (acc[card.status] ?? 0) + 1;
        return acc;
      }, {}),
    [catalog],
  );

  const statusOptions = useMemo(() => {
    const statuses = catalog.flatMap((c) => [c.status, ...c.familyStatuses.map((f) => f.status)]);
    return Array.from(new Set([...STATUS_ORDER, ...statuses])).sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a);
      const bi = STATUS_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [catalog]);

  const familyOptions = useMemo(
    () =>
      Array.from(
        new Set(catalog.flatMap((c) => c.familyStatuses.map((f) => f.familyId))),
      ).sort((a, b) => a.localeCompare(b)),
    [catalog],
  );

  const totalImplemented = useMemo(() => catalog.filter((c) => c.implemented).length, [catalog]);
  const implementationPercentage = Math.round((totalImplemented / catalog.length) * 100);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    const result = catalog.filter((card) => {
      const matchesSearch =
        !q ||
        card.name.toLocaleLowerCase().includes(q) ||
        card.cleanName.toLocaleLowerCase().includes(q) ||
        card.gameplayIdentity.toLocaleLowerCase().includes(q) ||
        card.printingCodes.some((code) => code.toLocaleLowerCase().includes(q)) ||
        card.familyStatuses.some((f) => f.familyId.toLocaleLowerCase().includes(q));
      const matchesSet = !setFilter || setFilter === "all" || card.setCode === setFilter;
      const matchesStatus = !statusFilter || statusFilter === "all" || card.status === statusFilter;
      const matchesImpl =
        !implementationFilter ||
        implementationFilter === "all" ||
        (implementationFilter === "implemented" && card.implemented) ||
        (implementationFilter === "not-implemented" && !card.implemented);
      const matchesImage =
        !imageFilter ||
        imageFilter === "all" ||
        (imageFilter === "with-image" && Boolean(card.artwork)) ||
        (imageFilter === "missing-image" && !card.artwork);
      const matchesFamily =
        !familyFilter || familyFilter === "all" || card.familyStatuses.some((f) => f.familyId === familyFilter);
      return matchesSearch && matchesSet && matchesStatus && matchesImpl && matchesImage && matchesFamily;
    });

    const effectiveSort = sort ?? "code-asc";
    result.sort((a, b) => {
      if (effectiveSort === "name-asc") return a.name.localeCompare(b.name);
      if (effectiveSort === "updated-desc") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (effectiveSort === "status-desc") {
        const ai = STATUS_ORDER.indexOf(a.status);
        const bi = STATUS_ORDER.indexOf(b.status);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.primaryCode.localeCompare(b.primaryCode);
      }
      return a.primaryCode.localeCompare(b.primaryCode, undefined, { numeric: true });
    });

    return result;
  }, [catalog, search, setFilter, statusFilter, implementationFilter, imageFilter, familyFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleCards = filteredCards.slice(pageStart, pageStart + PAGE_SIZE);

  const resetPage = () => setPage(1);

  const clearFilters = () => {
    setSearch("");
    setSetFilter("all");
    setStatusFilter("all");
    setImplementationFilter("all");
    setImageFilter("all");
    setFamilyFilter("all");
    setSort("code-asc");
    setPage(1);
  };

  const hasActiveFilters =
    search !== "" ||
    (setFilter !== "all" && setFilter !== null) ||
    (statusFilter !== "all" && statusFilter !== null) ||
    (implementationFilter !== "all" && implementationFilter !== null) ||
    (imageFilter !== "all" && imageFilter !== null) ||
    (familyFilter !== "all" && familyFilter !== null) ||
    (sort !== "code-asc" && sort !== null);

  const exportCsv = () => {
    const esc = (v: string | number | boolean) => `"${String(v).replaceAll('"', '""')}"`;
    const rows = [
      ["Code", "Name", "Set", "Workflow status", "Implemented", "Canonical model", "Updated at"],
      ...filteredCards.map((c) => [
        c.artwork?.publicCode ?? c.primaryCode,
        c.name,
        c.setCode,
        c.status,
        c.implemented,
        c.canonicalModel?.cardCode ?? "",
        c.updatedAt,
      ]),
    ];
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "card-implementation-catalog.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveCardStatus = async () => {
    if (!selectedCard || savingTarget || !cardStatusDraft) return;
    if (
      shouldWarnBeforeStatusChange(selectedCard.status, cardStatusDraft) &&
      !window.confirm(
        `Change from ${getStatusMeta(selectedCard.status).label} to ${getStatusMeta(cardStatusDraft).label}?`,
      )
    ) return;

    setSavingTarget("card");
    setSaveFeedback(null);

    try {
      const response = await updateCardImplementationStatus({
        setCode: selectedCard.setCode,
        gameplayIdentity: selectedCard.gameplayIdentity,
        target: "card",
        status: cardStatusDraft,
        note: cardNoteDraft.trim() || null,
      });

      if (!response.accepted) {
        setSaveFeedback({ kind: "error", message: readSaveError(response) });
        return;
      }

      updateCatalogCard(response);
      setCardNoteDraft("");
      setSaveFeedback({ kind: "success", message: "Card status saved." });
    } catch (caught) {
      setSaveFeedback({
        kind: "error",
        message: caught instanceof Error ? caught.message : "Card status save failed.",
      });
    } finally {
      setSavingTarget(null);
    }
  };

  const updateFamilyDraft = (familyId: string, update: Partial<FamilyDraft>) => {
    setFamilyDrafts((prev) => ({
      ...prev,
      [familyId]: { ...(prev[familyId] ?? { status: "unreviewed", note: "" }), ...update },
    }));
  };

  const saveFamilyStatus = async (familyId: string) => {
    if (!selectedCard || savingTarget) return;
    const draft = familyDrafts[familyId];
    if (!draft) return;

    const currentFamily = selectedCard.familyStatuses.find(
      (family) => family.familyId === familyId,
    );
    if (!currentFamily) return;

    if (
      shouldWarnBeforeStatusChange(currentFamily.status, draft.status) &&
      !window.confirm(
        `Change ${familyId} from ${getStatusMeta(currentFamily.status).label} to ${getStatusMeta(draft.status).label}?`,
      )
    ) {
      return;
    }

    setSavingTarget(`family:${familyId}`);
    setSaveFeedback(null);

    try {
      const response = await updateCardImplementationStatus({
        setCode: selectedCard.setCode,
        gameplayIdentity: selectedCard.gameplayIdentity,
        target: "family",
        familyId,
        status: draft.status,
        note: draft.note.trim() || null,
      });

      if (!response.accepted) {
        setSaveFeedback({ kind: "error", message: readSaveError(response) });
        return;
      }

      updateCatalogCard(response);
      setSaveFeedback({ kind: "success", message: `${familyId} status saved.` });
    } catch (caught) {
      setSaveFeedback({
        kind: "error",
        message: caught instanceof Error ? caught.message : "Family status save failed.",
      });
    } finally {
      setSavingTarget(null);
    }
  };

  return (
    <main className="bg-background min-h-screen">
      {/* Subtle background texture */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.72_0.14_210/0.07),transparent)] pointer-events-none" aria-hidden="true" />

      <div className="relative flex flex-col gap-6 mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1800px]">

        {/* ── Header ── */}
        <header className="flex lg:flex-row flex-col lg:justify-between lg:items-end gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-primary/80 text-xs uppercase tracking-widest">
              <Layers3 className="size-3.5" />
              Hextech Simulator
            </div>
            <h1 className="font-semibold text-foreground text-3xl tracking-tight">
              Card implementation catalog
            </h1>
            <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
              Browse card artwork while tracking canonical implementations, reusable behavior families, and manual validation progress.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={exportCsv}
            className="self-start lg:self-auto bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.1] text-foreground/80"
          >
            <Download data-icon="inline-start" />
            Export filtered CSV
          </Button>
        </header>

        {/* ── Metric cards ── */}
        <section className="gap-3 grid sm:grid-cols-2 xl:grid-cols-3" aria-label="Summary metrics">
          <MetricCard
            title="Implemented cards"
            value={`${totalImplemented} / ${catalog.length}`}
            description={`${implementationPercentage}% have a canonical model`}
            icon={<CheckCircle2 className="size-5" />}
          />
          <MetricCard
            title="Accepted"
            value={statusCounts.accepted ?? 0}
            description="Fully accepted workflow status"
            icon={<ShieldCheck className="size-5" />}
          />
          <MetricCard
            title="Awaiting validation"
            value={statusCounts.ready_for_manual_validation ?? 0}
            description="Ready for manual gameplay validation"
            icon={<Clock3 className="size-5" />}
          />
        </section>

        {/* ── Implementation by set ── */}
        <Card className="bg-white/[0.03] backdrop-blur-md border-white/[0.06]">
          <CardHeader className="pb-4">
            <CardTitle className="font-semibold text-foreground/90 text-sm">Implementation by set</CardTitle>
            <CardDescription className="text-xs">
              A card counts as implemented whenever its implementation JSON entry contains a canonical model.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3 grid md:grid-cols-2 xl:grid-cols-4">
            {REAL_SET_SUMMARIES.map((set) => {
              const percentage = Math.round((set.implemented / set.cards) * 100);
              return (
                <button
                  key={set.setCode}
                  type="button"
                  onClick={() => { setSetFilter(set.setCode); setPage(1); }}
                  className="group bg-white/[0.03] hover:bg-white/[0.06] p-4 border border-white/[0.06] hover:border-primary/30 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 text-left transition-all duration-200"
                >
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div>
                      <p className="font-mono font-semibold text-foreground/90 text-sm">{set.setCode}</p>
                      <p className="text-muted-foreground text-xs">
                        {set.implemented.toLocaleString()} of {set.cards.toLocaleString()} cards
                      </p>
                    </div>
                    <span className="bg-primary/10 px-2 py-0.5 border border-primary/20 rounded-md font-mono font-semibold text-primary text-xs">
                      {percentage}%
                    </span>
                  </div>
                  <Progress
                    value={percentage}
                    className="bg-white/[0.06] h-1.5"
                  />
                  <p className="mt-2.5 text-[10px] text-muted-foreground/60">
                    JSON updated {formatDate(setUpdatedAtByCode[set.setCode] ?? set.updatedAt)} UTC
                  </p>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Filters ── */}
        <Card className="bg-white/[0.03] backdrop-blur-md border-white/[0.06]">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary/70" />
                <div>
                  <CardTitle className="font-semibold text-foreground/90 text-sm">Catalog filters</CardTitle>
                  <CardDescription className="text-xs">
                    Search by name, collector code, card type, domain, or family ID.
                  </CardDescription>
                </div>
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="gap-1.5 text-muted-foreground hover:text-foreground text-xs"
                >
                  <X className="size-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {/* Row 1: search only */}
            <div className="w-full">
              {/* Search — grows to fill available space */}
              <div className="relative w-full">
                <Search className="top-1/2 left-3 absolute size-3.5 text-muted-foreground/60 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                  placeholder="Search cards, types, domains, or families…"
                  className="bg-white/[0.04] pl-9 border-white/[0.08] focus-visible:border-primary/40 focus-visible:ring-primary/20 placeholder:text-muted-foreground/50 text-sm"
                />
              </div>

            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Select value={setFilter} onValueChange={(v) => { setSetFilter(v); resetPage(); }}>
                <SelectTrigger aria-label="Filter by set" className="bg-white/[0.04] border-white/[0.08] w-36 text-sm">
                  <SelectValue placeholder="All sets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sets</SelectItem>
                  {REAL_SET_SUMMARIES.map((s) => (
                    <SelectItem key={s.setCode} value={s.setCode}>
                      {s.setCode} ({s.cards})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetPage(); }}>
                <SelectTrigger aria-label="Filter by status" className="bg-white/[0.04] border-white/[0.08] w-40 text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getStatusMeta(s).label} ({statusCounts[s] ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={implementationFilter} onValueChange={(v) => { setImplementationFilter(v); resetPage(); }}>
                <SelectTrigger aria-label="Filter by implementation" className="bg-white/[0.04] border-white/[0.08] w-44 text-sm">
                  <SelectValue placeholder="Any implementation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any implementation</SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
                  <SelectItem value="not-implemented">Not implemented</SelectItem>
                </SelectContent>
              </Select>

              <Select value={imageFilter} onValueChange={(v) => { setImageFilter(v); resetPage(); }}>
                <SelectTrigger aria-label="Filter by image" className="bg-white/[0.04] border-white/[0.08] w-40 text-sm">
                  <SelectValue placeholder="Any image state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any image state</SelectItem>
                  <SelectItem value="with-image">With image</SelectItem>
                  <SelectItem value="missing-image">Missing image</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={(v) => { setSort(v as SortOption); resetPage(); }}>
                <SelectTrigger aria-label="Sort cards" className="bg-white/[0.04] border-white/[0.08] w-44 text-sm">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="code-asc">Collector code</SelectItem>
                  <SelectItem value="name-asc">Card name</SelectItem>
                  <SelectItem value="updated-desc">Recently updated</SelectItem>
                  <SelectItem value="status-desc">Workflow progress</SelectItem>
                </SelectContent>
              </Select>

              <Select value={familyFilter} onValueChange={(v) => { setFamilyFilter(v); resetPage(); }}>
                <SelectTrigger aria-label="Filter by behavior family" className="bg-white/[0.04] border-white/[0.08] w-44 text-sm">
                  <SelectValue placeholder="All behavior families" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All behavior families</SelectItem>
                  {familyOptions.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </CardContent>
        </Card>

        {/* ── Cards grid ── */}
        <Card className="bg-white/[0.03] backdrop-blur-md border-white/[0.06] overflow-hidden">
          {/* Header row */}
          <CardHeader className="pb-4 border-white/[0.06] border-b">
            <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-3">
              <div>
                <CardTitle className="font-semibold text-foreground/90 text-sm">Cards</CardTitle>
                <CardDescription className="text-xs">
                  {filteredCards.length.toLocaleString()} matching cards
                </CardDescription>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {statusOptions.map((status) => {
                  const meta = getStatusMeta(status);
                  return (
                    <span key={status} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                      <span className={cn("rounded-full size-1.5", meta.dotClassName)} />
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {visibleCards.length ? (
              <div className="gap-2.5 grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {visibleCards.map((card) => (
                  <CatalogCardTile key={card.gameplayIdentity} card={card} onSelect={selectCard} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col justify-center items-center gap-3 border border-white/[0.08] border-dashed rounded-xl min-h-56 text-center">
                <Search className="size-6 text-muted-foreground/40" />
                <div>
                  <p className="font-medium text-foreground/70 text-sm">No cards found</p>
                  <p className="mt-1 max-w-sm text-muted-foreground/60 text-xs">
                    Change the search term or clear one of the active filters.
                  </p>
                </div>
              </div>
            )}
          </CardContent>

          {/* Pagination */}
          <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-3 px-5 py-4 border-white/[0.06] border-t">
            <p className="text-muted-foreground/70 text-xs">
              {filteredCards.length
                ? `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredCards.length)} of ${filteredCards.length.toLocaleString()}`
                : "Showing 0 cards"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-xs"
              >
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <span className="min-w-16 text-muted-foreground/70 text-xs text-center">
                {safePage} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={safePage >= pageCount}
                className="bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-xs"
              >
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Card detail dialog ── */}
      <Dialog
        open={Boolean(selectedCard)}
        onOpenChange={(open) => {
          if (!open) { setSelectedCard(null); setSaveFeedback(null); }
        }}
      >
        <DialogContent className="bg-[oklch(0.17_0.016_258)] backdrop-blur-xl border-white/[0.08] max-w-5xl max-h-[92vh] overflow-y-auto">
          {selectedCard && (
            <div className="gap-6 grid lg:grid-cols-[minmax(240px,320px)_1fr]">
              {/* Artwork panel */}
              <div className="space-y-2">
                <div className="bg-black/30 p-2 border border-white/[0.08] rounded-xl aspect-[744/1039] overflow-hidden">
                  <CardArtworkImage
                    key={selectedCard.artwork?.imageUrl ?? selectedCard.primaryCode}
                    card={selectedCard}
                    className="rounded-lg"
                  />
                </div>
                {selectedCard.artwork?.artist && (
                  <p className="text-[11px] text-muted-foreground/60 text-center">
                    Art by {selectedCard.artwork.artist}
                  </p>
                )}
              </div>

              {/* Info panel */}
              <div className="space-y-5 min-w-0">
                <DialogHeader>
                  <div className="flex flex-wrap items-center gap-2 pr-8">
                    <Badge variant="secondary" className="bg-white/[0.06] border-white/[0.08] font-mono text-xs">
                      {selectedCard.setCode}
                    </Badge>
                    <StatusBadge status={selectedCard.status} />
                  </div>
                  <DialogTitle className="pt-1 font-semibold text-xl">
                    {selectedCard.name}
                  </DialogTitle>
                  <DialogDescription className="font-mono text-muted-foreground/60 text-xs break-all">
                    {selectedCard.gameplayIdentity}
                  </DialogDescription>
                </DialogHeader>

                {/* Detail grid */}
                <div className="gap-2 grid sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Printing code", value: selectedCard.artwork?.publicCode ?? selectedCard.printingCodes.join(", ") },
                    {
                      label: "Card type",
                      value: [selectedCard.artwork?.supertype, selectedCard.artwork?.type].filter(Boolean).join(" ") || "—",
                    },
                    { label: "Canonical model", value: selectedCard.canonicalModel?.cardCode ?? "Not approved" },
                    { label: "Updated", value: `${formatDate(selectedCard.updatedAt)} UTC` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white/[0.03] p-3 border border-white/[0.06] rounded-lg">
                      <p className="font-medium text-[10px] text-muted-foreground/60 uppercase tracking-wider">{label}</p>
                      <p className="mt-1 font-medium text-foreground/90 text-sm">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Tags */}
                {selectedCard.artwork && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCard.artwork.rarity && (
                      <Badge variant="outline" className="border-white/[0.1] text-xs">
                        {selectedCard.artwork.rarity}
                      </Badge>
                    )}
                    {selectedCard.artwork.domains.map((d) => (
                      <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
                    ))}
                    {selectedCard.artwork.tags.map((t) => (
                      <Badge key={t} variant="outline" className="border-white/[0.1] text-xs">{t}</Badge>
                    ))}
                  </div>
                )}

                {selectedCard.artwork?.rulesText && (
                  <div className="bg-white/[0.03] p-4 border border-white/[0.06] rounded-lg">
                    <p className="font-medium text-[10px] text-muted-foreground/60 uppercase tracking-wider">Card text</p>
                    <p className="mt-2 text-foreground/80 text-sm leading-relaxed whitespace-pre-line">
                      {selectedCard.artwork.rulesText}
                    </p>
                  </div>
                )}

                <Separator className="bg-white/[0.06]" />

                {/* Manual validation */}
                <section className="space-y-4 bg-white/[0.02] p-4 border border-white/[0.06] rounded-xl">
                  <div>
                    <h3 className="font-semibold text-foreground/90 text-sm">Manual validation</h3>
                    <p className="text-muted-foreground/70 text-xs">
                      Update workflow gates and record the latest manual gameplay validation note.
                    </p>
                  </div>

                  <div className="gap-3 grid sm:grid-cols-2 bg-white/[0.03] p-3 border border-white/[0.06] rounded-lg">
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium text-foreground/80 text-xs">Card workflow status</span>
                      <Select value={cardStatusDraft} onValueChange={setCardStatusDraft} disabled={Boolean(savingTarget)}>
                        <SelectTrigger aria-label="Card workflow status" className="bg-white/[0.04] border-white/[0.08] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s} value={s}>{getStatusMeta(s).label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium text-foreground/80 text-xs">Validation note (optional)</span>
                      <Input
                        value={cardNoteDraft}
                        onChange={(e) => setCardNoteDraft(e.target.value)}
                        placeholder="What was verified?"
                        disabled={Boolean(savingTarget)}
                        className="bg-white/[0.04] border-white/[0.08] text-sm"
                      />
                    </label>

                    <div className="flex sm:justify-end sm:col-span-2">
                      <Button
                        type="button"
                        onClick={saveCardStatus}
                        disabled={Boolean(savingTarget)}
                        className="bg-primary/90 hover:bg-primary text-primary-foreground text-sm"
                      >
                        {savingTarget === "card" ? "Saving…" : "Save card status"}
                      </Button>
                    </div>
                  </div>

                  {/* Behavior families */}
                  {selectedCard.familyStatuses.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-foreground/80 text-xs">Behavior families</h4>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                          Only existing behavior families can be updated here.
                        </p>
                      </div>

                      {selectedCard.familyStatuses.map((family) => {
                        const draft = familyDrafts[family.familyId] ?? { status: family.status, note: family.note ?? "" };
                        const target = `family:${family.familyId}`;

                        return (
                          <div
                            key={`${selectedCard.gameplayIdentity}-${family.familyId}`}
                            className="space-y-3 bg-white/[0.03] p-3 border border-white/[0.06] rounded-lg"
                          >
                            <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-2">
                              <div>
                                <p className="font-mono font-medium text-foreground/90 text-sm break-all">{family.familyId}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                                  Updated {formatDate(family.updatedAt)} UTC
                                </p>
                              </div>
                              <StatusBadge status={family.status} />
                            </div>

                            <div className="gap-3 grid sm:grid-cols-2">
                              <label className="space-y-1.5 text-sm">
                                <span className="font-medium text-foreground/80 text-xs">Family status</span>
                                <Select
                                  value={draft.status}
                                  onValueChange={(s) => s && updateFamilyDraft(family.familyId, { status: s })}
                                  disabled={Boolean(savingTarget)}
                                >
                                  <SelectTrigger aria-label={`${family.familyId} status`} className="bg-white/[0.04] border-white/[0.08] text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {statusOptions.map((s) => (
                                      <SelectItem key={s} value={s}>{getStatusMeta(s).label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </label>

                              <label className="space-y-1.5 text-sm">
                                <span className="font-medium text-foreground/80 text-xs">Validation note (optional)</span>
                                <Input
                                  value={draft.note}
                                  onChange={(e) => updateFamilyDraft(family.familyId, { note: e.target.value })}
                                  placeholder="What was verified?"
                                  disabled={Boolean(savingTarget)}
                                  className="bg-white/[0.04] border-white/[0.08] text-sm"
                                />
                              </label>
                            </div>

                            <div className="flex sm:justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => saveFamilyStatus(family.familyId)}
                                disabled={Boolean(savingTarget)}
                                className="bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.1] text-xs"
                              >
                                {savingTarget === target ? "Saving…" : "Save family status"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 border border-white/[0.08] border-dashed rounded-lg text-muted-foreground/60 text-xs text-center">
                      This card is not currently linked to a behavior family.
                    </div>
                  )}

                  {saveFeedback && (
                    <p
                      aria-live="polite"
                      className={cn(
                        "text-xs",
                        saveFeedback.kind === "error" ? "text-destructive" : "text-emerald-400",
                      )}
                    >
                      {saveFeedback.message}
                    </p>
                  )}
                </section>

                <Separator className="bg-white/[0.06]" />

                {/* History */}
                <section className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-foreground/90 text-sm">Implementation history</h3>
                    <p className="text-muted-foreground/60 text-xs">
                      Recorded canonical approvals and family status changes.
                    </p>
                  </div>

                  {selectedCard.history.length ? (
                    <div className="space-y-3">
                      {[...selectedCard.history]
                        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                        .map((entry, i) => (
                          <div key={`${entry.at}-${entry.event}-${i}`} className="relative pl-5">
                            <span className="top-1.5 left-0 absolute bg-primary/70 rounded-full size-2" />
                            {i < selectedCard.history.length - 1 && (
                              <span className="top-4 bottom-[-16px] left-[3px] absolute bg-white/[0.06] w-px" />
                            )}
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-foreground/90 text-sm">{humanize(entry.event)}</p>
                                <StatusBadge status={entry.status} />
                              </div>
                              {entry.familyId && (
                                <p className="font-mono text-muted-foreground/60 text-xs break-all">{entry.familyId}</p>
                              )}
                              {entry.note && (
                                <p className="text-muted-foreground/70 text-xs">{entry.note}</p>
                              )}
                              <p className="text-[11px] text-muted-foreground/50">{formatDate(entry.at)} UTC</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="p-6 border border-white/[0.08] border-dashed rounded-lg text-muted-foreground/60 text-xs text-center">
                      No implementation events have been recorded.
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
