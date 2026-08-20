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
  const [isScreenStarting, setIsScreenStarting] = useState(false);
  const [screenError, setScreenError] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const isStartingRef = useRef(false);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  // Determined after mount to avoid SSR hydration mismatches
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(!!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices);
  }, []);

  const releaseScreenResources = useCallback(() => {
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

    try {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 10 },
          audio: false,
        });
      } catch (initialError) {
        const errorName = initialError instanceof DOMException ? initialError.name : "";
        const shouldRetry = ["NotReadableError", "AbortError", "OverconstrainedError"].includes(errorName);

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

      // Closing the picker or denying permission is an intentional user action.
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
  }, [isSupported, releaseScreenResources, scanFrame, stopScreenScanning]);

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
