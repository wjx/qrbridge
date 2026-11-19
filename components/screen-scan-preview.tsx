"use client";

import { useRef, useState, type PointerEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import type { ScanRegion } from "@/hooks/use-screen-qr-scanner";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  selecting: boolean;
  region: ScanRegion | null;
  onSelect: (region: ScanRegion | null) => void;
  onReselect: () => void;
}

export function ScreenScanPreview({ videoRef, selecting, region, onSelect, onReselect }: Props) {
  const drag = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const [draft, setDraft] = useState<ScanRegion | null>(null);
  const [hint, setHint] = useState("");
  const visibleRegion = selecting ? draft : region;

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const rectangle = (event: PointerEvent<HTMLDivElement>): ScanRegion | null => {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) return null;
    const end = point(event);
    return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  };
  const resetDrag = () => {
    drag.current = null;
    setDraft(null);
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border bg-muted">
        {/* The video has intrinsic aspect ratio and no letterboxing; overlay coordinates map directly to it. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} muted playsInline className="block h-auto w-full" aria-label="Screen capture preview" />
        <div
          className={`absolute inset-0 overflow-hidden ${selecting ? "cursor-crosshair touch-none" : "pointer-events-none"}`}
          aria-label="Drag to select the QR scanning area"
          onPointerDown={(event) => {
            if (!selecting || event.button !== 0 || drag.current) return;
            event.preventDefault();
            drag.current = { ...point(event), pointerId: event.pointerId };
            setDraft(null);
            setHint("");
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (selecting && drag.current) setDraft(rectangle(event));
          }}
          onPointerUp={(event) => {
            const next = rectangle(event);
            if (!next) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            resetDrag();
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (next.width * bounds.width < 16 || next.height * bounds.height < 16) {
              setHint("Area too small. Drag a larger rectangle around the entire QR code, including its white border.");
              return;
            }
            setHint("");
            onSelect(next);
          }}
          onPointerCancel={resetDrag}
          onLostPointerCapture={resetDrag}
        >
          {visibleRegion && (
            <div className="absolute border-2 border-green-400 bg-green-400/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ left: `${visibleRegion.x * 100}%`, top: `${visibleRegion.y * 100}%`, width: `${visibleRegion.width * 100}%`, height: `${visibleRegion.height * 100}%` }} />
          )}
        </div>
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-background/90 px-2 py-1 text-xs">
          {selecting ? "Scanning paused — select an area" : region ? "Scanning selected area" : "Scanning full window"}
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground" role="status">
        {hint || (selecting ? "Drag around the entire QR code, including its white border, or use the full window." : "If the QR code moves, reselect its area or restore full-window scanning.")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {!selecting && <Button variant="outline" size="sm" onClick={() => { resetDrag(); setHint(""); onReselect(); }}>Reselect Area</Button>}
        {selecting && region && <Button variant="outline" size="sm" onClick={() => { resetDrag(); setHint(""); onSelect(region); }}>Cancel Selection</Button>}
        <Button variant="outline" size="sm" disabled={!selecting && !region} onClick={() => { resetDrag(); setHint(""); onSelect(null); }}>Use Full Window</Button>
      </div>
    </div>
  );
}
