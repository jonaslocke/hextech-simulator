import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { Db } from "mongodb";
import {
  createGameRepositories,
  gameCollectionNames
} from "../src/server/game";

test("game uses the canonical persistence collections", () => {
  const names: string[] = [];
  const db = {
    collection(name: string) {
      names.push(name);
      return {};
    }
  } as unknown as Db;

  createGameRepositories(db);

  assert.deepEqual(names, [
    "matches",
    "games",
    "gameEvents",
    "deckSnapshots"
  ]);
  assert.deepEqual(names, Object.values(gameCollectionNames));
});

test("only canonical game and simulator paths remain", async () => {
  const removedPaths = [
    ["src", "features", ["game-board", "v2"].join("-")],
    ["src", "features", ["match-simulator", "v2"].join("-")],
    ["src", "server", ["game", "v2"].join("-")],
    ["src", "app", "legacy"],
    ["src", "app", "api", "v2", "matches"]
  ].map((parts) => path.join(process.cwd(), ...parts));

  assert.deepEqual(
    await Promise.all(removedPaths.map((entry) => exists(entry))),
    removedPaths.map(() => false)
  );
});

test("canonical game surfaces do not reference removed implementations", async () => {
  const roots = [
    path.join(process.cwd(), "src", "app"),
    path.join(process.cwd(), "src", "features", "game-board"),
    path.join(process.cwd(), "src", "features", "match-simulator"),
    path.join(process.cwd(), "src", "server", "game"),
    path.join(process.cwd(), "src", "shared")
  ];
  const forbidden = [
    ["game-board", "v2"].join("-"),
    ["match-simulator", "v2"].join("-"),
    ["game", "v2"].join("-"),
    ["api", "v2", "matches"].join("/"),
    ["legacy", "board", "adapter"].join("-")
  ];
  const violations: string[] = [];

  for (const file of (await Promise.all(roots.map(collect))).flat()) {
    const source = await readFile(file, "utf8");

    for (const fragment of forbidden) {
      if (source.toLowerCase().includes(fragment)) {
        violations.push(`${path.relative(process.cwd(), file)}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

async function exists(entry: string) {
  try {
    await access(entry);
    return true;
  } catch {
    return false;
  }
}

async function collect(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (/\.tsx?$/.test(fullPath)) files.push(fullPath);
  }

  return files;
}
