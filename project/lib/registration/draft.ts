const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface RegistrationDraft<T> {
  version: 1;
  step: number;
  savedAt: number;
  data: T;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readRegistrationDraft<T>(key: string): RegistrationDraft<T> | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<RegistrationDraft<T>>;
    if (draft.version !== 1 || typeof draft.savedAt !== 'number' || !draft.data) return null;
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return draft as RegistrationDraft<T>;
  } catch {
    return null;
  }
}

export function writeRegistrationDraft<T>(key: string, step: number, data: T): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ version: 1, step, savedAt: Date.now(), data }));
  } catch {
    // Private browsing and storage quotas must never break registration.
  }
}

export function clearRegistrationDraft(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Storage is an optional convenience, never a registration dependency.
  }
}
