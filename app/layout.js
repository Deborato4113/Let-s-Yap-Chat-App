import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";

export const metadata = {
  title: "Let's Yap",
  description: "A fast, simple real-time chat app.",
};

// Avoid a light-mode flash before ThemeProvider mounts: read the stored
// preference synchronously and stamp it onto <html> before first paint.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("yap_theme") || "classic";
    var dark = localStorage.getItem("yap_dark_mode") === "1";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-mode", dark ? "dark" : "light");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
