'use client';

import { LanguageLabels, Languages, type Language, type SolutionDto } from '@oj/contracts';
import { Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { cn, MonacoLanguage } from '@/lib/utils';
import { CodeEditor } from '../code-editor';
import { LoadFileButton, MarkdownField } from '../form-fields';
import { useToast } from '../toast';
import { Button, Card, ConfirmDialog, inputClass } from '../ui';

export function SolutionEditor({
  problemId,
  solution,
  onChange,
}: {
  problemId: string;
  solution: SolutionDto | null | undefined;
  onChange: (s: SolutionDto | null) => void;
}) {
  const toast = useToast();
  const t = useTranslations('authoring.solution');
  const [explanation, setExplanation] = useState(solution?.explanation ?? '');
  const [language, setLanguage] = useState<Language | null>(solution?.language ?? 'cpp');
  const [code, setCode] = useState(solution?.code ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const s = await api.saveSolution(problemId, { explanation, language: code.trim() ? language : null, code });
      onChange(s);
      toast.success(t('saved'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteSolution(problemId);
      onChange(null);
      setExplanation('');
      setCode('');
      toast.success(t('deleted'));
      setConfirmDelete(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <MarkdownField
          label={t('explanation')}
          value={explanation}
          onChange={setExplanation}
          rows={12}
          placeholder={t('explanationPlaceholder')}
        />
      </Card>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">{t('code')}</h2>
          <select
            className={cn(inputClass, 'w-auto py-1.5')}
            value={language ?? 'cpp'}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {Languages.map((l) => (
              <option key={l} value={l}>
                {LanguageLabels[l]}
              </option>
            ))}
          </select>
          <LoadFileButton
            label={t('loadFile')}
            accept=".cpp,.cc,.c,.py,.java,.js,.txt"
            onLoad={(t, name) => {
              setCode(t);
              const ext = name.split('.').pop()?.toLowerCase();
              const map: Record<string, Language> = { cpp: 'cpp', cc: 'cpp', c: 'c', py: 'python', java: 'java', js: 'javascript' };
              if (ext && map[ext]) setLanguage(map[ext]);
            }}
          />
        </div>
        <div className="h-[420px]">
          <CodeEditor value={code} onChange={setCode} language={MonacoLanguage[language ?? 'cpp']} />
        </div>
      </Card>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="secondary"
          className="text-mark-600"
          onClick={() => setConfirmDelete(true)}
          disabled={!solution}
        >
          <Trash2 className="h-4 w-4" />
          {t('delete')}
        </Button>
        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" />
          {t('save')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={t('confirmDeleteTitle')}
        message={t('confirmDeleteBody')}
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
