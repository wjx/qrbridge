"use client";

import { forwardRef, useMemo } from "react";
import { createQRBase, createQRVariant, qrSVGGeometry } from "@/lib/qr-symbol";

export const MaskedQRCode = forwardRef<SVGSVGElement, {
  value: string;
  size: number;
  variant: number;
  label: string;
}>(function MaskedQRCode({ value, size, variant, label }, ref) {
  const base = useMemo(() => createQRBase(value), [value]);
  const symbol = useMemo(() => createQRVariant(value, base, variant), [value, base, variant]);
  const geometry = useMemo(() => qrSVGGeometry(symbol), [symbol]);
  return (
    <svg ref={ref} width={size} height={size} viewBox={`0 0 ${geometry.size} ${geometry.size}`}
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label}
      className="shrink-0" shapeRendering="crispEdges" data-qr-mask={symbol.maskPattern}>
      <rect width={geometry.size} height={geometry.size} fill="#ffffff" />
      <path d={geometry.path} fill="#000000" />
    </svg>
  );
});
