'use client';

import React, { useState } from 'react';

interface UserAvatarProps {
  user: {
    avatar_url?: string | null;
    full_name?: string | null;
    nickname?: string | null;
  };
  size?: 'sm' | 'md' | 'lg' | 'lg2' | 'xl' | '2xl' | '3xl';
  className?: string;
  borderColor?: string; // Optional custom border color for podium/leaderboard matching
}

const SIZE_MAP = {
  sm:  'w-8 h-8 text-[11px]',
  md:  'w-9 h-9 text-[13px]',
  lg:  'w-10 h-10 text-[14px]',
  lg2: 'w-12 h-12 text-[16px]',
  xl:  'w-16 h-16 text-[22px]',
  '2xl': 'w-20 h-20 text-[28px]',
  '3xl': 'w-24 h-24 text-[32px]',
};

/**
 * Converts a display name or nickname to a candidate static avatar URL.
 *
 * Resolution order:
 *  1. `user.avatar_url` — explicit DB value (Supabase storage or external URL)
 *  2. `/avatars/<firstname>.jpg` — local static file matched by first name (lowercase)
 *  3. Initials circle fallback (CEFF00 on dark bg)
 *
 * All 8 local photos are stored in `public/avatars/` with lowercase filenames:
 *   ashray.jpg  mourya.jpg  narri.jpg  nithin.jpg
 *   rahul.jpg   rakesh.jpg  srihitha.jpg  vinay.jpg
 *
 * The `getStaticAvatarPath` helper tries the first name extracted from
 * `full_name` or `nickname` — e.g. "Nithin Kotha" → "/avatars/nithin.jpg".
 * Next.js serves anything in `public/` at the root path with no import needed.
 */
function getStaticAvatarPath(user: UserAvatarProps['user']): string | null {
  const rawName = user.full_name || user.nickname || '';
  if (!rawName) return null;

  // Use the first token of the full name or nickname
  const firstName = rawName.trim().split(/\s+/)[0].toLowerCase();
  if (!firstName) return null;

  // Try .jpg first (all our current assets are JPEG)
  return `/avatars/${firstName}.jpg`;
}

/**
 * Reusable user avatar badge with three-tier resolution:
 *  1. Explicit avatar_url from DB
 *  2. Static local photo matched by first name
 *  3. Initials circle fallback
 *
 * Uses an `imgError` state to catch broken image loads and instantly
 * fall back to initials — no broken image icon ever shown.
 */
export default function UserAvatar({ user, size = 'md', className = '', borderColor }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const displayName = user.nickname || user.full_name || 'Athlete';

  // Get initials (up to 2 characters)
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  // ── Tier 1: explicit DB URL ────────────────────────────────────────────
  const dbUrl = user.avatar_url;
  const isDbUrlValid = dbUrl &&
                       dbUrl.startsWith('http') &&
                       !dbUrl.includes('dummy.jpg') &&
                       !dbUrl.includes('placeholder');

  // ── Tier 2: static local photo ────────────────────────────────────────
  const staticPath = !isDbUrlValid ? getStaticAvatarPath(user) : null;

  // Resolved image src: db url → static path → null (show initials)
  const imgSrc = isDbUrlValid ? dbUrl : staticPath;
  const showImage = !!imgSrc && !imgError;

  const sizeClass   = SIZE_MAP[size];
  const borderStyles = borderColor ? { border: `2.5px solid ${borderColor}` } : {};

  return (
    <div
      className={`rounded-full flex-shrink-0 flex items-center justify-center font-black select-none overflow-hidden transition-transform duration-200 ease-out relative ${sizeClass} ${
        showImage 
          ? (loaded ? 'bg-zinc-800' : 'bg-slate-800 animate-pulse') 
          : 'bg-gradient-to-br from-zinc-900 to-black text-[#CEFF00] border border-white/10'
      } ${className}`}
      style={borderStyles}
      aria-label={displayName}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc!}
          alt={displayName}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="tracking-tight">{initials}</span>
      )}
    </div>
  );
}
