'use client';

import { Topics, type LearningPathDto, type SessionDto, type UpsertLearningPathRequest } from '@oj/contracts';
import { ArrowDown, ArrowUp, Plus, Save, Shuffle, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useToast } from './toast';
import { useTagLabel } from './topics';
import { Badge, Button, Card, ConfirmDialog, Field, InlineAlert, inputClass } from './ui';

type Step = UpsertLearningPathRequest['steps'][number];

/** Sessions a path may use: open public practice and homework (the server checks the same rule). */
const usable = (s: SessionDto) => s.audience === 'PUBLIC' && (s.type === 'PRACTICE' || s.type === 'HOMEWORK') && s.state !== 'CLOSED';

/** Create or edit a learning path (OJ-24): details, then steps picked from public practice sessions, in order. */
export function PathEditor({ path }: { path?: LearningPathDto }) {
  const t = useTranslations('paths.editor');
  const tc = useTranslations('common');
  const label = useTagLabel();
  const router = useRouter();
  const toast = useToast();
  const sessions = useAsync(() => api.listSessions({ audience: 'PUBLIC' }), []);
  const [title, setTitle] = useState(path?.title ?? '');
  const [description, setDescription] = useState(path?.description ?? '');
  const [topic, setTopic] = useState<string>(path?.topic ?? '');
  const [isPublic, setIsPublic] = useState(path?.isPublic ?? true);
  const [steps, setSteps] = useState<Step[]>(path?.steps.map(({ sessionId, title: stepTitle, note }) => ({ sessionId, title: stepTitle, note })) ?? []);
  const [pick, setPick] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const byId = new Map((sessions.data ?? []).map((s) => [s.id, s]));
  const candidates = (sessions.data ?? []).filter((s) => usable(s) && !steps.some((st) => st.sessionId === s.id));
  const setStep = (i: number, patch: Partial<Step>) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) =>
    setSteps((all) => {
      const next = [...all];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  const add = () => {
    const s = byId.get(pick);
    if (!s) return;
    setSteps((all) => [...all, { sessionId: s.id, title: s.title, note: '' }]);
    setPick('');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!steps.length) return setError(t('needSteps'));
    setSaving(true);
    setError(null);
    const body: UpsertLearningPathRequest = { title, description, topic: topic || null, isPublic, steps };
    try {
      const saved = path ? await api.updatePath(path.id, body) : await api.createPath(body);
      toast.success(t('saved'));
      router.push(`/paths/${saved.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!path) return;
    try {
      await api.deletePath(path.id);
      toast.success(t('deleted'));
      router.replace('/practice');
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Card className="space-y-4 p-5">
        <Field label={t('name')}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </Field>
        <Field label={t('description')}>
          <textarea className={cn(inputClass, 'min-h-24')} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('topic')}>
            <select className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">{t('noTopic')}</option>
              {Topics.map((x) => (
                <option key={x.id} value={x.id}>
                  {label(x.id)}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="mt-1" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>
              <span className="font-medium">{t('public')}</span>
              <span className="block text-xs text-slate-500">{t('publicHint')}</span>
            </span>
          </label>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-900">{t('stepsTitle')}</h2>
        <ol className="space-y-3">
          {steps.map((step, i) => {
            const s = byId.get(step.sessionId);
            return (
              <li key={step.sessionId} className="rounded-panel border border-rule p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-500 tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{s?.title ?? step.title}</span>
                  {s?.settings?.hideTopics && (
                    <Badge className="bg-amber-50 text-amber-800 ring-1 ring-amber-200" >
                      <Shuffle className="mr-1 h-3 w-3" aria-hidden="true" />
                      {t('reviewSession')}
                    </Badge>
                  )}
                  <span className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('moveUp')} title={t('moveUp')}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={t('moveDown')} title={t('moveDown')}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSteps((all) => all.filter((_, j) => j !== i))} aria-label={t('remove')} title={t('remove')}>
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <input className={inputClass} value={step.title} onChange={(e) => setStep(i, { title: e.target.value })} aria-label={t('stepTitle')} placeholder={t('stepTitle')} maxLength={200} required />
                  <textarea className={cn(inputClass, 'min-h-10')} rows={2} value={step.note} onChange={(e) => setStep(i, { note: e.target.value })} aria-label={t('stepNote')} placeholder={t('stepNote')} maxLength={2000} />
                </div>
              </li>
            );
          })}
        </ol>
        {candidates.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className={cn(inputClass, 'min-w-0 flex-1')} value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('pickSession')}>
              <option value="">{t('pickSession')}</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={add} disabled={!pick}>
              <Plus className="h-4 w-4" />
              {t('addStep')}
            </Button>
          </div>
        ) : (
          !sessions.loading && <p className="mt-3 text-sm text-slate-500">{t('noSessions')}</p>
        )}
      </Card>

      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {path ? (
          <Button type="button" variant="ghost" className="text-mark-600 hover:bg-mark-50" onClick={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" />
            {t('delete')}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={saving}>
          <Save className="h-4 w-4" />
          {t('save')}
        </Button>
      </div>
      <ConfirmDialog
        open={deleting}
        title={t('deleteTitle')}
        message={t('deleteBody')}
        confirmLabel={tc('delete')}
        onConfirm={remove}
        onClose={() => setDeleting(false)}
      />
    </form>
  );
}
