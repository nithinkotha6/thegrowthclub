import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeSession, SESSION_COOKIE } from '@/lib/session';
import { getBackupStatusAction } from '@/app/actions/backup';
import BackupStatusClient from '@/components/admin/BackupStatusClient';

export default async function AdminBackupStatusPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await decodeSession(token) : null;
  if (!session) redirect('/');

  const statusRes = await getBackupStatusAction();

  const initialMetadata = statusRes.success ? statusRes.latestMetadata : null;
  const initialHistory = statusRes.success ? statusRes.history : [];
  const initialTables = statusRes.success ? statusRes.tables : [];

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24">
      <BackupStatusClient
        initialMetadata={initialMetadata}
        initialHistory={initialHistory}
        initialTables={initialTables}
      />
    </div>
  );
}
