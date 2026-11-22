import Icon from "@/components/Icon";

/** Notice ke saath laga PDF: nayi tab me khulta hai (koi bhi dekh sakta hai). */
export default function PdfLink({ href, className = "" }: { href?: string | null; className?: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener" className={`notice-pdf-link mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 ${className}`}>
      <Icon name="download" size={13} />View PDF
    </a>
  );
}
