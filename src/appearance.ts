import { useSyncExternalStore, type CSSProperties } from 'react';

export interface ChatAppearance {
  animations: boolean;
  wallpaper: boolean;
  wallpaperDim: number;
  wallpaperBlur: number;
  wallpaperPosition: number;
  wallpaperFit: 'cover' | 'contain';
  fontSize: number;
  lineHeight: number;
  fontFamily: 'sans' | 'serif';
  textColor: string;
  italicColor: string;
  boldColor: string;
  quoteColor: string;
  linkColor: string;
}

export const defaultAppearance: ChatAppearance = {
  animations: true, wallpaper: false, wallpaperDim: 82, wallpaperBlur: 2, wallpaperPosition: 35, wallpaperFit: 'cover',
  fontSize: 18, lineHeight: 1.7, fontFamily: 'sans',
  textColor: '#e5e7eb', italicColor: '#b5bac4', boldColor: '#f5f5f5',
  quoteColor: '#c2c6cf', linkColor: '#dce1eb'
};
const storageKey = 'larsta-chat-appearance-v1';
const listeners = new Set<() => void>();
const colorKeys = ['textColor', 'italicColor', 'boldColor', 'quoteColor', 'linkColor'] as const;
function normalize(value: unknown): ChatAppearance {
  const result = { ...defaultAppearance };
  if (!value || typeof value !== 'object') return result;
  const input = value as Partial<ChatAppearance>;
  if (typeof input.fontSize === 'number' && Number.isFinite(input.fontSize)) result.fontSize = Math.min(26, Math.max(12, input.fontSize));
  if (typeof input.lineHeight === 'number' && Number.isFinite(input.lineHeight)) result.lineHeight = Math.min(2.3, Math.max(1.3, input.lineHeight));
  if (typeof input.animations === 'boolean') result.animations = input.animations;
  if (typeof input.wallpaper === 'boolean') result.wallpaper = input.wallpaper;
  for (const [key, max] of [['wallpaperDim', 100], ['wallpaperBlur', 20], ['wallpaperPosition', 100]] as const) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.min(max, Math.max(0, value));
  }
  if (input.wallpaperFit === 'contain') result.wallpaperFit = 'contain';
  if (input.fontFamily === 'serif') result.fontFamily = 'serif';
  for (const key of colorKeys) if (typeof input[key] === 'string' && /^#[\da-f]{6}$/i.test(input[key])) result[key] = input[key];
  return result;
}
function read(): ChatAppearance {
  try { return normalize(JSON.parse(localStorage.getItem(storageKey) || 'null')); }
  catch { return { ...defaultAppearance }; }
}
let current = read();
let storageFailed = false;
window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== null) return;
  current = read();
  listeners.forEach(listener => listener());
});
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function update(changes: Partial<ChatAppearance>) {
  current = normalize({ ...current, ...changes });
  try { localStorage.setItem(storageKey, JSON.stringify(current)); storageFailed = false; }
  catch { storageFailed = true; }
  listeners.forEach(listener => listener());
}
export function useChatAppearance() {
  const appearance = useSyncExternalStore(subscribe, () => current);
  return { appearance, update, reset: () => update(defaultAppearance), storageFailed };
}
export function appearanceStyle(value: ChatAppearance): CSSProperties {
  return {
    '--wallpaper-dim': value.wallpaperDim / 100, '--wallpaper-blur': `${value.wallpaperBlur}px`,
    '--wallpaper-position': `50% ${value.wallpaperPosition}%`, '--wallpaper-fit': value.wallpaperFit,
    '--chat-font-size': `${value.fontSize}px`, '--chat-line-height': value.lineHeight,
    '--chat-font-family': value.fontFamily === 'serif' ? 'Georgia, "Times New Roman", serif' : '"Segoe UI", system-ui, sans-serif',
    '--chat-text-color': value.textColor, '--chat-italic-color': value.italicColor,
    '--chat-bold-color': value.boldColor, '--chat-quote-color': value.quoteColor,
    '--chat-link-color': value.linkColor
  } as CSSProperties;
}
