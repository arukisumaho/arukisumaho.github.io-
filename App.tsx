import { useEffect, useRef, useState } from 'react';
import { Shield, ShieldAlert, Camera, Activity, Sliders, Eye, Footprints } from 'lucide-react';
import { useDeviceMotion } from '@/hooks/useDeviceMotion';
import { useFaceDetection, type GazeState } from '@/hooks/useFaceDetection';

type SafetyState = 'walking-phone' | 'safe' | 'loading';

const GAZE_LABELS: Record<GazeState, string> = {
  'looking-down': '下を向いています',
  staring: '画面を凝視しています',
  normal: '前を向いています',
  'no-face': '顔が見えません',
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [pitchThreshold, setPitchThreshold] = useState(0.58);
  const [proximityThreshold, setProximityThreshold] = useState(0.45);
  const [motionThreshold, setMotionThreshold] = useState(2.5);
  const [showSettings, setShowSettings] = useState(false);
  const [flash, setFlash] = useState(false);

  const motion = useDeviceMotion(motionThreshold);
  const face = useFaceDetection(videoRef, pitchThreshold, proximityThreshold);

  const isWalkingPhone = face.isDistracted && motion.isWalking;
  const safety: SafetyState = !face.cameraReady ? 'loading' : isWalkingPhone ? 'walking-phone' : 'safe';

  // Flash effect when entering walking-phone state
  const wasDangerRef = useRef(false);
  useEffect(() => {
    if (safety === 'walking-phone' && !wasDangerRef.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      wasDangerRef.current = true;
      return () => clearTimeout(t);
    }
    if (safety !== 'walking-phone') {
      wasDangerRef.current = false;
    }
  }, [safety]);

  // Vibrate when entering danger
  useEffect(() => {
    if (safety === 'walking-phone' && 'vibrate' in navigator) {
      navigator.vibrate?.(400);
    }
  }, [safety]);

  const danger = safety === 'walking-phone';

  return (
    <div
      className={`min-h-screen w-full overflow-hidden transition-colors duration-500 ${
        danger
          ? 'bg-red-600'
          : safety === 'safe'
            ? 'bg-green-600'
            : 'bg-slate-900'
      }`}
    >
      {/* Flash overlay */}
      <div
        className={`pointer-events-none fixed inset-0 z-50 bg-white transition-opacity duration-300 ${
          flash ? 'opacity-60' : 'opacity-0'
        }`}
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-5 py-6 text-white">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl backdrop-blur-sm ${
                danger ? 'bg-white/20' : safety === 'safe' ? 'bg-white/20' : 'bg-white/10'
              }`}
            >
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">歩きスマホ防止</h1>
              <p className="text-xs text-white/70">リアルタイム安全監視</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={`flex h-9 w-9 items-center justify-center rounded-xl backdrop-blur-sm transition-colors ${
              showSettings ? 'bg-white/30' : 'bg-white/10'
            }`}
            aria-label="設定"
          >
            <Sliders className="h-5 w-5" />
          </button>
        </header>

        {/* Camera preview */}
        <div className="relative mb-4 aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black/40 shadow-2xl ring-1 ring-white/10">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full -scale-x-100 object-cover"
          />

          {/* Status overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            {face.error ? (
              <div className="rounded-xl bg-black/60 px-4 py-3 text-center backdrop-blur-sm">
                <Camera className="mx-auto mb-2 h-8 w-8 text-red-300" />
                <p className="text-sm font-medium text-red-200">{face.error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 rounded-lg bg-white/20 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/30"
                >
                  再試行
                </button>
              </div>
            ) : !face.cameraReady ? (
              <div className="flex flex-col items-center gap-2 text-white/70">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <p className="text-sm">カメラを起動中…</p>
              </div>
            ) : (
              <></>
            )}
          </div>

          {/* Detection indicators */}
          {face.cameraReady && (
            <>
              {/* Face gaze badge */}
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm">
                <Eye className="h-3.5 w-3.5" />
                {GAZE_LABELS[face.gaze]}
              </div>

              {/* Motion badge */}
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm">
                <Footprints className="h-3.5 w-3.5" />
                {motion.permission === 'unsupported'
                  ? 'センサーなし'
                  : motion.isWalking
                    ? '歩行中'
                    : '静止'}
              </div>
            </>
          )}
        </div>

        {/* Main status banner */}
        <div className="flex-1 flex flex-col">
          {safety === 'loading' ? (
            <div className="rounded-2xl bg-white/10 p-6 text-center backdrop-blur-sm">
              <p className="text-sm text-white/70">システムを初期化しています…</p>
            </div>
          ) : danger ? (
            <div className="flex flex-col items-center rounded-2xl bg-white/15 p-6 text-center backdrop-blur-sm">
              <ShieldAlert className="mb-3 h-12 w-12 animate-pulse" />
              <p className="text-2xl font-black tracking-wide">⚠️ 歩きスマホです！ ⚠️</p>
              <p className="mt-2 text-sm text-white/80">
                下を向いて歩いています。立ち止まるか画面から目を離してください。
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-2xl bg-white/15 p-6 text-center backdrop-blur-sm">
              <Shield className="mb-3 h-12 w-12" />
              <p className="text-2xl font-black tracking-wide">安全な状態です</p>
              <p className="mt-2 text-sm text-white/80">
                {face.isDistracted && !motion.isWalking
                  ? '画面を見ていますが、立ち止まっています。'
                  : !face.isDistracted && motion.isWalking
                    ? '歩いていますが、前を向いています。'
                    : !face.isDistracted && !motion.isWalking
                      ? '立ち止まって前を向いています。'
                      : '安全な状態が保たれています。'}
              </p>
            </div>
          )}

          {/* Sensor readings */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <SensorCard
              icon={<Eye className="h-4 w-4" />}
              label="顔・視線"
              value={face.gaze === 'no-face' ? '—' : face.isDistracted ? '要注意' : 'OK'}
              detail={GAZE_LABELS[face.gaze]}
              danger={face.isDistracted}
            />
            <SensorCard
              icon={<Activity className="h-4 w-4" />}
              label="加速度"
              value={motion.permission === 'unsupported' ? '—' : motion.isWalking ? '歩行' : '静止'}
              detail={
                motion.permission === 'unsupported'
                  ? 'センサー非対応'
                  : `強度 ${motion.intensity.toFixed(1)}`
              }
              danger={motion.isWalking}
            />
          </div>

          {/* iOS motion permission button */}
          {motion.permission === 'unknown' && (
            <button
              onClick={motion.requestPermission}
              className="mt-4 rounded-xl bg-white/20 py-3 text-center text-sm font-bold text-white backdrop-blur-sm hover:bg-white/30"
            >
              歩行検知を有効にする
            </button>
          )}
          {motion.permission === 'denied' && (
            <p className="mt-3 rounded-xl bg-white/10 p-3 text-center text-xs text-white/70">
              モーションセンサーの権限が拒否されました。歩行検知は無効です。
            </p>
          )}

          {/* Settings panel */}
          {showSettings && (
            <div className="mt-4 space-y-4 rounded-2xl bg-black/30 p-4 backdrop-blur-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Sliders className="h-4 w-4" /> 判定閾値の調整
              </h2>

              <SliderRow
                label="視線下向き判定"
                value={pitchThreshold}
                min={0.4}
                max={0.8}
                step={0.01}
                onChange={setPitchThreshold}
                hint="大きいほど厳しく判定（下を向きやすくなる）"
              />
              <SliderRow
                label="画面凝視判定"
                value={proximityThreshold}
                min={0.2}
                max={0.7}
                step={0.01}
                onChange={setProximityThreshold}
                hint="顔がこれ以上近いと凝視と判定"
              />
              <SliderRow
                label="歩行検知の閾値"
                value={motionThreshold}
                min={0.5}
                max={8}
                step={0.1}
                onChange={setMotionThreshold}
                hint="小さいほど検知しやすい（揺れに敏感）"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SensorCard({
  icon,
  label,
  value,
  detail,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  danger: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-white/70">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-lg font-bold ${danger ? 'text-yellow-200' : 'text-white'}`}>
        {value}
      </p>
      <p className="text-xs text-white/60">{detail}</p>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-mono">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
      />
      <p className="mt-1 text-xs text-white/50">{hint}</p>
    </div>
  );
}
