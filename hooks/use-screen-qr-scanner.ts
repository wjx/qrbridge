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
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
  }
}

const SCAN_INTERVAL_MS = 400;
const MAX_FRAME_DIMENSION = 1920;

interface UseScreenQRScannerOptions {
  onDecode: (text: string) => void;
}

export function useScreenQRScanner({ onDecode }: UseScreenQRScannerOptions) {
  const [isScreenScanning, setIsScreenScanning] = useState(false);
  const [screenError, setScreenError] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  // Determined after mount to avoid SSR hydration mismatches
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(!!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices);
  }, []);

  const stopScreenScanning = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScreenScanning(false);
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;

    // Downscale very large frames (e.g. 4K screens) to keep decoding fast
    const scale = Math.min(1, MAX_FRAME_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.floor(video.videoWidth * scale);
    canvas.height = Math.floor(video.videoHeight * scale);

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      if (detectorRef.current) {
        // Native BarcodeDetector: can find multiple QR codes in one frame
        const results = await detectorRef.current.detect(canvas);
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
    }
  }, []);

  const startScreenScanning = useCallback(async () => {
    setScreenError("");

    if (!isSupported) {
      setScreenError(
        "Screen capture is not supported in this browser. Try a desktop browser like Chrome, Edge, or Firefox."
      );
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10 },
        audio: false,
      });
      streamRef.current = stream;

      // Prepare the native detector if available
      if (window.BarcodeDetector) {
        try {
          detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch {
          detectorRef.current = null;
        }
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }

      // Stop automatically when the user ends sharing via the browser UI
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopScreenScanning();
      });

      intervalRef.current = setInterval(() => {
        void scanFrame();
      }, SCAN_INTERVAL_MS);

      setIsScreenScanning(true);
      return true;
    } catch (err) {
      // User cancelled the screen picker — not an error worth showing
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        return false;
      }
      console.error("Screen capture error:", err);
      setScreenError("Unable to capture the screen. Please try again.");
      return false;
    }
  }, [isSupported, scanFrame, stopScreenScanning]);

  useEffect(() => {
    return () => {
      stopScreenScanning();
    };
  }, [stopScreenScanning]);

  return {
    isSupported,
    isScreenScanning,
    screenError,
    videoRef,
    startScreenScanning,
    stopScreenScanning,
  };
}
