import { spawnSync } from "node:child_process";

const checks = [
  ["npm", ["run", "catalog:check-mvp"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["test"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "build"]],
] as const;

for (const [command, args] of checks) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const baseArg = process.argv.find((argument) => argument.startsWith("--base="));
if (baseArg) {
  const base = baseArg.slice("--base=".length).trim();
  if (!base) {
    throw new Error("--base requires a git ref or SHA.");
  }

  console.log(`\n> git diff --check ${base}...HEAD`);
  const result = spawnSync("git", ["diff", "--check", `${base}...HEAD`], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} else {
  console.log(
    "\nSkipped git diff --check because no --base=<ref> argument was provided.",
  );
}

console.log("\nPR verification completed successfully.");
