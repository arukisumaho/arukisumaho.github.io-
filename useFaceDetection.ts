import { useCallback, useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as blazeface from '@tensorflow-models/blazeface';

export type GazeState = 'looking-down' | 'staring' | 'normal' | 'no-face';

export interface FaceState {
  /** Whether the user appears to be looking down / staring at phone */
  isDistracted: boolean;
  /** More granular classification */
  gaze: GazeState;
  /** Vertical position of the face in frame (0 = top, 1 = bottom) */
  faceY: number;
  /** Whether the face is close to the camera (staring) */
  faceProximity: number;
  /** Whether the camera is ready / streaming */
  cameraReady: boolean;
  /** Error message if camera failed */
  error: string | null;
}

type Point = [number, number];

interface BlazeFacePrediction {
  topLeft: Point;
  bottomRight: Point;
  landmarks?: Point[];
}

let modelPromise: Promise<blazeface.BlazeFaceModel> | null = null;
function getModel(): Promise<blazeface.BlazeFaceModel> {
  if (!modelPromise) {
    modelPromise = blazeface.load();
  }
  return modelPromise;
}

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement>,
  pitchThreshold: number,
  proximityThreshold: number,
): FaceState {
  const [gaze, setGaze] = useState<GazeState>('no-face');
  const [faceY, setFaceY] = useState(0.5);
  const [faceProximity, setFaceProximity] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pitchRef = useRef(pitchThreshold);
  pitchRef.current = pitchThreshold;
  const proxRef = useRef(proximityThreshold);
  proxRef.current = proximityThreshold;

  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);

  const detectLoop = useCallback(async () => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    try {
      const model = await getModel();
      const predictions = (await model.estimateFaces(
        video,
        false,
      )) as BlazeFacePrediction[];

      if (predictions.length === 0) {
        setGaze('no-face');
        setFaceProximity(0);
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      const pred = predictions[0];
      const [tlX, tlY] = pred.topLeft;
      const [brX, brY] = pred.bottomRight;
      const w = brX - tlX;
      const h = brY - tlY;

      const vw = video.videoWidth || 1;
      const vh = video.videoHeight || 1;

      // Normalized face box
      const normW = w / vw;
      const normH = h / vh;
      const centerY = (tlY + h / 2) / vh;
      setFaceY(centerY);

      // Proximity = how large the face box is relative to frame
      const proximity = Math.min(1, (normW * normH) / 0.25);
      setFaceProximity(proximity);

      // Use landmark positions ( BlazeFace returns 6 landmarks:
      // [rightEye, leftEye, noseTip, mouth, rightEar, leftEar] )
      let lookingDown = false;
      let staring = false;

      if (pred.landmarks && pred.landmarks.length >= 3) {
        const lm = pred.landmarks;
        const rightEye = lm[0];
        const leftEye = lm[1];
        const nose = lm[2];

        // Eye midpoint
        const eyeMidY = (rightEye[1] + leftEye[1]) / 2;
        const eyeMidX = (rightEye[0] + leftEye[0]) / 2;

        // Vertical offset of nose relative to eye line.
        // When looking down at phone, the nose tends to be lower relative
        // to the eyes (face tilts forward) and eyes appear closer to top of box.
        const eyeToNose = nose[1] - eyeMidY;
        const eyeDistance = Math.abs(leftEye[0] - rightEye[0]) || 1;
        // Normalized ratio: how far below eyes the nose sits
        const noseRatio = eyeToNose / eyeDistance;

        // Horizontal eye distance shrinks when head is pitched forward
        // (we see more top of head). Combined with noseRatio to estimate pitch.
        // Higher noseRatio = more pitch down
        const pitchScore = noseRatio; // typical range ~0.4 (level) to ~0.8+ (down)

        if (pitchScore > pitchRef.current) {
          lookingDown = true;
        }
      }

      // Staring: face is very close + centered
      if (proximity > proxRef.current) {
        staring = true;
      }

      let nextGaze: GazeState;
      if (lookingDown) {
        nextGaze = 'looking-down';
      } else if (staring) {
        nextGaze = 'staring';
      } else {
        nextGaze = 'normal';
      }
      setGaze(nextGaze);
    } catch {
      // keep last state on transient errors
    }

    rafRef.current = requestAnimationFrame(detectLoop);
  }, [videoRef]);

  const startCamera = useCallback(async () => {
    try {
      await tf.setBackend('webgl');
      await tf.ready();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraReady(true);
      setError(null);

      // Preload model
      await getModel();

      runningRef.current = true;
      rafRef.current = requestAnimationFrame(detectLoop);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'カメラにアクセスできません';
      setError(msg);
      setCameraReady(false);
    }
  }, [videoRef, detectLoop]);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const video = videoRef.current;
      if (video?.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera, videoRef]);

  const isDistracted = gaze === 'looking-down' || gaze === 'staring';

  return {
    isDistracted,
    gaze,
    faceY,
    faceProximity,
    cameraReady,
    error,
  };
}
