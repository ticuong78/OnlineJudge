'use client';

import type { ClassroomDto, UpsertClassroomRequest } from '@oj/contracts';
import { Check, Copy, Wand2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CLASS_CODE_RE, normalizeClassCode, suggestClassCode } from '@/lib/classes';
import { useAsync } from '@/lib/use-async';
import { cn, copyToClipboard } from '@/lib/utils';
import { useToast } from './toast';
import { Badge, Button, Field, InlineAlert, inputClass, Modal } from './ui';

/** A class join code, set large so it can be read aloud or copied onto the board. */
export function ClassCode({ code, size = 'md' }: { code: string; size?: 'sm' | 'md' | 'lg' }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'grid-paper rounded-control border border-rule font-mono font-semibold tracking-[0.18em] text-ink-700 select-all',
          size === 'sm' && 'px-2 py-0.5 text-base',
          size === 'md' && 'px-3 py-1 text-xl',
          size === 'lg' && 'px-4 py-2 text-3xl',
        )}
        aria-label={`Mã lớp ${code.split('').join(' ')}`}
      >
        {code}
      </span>
      <button
        type="button"
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (await copyToClipboard(code)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="rounded-control p-1.5 text-slate-500 hover:bg-slate-100 hover:text-ink-700"
        aria-label={copied ? 'Đã sao chép mã lớp' : 'Sao chép mã lớp'}
        title={copied ? 'Đã sao chép' : 'Sao chép mã lớp'}
      >
        {copied ? <Check className="h-4 w-4 text-chalk-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </span>
  );
}

/** Code input: uppercases while typing, with a "Gợi ý" button that builds a code from the class name. */
export function ClassCodeInput({
  value,
  onChange,
  name,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  name: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <input
        className={cn(inputClass, 'font-mono tracking-[0.15em]')}
        value={value}
        onChange={(e) => onChange(normalizeClassCode(e.target.value))}
        placeholder="22DTHC5"
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        aria-label="Mã lớp"
      />
      <Button variant="secondary" onClick={() => onChange(suggestClassCode(name || 'LOP'))} title="Tạo mã từ tên lớp">
        <Wand2 className="h-4 w-4" />
        Gợi ý
      </Button>
    </div>
  );
}

/** "3 yêu cầu chờ duyệt" on class cards; nothing when there are none. */
export function PendingRequestsBadge({ count, className }: { count: number | undefined; className?: string }) {
  if (!count) return null;
  return (
    <Badge className={cn('bg-amber-100 text-amber-800 ring-1 ring-amber-200 tabular-nums', className)}>
      {count} yêu cầu chờ duyệt
    </Badge>
  );
}

/** Teachers who can own a class (TEACHER and ADMIN). Admin only. */
export function TeacherSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data, loading } = useAsync(() => api.listUsers(), []);
  const teachers = (data ?? []).filter((u) => u.role === 'TEACHER' || u.role === 'ADMIN');
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      {loading && <option value={value}>Đang tải...</option>}
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.displayName}
          {t.role === 'ADMIN' && !/quản trị/i.test(t.displayName) ? ' (quản trị viên)' : ''}
        </option>
      ))}
    </select>
  );
}

