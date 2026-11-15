import { LightThemeOnly } from '@/components/light-theme-only';

/** Exam papers and answer keys: always the light theme, on screen as on paper (OJ-19). */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LightThemeOnly />
      {children}
    </>
  );
}
