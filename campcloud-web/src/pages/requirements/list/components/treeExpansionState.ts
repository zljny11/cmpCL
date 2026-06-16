export function loadExpandedKeys(storageKey: string): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function saveExpandedKeys(storageKey: string, keys: React.Key[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(storageKey, JSON.stringify(keys.map((key) => String(key))));
}
