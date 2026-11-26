import { isNewNotice } from "@/lib/notices";

export default function NoticeNewBadge({ publishOn }: { publishOn?: string | null }) {
  if (!isNewNotice(publishOn)) return null;

  return (
    <span className="notice-new-badge inline-flex shrink-0 items-center rounded-md bg-red-600 px-2 py-0.5 text-[9px] font-bold leading-4 tracking-wide text-white shadow-sm">
      NEW
    </span>
  );
}
