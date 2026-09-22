import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TypeSafeClient, type EntryType } from "@typesafe-ai/sdk";
import type { MongoClient } from "mongodb";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import { buildCardTriageQuestions } from "./card-jev-triage/questions";
import {
  buildCompactCardTriageOutput,
  decideCardTriageRoute,
} from "./card-jev-triage/routing";
import {
  buildCardJevTriageState,
  buildJevCardRequestState,
  type CardTriageTarget,
} from "./card-jev-triage/state";

const args = parseArguments(process.argv.slice(2));
const mode = args.mode;

if (args.help) {
  printHelp();
  process.exit(0);
}

if (mode === "off") {
  console.log(
    JSON.stringify({
      mode: "off",
      route: "EXISTING_ROUTING",
      instruction:
        "Jev card triage is disabled. Use the existing AGENTS.md specialist routing without Jev evidence.",
    }),
  );
  process.exit(0);
}

const activeMode: "on" | "shadow" = mode === "shadow" ? "shadow" : "on";

let mongoClient: MongoClient | null = null;
let databaseWarning: string | null = null;

try {
  if (!args.offline) {
    try {
      mongoClient = await getMongoClient();
    } catch (error) {
      databaseWarning = errorMessage(error);
    }
  }

  const target = buildTarget(args);
  const state = await buildCardJevTriageState({
    target,
    db: mongoClient?.db(getMongoDatabaseName()) ?? null,
  });
  const artifactPath = buildArtifactPath(state.targetIdentity.cardCode);

  if (state.implementation.status === "executable") {
    await persistArtifact(artifactPath, {
      generatedAt: new Date().toISOString(),
      mode: activeMode,
      databaseWarning,
      state,
      questions: null,
      jev: null,
      decision: {
        route: "ALREADY_IMPLEMENTED",
        reasons: [
          "Canonical source is current and runtime readiness is executable; Jev was not called.",
        ],
      },
    });
    console.log(
      JSON.stringify({
        card: state.targetCard.name,
        cardCode: state.targetIdentity.cardCode,
        implementationStatus: state.implementation.status,
        mode: activeMode,
        route: "ALREADY_IMPLEMENTED",
        artifact: artifactPath,
      }),
    );
    process.exit(0);
  }

  const questions = buildCardTriageQuestions(state);

  try {
    if (!process.env.TYPESAFE_API_KEY?.trim()) {
      throw new Error(
        "TYPESAFE_API_KEY is required for Jev card triage. Set it in .env or the launching environment.",
      );
    }

    const jevState = toJevState(buildJevCardRequestState(state));
    const requestStats = {
      questionCount: Object.keys(questions).length,
      serializedCharacters: JSON.stringify({ state: jevState, questions }).length,
    };

    console.error(
      `[jev] ${requestStats.questionCount} questions, ${requestStats.serializedCharacters} serialized characters`,
    );

    const jev = await new TypeSafeClient().systemOne({
      state: jevState,
      questions,
    });
    const decision = decideCardTriageRoute(state, jev);

    await persistArtifact(artifactPath, {
      generatedAt: new Date().toISOString(),
      mode: activeMode,
      databaseWarning,
      state,
      questions,
      requestStats,
      jev,
      decision,
    });

    console.log(
      JSON.stringify(
        buildCompactCardTriageOutput({
          state,
          mode: activeMode,
          decision,
          artifactPath,
        }),
      ),
    );
  } catch (error) {
    await persistArtifact(artifactPath, {
      generatedAt: new Date().toISOString(),
      mode: activeMode,
      databaseWarning,
      state,
      questions,
      requestStats: {
        questionCount: Object.keys(questions).length,
        serializedCharacters: JSON.stringify({
          state: toJevState(buildJevCardRequestState(state)),
          questions,
        }).length,
      },
      jev: null,
      error: errorMessage(error),
    });
    throw error;
  }
} finally {
  await mongoClient?.close();
}

type ParsedArguments = {
  cardName: string | null;
  publicCode: string | null;
  mode: "on" | "shadow" | "off";
  offline: boolean;
  help: boolean;
};

function parseArguments(argv: string[]): ParsedArguments {
  let cardName: string | null = null;
  let publicCode: string | null = null;
  let mode = readMode(process.env.HEXTECH_JEV_CARD_TRIAGE_MODE ?? "shadow");
  let offline = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--card") {
      cardName = requireArgumentValue(argv, ++index, "--card");
      continue;
    }
    if (argument === "--public-code") {
      publicCode = requireArgumentValue(argv, ++index, "--public-code");
      continue;
    }
    if (argument === "--mode") {
      mode = readMode(requireArgumentValue(argv, ++index, "--mode"));
      continue;
    }
    if (argument === "--offline") {
      offline = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!help && mode !== "off" && Number(Boolean(cardName)) + Number(Boolean(publicCode)) !== 1) {
    throw new Error("Provide exactly one of --card or --public-code.");
  }

  return { cardName, publicCode, mode, offline, help };
}

function buildTarget(args: ParsedArguments): CardTriageTarget {
  if (args.publicCode) return { publicCode: args.publicCode };
  if (args.cardName) return { cardName: args.cardName };
  throw new Error("A target card is required when Jev triage is enabled.");
}

function readMode(value: string): ParsedArguments["mode"] {
  if (value === "on" || value === "shadow" || value === "off") return value;
  throw new Error(
    `Invalid Jev card-triage mode ${JSON.stringify(value)}; expected on, shadow, or off.`,
  );
}

function requireArgumentValue(
  argv: string[],
  index: number,
  option: string,
): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function buildArtifactPath(cardCode: string): string {
  return path.join(
    ".agent-work",
    "card-jev-triage",
    `${cardCode.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}.json`,
  );
}

async function persistArtifact(
  artifactPath: string,
  value: unknown,
): Promise<void> {
  const absolutePath = path.join(process.cwd(), artifactPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}


function toJevState(value: unknown): EntryType {
  return JSON.parse(JSON.stringify(value)) as EntryType;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function printHelp(): void {
  console.log(`Usage:
  npm run card:triage:jev -- --card "Stellacorn Herder"
  npm run card:triage:jev -- --public-code "SFD-048/221"

Options:
  --card <name>          Exact source-card name.
  --public-code <code>   Exact source printing code; use when a name is ambiguous.
  --mode <mode>          on | shadow | off (default: HEXTECH_JEV_CARD_TRIAGE_MODE or shadow).
  --offline              Skip canonical MongoDB implementation-readiness lookup.
  --help                 Show this help.

Modes:
  on      Jev decision routes the card implementation.
  shadow  Jev runs and is persisted, but the compact route remains MOE_DISCOVERY.
  off     Jev and deterministic card-state construction are both skipped.
`);
}
