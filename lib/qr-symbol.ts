import QRCode from "qrcode";

export function createQRBase(value: string) {
  const symbol = QRCode.create(value, { errorCorrectionLevel: "Q" });
  if (symbol.maskPattern === undefined) throw new Error("QR encoder did not select a mask");
  return { ...symbol, maskPattern: symbol.maskPattern };
}

export function createQRVariant(value: string, base: ReturnType<typeof createQRBase>, variant: number) {
  if (!Number.isInteger(variant) || variant < 0 || variant > 7) throw new Error("Invalid QR mask variant");
  if (variant === 0) return base;
  const maskPattern = ((base.maskPattern + variant) % 8) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const symbol = QRCode.create(value, {
    errorCorrectionLevel: "Q",
    version: base.version,
    maskPattern,
  });
  return { ...symbol, maskPattern };
}

/** A four-module quiet zone remains identical for all masks. */
export function qrSVGGeometry(symbol: ReturnType<typeof createQRBase>) {
  const { size, data } = symbol.modules;
  const paths: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size;) {
      if (!data[y * size + x]) { x++; continue; }
      const start = x;
      while (x < size && data[y * size + x]) x++;
      paths.push(`M${start + 4} ${y + 4}h${x - start}v1h-${x - start}z`);
    }
  }
  return { size: size + 8, path: paths.join("") };
}
