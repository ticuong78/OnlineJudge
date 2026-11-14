import { tr } from '@/i18n/runtime';

/** The parts of a ValidityState and a field's limits that pick the message; plain data so it is testable in Node. */
export interface ValidityFacts {
  valueMissing: boolean;
  typeMismatch: boolean;
  tooShort: boolean;
  tooLong: boolean;
  rangeUnderflow: boolean;
  rangeOverflow: boolean;
  patternMismatch: boolean;
  stepMismatch: boolean;
  badInput: boolean;
  type: string;
  minLength: number;
  maxLength: number;
  min: string;
  max: string;
}

/**
 * The interface's own wording for a browser validation failure (UAT L4): the browser's bubble is in the browser's
 * language ("Please fill out this field." on a Vietnamese page). `null` for cases with no specific message.
 */
export function validityMessage(f: ValidityFacts): string | null {
  const t = tr();
  if (f.valueMissing) return t('common.validation.required');
  if (f.typeMismatch && f.type === 'email') return t('common.validation.email');
  if (f.tooShort) return t('common.validation.tooShort', { min: f.minLength });
  if (f.tooLong) return t('common.validation.tooLong', { max: f.maxLength });
  if (f.rangeUnderflow) return t('common.validation.rangeUnderflow', { min: f.min });
  if (f.rangeOverflow) return t('common.validation.rangeOverflow', { max: f.max });
  if (f.typeMismatch || f.patternMismatch || f.stepMismatch || f.badInput) return t('common.validation.invalid');
  return null;
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isControl(el: EventTarget | null): el is Control {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/** Installs the translated messages for every form on the page; returns the clean-up. Browser only. */
export function localizeValidation(doc: Document): () => void {
  const onInvalid = (e: Event) => {
    const el = e.target;
    if (!isControl(el)) return;
    el.setCustomValidity(''); // re-evaluate the native state, not our previous message
    const v = el.validity;
    const message = validityMessage({
      valueMissing: v.valueMissing,
      typeMismatch: v.typeMismatch,
      tooShort: v.tooShort,
      tooLong: v.tooLong,
      rangeUnderflow: v.rangeUnderflow,
      rangeOverflow: v.rangeOverflow,
      patternMismatch: v.patternMismatch,
      stepMismatch: v.stepMismatch,
      badInput: v.badInput,
      type: el instanceof HTMLInputElement ? el.type : '',
      minLength: 'minLength' in el ? el.minLength : -1,
      maxLength: 'maxLength' in el ? el.maxLength : -1,
      min: el instanceof HTMLInputElement ? el.min : '',
      max: el instanceof HTMLInputElement ? el.max : '',
    });
    if (message) el.setCustomValidity(message);
  };
  // A custom message makes the field invalid until cleared, so clear it as soon as the user edits.
  const onEdit = (e: Event) => {
    if (isControl(e.target)) e.target.setCustomValidity('');
  };
  doc.addEventListener('invalid', onInvalid, true);
  doc.addEventListener('input', onEdit, true);
  doc.addEventListener('change', onEdit, true);
  return () => {
    doc.removeEventListener('invalid', onInvalid, true);
    doc.removeEventListener('input', onEdit, true);
    doc.removeEventListener('change', onEdit, true);
  };
}