export function ClassFormModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: ClassroomDto;
  onSaved: (c: ClassroomDto) => void;
}) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const myOrganizations = user?.organizations ?? [];
  // OJ-8: an org admin may hand an organization class to another member of the organization.
  const orgOfClass = initial?.organization?.id ?? null;
  const orgAdminOfClass = !isAdmin && !!orgOfClass && myOrganizations.some((o) => o.organizationId === orgOfClass && o.role === 'ADMIN');
  const orgMembers = useAsync(
    () => (open && orgAdminOfClass && orgOfClass ? api.getOrganization(orgOfClass).then((o) => o.members) : Promise.resolve([])),
    [open, orgAdminOfClass, orgOfClass],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setCode(initial?.code ?? '');
    setTeacherId(initial?.teacherId ?? user?.id ?? '');
    setOrganizationId('');
    setCodeTouched(!!initial);
    setError(null);
  }, [open, initial, user?.id]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Nhập tên lớp, ví dụ "Tin học 11A1".');
    if (!CLASS_CODE_RE.test(code)) return setError('Mã lớp cần 4 đến 20 ký tự gồm chữ, số hoặc dấu gạch ngang.');
    setSaving(true);
    try {
      const body: UpsertClassroomRequest = { name: name.trim(), code };
      if (isAdmin || orgAdminOfClass) body.teacherId = teacherId || null;
      if (!initial && organizationId) body.organizationId = organizationId;
      const c = initial ? await api.updateClass(initial.id, body) : await api.createClass(body);
      toast.success(initial ? 'Đã lưu lớp' : `Đã tạo lớp ${c.name}`);
      onSaved(c);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Sửa lớp' : 'Tạo lớp'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {initial ? 'Lưu lớp' : 'Tạo lớp'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tên lớp">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!codeTouched) setCode(e.target.value.trim() ? suggestClassCode(e.target.value) : '');
            }}
            placeholder="Tin học 11A1"
            autoFocus
          />
        </Field>
        <Field label="Mã lớp" hint="Học sinh nhập mã này để xin vào lớp. Tự đặt mã dễ đọc, ví dụ 22DTHC5.">
          <ClassCodeInput
            value={code}
            name={name}
            onChange={(v) => {
              setCodeTouched(true);
              setCode(v);
            }}
          />
        </Field>
        {isAdmin && (
          <Field label="Giáo viên phụ trách">
            <TeacherSelect value={teacherId} onChange={setTeacherId} />
          </Field>
        )}
        {orgAdminOfClass && (
          <Field label="Giáo viên phụ trách" hint={`Chọn một giáo viên của ${initial?.organization?.name}.`}>
            <select className={inputClass} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              {(orgMembers.data ?? []).map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
              {!orgMembers.data?.some((m) => m.userId === teacherId) && <option value={teacherId}>{initial?.teacherName}</option>}
            </select>
          </Field>
        )}
        {!initial && !isAdmin && myOrganizations.length > 0 && (
          <Field
            label="Lớp thuộc"
            hint="Lớp của tổ chức do quản lý tổ chức cùng quản lý và thuộc về tổ chức khi bạn rời đi. Lớp cá nhân chỉ bạn quản lý."
          >
            <select className={inputClass} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              <option value="">Cá nhân</option>
              {myOrganizations.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>
                  {o.organizationName}
                </option>
              ))}
            </select>
          </Field>
        )}
        {error && <InlineAlert>{error}</InlineAlert>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/**
 * Inline "Thêm vào lớp" control: pick a managed class, then add the student to it.
 * Adding never removes the student from other classes (a student may be in several).
 */
export function MoveStudentControl({
  studentId,
  excludeClassId,
  classes,
  label = 'Thêm vào lớp khác',
  onMoved,
}: {
  studentId: string;
  /** The class the row is shown in, left out of the options. */
  excludeClassId: string | null;
  classes: ClassroomDto[];
  label?: string;
  onMoved: (classId: string) => void;
}) {
  const toast = useToast();
  const options = classes.filter((c) => c.id !== excludeClassId);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  if (options.length === 0) return excludeClassId ? null : <span className="text-xs text-slate-400">Chưa có lớp nào đang học</span>;
  const add = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.moveStudent(studentId, target);
      const c = classes.find((x) => x.id === target);
      toast.success(`Đã thêm vào lớp ${c?.name ?? ''}`);
      setTarget('');
      onMoved(target);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <select
        className={cn(inputClass, 'w-auto py-1 text-sm')}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        aria-label={label}
      >
        <option value="">{label}…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button size="sm" variant="secondary" onClick={add} disabled={!target} loading={busy}>
        Thêm vào lớp
      </Button>
    </span>
  );
}
