'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';
import { useTranslations } from 'use-intl';
import { useTheme } from '@/lib/theme';
import { Spinner } from './ui';

/** Monaco's dark theme on the board's own colours, so the editor sits in the page rather than on top of it (OJ-19). */
const BOARD_THEME = 'oj-board';

function EditorLoading() {
  const t = useTranslations('common');
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
      <Spinner /> {t('editorLoading')}
    </div>
  );
}

const Monaco = dynamic(() => import('@monaco-editor/react').then((m) => m.default), {
  ssr: false,
  loading: () => <EditorLoading />,
});

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly,
  height = '100%',
  fontSize = 14,
  onSubmitShortcut,
}: {
  value: string;
  onChange?: (v: string) => void;
  language: string;
  readOnly?: boolean;
  height?: string | number;
  fontSize?: number;
  /** Ctrl+Enter (Cmd+Enter on a Mac) inside the editor (OJ-17). Read through a ref, so it is always the latest. */
  onSubmitShortcut?: () => void;
}) {
  const { theme } = useTheme();
  const shortcut = useRef(onSubmitShortcut);
  shortcut.current = onSubmitShortcut;
  return (
    <Monaco
      height={height}
      language={language}
      value={value}
      theme={theme === 'dark' ? BOARD_THEME : 'vs'}
      beforeMount={(monaco) => {
        monaco.editor.defineTheme(BOARD_THEME, {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#1b2621',
            'editorGutter.background': '#1b2621',
            'editor.lineHighlightBackground': '#24322b',
            'editorLineNumber.foreground': '#74867d',
          },
        });
      }}
      onChange={(v) => onChange?.(v ?? '')}
      loading={<EditorLoading />}
      onMount={(editor, monaco) => {
        // CtrlCmd is Cmd on a Mac and Ctrl elsewhere; WinCtrl is the Ctrl key on a Mac. Both, so Ctrl+Enter works on
        // every lab computer and Cmd+Enter on a Mac too.
        /* eslint-disable no-bitwise */
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => shortcut.current?.());
        editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.Enter, () => shortcut.current?.());
        /* eslint-enable no-bitwise */
      }}
      options={{
        readOnly,
        fontSize,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        wordWrap: 'off',
        renderLineHighlight: readOnly ? 'none' : 'line',
        fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
        padding: { top: 8 },
        // At the top or bottom of the code, the wheel scrolls the page instead of stopping dead (UAT M3).
        scrollbar: { alwaysConsumeMouseWheel: false },
      }}
    />
  );
}
