import { notFound } from "next/navigation";
import RegistrationForm from "@/components/RegistrationForm";

export default async function RegisterPortalPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "student" && role !== "teacher") notFound();
  return <RegistrationForm portal={role} />;
}
