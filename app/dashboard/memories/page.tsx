import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import MemoriesClientPage from '@/components/MemoriesClientPage';

export default async function MemoriesPage() {
  // ── Session Authentication ─────────────────────────────────────────────
  const cookieStore = await cookies();
  const token       = cookieStore.get(SESSION_COOKIE)?.value;
  const session     = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const { groupId, userId, userName } = session;

  const supabase = createAdminClient();

  // Fetch all group memories explicitly with expected columns
  const { data: memoriesRaw, error: memoriesErr } = await supabase
    .from('memories')
    .select(`
      id,
      group_id,
      user_id,
      image_url,
      caption,
      created_at,
      profiles:user_id ( id, nickname, full_name, avatar_url )
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (memoriesErr) {
    console.error('[MemoriesPage] Fetch memories error:', memoriesErr);
  }

  const memoriesList = memoriesRaw || [];
  const memoryIds = memoriesList.map((m) => m.id);

  // Fetch comments matching these memory IDs
  let commentsList: any[] = [];
  if (memoryIds.length > 0) {
    const { data: commentsRaw, error: commentsErr } = await supabase
      .from('memory_comments')
      .select(`
        id,
        memory_id,
        user_id,
        content,
        created_at,
        profiles:user_id ( id, nickname, full_name, avatar_url )
      `)
      .in('memory_id', memoryIds)
      .order('created_at', { ascending: true });

    if (commentsErr) {
      console.error('[MemoriesPage] Fetch comments error:', commentsErr);
    } else {
      commentsList = commentsRaw || [];
    }
  }

  return (
    <MemoriesClientPage
      initialMemories={memoriesList}
      initialComments={commentsList}
      groupId={groupId}
      userId={userId}
      userName={userName}
    />
  );
}
