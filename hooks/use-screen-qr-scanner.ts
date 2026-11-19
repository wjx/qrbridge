"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Minimal typings for the native BarcodeDetector API (not yet in TS lib.dom)
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorInstance {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    qrDesktop?: { captureOutcome: () => Promise<{ status: string; at: number } | null> };
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
  }
}

// Up to 10 decode attempts/sec gives a 500ms QR several chances to be read.
// busyRef prevents overlapping work when decoding takes longer than this.
const SCAN_INTERVAL_MS = 100;
const MAX_FRAME_DIMENSION = 1920;

// Fractions of the captured video, independent of preview size.
export interface ScanRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseScreenQRScannerOptions {
  onDecode: (text: string) => void;
  desktop?: boolean;
  region?: ScanRegion | null;
  paused?: boolean;
}

export function useScreenQRScanner({ onDecode, desktop = false, region = null, paused = false }: UseScreenQRScannerOptions) {
  const [isScreenScanning, setIsScreenScanning] = useState(false);
  const [isScreenStarting, setIsScreenStarting] = useState(false);
  const [screenError, setScreenError] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const isStartingRef = useRef(false);
  const busyRef = useRef(false);
  const generationRef = useRef(0);
  const scanOptionsRef = useRef({ region, paused });
  scanOptionsRef.current = { region, paused };
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  // Determined after mount to avoid SSR hydration mismatches
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(!!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices);
  }, []);

  const releaseScreenResources = useCallback(() => {
    generationRef.current += 1;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    detectorRef.current = null;
  }, []);

  const stopScreenScanning = useCallback(() => {
    releaseScreenResources();
    isStartingRef.current = false;
    setIsScreenStarting(false);
    setIsScreenScanning(false);
  }, [releaseScreenResources]);

  const scanFrame = useCallback(async () => {
    const options = scanOptionsRef.current;
    if (options.paused || busyRef.current) return;
    const generation = generationRef.current;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;

    // Crop at source resolution BEFORE downscaling, retaining small QR details.
    const crop = options.region ?? { x: 0, y: 0, width: 1, height: 1 };
    const sx = crop.x * video.videoWidth;
    const sy = crop.y * video.videoHeight;
    const sw = crop.width * video.videoWidth;
    const sh = crop.height * video.videoHeight;
    const scale = Math.min(1, MAX_FRAME_DIMENSION / Math.max(sw, sh));
    const width = Math.max(1, Math.floor(sw * scale));
    const height = Math.max(1, Math.floor(sh * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    busyRef.current = true;
    try {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      if (detectorRef.current) {
        // Native BarcodeDetector: can find multiple QR codes in one frame
        const results = await detectorRef.current.detect(canvas);
        if (generation !== generationRef.current || scanOptionsRef.current.paused || scanOptionsRef.current.region !== options.region) return;
        for (const result of results) {
          if (result.rawValue) onDecodeRef.current(result.rawValue);
        }
      } else {
        // jsQR fallback: finds one QR code per frame
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (result?.data) onDecodeRef.current(result.data);
      }
    } catch {
      // Ignore per-frame decode errors and keep scanning
    } finally {
      busyRef.current = false;
    }
  }, []);

  const startScreenScanning = useCallback(async () => {
    if (isStartingRef.current) return false;

    setScreenError("");

    if (!isSupported) {
      setScreenError(
        "Screen capture is not supported in this browser. Try a desktop browser like Chrome, Edge, or Firefox."
      );
      return false;
    }

    isStartingRef.current = true;
    setIsScreenStarting(true);
    releaseScreenResources();
    setIsScreenScanning(false);

    let stream: MediaStream | null = null;
    const startedAt = Date.now();

    try {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 10 },
          audio: false,
        });
      } catch (initialError) {
        const errorName = initialError instanceof DOMException ? initialError.name : "";
        const shouldRetry = !desktop && ["NotReadableError", "AbortError", "OverconstrainedError"].includes(errorName);

        if (!shouldRetry) throw initialError;

        // Some deployed browser/OS combinations reject additional constraints.
        // Retry once using the browser's most compatible display-capture request.
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState === "ended") {
        throw new DOMException("No active display video track was returned.", "NotFoundError");
      }

      const video = videoRef.current;
      if (!video) {
        throw new DOMException("Screen preview is not available.", "InvalidStateError");
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      // Prepare the native detector if available
      if (window.BarcodeDetector) {
        try {
          detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch {
          detectorRef.current = null;
        }
      }

      // Stop automatically when the user ends sharing via the browser UI
      videoTrack.addEventListener("ended", stopScreenScanning, { once: true });

      intervalRef.current = setInterval(() => {
        void scanFrame();
      }, SCAN_INTERVAL_MS);

      setIsScreenScanning(true);
      return true;
    } catch (err) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      releaseScreenResources();

      const errorName = err instanceof DOMException ? err.name : "UnknownError";
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Only a confirmed picker cancellation is silent on desktop. Permission
      // rejection before the picker opens must remain visible for diagnosis.
      if (desktop) {
        const outcome = await window.qrDesktop?.captureOutcome().catch(() => null);
        if (outcome?.status === "cancelled" && outcome.at >= startedAt) return false;
        setScreenError(`Screen capture failed (${errorName}): ${errorMessage}. If no selection window appeared, please report this message.`);
        return false;
      }
      if (errorName === "NotAllowedError") return false;

      console.error("Screen capture error:", { name: errorName, message: errorMessage });

      if (errorName === "NotReadableError" || errorName === "AbortError") {
        setScreenError(
          "The browser could not start screen sharing. Close other screen-recording or sharing apps, check your system's screen-recording permission for this browser, then try again."
        );
      } else if (errorName === "NotFoundError") {
        setScreenError("No shareable screen or window was found in this browser or environment.");
      } else if (errorName === "InvalidStateError") {
        setScreenError("Screen capture must be started by clicking Capture Screen on the active page.");
      } else {
        setScreenError("Unable to capture the screen. Please try again.");
      }
      return false;
    } finally {
      isStartingRef.current = false;
      setIsScreenStarting(false);
    }
  }, [desktop, isSupported, releaseScreenResources, scanFrame, stopScreenScanning]);

  useEffect(() => {
    return () => {
      stopScreenScanning();
    };
  }, [stopScreenScanning]);

  return {
    isSupported,
    isScreenScanning,
    isScreenStarting,
    screenError,
    videoRef,
    startScreenScanning,
    stopScreenScanning,
  };
}
