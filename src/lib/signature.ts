/** Same 3:1 frame as SignaturePad and the signature box on the AB PDF. */
const W = 600, H = 200;

/** Turns an uploaded signature image (photo / scan / PNG) into the format the
    pad draws: a 600×200 PNG, image centered and scaled to fit, with the paper
    background (near-white pixels) made transparent so only the ink remains. */
export function signatureFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas nicht verfügbar')); return; }
      const scale = Math.min(W / img.width, H / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      const data = ctx.getImageData(0, 0, W, H);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum > 215) px[i + 3] = 0;
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}
