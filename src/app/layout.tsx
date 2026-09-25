import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CirkleBrandDefs } from "@/components/brand/cirkle-logo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cirkle — A New Social Operating System",
  description:
    "Cirkle (دواير) — a luxurious AI-native social operating system. Chat, video, photos, social, travel, payments, and mail in one premium app.",
  keywords: ["Cirkle", "دواير", "Dawayer", "social operating system", "super app", "AI-native", "mail", "chat"],
  authors: [{ name: "Cirkle" }],
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "256x256" }, { url: "/logo.svg" }],
  },
  openGraph: {
    title: "Cirkle — دواير",
    description: "The next-generation social operating system.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A4A5A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <CirkleBrandDefs />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
