import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Bot, Trash2, Check, X } from 'lucide-react';
import { askAssistant, confirmAssistantAction, type AssistantAction } from '../lib/payAdmin';

interface Msg { role: 'me' | 'ai'; text: string; action?: AssistantAction | null; settled?: 'done' | 'cancelled' }
const KEY = 'shopos.admin.chat.v1';
const IDEAS = ['What is waiting for me?', 'How is the platform doing today?', 'Any M-Pesa errors today, and what do they mean?', 'Which tab changes a package price?'];

function load(): Msg[] { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.slice(-40) : []; } catch { return []; } }

/** Chat helper for the platform admin. It can answer, list what is waiting, and prepare approve/decline actions for a business's branch requests.
 *  Nothing is changed until you press Confirm. It never sees keys, passwords or customer details. */
export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs, busy]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch { /* storage unavailable */ } }, [msgs]);

  async function send(text: string) {
    const question = text.trim(); if (!question || busy) return;
    setQ(''); setBusy(true);
    const history = msgs.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: 'me', text: question }]);
    const r = await askAssistant(question, history);
    setMsgs((m) => [...m, { role: 'ai', text: r.text || r.error || 'Sorry, I could not answer that.', action: r.action }]);
    setBusy(false);
  }
  async function decide(i: number, ok: boolean) {
    const a = msgs[i]?.action; if (!a) return;
    if (!ok) { setMsgs((m) => m.map((x, k) => k === i ? { ...x, settled: 'cancelled' } : x)); return; }
    setBusy(true);
    const r = await confirmAssistantAction(a);
    setMsgs((m) => [...m.map((x, k) => k === i ? { ...x, settled: 'done' as const } : x), { role: 'ai', text: r.text || r.error || 'Done.' }]);
    setBusy(false);
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)] min-h-[380px]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h2 className="font-display font-semibold text-lg">Assistant</h2>
          <p className="text-xs text-slate-400">Ask what is waiting, how things are going, or tell it to act, for example "approve Zawadi shop branch requests". It asks you to confirm before it changes anything.</p></div>
        {msgs.length > 0 && <button onClick={() => setMsgs([])} className="text-xs text-slate-400 hover:text-ink inline-flex items-center gap-1 shrink-0" aria-label="Clear chat"><Trash2 className="w-3.5 h-3.5" /> Clear</button>}
      </div>
      <div ref={box} className="flex-1 overflow-y-auto card p-3 space-y-3">
        {msgs.length === 0 && (
          <div className="space-y-2"><p className="text-sm text-slate-400">Try one of these:</p>
            {IDEAS.map((i) => <button key={i} onClick={() => void send(i)} className="block w-full text-left text-sm card p-2.5 hover:border-slate-500">{i}</button>)}</div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'me' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'ai' && <span className="w-7 h-7 rounded-full bg-field-600/20 text-field-600 flex items-center justify-center shrink-0 mt-0.5"><Bot className="w-4 h-4" /></span>}
            <div className="max-w-[85%] space-y-2">
              <div className={`whitespace-pre-wrap text-sm rounded-2xl px-3.5 py-2 ${m.role === 'me' ? 'bg-field-600 text-paper' : 'bg-slate-800 text-ink'}`}>{m.text}</div>
              {m.action && (
                <div className="card p-2.5 text-sm space-y-2">
                  <p className="font-medium">{m.action.label}</p>
                  {m.settled ? <p className="text-xs text-slate-400">{m.settled === 'done' ? 'Confirmed.' : 'Cancelled.'}</p> : (
                    <div className="flex gap-2">
                      <button onClick={() => void decide(i, true)} disabled={busy} className="btn-primary text-xs !py-1.5 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Confirm</button>
                      <button onClick={() => void decide(i, false)} disabled={busy} className="btn-secondary text-xs !py-1.5 inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="bg-slate-800 rounded-2xl px-3.5 py-2"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div></div>}
      </div>
      <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
        <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask or tell me what to do" maxLength={800} />
        <button className="btn-primary px-4" disabled={busy || !q.trim()} aria-label="Send"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}
