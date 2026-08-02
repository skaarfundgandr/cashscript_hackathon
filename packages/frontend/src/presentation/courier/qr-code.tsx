import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * Rendered onto a white plate whatever the surrounding chrome, because scanners read contrast, not
 * design intent. Level M leaves room for a phone screen's glare without inflating the module count.
 */
export function QrCode({ value, size = 244, label }: { value: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(null);
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size * 2,
      color: { dark: '#0a0a0bff', light: '#ffffffff' },
    })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [value, size]);

  if (error) return <div className="c-qr c-qr-error" role="alert">{error}</div>;

  return (
    <div className="c-qr" style={{ width: size, height: size }}>
      {src && <img src={src} alt={label ?? 'QR code'} width={size} height={size} />}
    </div>
  );
}
