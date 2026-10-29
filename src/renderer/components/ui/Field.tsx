import type { JSX, ReactNode } from 'react';

export type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

/** Label + help/error text wrapper; caller retains ownership of control state. */
export function Field({ label, htmlFor, hint, error, required = false, children, className = '' }: FieldProps): JSX.Element {
  const classes = ['mrp-ui-field', error ? 'mrp-ui-field--invalid' : '', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <label className="mrp-ui-field__label" htmlFor={htmlFor}>
        {label}
        {required && <span className="mrp-ui-field__required" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? <span className="mrp-ui-field__error" role="alert">{error}</span> : hint ? <span className="mrp-ui-field__hint">{hint}</span> : null}
    </div>
  );
}
