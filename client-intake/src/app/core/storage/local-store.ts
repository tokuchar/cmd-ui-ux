/**
 * Bezpieczny dostęp do localStorage (tryb prywatny / zablokowane dane → brak zapisu, bez wyjątku).
 * MVP trzyma tu profil, plan, historię wersji planu i logi treningów — docelowo backend.
 */
export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* brak miejsca / zablokowane — dane zostają w pamięci */
  }
}

/** Pobranie pliku JSON w przeglądarce (eksport profilu / planu). */
export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const STORAGE_KEYS = {
  profile: 'athlete-profile-v1',
  plan: 'athlete-plan-v1',
  planHistory: 'athlete-plan-history-v1',
  log: 'athlete-training-log-v1',
  events: 'athlete-plan-events-v1',
  regens: 'athlete-plan-regens-v1',
  daily: 'athlete-daily-log-v1',
} as const;
