/** The ShopOS emblem (public/logo-emblem.png). Works on light and dark themes: the emblem carries its own dark tile. */
export function BrandMark({ className = 'w-8 h-8 rounded-lg' }: { className?: string }) {
  return <img src="/logo-emblem.png" alt="ShopOS" width={64} height={64} className={`object-contain ${className}`} draggable={false} />;
}
