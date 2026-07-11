'use client';

import React from 'react';

interface UserAvatarProps {
  user: {
    avatar_url?: string | null;
    full_name?: string | null;
    nickname?: string | null;
  };
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  borderColor?: string; // Optional custom border color for podium/leaderboard matching
}

const SIZE_MAP = {
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-9 h-9 text-[13px]',
  lg: 'w-10 h-10 text-[14px]',
  xl: 'w-16 h-16 text-[22px]',
  '2xl': 'w-20 h-20 text-[28px]',
};

/**
 * Reusable user avatar badge featuring smart initials fallback logic and premium aesthetics.
 */
export default function UserAvatar({ user, size = 'md', className = '', borderColor }: UserAvatarProps) {
  const avatarUrl = user.avatar_url;
  const displayName = user.nickname || user.full_name || 'Athlete';

  // Get initials (up to 2 characters)
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  // Check if avatar_url is a real image URL and not a dummy placeholder
  const isImageValid = avatarUrl && 
                       avatarUrl.startsWith('http') && 
                       !avatarUrl.includes('dummy.jpg') && 
                       !avatarUrl.includes('placeholder');

  const sizeClass = SIZE_MAP[size];

  const borderStyles = borderColor 
    ? { border: `2.5px solid ${borderColor}` } 
    : {};

  return (
    <div
      className={`rounded-full flex-shrink-0 flex items-center justify-center font-black select-none overflow-hidden transition-all duration-300 ${sizeClass} ${
        isImageValid ? 'bg-zinc-800' : 'bg-gradient-to-br from-zinc-900 to-black text-[#CEFF00] border border-white/10'
      } ${className}`}
      style={borderStyles}
      aria-label={displayName}
    >
      {isImageValid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback if image fails to load dynamically
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <span className="tracking-tight">{initials}</span>
      )}
    </div>
  );
}
