'use client';

import type { TestCaseDto, UpsertTestCaseRequest } from '@oj/contracts';
import { ChevronDown, ChevronRight, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useAiFeature } from '@/lib/ai-usage';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AiUsesLeft, useAiBlockedReason, VipOnly } from '../ai-access';
import { IoTextarea } from '../form-fields';
import { useToast } from '../toast';
import { Badge, Button, Card, ConfirmDialog, EmptyState, inputClass, Modal } from '../ui';
import { FEW_TESTS, SuggestTestsDialog } from './test-suggestions';

const emptyTest: UpsertTestCaseRequest = { input: '', expectedOutput: '', isSample: false, points: 10 };

function preview(s: string, empty: string, n = 80) {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one || empty;
}

export function TestCaseManager({
  problemId,
  testCases,
  onChange,
}: {
  problemId: string;
  testCases: TestCaseDto[];
  onChange: (tcs: TestCaseDto[]) => void;
}) {
  const toast = useToast();
  const t = useTranslations('authoring.tests');
  const tCommon = useTranslations('common');
  const [editing, setEditing] = useState<{ id: string | null; value: UpsertTestCaseRequest } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TestCaseDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // A free teacher has a monthly allowance (OJ-21): the button shows what is left and stops at the limit.
  const canUseAi = useAiFeature('TESTS').enabled;
  const blocked = useAiBlockedReason('TESTS');
  const aiOff = !!blocked;
  const [suggesting, setSuggesting] = useState(false);
  // The list as it grows while the AI dialog adds tests one by one.
  const added = useRef(testCases);
  added.current = testCases;

  const sorted = [...testCases].sort((a, b) => a.order - b.order);
  const totalPoints = sorted.reduce((s, t) => s + (t.points || 0), 0);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const body = { ...editing.value, points: Number(editing.value.points) || 0 };
      if (editing.id) {
        const tc = await api.updateTestCase(problemId, editing.id, body);
        onChange(testCases.map((t) => (t.id === tc.id ? tc : t)));
        toast.success(t('updated'));
      } else {
        const tc = await api.createTestCase(problemId, body);
        onChange([...testCases, tc]);
        toast.success(t('added'));
      }
      setEditing(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleSample = async (t: TestCaseDto) => {
    try {
      const tc = await api.updateTestCase(problemId, t.id, {
        input: t.input,
        expectedOutput: t.expectedOutput,
        points: t.points,
        isSample: !t.isSample,
      });
      onChange(testCases.map((x) => (x.id === tc.id ? tc : x)));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deleteTestCase(problemId, deleting.id);
      onChange(testCases.filter((t) => t.id !== deleting.id));
      toast.success(t('deleted'));
      setDeleting(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{t('heading', { count: sorted.length })}</h2>
          <p className="text-xs text-slate-500">{t('managerHint', { total: totalPoints })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUseAi ? (
            <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSuggesting(true)}
              disabled={aiOff}
              title={blocked}
            >
              <Sparkles className="h-4 w-4" />
              {t('suggestAi')}
            </Button>
            <AiUsesLeft feature="TESTS" className="self-center" />
            </>
          ) : (
            <VipOnly label={t('suggestAiVip')} className="self-center" />
          )}
          <Button size="sm" onClick={() => setEditing({ id: null, value: { ...emptyTest } })}>
            <Plus className="h-4 w-4" />
            {t('add')}
          </Button>
        </div>
      </div>

      {sorted.length > 0 && sorted.length < FEW_TESTS && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-ink-50/60 px-5 py-2 text-sm text-slate-700">
          <span className="min-w-0">{t('few', { count: sorted.length })}</span>
          {canUseAi && !aiOff && (
            <Button size="sm" variant="ghost" onClick={() => setSuggesting(true)}>
              <Sparkles className="h-4 w-4" />
              {t('suggestMore')}
            </Button>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title={t('emptyTitle')}>
          {canUseAi ? t.rich('managerEmptyAi', { b: (c) => <b>{c}</b> }) : t('managerEmpty')}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((test, i) => {
            const open = !!expanded[test.id];
            return (
              <li key={test.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setExpanded((x) => ({ ...x, [test.id]: !open }))}
                    className="-my-1 flex min-h-8 items-center gap-1 rounded pr-1 text-sm font-medium tabular-nums text-slate-700 hover:bg-slate-50"
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}#{i + 1}
                  </button>
                  {test.isSample && <Badge className="bg-sky-100 text-sky-700">{t('sample')}</Badge>}
                  <Badge>{t('points', { points: test.points })}</Badge>
                  <span className="hidden min-w-0 flex-1 truncate font-mono text-xs text-slate-500 md:block">
                    {preview(test.input, tCommon('empty'))}  ⟹  {preview(test.expectedOutput, tCommon('empty'), 40)}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <label className="mr-2 flex min-h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                      <input type="checkbox" checked={test.isSample} onChange={() => toggleSample(test)} />
                      {t('sample')}
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('editTest', { n: i + 1 })}
                      onClick={() =>
                        setEditing({
                          id: test.id,
                          value: { input: test.input, expectedOutput: test.expectedOutput, isSample: test.isSample, points: test.points },
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('deleteTest', { n: i + 1 })}
                      onClick={() => setDeleting(test)}
                      className="text-mark-600 hover:bg-mark-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {open && (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <pre className="io-block max-h-60 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">{test.input}</pre>
                    <pre className="io-block max-h-60 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
                      {test.expectedOutput}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? t('editTitle') : t('addTitle')}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={save} loading={saving}>
              {t('saveTest')}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <IoTextarea
                label={t('input')}
                rows={12}
                value={editing.value.input}
                onChange={(input) => setEditing({ ...editing, value: { ...editing.value, input } })}
              />
              <IoTextarea
                label={t('expectedOutput')}
                rows={12}
                value={editing.value.expectedOutput}
                onChange={(expectedOutput) => setEditing({ ...editing, value: { ...editing.value, expectedOutput } })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                {t('pointsLabel')}
                <input
                  type="number"
                  min={0}
                  className={cn(inputClass, 'w-24')}
                  value={editing.value.points}
                  onChange={(e) => setEditing({ ...editing, value: { ...editing.value, points: Number(e.target.value) } })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.value.isSample}
                  onChange={(e) => setEditing({ ...editing, value: { ...editing.value, isSample: e.target.checked } })}
                />
                {t('sampleCheckbox')}
              </label>
            </div>
          </div>
        )}
      </Modal>

      <SuggestTestsDialog
        open={suggesting}
        onClose={() => setSuggesting(false)}
        suggest={(request) => api.suggestTestCases(problemId, request)}
        addTest={async (test) => {
          const tc = await api.createTestCase(problemId, test);
          added.current = [...added.current, tc];
          onChange(added.current);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t('confirmDeleteTitle')}
        message={t('confirmDeleteBody')}
        loading={deleteBusy}
        onConfirm={doDelete}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}
