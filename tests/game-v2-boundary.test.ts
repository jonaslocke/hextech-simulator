import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createGameV2Repositories, gameV2CollectionNames } from "../src/server/game-v2";
import type { Db } from "mongodb";

test("game v2 uses independent persistence collections", () => {
  const names: string[] = [];
  const db = { collection(name: string) { names.push(name); return {}; } } as unknown as Db;
  createGameV2Repositories(db);
  assert.deepEqual(names, Object.values(gameV2CollectionNames));
});

test("game v2 does not import the legacy engine or match domain", async () => {
  const files = await collect(path.join(process.cwd(), "src", "server", "game-v2"));
  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const forbidden of ["@/server/match", "../match", "@/server/engine", "../engine"]) {
      if (source.includes(`from \"${forbidden}`) || source.includes(`from '${forbidden}`)) {
        violations.push(`${path.relative(process.cwd(), file)} imports ${forbidden}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

async function collect(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (entry.isFile() && fullPath.endsWith(".ts")) files.push(fullPath);
  }
  return files;
}
