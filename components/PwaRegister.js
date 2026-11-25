"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pushClient";

// Registers the service worker (installable app + notifications) and captures the
// browser's "install" prompt so Settings can offer an Install button.
export default function PwaRegister() {
  useEffect(() => {
    registerServiceWorker();
    const onPrompt = (e) => {
      e.preventDefault();
      window.__yapInstallPrompt = e;
      window.dispatchEvent(new Event("yap-install-available"));
    };
    const onInstalled = () => {
      window.__yapInstallPrompt = null;
      window.dispatchEvent(new Event("yap-install-available"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
