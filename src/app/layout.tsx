import type { Metadata } from "next";
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
  title: "Cirkle Mail — your connected inbox",
  description:
    "Cirkle Mail — a fast, distraction-free email client with a premium gold + teal design system. Built with Next.js, Prisma, and shadcn/ui.",
  keywords: ["Cirkle", "Cirkle Mail", "email", "mail", "inbox", "Next.js"],
  authors: [{ name: "Cirkle" }],
  icons: {
    icon: "/logo.svg",
  },
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
