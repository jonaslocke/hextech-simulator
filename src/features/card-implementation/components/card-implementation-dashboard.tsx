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
  {
    label: string;
    description: string;
    className: string;
    dotClassName: string;
  }
> = {
  accepted: {
    label: "Accepted",
    description: "Implementation and validation accepted.",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotClassName: "bg-emerald-500",
  },
  manual_family_passed: {
    label: "Manual family passed",
    description: "The reusable behavior family passed manual validation.",
    className:
      "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    dotClassName: "bg-cyan-500",
  },
  ready_for_manual_validation: {
    label: "Ready for validation",
    description: "Implemented and waiting for manual validation.",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dotClassName: "bg-amber-500",
  },
  implemented: {
    label: "Implemented",
    description: "A canonical behavior model is available.",
    className:
      "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    dotClassName: "bg-blue-500",
  },
  unreviewed: {
    label: "Unreviewed",
    description: "No canonical implementation has been approved yet.",
    className: "border-muted-foreground/20 bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground/50",
  },
};

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
  printings: Array<{
    sourceCardId: string;
    cardCode: string;
    name: string;
  }>;
  status: string;
  canonicalModel: null | {
    cardCode: string;
    approvedAt: string;
  };
  familyStatuses: FamilyStatus[];
  history: HistoryEntry[];
  updatedAt: string;
  imageUrl?: string;
  media?: {
    image_url?: string;
    accessibility_text?: string;
    artist?: string;
  };
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
  riftbound_id?: string;
  public_code?: string;
  collector_number?: number;
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
  text?: {
    plain?: string;
  };
  set?: {
    set_id?: string;
    label?: string;
  };
  media?: {
    image_url?: string;
    artist?: string;
    accessibility_text?: string;
  };
  tags?: string[];
  orientation?: "portrait" | "landscape" | string;
  metadata?: {
    clean_name?: string;
    alternate_art?: boolean;
    overnumbered?: boolean;
    signature?: boolean;
  };
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

type CatalogCard = CardImplementation & {
  setCode: string;
  setUpdatedAt: string;
  implemented: boolean;
  primaryCode: string;
  artwork: CardArtwork | null;
};

type SortOption = "code-asc" | "name-asc" | "updated-desc" | "status-desc";

type ImageFilter = "all" | "with-image" | "missing-image";

type FamilyDraft = {
  status: string;
  note: string;
};

type SaveFeedback = {
  kind: "error" | "success";
  message: string;
} | null;

const SET_FILES = [
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

function humanize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

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

function hasCanonicalCollectorCode(value?: string) {
  if (!value) return false;
  return /^[A-Z]+-\d+\/\d+$/i.test(value.trim());
}

function sourceCardScore(
  sourceCard: SourceCard,
  implementation: CardImplementation,
) {
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
  const canonicalCode = normalizeCardCode(
    implementation.canonicalModel?.cardCode,
  );
  const sourceCode = normalizeCardCode(sourceCard.public_code);
  const sourceName = normalizeName(
    sourceCard.metadata?.clean_name ?? sourceCard.name,
  );
  const implementationName = normalizeName(
    implementation.cleanName ?? implementation.name,
  );

  let score = 0;

  // Prefer the canonical collector code over a variant-specific source ID.
  // This keeps OGN-193 ahead of OGN-193a, showcase, signature, or overnumbered art.
  if (canonicalCode && sourceCode === canonicalCode) score += 25_000;
  if (sourceCode && printingCodes.has(sourceCode)) score += 20_000;
  if (sourceIds.has(sourceCard.id)) score += 10_000;
  if (sourceName && sourceName === implementationName) score += 1_000;

  if (hasCanonicalCollectorCode(sourceCard.public_code)) score += 100;
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

function resolveArtwork(
  implementation: CardImplementation,
  setCode: string,
): CardArtwork | null {
  const implementationImage =
    implementation.imageUrl ?? implementation.media?.image_url;

  if (implementationImage) {
    return {
      imageUrl: implementationImage,
      accessibilityText: implementation.media?.accessibility_text,
      artist: implementation.media?.artist,
      domains: [],
      tags: [],
    };
  }

  const sourceCards = SOURCE_CARDS_BY_SET[setCode] ?? [];
  const rankedCandidates = sourceCards
    .map((sourceCard) => ({
      sourceCard,
      score: sourceCardScore(sourceCard, implementation),
    }))
    .filter(({ score, sourceCard }) => score > 0 && sourceCard.media?.image_url)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;

      return (left.sourceCard.public_code ?? "").localeCompare(
        right.sourceCard.public_code ?? "",
        undefined,
        { numeric: true },
      );
    });

  return rankedCandidates.length
    ? toArtwork(rankedCandidates[0].sourceCard)
    : null;
}

