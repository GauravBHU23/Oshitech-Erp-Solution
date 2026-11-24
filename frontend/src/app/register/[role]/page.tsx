import { notFound } from "next/navigation";
import RegistrationForm from "@/components/RegistrationForm";

export default function RegisterPortalPage({ params }: { params: { role: string } }) {
  if (params.role !== "student" && params.role !== "teacher") notFound();
  return <RegistrationForm portal={params.role} />;
}
