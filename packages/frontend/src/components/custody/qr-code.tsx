import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';

export function QrCode({ value, label }: { value: Record<string, string>; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(false);
    void QRCode.toCanvas(canvas, JSON.stringify(value), {
      width: 280,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#111111', light: '#ffffff' },
    }).catch(() => setError(true));
  }, [value]);

  if (error) return <p className="custody-qr-error" role="alert">Could not create {label}.</p>;
  return <canvas className="custody-qr-code" ref={canvasRef} aria-label={label} role="img" />;
}
