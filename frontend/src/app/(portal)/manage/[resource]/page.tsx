"use client";
import { useAuth } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { resources } from "@/lib/resources";
import ResourcePage from "@/components/ResourcePage";

export default function ManagePage({ params }: { params: { resource: string } }) {
  const { user } = useAuth();
  const resource = resources[params.resource];
  if (!resource) return <p className="text-slate-500">Page not found.</p>;
  if (!user) return null;
  // UI level check (asli enforcement backend karta hai)
  if (user.role !== "super_admin" && !navFor(user.role).some((i) => i.href === `/manage/${resource.key}`))
    return <p className="text-slate-500">You do not have access to this page.</p>;
  return <ResourcePage key={resource.key} resource={resource} />;
}
