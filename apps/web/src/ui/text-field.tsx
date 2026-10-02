import { type ComponentPropsWithRef, useId } from 'react';

export interface TextFieldProps extends ComponentPropsWithRef<'input'> {
  label: string;
  /** Message shown under the input; marks the input invalid and is announced with it. */
  error?: string;
  hint?: string;
}

/** Labelled input. Spread `register('name')` from react-hook-form into it. */
export function TextField({ label, error, hint, id, className = '', ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-slate-900 aria-invalid:border-red-600"
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
