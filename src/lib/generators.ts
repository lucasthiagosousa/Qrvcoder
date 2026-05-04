import qrcode from 'qrcode';
import bwipjs from 'bwip-js';

export async function generateQrDataUrl(content: string, size: number = 400): Promise<string> {
  try {
    return await qrcode.toDataURL(content || 'empty', { margin: 2, width: size });
  } catch (err) {
    console.error('QR Generator Error:', err);
    return '';
  }
}

export async function generateBarcodeDataUrl(content: string): Promise<string> {
  if (!content) return '';
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      bwipjs.toCanvas(canvas, {
        bcid: 'code128',
        text: content,
        scale: 3,
        height: 15,
        includetext: true,
        textxalign: 'center',
        textsize: 12,
        textyoffset: -3,
        paddingheight: 3,
      });
      resolve(canvas.toDataURL('image/png'));
    } catch (e: any) {
      console.error('Barcode Generator Error:', e);
      let msg = e?.message || 'Formato ou tamanho inválido.';
      if (msg.includes('badLength')) {
          msg = msg.split(':')[1]?.trim() || msg;
      }
      reject(new Error(`Erro no Código de Barras: ${msg}`));
    }
  });
}
