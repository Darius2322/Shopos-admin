import { useEffect, useRef, useState } from 'react';
import { X, Flashlight, FlashlightOff, Keyboard } from 'lucide-react';

interface BarcodeScannerModalProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  title?: string;
}

/**
 * Uses the native BarcodeDetector API (Chrome/Edge/Android WebView — the
 * primary target here) so no extra scanning library or model download is
 * needed. When the API or camera isn't available, this never fakes a scan —
 * it drops straight to a manual barcode entry field instead, per the spec's
 * "do not fake barcode scanning" requirement.
 */
export function BarcodeScannerModal({ onDetected, onClose, title = 'Scan barcode' }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);

  const [status, setStatus] = useState<'starting' | 'scanning' | 'unsupported' | 'denied' | 'error'>('starting');
  const [manualCode, setManualCode] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!('BarcodeDetector' in window)) {
        setStatus('unsupported');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as any;
        setTorchAvailable(!!capabilities?.torch);

        setStatus('scanning');
        runDetectionLoop();
      } catch (err) {
        setStatus(err instanceof Error && err.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    }

    function runDetectionLoop() {
      const DetectorCtor = (window as any).BarcodeDetector;
      const detector = new DetectorCtor({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf']
      });

      async function tick() {
        if (cancelled || detectedRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0 && !detectedRef.current) {
              detectedRef.current = true;
              handleDetected(codes[0].rawValue);
              return;
            }
          } catch {
            // transient detection errors (e.g. frame not ready) — keep looping
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleDetected(code: string) {
    if (navigator.vibrate) navigator.vibrate(80);
    playBeep();
    onDetected(code);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn((t) => !t);
    } catch {
      // torch control not actually supported on this device despite capability flag — ignore
    }
  }

  function submitManual() {
    const code = manualCode.trim();
    if (!code) return;
    handleDetected(code);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-white text-sm font-medium">{title}</span>
        <div className="flex items-center gap-2">
          {status === 'scanning' && torchAvailable && (
            <button onClick={toggleTorch} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white" aria-label="Toggle flashlight">
              {torchOn ? <FlashlightOff className="w-4.5 h-4.5" /> : <Flashlight className="w-4.5 h-4.5" />}
            </button>
          )}
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white" aria-label="Close scanner">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {(status === 'starting' || status === 'scanning') && (
        <div className="relative flex-1 min-h-0">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-40 border-2 border-field-500 rounded-2xl" />
          </div>
          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/70 text-sm">Starting camera…</span>
            </div>
          )}
        </div>
      )}

      {(status === 'unsupported' || status === 'denied' || status === 'error') && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-white text-sm font-medium mb-1">
            {status === 'denied' ? 'Camera access was denied' : 'Camera scanning isn\'t available'}
          </p>
          <p className="text-white/60 text-xs mb-5 max-w-xs">
            {status === 'unsupported' && "This browser doesn't support in-browser barcode scanning. Enter the code manually below."}
            {status === 'denied' && 'Allow camera access in your browser settings, or enter the barcode manually below.'}
            {status === 'error' && "Couldn't start the camera. Enter the barcode manually below."}
          </p>
        </div>
      )}

      <div className="shrink-0 p-4 bg-black/80 flex items-center gap-2">
        <div className="relative flex-1">
          <Keyboard className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="w-full bg-white/10 text-white placeholder-white/40 rounded-card pl-9 pr-3 py-2.5 text-sm outline-none focus:bg-white/15"
            placeholder="Or type barcode manually"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
            autoFocus={status === 'unsupported' || status === 'denied' || status === 'error'}
          />
        </div>
        <button onClick={submitManual} disabled={!manualCode.trim()} className="btn-primary px-4 py-2.5 text-sm disabled:opacity-40">
          Use
        </button>
      </div>
    </div>
  );
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch {
    // audio not available — vibration feedback already covers this
  }
}
