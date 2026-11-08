import type { Metadata } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono, Patrick_Hand } from 'next/font/google';
import Script from 'next/script';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './globals.css';
import { ToastProvider } from '@/components/toast';
import { AuthProvider } from '@/lib/auth';
import { TRANSLATION_SAFE_DOM } from '@/lib/translation-safe-dom';

// All three faces ship the Vietnamese subset so stacked diacritics render correctly.
const ui = Be_Vietnam_Pro({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});
const code = JetBrains_Mono({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-code',
  display: 'swap',
});
const hand = Patrick_Hand({
  subsets: ['latin', 'vietnamese'],
  weight: '400',
  variable: '--font-handwritten',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Online Judge',
    template: '%s | Online Judge',
  },
  description: 'Hệ thống chấm bài lập trình trực tuyến cho lớp học',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser translation (e.g. Chrome's "Translate to English") rewrites <html lang> and adds a class before React
    // loads. suppressHydrationWarning covers only this element's own attributes, not its children.
    <html lang="vi" className={`${ui.variable} ${code.variable} ${hand.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        {/* Before React starts: browser translation must not crash the app (see lib/translation-safe-dom.ts). */}
        <Script id="translation-safe-dom" strategy="beforeInteractive">
          {TRANSLATION_SAFE_DOM}
        </Script>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
