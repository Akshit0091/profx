import { useState, useEffect, useCallback } from 'react';
import { getActivePlatform, setActivePlatform } from './api';

// Display metadata for each platform.
export const PLATFORM_META = {
  flipkart: { label: 'Flipkart', short: 'FK', color: '#2874f0', emoji: '🛒', logo: '/flipkart.jpg' },
  meesho:   { label: 'Meesho',   short: 'ME', color: '#f43397', emoji: '🛍️', logo: '/Meesho_logo.png' },
  amazon:   { label: 'Amazon',   short: 'AZ', color: '#ff9900', emoji: '📦', logo: '/Amazon_icon.svg' },
};

export const PLATFORM_ORDER = ['flipkart', 'meesho', 'amazon'];

// Pseudo-platform: the combined "All platforms" view.
export const ALL_PLATFORM = 'all';
export const ALL_META = { label: 'All Platforms', short: 'ALL', color: '#6366f1', emoji: '🌐' };

// Given a user's plans array, return the platform keys they can access, in order.
export function platformsForUser(user) {
  if (!user) return [];
  if (user.isAdmin) return [...PLATFORM_ORDER];
  const plans = Array.isArray(user.plans) ? user.plans : [];
  return PLATFORM_ORDER.filter((p) => plans.includes(p));
}

// True only when the user owns ALL three platforms (or is admin).
// Gates the combined "All" view.
export function ownsAllPlatforms(user) {
  if (user && user.isAdmin) return true;
  const owned = platformsForUser(user);
  return PLATFORM_ORDER.every((p) => owned.includes(p));
}

// React hook for reading + switching the active platform.
// Falls back to the first platform the user owns if the stored one isn't allowed.
// When the user owns all three, 'all' is offered as a leading option.
export function useActivePlatform(user) {
  const base = platformsForUser(user);
  const canAll = ownsAllPlatforms(user);
  // 'all' leads the list for all-three users.
  const allowed = canAll ? [ALL_PLATFORM, ...base] : base;

  const [platform, setPlatformState] = useState(() => {
    const stored = getActivePlatform();
    if (allowed.length && !allowed.includes(stored)) return allowed[0];
    return stored;
  });

  // If the user's allowed platforms change (e.g. after upgrade) and the current
  // selection is no longer valid, snap to the first allowed one.
  useEffect(() => {
    if (allowed.length && !allowed.includes(platform)) {
      const next = allowed[0];
      setActivePlatform(next);
      setPlatformState(next);
    }
  }, [allowed, platform]);

  const switchPlatform = useCallback((next) => {
    if (!allowed.includes(next)) return;
    setActivePlatform(next);
    setPlatformState(next);
    // Reload so all data refetches under the new platform header.
    window.location.reload();
  }, [allowed]);

  return { platform, switchPlatform, allowed, canAll };
}
