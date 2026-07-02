export function readFeedbackDrafts(storageKey) {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string')
    );
  } catch {
    return {};
  }
}

export function writeFeedbackDrafts(storageKey, drafts) {
  if (typeof window === 'undefined') return;
  try {
    const cleaned = Object.fromEntries(
      Object.entries(drafts || {}).filter(([, value]) => String(value || '').trim())
    );
    if (Object.keys(cleaned).length) {
      window.localStorage.setItem(storageKey, JSON.stringify(cleaned));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Local draft persistence should not block feedback submission.
  }
}
