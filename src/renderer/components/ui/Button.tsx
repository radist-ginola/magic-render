import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
};

/** Presentational button primitive. Defaults to type="button" to avoid accidental form submits. */
export function Button({
  type = 'button',
  variant = 'secondary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps): JSX.Element {
  const classes = [
    'mrp-ui-button',
    `mrp-ui-button--${variant}`,
    `mrp-ui-button--${size}`,
    fullWidth ? 'mrp-ui-button--full' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...props}>
      {leadingIcon != null && <span className="mrp-ui-button__icon" aria-hidden="true">{leadingIcon}</span>}
      {children}
      {trailingIcon != null && <span className="mrp-ui-button__icon" aria-hidden="true">{trailingIcon}</span>}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, 'children' | 'leadingIcon' | 'trailingIcon'> & {
  icon: ReactNode;
  label: string;
};

export function IconButton({ icon, label, className = '', title, ...props }: IconButtonProps): JSX.Element {
  return (
    <Button
      {...props}
      title={title ?? label}
      aria-label={label}
      className={['mrp-ui-icon-button', className].filter(Boolean).join(' ')}
    >
      <span className="mrp-ui-button__icon" aria-hidden="true">{icon}</span>
    </Button>
  );
}
