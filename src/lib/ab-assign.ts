import { createHash } from "node:crypto";

export function deterministicVariantId<T extends { id: string; weight: number }>(
  variants: T[],
  visitorKey: string,
): T | null {
  if (variants.length === 0) return null;
  const totalWeight = variants.reduce((s, v) => s + Math.max(1, v.weight), 0);
  const hash = createHash("sha256")
    .update(visitorKey)
    .digest("hex")
    .slice(0, 8);
  const slot = parseInt(hash, 16) % totalWeight;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(1, v.weight);
    if (slot < acc) return v;
  }
  return variants[variants.length - 1];
}
