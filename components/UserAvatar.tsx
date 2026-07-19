'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';

interface UserAvatarProps {
  user: {
    avatar_url?: string | null;
    full_name?: string | null;
    nickname?: string | null;
  };
  size?: 'sm' | 'md' | 'lg' | 'lg2' | 'xl' | '2xl' | '3xl';
  className?: string;
  borderColor?: string; // Optional custom border color for podium/leaderboard matching
  priority?: boolean;   // Next.js Image priority preloading
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

const SIZE_NUMBERS = {
  sm: 32,
  md: 36,
  lg: 40,
  lg2: 48,
  xl: 64,
  '2xl': 80,
  '3xl': 96,
};

function isValidAvatarUrl(url: string | null | undefined): url is string {
  return !!url && url.startsWith('http') && !url.includes('dummy.jpg') && !url.includes('placeholder');
}

export default function UserAvatar({ user, size = 'md', className = '', borderColor, priority = false }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const displayName = user.nickname || user.full_name || 'Athlete';

  // Get initials (up to 2 characters)
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  // Every profile picture lives in Supabase Storage as the single master
  // picture for that person (profiles.avatar_url). No local/static fallback —
  // if it's missing, we show initials.
  const imgSrc = isValidAvatarUrl(user.avatar_url) ? user.avatar_url : null;

  const isRemoteSrc = !!imgSrc;

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setImgError(false);
    setLoaded(false);
  }, [imgSrc]);


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
      {showImage && (
        <Image
          src={imgSrc!}
          alt={displayName}
          width={SIZE_NUMBERS[size]}
          height={SIZE_NUMBERS[size]}
          sizes={`${SIZE_NUMBERS[size]}px`}
          priority={priority}
          className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setImgError(true)}
          unoptimized={!isRemoteSrc}
        />
      )}
      {(!loaded || !showImage) && (
        <span className="tracking-tight absolute inset-0 flex items-center justify-center bg-zinc-800 text-[#CEFF00]">{initials}</span>
      )}
    </div>
  );
}
