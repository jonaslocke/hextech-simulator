import { updateImplementationStatus, implementationStatusSchema } from "../src/server/card-catalog";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";

const positionalArguments = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const setCode = argumentValue("--set") ?? positionalArguments[0];
const statusValue = argumentValue("--status") ?? positionalArguments[1];
const cardCodesValue = argumentValue("--cards") ?? positionalArguments[2];
const familyId = argumentValue("--family") ?? positionalArguments[3];
const note = argumentValue("--note") ?? positionalArguments[4];

if (!setCode || !statusValue || !cardCodesValue) {
  throw new Error(
    "Usage: --set OGN --status manual_family_passed --cards OGN-001,OGN-002 [--family id] [--note text]",
  );
}

const status = implementationStatusSchema.parse(statusValue);
const cardCodes = cardCodesValue.split(",").map((cardCode) => cardCode.trim()).filter(Boolean);
if (cardCodes.length === 0) throw new Error("At least one card code is required.");

const client = await getMongoClient();
try {
  const ledger = await updateImplementationStatus(
    client.db(getMongoDatabaseName()),
    { setCode, status, cardCodes, ...(familyId ? { familyId } : {}), ...(note ? { note } : {}) },
  );
  console.log(`Updated ${cardCodes.length} card(s) in ${ledger.setCode} implementation-status ledger.`);
} finally {
  await client.close();
}

function argumentValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
