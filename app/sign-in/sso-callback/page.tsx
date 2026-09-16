"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SsoCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
