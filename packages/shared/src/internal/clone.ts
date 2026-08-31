/**
 * Deep clone for plain JSON data.
 *
 * `structuredClone` is a host global, and this package compiles with
 * `"lib": ["ES2023"]` and `"types": []` so it stays usable from both Node and
 * the browser without either environment's type surface leaking in. The values
 * cloned here — configuration objects and request bodies — are JSON by
 * construction, so a structural walk is sufficient and total.
 */

export function deepCloneJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item: unknown) => deepCloneJson(item)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    // Skip the two keys that could otherwise re-attach a prototype when the
    // clone is later written into with a computed key.
    if (key === '__proto__' || key === 'constructor') continue;
    out[key] = deepCloneJson(item);
  }
  return out as T;
}