const CATALOG: CatalogCard[] = SET_FILES.flatMap((set) =>
  set.cards.map((card) => ({
    ...card,
    setCode: set.setCode,
    setUpdatedAt: set.updatedAt,
    implemented: Boolean(card.canonicalModel),
    primaryCode: card.printingCodes[0] ?? card.canonicalModel?.cardCode ?? "—",
    artwork: resolveArtwork(card, set.setCode),
  })),
);

function getStatusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: humanize(status),
      description: "Custom implementation workflow status.",
      className:
        "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      dotClassName: "bg-violet-500",
    }
  );
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

function shouldWarnBeforeStatusChange(current: string, next: string) {
  if (current === next) return false;
  if (current === "accepted") return true;
  if (current === "manual_family_passed") {
    return next !== "accepted";
  }
  return false;
}

function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status);

  return (
    <Badge variant="outline" className={meta.className}>
      <span className={`mr-1.5 size-1.5 rounded-full ${meta.dotClassName}`} />
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
    <Card className="bg-card/70 shadow-sm backdrop-blur">
      <CardContent className="flex justify-between items-start gap-4 p-5">
        <div className="space-y-1">
          <p className="font-medium text-muted-foreground text-sm">{title}</p>
          <p className="font-semibold text-2xl tracking-tight">{value}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        <div className="bg-background/70 p-2.5 border rounded-lg text-muted-foreground">
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
        className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/50 px-4 text-center text-muted-foreground ${className}`}
      >
        <ImageOff className="size-8" />
        <div>
          <p className="font-medium text-foreground text-sm">
            Image unavailable
          </p>
          <p className="mt-1 font-mono text-xs">{card.primaryCode}</p>
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
      className={`h-full w-full object-contain ${className}`}
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
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-w-0 text-left"
    >
      <Card className="bg-card/80 shadow-sm group-hover:shadow-md group-hover:border-primary/35 h-full overflow-hidden transition group-hover:-translate-y-0.5 duration-200">
        <div className="relative bg-black/10 dark:bg-black/30 p-1.5 aspect-[744/1039] overflow-hidden">
          <CardArtworkImage
            card={card}
            className="rounded-md group-hover:scale-[1.015] transition duration-200"
          />

          <div className="top-2 absolute inset-x-2 flex justify-between items-start gap-2 pointer-events-none">
            <Badge className="bg-background/90 shadow-sm backdrop-blur border-black/10 font-mono text-[10px]">
              {card.setCode}
            </Badge>
            <span
              title={statusMeta.label}
              className={`size-3 rounded-full border-2 border-background shadow-sm ${statusMeta.dotClassName}`}
            />
          </div>

          {card.implemented ? (
            <div className="right-2 bottom-2 absolute bg-background/90 shadow-sm backdrop-blur p-1.5 border border-emerald-500/30 rounded-full text-emerald-600 dark:text-emerald-300 pointer-events-none">
              <CheckCircle2 className="size-3.5" />
            </div>
          ) : null}
        </div>

        <CardContent className="space-y-2 p-3">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" title={card.name}>
              {card.name}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
              {card.artwork?.publicCode ?? card.primaryCode}
            </p>
          </div>

          <StatusBadge status={card.status} />

          {card.familyStatuses.length ? (
            <p className="text-[11px] text-muted-foreground truncate">
              {card.familyStatuses.length} behavior family
              {card.familyStatuses.length === 1 ? "" : "ies"}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No behavior family
            </p>
          )}
        </CardContent>
      </Card>
    </button>
  );
}

export default function CardImplementationDashboard() {
  const [catalog, setCatalog] = useState(CATALOG);
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [implementationFilter, setImplementationFilter] = useState("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [sort, setSort] = useState<SortOption>("code-asc");
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [setUpdatedAtByCode, setSetUpdatedAtByCode] = useState<
    Record<string, string>
  >(() => Object.fromEntries(SET_FILES.map((set) => [set.setCode, set.updatedAt])));
  const [cardStatusDraft, setCardStatusDraft] = useState("");
  const [cardNoteDraft, setCardNoteDraft] = useState("");
  const [familyDrafts, setFamilyDrafts] = useState<Record<string, FamilyDraft>>(
    {},
  );
  const [savingTarget, setSavingTarget] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);

  const selectCard = (card: CatalogCard) => {
    setSelectedCard(card);
    setCardStatusDraft(card.status);
    setCardNoteDraft("");
    setFamilyDrafts(
      Object.fromEntries(
        card.familyStatuses.map((family) => [
          family.familyId,
          { status: family.status, note: family.note ?? "" },
        ]),
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

  const saveCardStatus = async () => {
    if (!selectedCard || savingTarget) return;

    if (
      shouldWarnBeforeStatusChange(selectedCard.status, cardStatusDraft) &&
      !window.confirm(
        `This changes the card from ${getStatusMeta(selectedCard.status).label} to ${getStatusMeta(cardStatusDraft).label}. Continue?`,
      )
    ) {
      return;
    }

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

  const updateFamilyDraft = (
    familyId: string,
    update: Partial<FamilyDraft>,
  ) => {
    setFamilyDrafts((current) => ({
      ...current,
      [familyId]: {
        ...(current[familyId] ?? { status: "unreviewed", note: "" }),
        ...update,
      },
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
        `This changes ${familyId} from ${getStatusMeta(currentFamily.status).label} to ${getStatusMeta(draft.status).label}. Continue?`,
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
      setSaveFeedback({
        kind: "success",
        message: `${familyId} status saved.`,
      });
    } catch (caught) {
      setSaveFeedback({
        kind: "error",
        message:
          caught instanceof Error ? caught.message : "Family status save failed.",
      });
    } finally {
      setSavingTarget(null);
    }
  };

  const statusCounts = useMemo(() => {
    return catalog.reduce<Record<string, number>>((counts, card) => {
      counts[card.status] = (counts[card.status] ?? 0) + 1;
      return counts;
    }, {});
  }, [catalog]);

  const statusOptions = useMemo(() => {
    const statuses = catalog.flatMap((card) => [
      card.status,
      ...card.familyStatuses.map((family) => family.status),
    ]);

    return Array.from(new Set([...STATUS_ORDER, ...statuses])).sort(
      (left, right) => {
        const leftIndex = STATUS_ORDER.indexOf(left);
        const rightIndex = STATUS_ORDER.indexOf(right);
        return (
          (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
        );
      },
    );
  }, [catalog]);

  const familyOptions = useMemo(() => {
    return Array.from(
      new Set(
        catalog.flatMap((card) =>
          card.familyStatuses.map((family) => family.familyId),
        ),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }, [catalog]);

  const totalImplemented = useMemo(
    () => catalog.filter((card) => card.implemented).length,
    [catalog],
  );
  const totalWithImages = useMemo(
    () => catalog.filter((card) => card.artwork).length,
    [catalog],
  );
  const implementationPercentage = Math.round(
    (totalImplemented / catalog.length) * 100,
  );

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();

    const result = catalog.filter((card) => {
      const matchesSearch =
        !normalizedSearch ||
        card.name.toLocaleLowerCase().includes(normalizedSearch) ||
        card.cleanName.toLocaleLowerCase().includes(normalizedSearch) ||
        card.gameplayIdentity.toLocaleLowerCase().includes(normalizedSearch) ||
        card.printingCodes.some((code) =>
          code.toLocaleLowerCase().includes(normalizedSearch),
        ) ||
        card.artwork?.publicCode
          ?.toLocaleLowerCase()
          .includes(normalizedSearch) ||
        card.artwork?.type?.toLocaleLowerCase().includes(normalizedSearch) ||
        card.artwork?.domains.some((domain) =>
          domain.toLocaleLowerCase().includes(normalizedSearch),
        ) ||
        card.familyStatuses.some((family) =>
          family.familyId.toLocaleLowerCase().includes(normalizedSearch),
        );

      const matchesSet = setFilter === "all" || card.setCode === setFilter;
      const matchesStatus =
        statusFilter === "all" || card.status === statusFilter;
      const matchesImplementation =
        implementationFilter === "all" ||
        (implementationFilter === "implemented" && card.implemented) ||
        (implementationFilter === "not-implemented" && !card.implemented);
      const matchesImage =
        imageFilter === "all" ||
        (imageFilter === "with-image" && Boolean(card.artwork)) ||
        (imageFilter === "missing-image" && !card.artwork);
      const matchesFamily =
        familyFilter === "all" ||
        card.familyStatuses.some((family) => family.familyId === familyFilter);

      return (
        matchesSearch &&
        matchesSet &&
        matchesStatus &&
        matchesImplementation &&
        matchesImage &&
        matchesFamily
      );
    });

    result.sort((left, right) => {
      if (sort === "name-asc") {
        return left.name.localeCompare(right.name);
      }

      if (sort === "updated-desc") {
        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        );
      }

      if (sort === "status-desc") {
        const leftRank = STATUS_ORDER.indexOf(left.status);
        const rightRank = STATUS_ORDER.indexOf(right.status);
        const normalizedLeft = leftRank === -1 ? STATUS_ORDER.length : leftRank;
        const normalizedRight =
          rightRank === -1 ? STATUS_ORDER.length : rightRank;
        return (
          normalizedLeft - normalizedRight ||
          left.primaryCode.localeCompare(right.primaryCode)
        );
      }

      return left.primaryCode.localeCompare(right.primaryCode, undefined, {
        numeric: true,
      });
    });

    return result;
  }, [
    familyFilter,
    imageFilter,
    implementationFilter,
    catalog,
    search,
    setFilter,
    sort,
    statusFilter,
  ]);

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
    setFilter !== "all" ||
    statusFilter !== "all" ||
    implementationFilter !== "all" ||
    imageFilter !== "all" ||
    familyFilter !== "all" ||
    sort !== "code-asc";

  const exportCsv = () => {
    const escapeCell = (value: string | number | boolean) =>
      `"${String(value).replaceAll('"', '""')}"`;

    const rows = [
      [
        "Code",
        "Name",
        "Set",
        "Workflow status",
        "Implemented",
        "Canonical model",
        "Families",
        "Image URL",
        "Updated at",
      ],
      ...filteredCards.map((card) => [
        card.artwork?.publicCode ?? card.primaryCode,
        card.name,
        card.setCode,
        card.status,
        card.implemented,
        card.canonicalModel?.cardCode ?? "",
        card.familyStatuses.map((family) => family.familyId).join(" | "),
        card.artwork?.imageUrl ?? "",
        card.updatedAt,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => escapeCell(cell)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "card-implementation-catalog.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="bg-muted/20 min-h-screen">
      <div className="flex flex-col gap-6 mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1800px]">
        <section className="flex lg:flex-row flex-col lg:justify-between lg:items-end gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
              <Layers3 className="size-4" />
              Hextech Simulator
            </div>
            <div>
              <h1 className="font-semibold text-3xl tracking-tight">
                Card implementation catalog
              </h1>
              <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
                Browse the real card artwork while tracking canonical
                implementations, reusable behavior families, and manual
                validation progress.
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 size-4" />
            Export filtered CSV
          </Button>
        </section>

        <section className="gap-3 grid sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Implemented cards"
            value={`${totalImplemented} / ${catalog.length}`}
            description={`${implementationPercentage}% have a canonical model`}
            icon={<CheckCircle2 className="size-5" />}
          />
          <MetricCard
            title="Card images"
            value={`${totalWithImages} / ${catalog.length}`}
            description="Matched from implementation or set JSON data"
            icon={<Layers3 className="size-5" />}
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

        <Card className="bg-card/70 shadow-sm backdrop-blur overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Implementation by set</CardTitle>
            <CardDescription>
              A card counts as implemented whenever its implementation JSON
              entry contains a canonical model.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-5 grid md:grid-cols-2 xl:grid-cols-4">
            {SET_FILES.map((set) => {
              const implemented = set.cards.filter(
                (card) => card.canonicalModel,
              ).length;
              const percentage = Math.round(
                (implemented / set.cards.length) * 100,
              );

              return (
                <button
                  key={set.setCode}
                  type="button"
                  onClick={() => {
                    setSetFilter(set.setCode);
                    setPage(1);
                  }}
                  className="bg-background/60 hover:bg-accent/50 p-4 border rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left transition-colors"
                >
                  <div className="flex justify-between items-center gap-3 mb-3">
                    <div>
                      <p className="font-semibold">{set.setCode}</p>
                      <p className="text-muted-foreground text-xs">
                        {implemented} of {set.cards.length} cards
                      </p>
                    </div>
                    <span className="font-semibold text-sm">{percentage}%</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    JSON updated {formatDate(setUpdatedAtByCode[set.setCode] ?? set.updatedAt)} UTC
                  </p>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-card/70 shadow-sm backdrop-blur">
          <CardHeader className="pb-4">
            <div className="flex lg:flex-row flex-col lg:justify-between lg:items-center gap-3">
              <div>
                <CardTitle className="text-base">Catalog filters</CardTitle>
                <CardDescription>
                  Search by name, collector code, card type, domain, or family
                  ID.
                </CardDescription>
              </div>
              {hasActiveFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="gap-3 grid md:grid-cols-2 xl:grid-cols-7">
            <div className="relative md:col-span-2 xl:col-span-2">
              <Search className="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                placeholder="Search cards, types, domains, or families..."
                className="pl-9"
              />
            </div>

            <Select
              value={setFilter}
              onValueChange={(value) => {
                setSetFilter(value);
                resetPage();
              }}
            >
              <SelectTrigger aria-label="Filter by set">
                <SelectValue placeholder="All sets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sets</SelectItem>
                {SET_FILES.map((set) => (
                  <SelectItem key={set.setCode} value={set.setCode}>
                    {set.setCode} ({set.cards.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                resetPage();
              }}
            >
              <SelectTrigger aria-label="Filter by workflow status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {getStatusMeta(status).label} ({statusCounts[status] ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={implementationFilter}
              onValueChange={(value) => {
                setImplementationFilter(value);
                resetPage();
              }}
            >
              <SelectTrigger aria-label="Filter by implementation state">
                <SelectValue placeholder="Any implementation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any implementation</SelectItem>
                <SelectItem value="implemented">Implemented</SelectItem>
                <SelectItem value="not-implemented">Not implemented</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={imageFilter}
              onValueChange={(value) => {
                setImageFilter(value as ImageFilter);
                resetPage();
              }}
            >
              <SelectTrigger aria-label="Filter by card image availability">
                <SelectValue placeholder="Any image state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any image state</SelectItem>
                <SelectItem value="with-image">With image</SelectItem>
                <SelectItem value="missing-image">Missing image</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sort}
              onValueChange={(value) => {
                setSort(value as SortOption);
                resetPage();
              }}
            >
              <SelectTrigger aria-label="Sort catalog">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="code-asc">Collector code</SelectItem>
                <SelectItem value="name-asc">Card name</SelectItem>
                <SelectItem value="updated-desc">Recently updated</SelectItem>
                <SelectItem value="status-desc">Workflow progress</SelectItem>
              </SelectContent>
            </Select>

            <div className="md:col-span-2 xl:col-span-7">
              <Select
                value={familyFilter}
                onValueChange={(value) => {
                  setFamilyFilter(value);
                  resetPage();
                }}
              >
                <SelectTrigger aria-label="Filter by behavior family">
                  <SelectValue placeholder="All behavior families" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All behavior families</SelectItem>
                  {familyOptions.map((family) => (
                    <SelectItem key={family} value={family}>
                      {family}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 shadow-sm backdrop-blur overflow-hidden">
          <CardHeader className="pb-4 border-b">
            <div className="flex sm:flex-row flex-col sm:justify-between sm:items-end gap-2">
              <div>
                <CardTitle className="text-base">Cards</CardTitle>
                <CardDescription>
                  {filteredCards.length.toLocaleString()} matching cards
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
                {statusOptions.map((status) => {
                  const meta = getStatusMeta(status);
                  return (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1.5"
                    >
                      <span
                        className={`size-1.5 rounded-full ${meta.dotClassName}`}
                      />
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {visibleCards.length ? (
              <div className="gap-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-8 xl:grid-cols-6">
                {visibleCards.map((card) => (
                  <CatalogCardTile
                    key={card.gameplayIdentity}
                    card={card}
                    onSelect={selectCard}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col justify-center items-center gap-2 border border-dashed rounded-xl min-h-56 text-muted-foreground text-center">
                <Search className="size-6" />
                <p className="font-medium text-foreground">No cards found</p>
                <p className="max-w-sm text-sm">
                  Change the search term or clear one of the active filters.
                </p>
              </div>
            )}
          </CardContent>

          <div className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-3 px-4 py-4 border-t">
            <p className="text-muted-foreground text-sm">
              {filteredCards.length
                ? `Showing ${pageStart + 1}–${Math.min(
                    pageStart + PAGE_SIZE,
                    filteredCards.length,
                  )} of ${filteredCards.length}`
                : "Showing 0 cards"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
              >
                <ChevronLeft className="mr-1 size-4" />
                Previous
              </Button>
              <span className="min-w-20 text-muted-foreground text-sm text-center">
                {safePage} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                disabled={safePage >= pageCount}
              >
                Next
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Dialog
        open={Boolean(selectedCard)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCard(null);
            setSaveFeedback(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          {selectedCard ? (
            <div className="gap-6 grid lg:grid-cols-[minmax(260px,360px)_1fr]">
              <div className="space-y-3">
                <div className="bg-black/10 dark:bg-black/30 shadow-sm p-2 border rounded-xl aspect-[744/1039] overflow-hidden">
                  <CardArtworkImage
                    key={
                      selectedCard.artwork?.imageUrl ?? selectedCard.primaryCode
                    }
                    card={selectedCard}
                    className="rounded-lg"
                  />
                </div>

                {selectedCard.artwork?.artist ? (
                  <p className="text-muted-foreground text-xs text-center">
                    Art by {selectedCard.artwork.artist}
                  </p>
                ) : null}
              </div>

              <div className="space-y-6 min-w-0">
                <DialogHeader>
                  <div className="flex flex-wrap items-center gap-2 pr-8">
                    <Badge variant="secondary">{selectedCard.setCode}</Badge>
                    <StatusBadge status={selectedCard.status} />
                  </div>
                  <DialogTitle className="pt-2 text-2xl">
                    {selectedCard.name}
                  </DialogTitle>
                  <DialogDescription className="font-mono break-all">
                    {selectedCard.gameplayIdentity}
                  </DialogDescription>
                </DialogHeader>

                <div className="gap-3 grid sm:grid-cols-2 xl:grid-cols-4">
                  <div className="bg-muted/20 p-3 border rounded-lg">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Printing code
                    </p>
                    <p className="mt-1 font-medium text-sm">
                      {selectedCard.artwork?.publicCode ??
                        selectedCard.printingCodes.join(", ")}
                    </p>
                  </div>
                  <div className="bg-muted/20 p-3 border rounded-lg">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Card type
                    </p>
                    <p className="mt-1 font-medium text-sm">
                      {[
                        selectedCard.artwork?.supertype,
                        selectedCard.artwork?.type,
                      ]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </p>
                  </div>
                  <div className="bg-muted/20 p-3 border rounded-lg">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Canonical model
                    </p>
                    <p className="mt-1 font-medium text-sm">
                      {selectedCard.canonicalModel?.cardCode ?? "Not approved"}
                    </p>
                  </div>
                  <div className="bg-muted/20 p-3 border rounded-lg">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Updated
                    </p>
                    <p className="mt-1 font-medium text-sm">
                      {formatDate(selectedCard.updatedAt)} UTC
                    </p>
                  </div>
                </div>

                {selectedCard.artwork ? (
                  <section className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {selectedCard.artwork.rarity ? (
                        <Badge variant="outline">
                          {selectedCard.artwork.rarity}
                        </Badge>
                      ) : null}
                      {selectedCard.artwork.domains.map((domain) => (
                        <Badge key={domain} variant="secondary">
                          {domain}
                        </Badge>
                      ))}
                      {selectedCard.artwork.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {selectedCard.artwork.rulesText ? (
                      <div className="bg-muted/20 p-4 border rounded-lg">
                        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          Card text
                        </p>
                        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
                          {selectedCard.artwork.rulesText}
                        </p>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <Separator />

                <section className="space-y-4 bg-muted/10 p-4 border rounded-xl">
                  <div>
                    <h3 className="font-semibold">Manual validation</h3>
                    <p className="text-muted-foreground text-sm">
                      Update workflow gates and record the latest manual gameplay
                      validation note.
                    </p>
                  </div>

                  <div className="gap-3 grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-background/40 p-3 border rounded-lg">
                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium">Card workflow status</span>
                      <Select
                        value={cardStatusDraft}
                        onValueChange={setCardStatusDraft}
                        disabled={Boolean(savingTarget)}
                      >
                        <SelectTrigger aria-label="Card workflow status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((status) => (
                            <SelectItem key={status} value={status}>
                              {getStatusMeta(status).label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="space-y-1.5 text-sm">
                      <span className="font-medium">Validation note (optional)</span>
                      <Input
                        value={cardNoteDraft}
                        onChange={(event) => setCardNoteDraft(event.target.value)}
                        placeholder="What was verified?"
                        disabled={Boolean(savingTarget)}
                      />
                    </label>

                    <div className="flex sm:justify-end sm:col-span-2">
                      <Button
                        type="button"
                        onClick={saveCardStatus}
                        disabled={Boolean(savingTarget)}
                      >
                        {savingTarget === "card" ? "Saving..." : "Save card status"}
                      </Button>
                    </div>
                  </div>

                  {selectedCard.familyStatuses.length ? (
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-sm">Behavior families</h4>
                        <p className="mt-1 text-muted-foreground text-xs">
                          Only existing behavior families can be updated here.
                        </p>
                      </div>

                      {selectedCard.familyStatuses.map((family) => {
                        const draft = familyDrafts[family.familyId] ?? {
                          status: family.status,
                          note: family.note ?? "",
                        };
                        const target = `family:${family.familyId}`;

                        return (
                          <div
                            key={`${selectedCard.gameplayIdentity}-${family.familyId}`}
                            className="space-y-3 bg-background/40 p-3 border rounded-lg"
                          >
                            <div className="flex sm:flex-row flex-col sm:justify-between sm:items-start gap-2">
                              <div>
                                <p className="font-mono font-medium text-sm break-all">
                                  {family.familyId}
                                </p>
                                <p className="mt-1 text-muted-foreground text-xs">
                                  Current: {getStatusMeta(family.status).label} · Updated {formatDate(family.updatedAt)} UTC
                                </p>
                              </div>
                              <StatusBadge status={family.status} />
                            </div>

                            <div className="gap-3 grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                              <label className="space-y-1.5 text-sm">
                                <span className="font-medium">Family status</span>
                                <Select
                                  value={draft.status}
                                  onValueChange={(status) =>
                                    updateFamilyDraft(family.familyId, { status })
                                  }
                                  disabled={Boolean(savingTarget)}
                                >
                                  <SelectTrigger aria-label={`${family.familyId} status`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {statusOptions.map((status) => (
                                      <SelectItem key={status} value={status}>
                                        {getStatusMeta(status).label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </label>

                              <label className="space-y-1.5 text-sm">
                                <span className="font-medium">Validation note (optional)</span>
                                <Input
                                  value={draft.note}
                                  onChange={(event) =>
                                    updateFamilyDraft(family.familyId, {
                                      note: event.target.value,
                                    })
                                  }
                                  placeholder="What was verified?"
                                  disabled={Boolean(savingTarget)}
                                />
                              </label>
                            </div>

                            <div className="flex sm:justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => saveFamilyStatus(family.familyId)}
                                disabled={Boolean(savingTarget)}
                              >
                                {savingTarget === target ? "Saving..." : "Save family status"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 border border-dashed rounded-lg text-muted-foreground text-sm text-center">
                      This card is not currently linked to a behavior family.
                    </div>
                  )}

                  {saveFeedback ? (
                    <p
                      aria-live="polite"
                      className={
                        saveFeedback.kind === "error"
                          ? "text-destructive text-sm"
                          : "text-emerald-600 dark:text-emerald-300 text-sm"
                      }
                    >
                      {saveFeedback.message}
                    </p>
                  ) : null}
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <h3 className="font-semibold">Implementation history</h3>
                    <p className="text-muted-foreground text-sm">
                      Recorded canonical approvals and family status changes.
                    </p>
                  </div>

                  {selectedCard.history.length ? (
                    <div className="space-y-3">
                      {[...selectedCard.history]
                        .sort(
                          (left, right) =>
                            new Date(right.at).getTime() -
                            new Date(left.at).getTime(),
                        )
                        .map((entry, index) => (
                          <div
                            key={`${entry.at}-${entry.event}-${index}`}
                            className="relative pl-6"
                          >
                            <span className="top-1.5 left-0 absolute bg-primary rounded-full size-2" />
                            {index < selectedCard.history.length - 1 ? (
                              <span className="top-4 bottom-[-18px] left-[3px] absolute bg-border w-px" />
                            ) : null}
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-sm">
                                  {humanize(entry.event)}
                                </p>
                                <StatusBadge status={entry.status} />
                              </div>
                              {entry.familyId ? (
                                <p className="font-mono text-muted-foreground text-xs break-all">
                                  {entry.familyId}
                                </p>
                              ) : null}
                              {entry.note ? (
                                <p className="text-muted-foreground text-sm">
                                  {entry.note}
                                </p>
                              ) : null}
                              <p className="text-muted-foreground text-xs">
                                {formatDate(entry.at)} UTC
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="p-6 border border-dashed rounded-lg text-muted-foreground text-sm text-center">
                      No implementation events have been recorded.
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
