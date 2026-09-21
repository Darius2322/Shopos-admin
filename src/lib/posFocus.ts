import { create } from 'zustand';

/**
 * Focus POS mode hides ShopOS's normal navigation so a customer standing
 * in front of the screen sees only the sale in progress, not the rest of
 * the business-management app. This is a UI-only mode, not a security
 * boundary — it doesn't change what the signed-in user can access, only
 * what's visible on screen. Exiting focus mode (or navigating away from
 * /pos) restores the normal shell.
 */
export const usePosFocus = create<{ focused: boolean; enter: () => void; exit: () => void }>((set) => ({
  focused: false,
  enter: () => set({ focused: true }),
  exit: () => set({ focused: false })
}));
