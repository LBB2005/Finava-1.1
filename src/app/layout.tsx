import type { Metadata } from "next";
import { Hanken_Grotesk, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import { AppearanceProvider } from "@/components/providers/AppearanceProvider";
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
        {/* Apply stored appearance prefs before first paint to avoid flash.
            Mirrors applyAppearance() in @/lib/appearance; kept tiny + inline. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var p;var raw=localStorage.getItem('finava-appearance');if(raw){p=JSON.parse(raw);}else{var lt=localStorage.getItem('finava-theme');if(lt){p={theme:lt};}}p=p||{};var d=document.documentElement;var th=p.theme||'light';var dark=th==='dark'||(th==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark)d.setAttribute('data-theme','dark');if(p.accent&&p.accent!=='navy')d.setAttribute('data-accent',p.accent);if(p.textSize&&p.textSize!=='default')d.setAttribute('data-text-size',p.textSize);if(p.density&&p.density!=='comfortable')d.setAttribute('data-density',p.density);if(p.reduceMotion)d.setAttribute('data-motion','reduced');if(p.serifHeadings===false)d.setAttribute('data-headings','sans');}catch(e){}` }} />
      </head>
      <body className="h-full bg-[var(--color-bg)]">
        <SWRProvider>
          <AuthProvider>
            <AppearanceProvider>
              <ToastProvider>
                <AppShell>{children}</AppShell>
              </ToastProvider>
            </AppearanceProvider>
          </AuthProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
