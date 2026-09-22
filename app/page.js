"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/chat" : "/login");
  }, [user, loading, router]);

  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--wa-panel-header)]">
      <div className="w-10 h-10 border-4 border-[var(--wa-green)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
