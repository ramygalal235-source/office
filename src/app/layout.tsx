import type { Metadata, Viewport } from "next";
import "@fontsource-variable/cairo";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "دفاتر المحاسب | نظام المحاسبة المتكامل",
  description:
    "نظام محاسبة ومراجعة عربي متكامل: فواتير، مخازن، حسابات عامة، تقارير مالية، ضرائب مصرية، رواتب، وأصول ثابتة — يعمل محلياً بالكامل.",
  keywords: ["محاسبة", "فواتير", "ميزان مراجعة", "ضريبة القيمة المضافة", "برنامج محاسبي", "مصر"],
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d7a5f" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1f1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
