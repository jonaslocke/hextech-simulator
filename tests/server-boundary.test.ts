import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const forbiddenImports = [
  "next",
  "next/",
  "react",
  "react/",
  "react-dom",
  "react-dom/"
];

test("pure server modules do not import Next.js or React", async () => {
  const files = await collectTypeScriptFiles(path.join(process.cwd(), "src", "server"));
  const violations: string[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");

    for (const importPath of findImportPaths(source)) {
      if (forbiddenImports.some((forbidden) => importPath === forbidden || importPath.startsWith(forbidden))) {
        violations.push(`${path.relative(process.cwd(), file)} imports ${importPath}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

async function collectTypeScriptFiles(root: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(fullPath)));
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function findImportPaths(source: string): string[] {
  const paths: string[] = [];
  const staticImportPattern = /import(?:\s+type)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const dynamicImportPattern = /import\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(staticImportPattern)) {
    paths.push(match[1]);
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    paths.push(match[1]);
  }

  return paths;
}
