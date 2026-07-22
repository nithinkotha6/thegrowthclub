'use client';

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * PWAInstallPrompt — Captures Chrome's `beforeinstallprompt` event
 * and renders a high-visibility install popup banner for desktop & mobile Chrome.
 */
export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Skip if already in standalone PWA mode
    if (
      typeof window === 'undefined' ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      return;
    }

    // Check if dismissed recently (within 24 hours)
    const lastDismissed = localStorage.getItem('pwa_prompt_dismissed');
    if (lastDismissed) {
      const dismissedTime = parseInt(lastDismissed, 10);
      if (Date.now() - dismissedTime < 24 * 60 * 60 * 1000) {
        return;
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show native Chrome prompt
    await deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === 'accepted') {
      console.log('[PWA] User accepted Chrome install prompt');
    } else {
      console.log('[PWA] User dismissed Chrome install prompt');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
  };

  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div
      className="fixed bottom-4 right-4 left-4 md:left-auto md:max-w-sm z-50 animate-in slide-in-from-bottom-5 duration-300"
      role="dialog"
      aria-label="Install App"
    >
      <div className="bg-[#111111] border-2 border-[#CEFF00]/40 text-white rounded-2xl p-4 shadow-2xl shadow-black/80 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="Growth Club App Icon"
              className="w-12 h-12 rounded-xl object-cover border border-[#CEFF00]/30 shadow-md flex-shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <h3 className="text-sm font-black text-white uppercase tracking-tight leading-none">
                Install Growth Club App
              </h3>
              <p className="text-[11px] font-medium text-[#9CA3AF] mt-1 leading-snug">
                Install on your device for quick full-screen access.
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-[#9CA3AF] hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleInstallClick}
            className="flex-1 bg-[#CEFF00] hover:bg-[#b8e600] text-black font-black text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer active:scale-95 min-h-[40px]"
          >
            <Download size={15} strokeWidth={2.5} />
            Install App
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2.5 bg-white/5 hover:bg-white/10 text-[#9CA3AF] hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer min-h-[40px]"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
