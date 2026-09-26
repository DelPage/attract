/**
 * Favorites and recently played. Kept in WebView storage and mirrored to the
 * native host (which writes it to the app's LocalState) so a cleared WebView
 * profile can be restored on the next launch.
 */
import { postNative } from './bridge';

const KEY = 'attract.user.v1';
const MAX_RECENT = 30;

export interface UserState { favorites: string[]; recent: { id: string; at: number }[] }

const empty = (): UserState => ({ favorites: [], recent: [] });

function sanitize(value: unknown): UserState {
  if (!value || typeof value !== 'object') return empty();
  const v = value as Partial<UserState>;
  const favorites = Array.isArray(v.favorites) ? v.favorites.filter((x): x is string => typeof x === 'string') : [];
  const recent = Array.isArray(v.recent)
    ? v.recent.filter((r) => r && typeof r.id === 'string' && Number.isFinite(r.at)).slice(0, MAX_RECENT)
    : [];
  return { favorites: [...new Set(favorites)], recent };
}

function read(): UserState {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return empty(); }
}

let state: UserState = read();

function write(next: UserState): void {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* the native mirror still holds it */ }
  postNative({ type: 'user-state', state: next });
}

export const userState = (): UserState => state;
export const isFavorite = (id: string): boolean => state.favorites.includes(id);

export function toggleFavorite(id: string): boolean {
  const on = !isFavorite(id);
  write({ ...state, favorites: on ? [id, ...state.favorites] : state.favorites.filter((f) => f !== id) });
  return on;
}

export function markPlayed(id: string, at = Date.now()): void {
  write({ ...state, recent: [{ id, at }, ...state.recent.filter((r) => r.id !== id)].slice(0, MAX_RECENT) });
}

/** Native host hands back its saved copy at startup; keep whichever has more history. */
export function restoreUserState(value: unknown): void {
  const saved = sanitize(value);
  const score = (s: UserState) => s.favorites.length + s.recent.length;
  if (score(saved) > score(state)) write(saved);
}
