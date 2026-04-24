function clean(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export function getModel(): string {
  const model = clean(process.env.ANTHROPIC_MODEL);
  if (!model) {
    throw new Error("ANTHROPIC_MODEL must be set for the analyze route.");
  }
  return model;
}
