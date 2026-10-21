import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
}

/** A plain password input with no way to check what you actually typed is
 * exactly the kind of thing that causes a "passwords don't match" error
 * nobody can see the cause of — this adds the show/hide toggle every
 * password field in the app was missing. */
export function PasswordInput({ value, onChange, placeholder, minLength, required, autoFocus, id }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-10"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
