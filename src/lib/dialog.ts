// In-app replacements for the browser's own alert / confirm / prompt boxes, so nothing looks like a browser popup.
export type DialogRequest =
  | { kind: 'alert'; message: string; resolve: () => void }
  | { kind: 'confirm'; message: string; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; message: string; resolve: (v: string | null) => void };

let listener: ((d: DialogRequest) => void) | null = null;
export function onDialog(fn: ((d: DialogRequest) => void) | null) { listener = fn; }

export function showAlert(message: string): Promise<void> {
  return new Promise((resolve) => { if (listener) listener({ kind: 'alert', message, resolve }); else resolve(); });
}
export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => { if (listener) listener({ kind: 'confirm', message, resolve }); else resolve(false); });
}
export function askPrompt(message: string): Promise<string | null> {
  return new Promise((resolve) => { if (listener) listener({ kind: 'prompt', message, resolve }); else resolve(null); });
}
