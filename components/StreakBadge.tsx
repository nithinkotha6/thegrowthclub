import { formatStreakBadge } from '@/lib/utils';

/** Small absolute-positioned circle for the bottom-right corner of an avatar,
 * showing the user's current streak. Parent must be `position: relative`. */
export default function StreakBadge({ count }: { count: number }) {
  return (
    <div
      className="absolute -bottom-1.5 -right-1.5 bg-white border-2 border-[#111827] text-[10px] font-black rounded-full min-w-6 h-6 px-1 flex items-center justify-center shadow tabular-nums whitespace-nowrap"
      title={`${count}-day streak`}
    >
      {formatStreakBadge(count)}
    </div>
  );
}
