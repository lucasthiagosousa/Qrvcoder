import React, { useEffect, useState } from 'react';
import { generateQrDataUrl, generateBarcodeDataUrl } from '../lib/generators';

export const QrImage = ({ content, size = 400, className, alt = "QR Code", onError }: { content: string, size?: number, className?: string, alt?: string, onError?: (e: any) => void }) => {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    if (content) {
      generateQrDataUrl(content, size).then(setSrc);
    }
  }, [content, size]);

  if (!src) return null;
  return <img src={src} className={className} alt={alt} onError={onError} />;
};

export const BarcodeImage = ({ content, className, alt = "Barcode", onError }: { content?: string, className?: string, alt?: string, onError?: (e: any) => void }) => {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    if (content) {
      generateBarcodeDataUrl(content).then(setSrc).catch(() => setSrc(''));
    }
  }, [content]);

  if (!src) return null;
  return <img src={src} className={className} alt={alt} onError={onError} />;
};
