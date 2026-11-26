import { notFound } from "next/navigation";
import PortalLoginForm from "@/components/PortalLoginForm";
import { portalBySlug } from "@/lib/portals";

export default async function PortalLoginPage({ params }: { params: Promise<{ portal: string }> }) {
  const { portal: slug } = await params;
  const portal = portalBySlug(slug);
  if (!portal) notFound();
  return <PortalLoginForm portal={portal} />;
}
