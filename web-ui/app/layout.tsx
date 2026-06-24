import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { CoreLayoutWrapper } from "@/components/layout-wrapper";
import { ThemeInjector } from "@/components/theme-injector";
import { ThemeProvider } from "@/components/theme-provider";
import { ExtensionsLoader } from "@/lib/extensions";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Static SSR defaults — ThemeInjector overrides at runtime from config.json theme
export const metadata: Metadata = {
  title: "Youbot",
  description: "AI Agent Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ExtensionsLoader />
          <TooltipProvider>
            <CoreLayoutWrapper>{children}</CoreLayoutWrapper>
          </TooltipProvider>
          <ThemeInjector />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
