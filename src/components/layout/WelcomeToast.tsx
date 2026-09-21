import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';

const SHOWN_KEY = 'shopos:welcomeShownFor';

/**
 * Shows a brief "Welcome back, [name]" once per login session — and, for a
 * profile whose login history suggests this is their very first sign-in
 * (no lastLoginAt recorded before now), a slightly different message
 * introducing their role and branch. Deliberately short and dismisses
 * itself; never blocks the UI underneath it.
 */
export function WelcomeToast() {
  const { profile, business, branches, activeBranchId, userId } = useAuth();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<{ title: string; subtitle: string } | null>(null);

  useEffect(() => {
    if (!profile || !userId) return;
    const shownFor = sessionStorage.getItem(SHOWN_KEY);
    if (shownFor === userId) return;

    const isFirstLogin = !profile.lastLoginAt;
    const branch = branches.find((b) => b.id === activeBranchId);

    if (isFirstLogin) {
      setMessage({
        title: `Welcome to ShopOS, ${profile.fullName.split(' ')[0]}`,
        subtitle: branch ? `You've been assigned to ${branch.name} as ${roleLabel(profile.role)}.` : `You're set up as ${roleLabel(profile.role)}.`
      });
    } else {
      setMessage({
        title: `Welcome back, ${profile.fullName.split(' ')[0]}`,
        subtitle: business?.name ?? ''
      });
    }

    sessionStorage.setItem(SHOWN_KEY, userId);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(timer);
  }, [profile?.id]);

  if (!visible || !message) return null;

  return (
    <div className="fixed top-4 inset-x-0 z-[90] flex justify-center pointer-events-none px-4">
      <div className="card px-4 py-3 shadow-lg animate-welcome-in max-w-sm w-full pointer-events-auto">
        <div className="font-display font-semibold text-sm">{message.title}</div>
        {message.subtitle && <div className="text-xs text-slate-500 mt-0.5">{message.subtitle}</div>}
      </div>
    </div>
  );
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ');
}
