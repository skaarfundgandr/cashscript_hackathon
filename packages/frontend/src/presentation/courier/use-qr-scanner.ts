import jsQRModule from 'jsqr';
import type { Options, QRCode } from 'jsqr';
import { useEffect, useRef, useState } from 'react';

type DecodeQr = (data: Uint8ClampedArray, width: number, height: number, options?: Options) => QRCode | null;

/**
 * jsqr ships an ES-style `.d.ts` inside a CommonJS package, so under NodeNext resolution the
 * default import types as the module namespace rather than the function. The UMD bundle exposes the
 * callable both ways (`module.exports` is the function and carries a `default` alias), so the
 * callable is picked at runtime and the type asserted exactly once, here.
 */
const jsQRCandidate: unknown = jsQRModule;
const decodeQr = (typeof jsQRCandidate === 'function'
  ? jsQRCandidate
  : (jsQRCandidate as { default: DecodeQr }).default) as DecodeQr;

export type ScannerStatus = 'idle' | 'starting' | 'running' | 'error';

/** Decoding every frame is wasted work; a courier lines a box up over hundreds of milliseconds. */
const DECODE_INTERVAL_MS = 90;
/** Long side the frame is downscaled to before decoding. Enough for a printed label at arm's length. */
const DECODE_EDGE = 640;
/** A QR sitting in frame decodes continuously. Ignore a repeat of the same value for this long. */
const REPEAT_GUARD_MS = 2500;

function cameraMessage(error: unknown): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Cameras need HTTPS outside localhost. Use Paste below.';
  }
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was refused. Allow it in the address bar, or use Paste below.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera available on this device. Use Paste below.';
    case 'NotReadableError':
      return 'The camera is already in use by another app. Close it, or use Paste below.';
    default: {
      const reason = error instanceof Error && error.message ? error.message.replace(/\.?$/, '.') : '';
      return `${reason || 'The camera would not open.'} Use Paste below.`;
    }
  }
}

/**
 * Camera QR decoding, with the paste box as the standing alternative rather than a fallback that
 * only appears on failure: a camera that will not open mid-recording ends the demo session.
 *
 * `onDecode` is read through a ref so a changing handler never tears down the stream — restarting
 * the camera costs a visible second and a permission flicker.
 */
export function useQrScanner(active: boolean, onDecode: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) {
      setStatus('idle');
      setError(null);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let lastDecodeAt = 0;
    let lastText = '';
    let lastTextAt = 0;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!video || !context || video.readyState < video.HAVE_CURRENT_DATA) return;
      if (now - lastDecodeAt < DECODE_INTERVAL_MS) return;
      lastDecodeAt = now;

      const { videoWidth: width, videoHeight: height } = video;
      if (!width || !height) return;

      const scale = Math.min(1, DECODE_EDGE / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = decodeQr(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (!found?.data) return;

      if (found.data === lastText && now - lastTextAt < REPEAT_GUARD_MS) return;
      lastText = found.data;
      lastTextAt = now;
      onDecodeRef.current(found.data);
    };

    const start = async () => {
      setStatus('starting');
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser cannot open a camera here.');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return;

        const video = videoRef.current;
        if (!video) throw new Error('The camera surface went away.');
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        setStatus('running');
        frame = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(cameraMessage(err));
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active, attempt]);

  return { videoRef, status, error, retry: () => setAttempt((n) => n + 1) };
}
