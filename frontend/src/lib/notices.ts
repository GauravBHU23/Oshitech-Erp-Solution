const NEW_NOTICE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isNewNotice(publishOn: string | null | undefined, now = Date.now()) {
  if (!publishOn) return false;

  const publishedAt = Date.parse(`${publishOn.slice(0, 10)}T00:00:00Z`);
  const age = now - publishedAt;
  return Number.isFinite(publishedAt) && age >= 0 && age < NEW_NOTICE_WINDOW_MS;
}
