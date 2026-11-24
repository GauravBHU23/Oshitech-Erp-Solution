import { redirect } from "next/navigation";

export default function StreAdmitCardPage({ params }: { params: { token: string } }) {
  redirect(`/api/v1/stre/admit-card/${encodeURIComponent(params.token)}/download/`);
}
