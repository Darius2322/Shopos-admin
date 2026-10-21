/** Stable, colourful icon tints for menu tiles. Inline colours (not theme tokens) so every tile keeps its own
 * hue in both Light and Dark; the tinted background is the same colour at low opacity. */
const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#6366f1', '#f97316', '#06b6d4', '#84cc16', '#d946ef'];

export function tileColor(key: string): { color: string; bg: string } {
  let h = 7;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = PALETTE[h % PALETTE.length];
  return { color, bg: `${color}26` }; // 0x26 ≈ 15% opacity
}
