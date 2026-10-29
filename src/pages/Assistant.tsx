import { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { askAssistant } from '../lib/payAdmin';

interface Msg { role: 'me' | 'ai'; text: string }
const IDEAS = ['How is the platform doing today?', 'Which M-Pesa errors happened in the last day and what do they mean?', 'How do I connect a business to Safaricom?', 'Which tab do I use to change a package price?'];

/** Read-only helper for the platform admin. It sees counts and scrubbed error lines, never keys, passwords or customer details. */
export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs, busy]);

  async function send(text: string) {
    const question = text.trim(); if (!question || busy) return;
    setQ(''); setBusy(true);
    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: 'me', text: question }]);
    const r = await askAssistant(question, history);
    setMsgs((m) => [...m, { role: 'ai', text: r.text || r.error || 'Sorry, I could not answer that.' }]);
    setBusy(false);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-11rem)] min-h-[420px]">
      <div className="mb-3"><h2 className="font-display font-semibold text-lg">Assistant</h2>
        <p className="text-xs text-slate-400">Ask about the platform, M-Pesa errors or how to do something in this portal. It can read summary numbers and recent errors. It cannot change anything and never sees keys, passwords or customer details.</p></div>
      <div ref={box} className="flex-1 overflow-y-auto card p-3 space-y-3">
        {msgs.length === 0 && (
          <div className="space-y-2"><p className="text-sm text-slate-400">Try one of these:</p>
            {IDEAS.map((i) => <button key={i} onClick={() => void send(i)} className="block w-full text-left text-sm card p-2.5 hover:border-slate-500">{i}</button>)}</div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap text-sm rounded-2xl px-3.5 py-2 ${m.role === 'me' ? 'bg-field-600 text-paper' : 'bg-slate-800 text-ink'}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="bg-slate-800 rounded-2xl px-3.5 py-2"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div></div>}
      </div>
      <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
        <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about ShopOS" maxLength={800} />
        <button className="btn-primary px-4" disabled={busy || !q.trim()} aria-label="Send"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}
