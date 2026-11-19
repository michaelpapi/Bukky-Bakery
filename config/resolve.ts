import { clientSchema, type ClientConfig } from './schema';

/** Objects merge recursively. Arrays and primitives from `over` replace `base`. */
export function deepMerge<T = any>(base: any, over: any): T {
  if (Array.isArray(over) || over === null || typeof over !== 'object') return (over === undefined ? base : over) as T;
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return over as T;
  const out: any = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out as T;
}

export interface WorldFile {
  world: string;
  /** style defaults merged into every section of that type, e.g. { products: { layout: "menu" } } */
  sectionDefaults?: Record<string, Record<string, unknown>>;
  /** section types a client of this world must have */
  requiredSections?: string[];
  [key: string]: unknown;
}

/** world defaults + client overrides -> validated config. Throws a ZodError with exact paths. */
export function resolveClient(world: WorldFile, client: any): ClientConfig {
  const { sectionDefaults = {}, requiredSections = [], ...worldDefaults } = world;
  if (client.world !== world.world) throw new Error(`client.world "${client.world}" does not match world file "${world.world}"`);
  const merged = deepMerge<any>(worldDefaults, { ...client, sections: undefined });
  merged.sections = (client.sections ?? []).map((s: any) => deepMerge(sectionDefaults[s.type] ?? {}, s));
  const parsed = clientSchema.parse(merged);

  const have = new Set(parsed.sections.filter((s) => s.enabled).map((s) => s.type));
  const missing = requiredSections.filter((t) => !have.has(t as any));
  if (missing.length) throw new Error(`world "${world.world}" requires sections: ${missing.join(', ')}`);
  return parsed;
}
