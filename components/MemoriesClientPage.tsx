'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, ChevronLeft, ChevronRight, MessageSquare, Plus, Send, RefreshCw, Trash2 } from 'lucide-react';
import { uploadAndCreateMemoryAction, addMemoryComment, deleteMemoryAction } from '@/app/actions/memories';
import UserAvatar from '@/components/UserAvatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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
  initialMemories: Memory[];
  initialComments: MemoryComment[];
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

/**
 * Helper to convert Blob to Base64 string for Server Action transmission.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
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
  // Upload Dialog States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string>('');
  const [uploadCaption, setUploadCaption] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const slideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Slideshow Auto-Advance Loop ─────────────────────────────────────────
  const startSlideshowTimer = React.useCallback(() => {
    if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    if (memories.length <= 1) return;

    slideTimerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % memories.length);
    }, 7000);
  }, [memories]);

  useEffect(() => {
    startSlideshowTimer();
    return () => {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    };
  }, [startSlideshowTimer]);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }

    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setUploadCaption('');
    setIsUploadOpen(true);
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile) return;
    if (uploadCaption.trim().length === 0) return;

    setIsUploading(true);
    showToast('Compressing image...', 'success');

    try {
      // 1. Compress Image client-side
      const compressedBlob = await compressImage(uploadFile);

      // 2. Convert compressed blob to base64 string
      const base64Image = await blobToBase64(compressedBlob);

      // 3. Perform RLS-bypassed upload and DB insert on the server
      const dbRes = await uploadAndCreateMemoryAction(
        base64Image,
        uploadFile.name,
        groupId,
        userId,
        uploadCaption.trim()
      );

      if (!dbRes.success || !dbRes.memory) {
        throw new Error(dbRes.error || 'Server did not return a valid memory record.');
      }

      // 4. Update local memory state (immediate presentation)
      const newMemory: Memory = {
        id: dbRes.memory.id,
        image_url: dbRes.memory.image_url,
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
      
      // Close Upload Dialog
      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadPreview('');
    } catch (err) {
      const error = err as Error | null;
      console.error('Upload failed detail:', error);
      showToast(`Upload failed: ${error?.message || 'Unknown error'}`, 'error');
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
      if (!dbRes.success || !dbRes.comment) {
        throw new Error(dbRes.error || 'Server did not return a valid comment record.');
      }

      // Update optimistic comment with actual database record details (id)
      setComments((prev) =>
        prev.map((c) => (c.id === optimisticComment.id ? { ...c, id: dbRes.comment.id } : c))
      );
    } catch (err) {
      console.error(err);
      showToast('Failed to post comment', 'error');
      // Rollback optimistic comment
      setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this photo from Memories?')) return;
    try {
      const res = await deleteMemoryAction(memoryId, userId);
      if (res.success) {
        showToast('Photo deleted successfully.');
        const updatedMemories = memories.filter((m) => m.id !== memoryId);
        setMemories(updatedMemories);
        if (activeIndex >= updatedMemories.length) {
          setActiveIndex(Math.max(0, updatedMemories.length - 1));
        }
      } else {
        showToast(res.error || 'Failed to delete photo', 'error');
      }
    } catch (err) {
      const error = err as Error | null;
      showToast(error?.message || 'An error occurred during deletion', 'error');
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
          <div className="relative w-full h-[380px] md:h-[480px] bg-white rounded-card overflow-hidden shadow-raised border border-slate-200/50 flex items-center justify-center group select-none">
            {activeImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeImageUrl}
                alt={activeMemory.caption || 'Memory'}
                className="w-full h-full object-contain"
              />
            )}

            {/* Trash soft-delete button */}
            {activeMemory.user_id === userId && (
              <button
                onClick={() => handleDeleteMemory(activeMemory.id)}
                className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/45 hover:bg-red-650 hover:text-white text-zinc-300 flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-md"
                title="Delete memory"
              >
                <Trash2 size={15} className="stroke-[2.5]" />
              </button>
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
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-6 text-white flex flex-col justify-end">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#CEFF00] tracking-wide">
                  @{activeMemory.profiles?.nickname || activeMemory.profiles?.full_name || 'Athlete'}
                </span>
                <span className="text-[10px] text-zinc-400 font-bold tabular-nums">
                  · {new Date(activeMemory.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              {activeMemory.caption && (
                <p className="mt-1 text-sm font-semibold truncate leading-snug text-white">
                  {activeMemory.caption}
                </p>
              )}
            </div>

            {/* Top Indicator Bullets */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 bg-black/35 px-3 py-1.5 rounded-full">
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
          <div className="bg-white rounded-card border border-white/5 shadow-raised p-5 flex flex-col gap-4">
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
        <div className="bg-white rounded-card border border-white/5 shadow-raised p-16 text-center flex flex-col items-center justify-center gap-3">
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
        onChange={handleFileSelect}
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

      {/* ── Upload Modal Dialog with Caption Validation ────────────────── */}
      <Dialog open={isUploadOpen} onOpenChange={(openState) => {
        if (!openState && !isUploading) {
          setIsUploadOpen(false);
          setUploadFile(null);
          setUploadPreview('');
        }
      }}>
        <DialogContent className="sm:max-w-md rounded-overlay p-7">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight text-[#111827]">
              Post a Memory
            </DialogTitle>
            <DialogDescription className="text-[#6B7280] text-sm mt-1">
              Add a caption for this memory.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-4">
            {/* Image Preview */}
            {uploadPreview && (
              <div className="w-full h-48 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadPreview}
                  alt="Upload preview"
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Caption Textarea */}
            <div>
              <label htmlFor="caption-input" className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1.5 block">
                Caption
              </label>
              <textarea
                id="caption-input"
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                placeholder="Write a caption for this memory..."
                rows={3}
                disabled={isUploading}
                className="w-full resize-none rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#111827] disabled:opacity-50 transition"
              />
              {uploadCaption.trim().length === 0 && (
                <p className="text-red-500 text-xs font-semibold mt-1">
                  A caption is required to post a memory.
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => {
                  setIsUploadOpen(false);
                  setUploadFile(null);
                  setUploadPreview('');
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUploading || uploadCaption.trim().length === 0}
                onClick={handleUploadSubmit}
                className="px-5 py-2.5 rounded-xl bg-gray-950 text-[#CEFF00] hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5"
              >
                {isUploading ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload Memory'
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
