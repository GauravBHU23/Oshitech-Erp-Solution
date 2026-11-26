import { redirect } from "next/navigation";

export default async function StreAdmitCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/api/v1/stre/admit-card/${encodeURIComponent(token)}/download/`);
}
