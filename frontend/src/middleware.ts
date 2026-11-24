import { NextRequest, NextResponse } from "next/server";

function isMaintenanceExemptPath(pathname: string) {
  return (
    pathname === "/maintenance" ||
    pathname.startsWith("/maintenance/") ||
    pathname === "/support" ||
    pathname.startsWith("/support/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    /\.[^/]+$/.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  if (process.env.MAINTENANCE_MODE !== "true" || isMaintenanceExemptPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const destination = request.nextUrl.clone();
  destination.pathname = "/maintenance";
  destination.search = "";
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
