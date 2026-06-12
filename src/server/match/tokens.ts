import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type AnonymousPlayerToken = {
  token: string;
  tokenHash: string;
};

export function generateAnonymousPlayerToken(): AnonymousPlayerToken {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashPlayerToken(token)
  };
}

export function hashPlayerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyPlayerToken(token: string, tokenHash: string): boolean {
  const actual = Buffer.from(hashPlayerToken(token), "hex");
  const expected = Buffer.from(tokenHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
