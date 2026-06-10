import type { Metadata } from "next";
import { Hanken_Grotesk, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import ToastProvider from "@/components/feedback/ToastProvider";
import SWRProvider from "@/components/providers/SWRProvider";

const hankenSans = Hanken_Grotesk({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "900"],
});

export const metadata: Metadata = {
  title: "Finava — AI Investment Research",
  description: "AI-powered stock research platform with multi-agent analysis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${hankenSans.variable} ${geistMono.variable} ${playfair.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply stored theme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('finava-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}` }} />
      </head>
      <body className="h-full bg-[var(--color-bg)]">
        <SWRProvider>
          <AuthProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </AuthProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
