import type { ComponentPropsWithRef } from 'react';

const VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100',
  danger: 'bg-red-700 text-white hover:bg-red-600',
} as const;

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: keyof typeof VARIANTS;
}

/** Native button with the app's look. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({ variant = 'secondary', type = 'button', className = '', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
