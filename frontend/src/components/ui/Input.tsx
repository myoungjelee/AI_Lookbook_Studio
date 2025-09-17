import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

const Input: React.FC<InputProps> = ({
    label,
    error,
    helperText,
    leftIcon,
    rightIcon,
    className = '',
    id,
    ...props
}) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const baseClasses = 'block w-full rounded-[12px] border border-[var(--divider)] bg-[var(--surface-bg)] px-3 py-2 text-sm text-[var(--text-base)] placeholder-[var(--text-muted)] shadow-sm transition-colors focus:border-[#111111] focus:outline-none focus:ring-1 focus:ring-[#111111] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-muted)]';

    const errorClasses = error ? 'border-[#d6001c] focus:border-[#d6001c] focus:ring-[#d6001c]' : '';

    const paddingClasses = leftIcon && rightIcon
        ? 'pl-10 pr-10'
        : leftIcon
            ? 'pl-10'
            : rightIcon
                ? 'pr-10'
                : '';

    const inputClasses = `${baseClasses} ${errorClasses} ${paddingClasses} ${className}`;

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-[var(--text-base)]">
                    {label}
                </label>
            )}
            <div className="relative">
                {leftIcon && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-muted)]">
                        <div className="h-5 w-5">
                            {leftIcon}
                        </div>
                    </div>
                )}
                <input
                    id={inputId}
                    className={inputClasses}
                    {...props}
                />
                {rightIcon && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--text-muted)]">
                        <div className="h-5 w-5">
                            {rightIcon}
                        </div>
                    </div>
                )}
            </div>
            {error && (
                <p className="mt-1 text-sm text-[#d6001c]">{error}</p>
            )}
            {helperText && !error && (
                <p className="mt-1 text-sm text-[var(--text-muted)]">{helperText}</p>
            )}
        </div>
    );
};

export default Input;
