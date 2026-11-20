// Foto verkleinen voordat hij wordt geüpload (telefoonfoto's zijn vaak 4-8 MB).
export async function verkleinFoto(bestand: Blob, max = 1600, kwaliteit = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(bestand);
    const schaal = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * schaal), h = Math.round(bmp.height * schaal);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return await new Promise<Blob>((ok, fout) => canvas.toBlob((b) => (b ? ok(b) : fout(new Error("Foto kon niet worden verwerkt"))), "image/jpeg", kwaliteit));
  } catch {
    return bestand; // onbekend formaat: origineel gebruiken
  }
}

export function blobNaarDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, fout) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fout(r.error); r.readAsDataURL(b); });
}
