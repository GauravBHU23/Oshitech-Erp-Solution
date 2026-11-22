import { notFound } from "next/navigation";
import PortalLoginForm from "@/components/PortalLoginForm";
import { portalBySlug } from "@/lib/portals";

export default function PortalLoginPage({ params }: { params: { portal: string } }) {
  const portal = portalBySlug(params.portal);
  if (!portal) notFound();
  return <PortalLoginForm portal={portal} />;
}
