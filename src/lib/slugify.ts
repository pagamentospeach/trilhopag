export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export function randomSuffix(length = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function uniqueSlug<T>(
  base: string,
  exists: (slug: string) => Promise<T | null>,
): Promise<string> {
  const seed = slugify(base) || "item";
  if (!(await exists(seed))) return seed;
  for (let i = 0; i < 5; i++) {
    const candidate = `${seed}-${randomSuffix(4)}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${seed}-${randomSuffix(8)}`;
}
