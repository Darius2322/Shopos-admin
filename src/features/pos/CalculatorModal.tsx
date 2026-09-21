import { useState } from 'react';
import { X, Delete } from 'lucide-react';

const KEYS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '=']
];

function calculate(a: number, op: string, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
    default: return b;
  }
}

export function CalculatorModal({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [freshEntry, setFreshEntry] = useState(true);

  function press(key: string) {
    if (key === 'C') {
      setDisplay('0'); setStored(null); setPendingOp(null); setFreshEntry(true);
      return;
    }
    if (key === '⌫') {
      setDisplay((d) => (d.length > 1 ? d.slice(0, -1) : '0'));
      return;
    }
    if (key === '±') {
      setDisplay((d) => (d.startsWith('-') ? d.slice(1) : d === '0' ? d : `-${d}`));
      return;
    }
    if (key === '%') {
      setDisplay((d) => String(parseFloat(d) / 100));
      return;
    }
    if (['+', '-', '×', '÷'].includes(key)) {
      const current = parseFloat(display);
      if (stored !== null && pendingOp) {
        setDisplay(String(round(calculate(stored, pendingOp, current))));
        setStored(calculate(stored, pendingOp, current));
      } else {
        setStored(current);
      }
      setPendingOp(key);
      setFreshEntry(true);
      return;
    }
    if (key === '=') {
      if (stored !== null && pendingOp) {
        const result = calculate(stored, pendingOp, parseFloat(display));
        setDisplay(String(round(result)));
        setStored(null);
        setPendingOp(null);
        setFreshEntry(true);
      }
      return;
    }
    if (key === '.') {
      setDisplay((d) => (freshEntry ? '0.' : d.includes('.') ? d : d + '.'));
      setFreshEntry(false);
      return;
    }
    // digit
    setDisplay((d) => (freshEntry || d === '0' ? key : d + key));
    setFreshEntry(false);
  }

  function round(n: number) {
    return Math.round(n * 1e8) / 1e8;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-xs bg-paper-raised rounded-t-2xl md:rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold">Calculator</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="bg-paper rounded-card p-4 mb-3 text-right">
          <div className="tnum text-3xl font-semibold truncate">{display}</div>
          {pendingOp && <div className="text-xs text-slate-500 tnum">{stored} {pendingOp}</div>}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {KEYS.flat().map((key) => (
            <button
              key={key}
              onClick={() => press(key)}
              className={`h-14 rounded-card text-lg font-medium flex items-center justify-center ${
                key === '=' ? 'bg-field-600 text-white' :
                ['÷', '×', '-', '+'].includes(key) ? 'bg-field-50 text-field-700' :
                key === 'C' ? 'bg-rust-50 text-rust-600' : 'bg-paper text-ink'
              }`}
            >
              {key === '⌫' ? <Delete className="w-5 h-5" /> : key}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
