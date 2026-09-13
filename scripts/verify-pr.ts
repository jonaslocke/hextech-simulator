import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const MAX_DIAGNOSTIC_LINES = 80;
const MAX_DIAGNOSTIC_CHARS = 12_000;

const checks = [
  { name: "catalog", command: "npm", args: ["run", "catalog:check-mvp"] },
  { name: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { name: "tests", command: "npm", args: ["test"] },
  { name: "lint", command: "npm", args: ["run", "lint"] },
  { name: "build", command: "npm", args: ["run", "build"] },
] as const;

const base = process.argv
  .find((argument) => argument.startsWith("--base="))
  ?.slice("--base=".length)
  .trim();

const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const logDirectory = path.join(".agent-work", "verify", runId);
await mkdir(logDirectory, { recursive: true });

for (const check of checks) {
  const result = await runCheck(check.name, check.command, [...check.args]);
  if (!result.ok) fail(check.name, result);
  console.log(`✓ ${check.name}`);
}

if (base) {
  const result = await runCheck("diff-check", "git", [
    "diff",
    "--check",
    `${base}...HEAD`,
  ]);
  if (!result.ok) fail("diff-check", result);
  console.log("✓ diff-check");
} else {
  console.log("- diff-check (no --base=<ref>)");
}

console.log(`\nPR verification passed. Full logs: ${logDirectory}`);

async function runCheck(name: string, command: string, args: string[]) {
  const logPath = path.join(logDirectory, `${name}.log`);
  const log = createWriteStream(logPath, { encoding: "utf8" });
  const tail = new TailBuffer(MAX_DIAGNOSTIC_LINES, MAX_DIAGNOSTIC_CHARS);

  log.write(`> ${command} ${args.join(" ")}\n\n`);

  const outcome = await new Promise<{ status: number; error?: Error }>((resolve) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      env: { ...process.env, NO_COLOR: process.env.NO_COLOR ?? "1" },
    });

    const capture = (chunk: Buffer | string) => {
      const text = chunk.toString();
      log.write(text);
      tail.push(text);
    };

    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.on("error", (error) => resolve({ status: 1, error }));
    child.on("close", (code) => resolve({ status: code ?? 1 }));
  });

  if (outcome.error) {
    const message = `${outcome.error.name}: ${outcome.error.message}\n`;
    log.write(message);
    tail.push(message);
  }

  await new Promise<void>((resolve) => log.end(resolve));

  return {
    ok: outcome.status === 0 && !outcome.error,
    status: outcome.status,
    logPath,
    diagnostic: tail.text(),
  };
}

function fail(
  name: string,
  result: { status: number; logPath: string; diagnostic: string },
): never {
  console.error(`✗ ${name}`);
  if (result.diagnostic.trim()) {
    console.error(`\n${result.diagnostic.trimEnd()}`);
  }
  console.error(`\nFull log: ${result.logPath}`);
  process.exit(result.status || 1);
}

class TailBuffer {
  private lines: string[] = [];
  private partial = "";

  constructor(
    private readonly maxLines: number,
    private readonly maxChars: number,
  ) {}

  push(chunk: string) {
    const parts = (this.partial + chunk).split(/\r?\n/);
    this.partial = parts.pop() ?? "";
    this.lines.push(...parts);

    if (this.lines.length > this.maxLines) {
      this.lines.splice(0, this.lines.length - this.maxLines);
    }

    this.trimChars();
  }

  text() {
    const complete = [...this.lines, ...(this.partial ? [this.partial] : [])];
    return complete.join("\n").slice(-this.maxChars);
  }

  private trimChars() {
    while (
      this.lines.join("\n").length > this.maxChars &&
      this.lines.length > 1
    ) {
      this.lines.shift();
    }
  }
}
