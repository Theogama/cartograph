import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cartograph",
  description: "Map a public codebase with team-aware workspace organization.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const storedTheme = localStorage.getItem('theme');
                  const nextTheme = storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'system';
                  const colorScheme = nextTheme === 'dark' ? 'dark' : nextTheme === 'light' ? 'light' : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  document.documentElement.dataset.theme = nextTheme;
                  document.documentElement.dataset.colorScheme = colorScheme;
                  document.documentElement.style.colorScheme = colorScheme;
                } catch (error) {
                  document.documentElement.dataset.theme = 'system';
                  document.documentElement.dataset.colorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
              })();
            `,
          }}
        />
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}