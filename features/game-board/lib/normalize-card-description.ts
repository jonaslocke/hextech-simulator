export function normalizeCardText(text: string) {
  const protectedTokens: string[] = [];
  const tokenizedText = text.replace(/:rb_[a-z0-9_]+:/g, (token) => {
    const index = protectedTokens.push(token) - 1;

    return `RBTOKEN${index}RBTOKEN`;
  });

  return tokenizedText
    .replace(/\*\*/g, "")
    .replace(/_ _/g, " ")
    .replace(/(^|\s)_(?=\s|$)/g, "$1")
    .replace(/_\s*(?=[).])/g, "")
    .replace(/([(.])\s*_/g, "$1")
    .replace(/RBTOKEN(\d+)RBTOKEN/g, (_, rawIndex: string) => {
      const token = protectedTokens[Number(rawIndex)];

      return token ?? "";
    })
    .replace(/\s+/g, " ")
    .replace(/\)(?=\[)/g, ")\n")
    .replace(/\)(?=[A-Z])/g, ")\n")
    .replace(/\.(?=\[)/g, ".\n")
    .replace(/\.(?=[A-Z][a-z])/g, ".\n")
    .trim();
}
