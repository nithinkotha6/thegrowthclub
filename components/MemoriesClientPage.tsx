'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, ChevronLeft, ChevronRight, MessageSquare, Plus, Send, RefreshCw, Heart } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { addMemory, addMemoryComment } from '@/app/actions/memories';
import UserAvatar from '@/components/UserAvatar';

interface Memory {
  id: string;
  image_url?: string | null;
  url?: string | null;
  caption?: string | null;
  created_at: string;
  user_id: string;
  profiles: {
    id: string;
    nickname: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface MemoryComment {
  id: string;
  memory_id: string;
  user_id: string;
  content?: string | null;
  text?: string | null;
  comment?: string | null;
  created_at: string;
  profiles: {
    id: string;
    nickname: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface MemoriesClientPageProps {
  initialMemories: any[];
  initialComments: any[];
  groupId: string;
  userId: string;
  userName: string;
}

/**
 * Client image compression using HTML5 Canvas.
 * Scales down high-res images to max 1200px width/height and compresses to JPEG.
 */
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failure'));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas compression failure'));
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function MemoriesClientPage({
  initialMemories,
  initialComments,
  groupId,
  userId,
  userName,
}: MemoriesClientPageProps) {
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [comments, setComments] = useState<MemoryComment[]>(initialComments);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentInput, setCommentInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [hearts, setHearts] = useState<{ id: number; left: number; delay: number }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const slideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  // ── Mount Floating Hearts Animation ─────────────────────────────────────
  useEffect(() => {
    // Generate 6-8 hearts with random placement and delays
    const newHearts = Array.from({ length: 7 }).map((_, idx) => ({
      id: Date.now() + idx,
      left: Math.random() * 80 + 10, // 10% - 90% view width
      delay: Math.random() * 2.5,     // 0s - 2.5s delay
    }));
    setHearts(newHearts);

    // Clean up hearts after animation completes
    const timer = setTimeout(() => setHearts([]), 5000);
    return () => clearTimeout(timer);
  }, []);

  // ── Slideshow Auto-Advance Loop ─────────────────────────────────────────
  const startSlideshowTimer = () => {
    if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    if (memories.length <= 1) return;

    slideTimerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % memories.length);
    }, 7000);
  };

  useEffect(() => {
    startSlideshowTimer();
    return () => {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    };
  }, [memories]);

  // ── Show Toast Helper ───────────────────────────────────────────────────
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Slideshow Controls ──────────────────────────────────────────────────
  const handlePrev = () => {
    if (memories.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + memories.length) % memories.length);
    startSlideshowTimer(); // Reset auto-timer
  };

  const handleNext = () => {
    if (memories.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % memories.length);
    startSlideshowTimer(); // Reset auto-timer
  };

  // ── Image Upload Handling ───────────────────────────────────────────────
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }

    setIsUploading(true);
    showToast('Compressing image...', 'success');

    try {
      // 1. Compress Image client-side
      const compressedBlob = await compressImage(file);

      // 2. Upload to Supabase Storage
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `${groupId}/${fileName}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('memories')
        .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

      if (uploadErr) {
        throw new Error(uploadErr.message);
      }

      // 3. Retrieve Public URL
      const { data: publicUrlData } = supabase.storage
        .from('memories')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      // 4. Link in database
      const dbRes = await addMemory(publicUrl, groupId, userId);
      if (!dbRes.success) {
        throw new Error(dbRes.error);
      }

      // 5. Update local memory state
      const newMemory: Memory = {
        id: dbRes.memory.id,
        image_url: dbRes.memory.image_url || dbRes.memory.url,
        url: dbRes.memory.url,
        caption: dbRes.memory.caption,
        created_at: dbRes.memory.created_at,
        user_id: dbRes.memory.user_id,
        profiles: {
          id: userId,
          nickname: userName,
          full_name: userName,
          avatar_url: null,
        },
      };

      setMemories((prev) => [newMemory, ...prev]);
      setActiveIndex(0);
      showToast('Memory uploaded successfully!');
    } catch (err: any) {
      console.error('Upload failed detail:', err);
      showToast(`Upload failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Comment Submission Handling ─────────────────────────────────────────
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    const currentMemory = memories[activeIndex];
    if (!currentMemory) return;

    const textToSubmit = commentInput.trim();
    setCommentInput('');

    // Optimistic Client Update
    const optimisticComment: MemoryComment = {
      id: `temp-${Date.now()}`,
      memory_id: currentMemory.id,
      user_id: userId,
      content: textToSubmit,
      created_at: new Date().toISOString(),
      profiles: {
        id: userId,
        nickname: userName,
        full_name: userName,
        avatar_url: null,
      },
    };

    setComments((prev) => [...prev, optimisticComment]);

    try {
      const dbRes = await addMemoryComment(currentMemory.id, textToSubmit, userId);
      if (!dbRes.success) {
        throw new Error(dbRes.error);
      }

      // Update optimistic comment with actual database record details (id)
      setComments((prev) =>
        prev.map((c) => (c.id === optimisticComment.id ? { ...c, id: dbRes.comment.id } : c))
      );
    } catch (err: any) {
      console.error(err);
      showToast('Failed to post comment', 'error');
      // Rollback optimistic comment
      setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
    }
  };

  const activeMemory = memories[activeIndex];
  const activeImageUrl = activeMemory ? (activeMemory.image_url || activeMemory.url) : null;

  // Filter comments belonging to active memory slide
  const activeComments = activeMemory
    ? comments.filter((c) => c.memory_id === activeMemory.id)
    : [];

  return (
    <div className="flex flex-col gap-y-4 px-4 md:px-8 pt-4 pb-24 min-h-screen bg-[#F7F8FA] min-w-0 relative overflow-x-hidden">
      
      {/* ── Keyframes Style Block (Self-contained animation definitions) ─ */}
      <style jsx global>{`
        @keyframes floatUp {
          0% {
            transform: translateY(100vh) scale(1) rotate(0deg);
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            transform: translateY(-80vh) scale(1.5) rotate(15deg);
            opacity: 0;
          }
        }
        .floating-heart {
          animation: floatUp 4.2s linear forwards;
        }
      `}</style>

      {/* ── Mounting Floating Hearts Overlay ──────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {hearts.map((h) => (
          <span
            key={h.id}
            className="absolute floating-heart text-3xl md:text-4xl"
            style={{
              left: `${h.left}%`,
              animationDelay: `${h.delay}s`,
              bottom: '0px',
            }}
          >
            💕
          </span>
        ))}
      </div>

      {/* ── Page Header ────────────────────────────────────────────── */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#111827] leading-none flex items-center gap-3">
            <Camera className="text-[#CEFF00] w-10 h-10 stroke-[2.5]" />
            Memories
          </h1>
          <p className="mt-2 text-[11px] font-bold tracking-[0.18em] text-[#6B7280] uppercase">
            Shared digital album · {memories.length} item{memories.length !== 1 ? 's' : ''}
          </p>
          <svg width="220" height="14" viewBox="0 0 220 14" fill="none" aria-hidden="true" className="mt-1">
            <path d="M2 10 C30 3, 70 13, 110 7 S165 2, 218 6" stroke="#CEFF00" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      </header>

      {/* ── Slideshow Showcase ──────────────────────────────────────── */}
      {memories.length > 0 && activeMemory ? (
        <div className="flex flex-col gap-4">
          
          {/* Main Cinematic Image Card */}
          <div className="relative w-full h-[380px] md:h-[480px] bg-black rounded-[24px] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-white/5 flex items-center justify-center group select-none">
            {activeImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeImageUrl}
                alt={activeMemory.caption || 'Memory'}
                className="w-full h-full object-contain"
              />
            )}

            {/* Left Manual Arrow Overlay */}
            <button
              onClick={handlePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
              aria-label="Previous image"
              type="button"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>

            {/* Right Manual Arrow Overlay */}
            <button
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
              aria-label="Next image"
              type="button"
            >
              <ChevronRight size={20} strokeWidth={2.5} />
            </button>

            {/* Image Info / Uploader Overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 text-white flex flex-col justify-end">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#CEFF00] tracking-wide">
                  @{activeMemory.profiles?.nickname || activeMemory.profiles?.full_name || 'Athlete'}
                </span>
                <span className="text-[10px] text-zinc-400 font-bold tabular-nums">
                  · {new Date(activeMemory.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              {activeMemory.caption && (
                <p className="mt-1 text-sm font-semibold truncate leading-snug">
                  {activeMemory.caption}
                </p>
              )}
            </div>

            {/* Top Indicator Bullets */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 bg-black/30 px-3 py-1.5 rounded-full">
              {memories.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === activeIndex ? 'w-4 bg-[#CEFF00]' : 'w-1.5 bg-white/40'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* ── Instagram-Style Comments Card ────────────────────────── */}
          <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-5 flex flex-col gap-4">
            <h2 className="text-base font-black text-[#111827] flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-gray-500" />
              Comments ({activeComments.length})
            </h2>

            {/* Comment Feed Stream */}
            <div className="flex flex-col gap-3.5 max-h-[220px] overflow-y-auto pr-1">
              {activeComments.length > 0 ? (
                activeComments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 items-start animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <UserAvatar user={comment.profiles || {}} size="sm" />
                    <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl px-4 py-2 flex-1 relative">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-black text-gray-900">
                          {comment.profiles?.nickname || comment.profiles?.full_name || 'Athlete'}
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 tabular-nums">
                          {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 font-medium leading-relaxed break-all">
                        {comment.content || comment.text || comment.comment}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-[#9CA3AF] font-bold select-none">
                  No comments yet. Start the conversation! 💬
                </div>
              )}
            </div>

            {/* Sticky Comment Submit Form */}
            <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 mt-1">
              <input
                type="text"
                placeholder="Write a comment..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                className="flex-1 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl px-4 py-3 text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#CEFF00]/50"
                maxLength={200}
              />
              <button
                type="submit"
                className="w-10 h-10 rounded-2xl bg-gray-950 hover:bg-gray-800 text-white flex items-center justify-center active:scale-95 transition-all shadow-sm flex-shrink-0 cursor-pointer"
                aria-label="Submit comment"
              >
                <Send size={14} className="stroke-[2.5] text-[#CEFF00]" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* ── Empty State Showcase ───────────────────────────────────── */
        <div className="bg-white rounded-[24px] border border-white/5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-16 text-center flex flex-col items-center justify-center gap-3">
          <Camera size={44} className="text-gray-300 stroke-[1.5]" />
          <h2 className="text-base font-black text-gray-800">No memories uploaded for this group yet!</h2>
          <p className="text-xs font-bold text-gray-500 max-w-[280px] leading-relaxed">
            Tap the + button below to add the first photo 💕
          </p>
        </div>
      )}

      {/* ── Native File Input (hidden) ─────────────────────────────── */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* ── Fixed Floating Action Upload Button (FAB) ────────────────── */}
      <button
        onClick={triggerFileSelect}
        disabled={isUploading}
        className={`fixed bottom-24 right-4 md:right-8 md:bottom-8 z-40 w-14 h-14 rounded-full bg-gray-950 text-white flex items-center justify-center shadow-[0_12px_24px_rgba(0,0,0,0.2)] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border-2 border-[#CEFF00]/20 ${
          isUploading ? 'opacity-80' : ''
        }`}
        aria-label="Upload new memory photo"
        type="button"
      >
        {isUploading ? (
          <RefreshCw size={24} className="animate-spin text-[#CEFF00]" />
        ) : (
          <Plus size={28} className="stroke-[2.5] text-[#CEFF00]" />
        )}
      </button>

      {/* ── Lightweight Floating Toast Notification ───────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-[0_8px_30px_rgba(0,0,0,0.15)] flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none ${
            toast.type === 'error'
              ? 'bg-red-950 text-red-200 border border-red-800'
              : 'bg-[#111827] text-[#CEFF00] border border-white/10'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
