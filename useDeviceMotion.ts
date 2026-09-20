import { useCallback, useEffect, useRef, useState } from 'react';

const GRAVITY = 9.81;

export interface MotionState {
  /** Whether rhythmic walking-like shake is currently detected */
  isWalking: boolean;
  /** Magnitude of the combined Y/Z variance used for walking detection */
  intensity: number;
  /** Whether motion permission has been granted (iOS) */
  permission: 'unknown' | 'granted' | 'denied' | 'unsupported';
  /** Request motion permission (iOS 13+ requires user gesture) */
  requestPermission: () => Promise<void>;
}

interface AccelSample {
  y: number;
  z: number;
  t: number;
}

export function useDeviceMotion(threshold: number): MotionState {
  const [isWalking, setIsWalking] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const [permission, setPermission] =
    useState<MotionState['permission']>('unknown');
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  const samplesRef = useRef<AccelSample[]>([]);
  const listeningRef = useRef(false);

  const handleMotion = useCallback((e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.y == null || a.z == null) return;

    const now = performance.now();
    const sample: AccelSample = { y: a.y, z: a.z, t: now };
    const samples = samplesRef.current;
    samples.push(sample);

    // Keep roughly 1.5s of samples (assumes ~60Hz)
    const cutoff = now - 1500;
    while (samples.length > 0 && samples[0].t < cutoff) {
      samples.shift();
    }

    if (samples.length < 10) return;

    // Use a rolling 1s window for variance calc
    const windowStart = now - 1000;
    const recent = samples.filter((s) => s.t >= windowStart);
    if (recent.length < 10) return;

    // Subtract gravity baseline to isolate motion-induced changes
    const yVals = recent.map((s) => s.y - GRAVITY);
    const zVals = recent.map((s) => s.z - GRAVITY);

    const variance = (arr: number[]) => {
      const mean = arr.reduce((p, c) => p + c, 0) / arr.length;
      return arr.reduce((p, c) => p + (c - mean) ** 2, 0) / arr.length;
    };

    const varY = variance(yVals);
    const varZ = variance(zVals);
    // Combined magnitude — std-dev across both axes
    const mag = Math.sqrt(varY + varZ);
    setIntensity(mag);

    setIsWalking(mag > thresholdRef.current);
  }, []);

  const startListening = useCallback(() => {
    if (listeningRef.current) return;
    window.addEventListener('devicemotion', handleMotion);
    listeningRef.current = true;
  }, [handleMotion]);

  const requestPermission = useCallback(async () => {
    const dm =
      DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
    if (typeof dm.requestPermission === 'function') {
      try {
        const res = await dm.requestPermission();
        if (res === 'granted') {
          setPermission('granted');
          startListening();
        } else {
          setPermission('denied');
        }
      } catch {
        setPermission('denied');
      }
    } else if ('DeviceMotionEvent' in window) {
      setPermission('granted');
      startListening();
    } else {
      setPermission('unsupported');
    }
  }, [startListening]);

  useEffect(() => {
    return () => {
      if (listeningRef.current) {
        window.removeEventListener('devicemotion', handleMotion);
        listeningRef.current = false;
      }
    };
  }, [handleMotion]);

  // Auto-start on non-iOS where no permission gesture is needed
  useEffect(() => {
    if (permission === 'unknown') {
      const dm =
        DeviceMotionEvent as unknown as {
          requestPermission?: () => Promise<string>;
        };
      if (typeof dm.requestPermission !== 'function' && 'DeviceMotionEvent' in window) {
        setPermission('granted');
        startListening();
      }
    }
  }, [permission, startListening]);

  return { isWalking, intensity, permission, requestPermission };
}
