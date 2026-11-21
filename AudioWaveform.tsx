import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ToyDeviceStatus } from '../types';

interface AudioWaveformProps {
  status: ToyDeviceStatus;
  inputAnalyserRef: RefObject<AnalyserNode | null>;
  outputAnalyserRef: RefObject<AnalyserNode | null>;
}

const BAR_COUNT = 36;

export function AudioWaveform({
  status,
  inputAnalyserRef,
  outputAnalyserRef,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const freqBuffer = new Uint8Array(64);
    const smoothed = new Float32Array(BAR_COUNT).fill(0.08);
    let phase = 0;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentStatus = statusRef.current;
      phase += 0.065;

      const activeAnalyser =
        currentStatus === 'speaking'
          ? outputAnalyserRef.current
          : currentStatus === 'listening'
            ? inputAnalyserRef.current
            : null;

      let hasLiveSignal = false;
      if (activeAnalyser) {
        activeAnalyser.getByteFrequencyData(freqBuffer);
        for (let i = 0; i < 32; i++) {
          if (freqBuffer[i] > 6) {
            hasLiveSignal = true;
            break;
          }
        }
      }

      const barGap = 4 * dpr;
      const totalWidth = canvas.width;
      const barWidth = Math.max(2 * dpr, (totalWidth - barGap * (BAR_COUNT - 1)) / BAR_COUNT);
      const centerY = canvas.height / 2;
      const maxBarH = canvas.height * 0.84;

      const barColor =
        currentStatus === 'sleeping'
          ? '#E2E8F0'
          : currentStatus === 'speaking'
            ? '#EA580C'
            : currentStatus === 'listening'
              ? '#0F766E'
              : currentStatus === 'motion'
                ? '#D97706'
                : currentStatus === 'connecting'
                  ? '#64748B'
                  : '#CBD5E1';

      ctx.fillStyle = barColor;

      for (let i = 0; i < BAR_COUNT; i++) {
        // Mirror around center for balanced acoustic symmetry
        const distFromCenter = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
        const envelope = 1 - distFromCenter * 0.55;

        let target = 0.08;
        if (currentStatus === 'sleeping') {
          target = 0.05;
        } else if (currentStatus === 'speaking' || currentStatus === 'listening') {
          if (hasLiveSignal && activeAnalyser) {
            const bin = Math.min(freqBuffer.length - 1, Math.floor(Math.abs(i - BAR_COUNT / 2) * 1.4));
            const normalized = freqBuffer[bin] / 255;
            target = Math.max(0.12, Math.min(1, normalized * 1.35 * envelope));
          } else {
            // Subtle breathing floor while awaiting voice amplitude
            const wave = Math.sin(phase + i * 0.35) * 0.5 + 0.5;
            target = (0.12 + wave * (currentStatus === 'speaking' ? 0.34 : 0.14)) * envelope;
          }
        } else if (currentStatus === 'motion') {
          const sweep = Math.sin(phase * 1.9 - Math.abs(i - BAR_COUNT / 2) * 0.45) * 0.5 + 0.5;
          target = (0.18 + sweep * 0.62) * envelope;
        } else if (currentStatus === 'connecting') {
          const pulse = Math.sin(phase * 1.2 + i * 0.28) * 0.5 + 0.5;
          target = (0.12 + pulse * 0.22) * envelope;
        } else {
          target = 0.08 * envelope + 0.04;
        }

        smoothed[i] += (target - smoothed[i]) * 0.24;
        const barH = Math.max(4 * dpr, smoothed[i] * maxBarH);
        const x = i * (barWidth + barGap);
        const y = centerY - barH / 2;
        const radius = barWidth / 2;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, radius);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, [inputAnalyserRef, outputAnalyserRef]);

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        aria-label="Live audio waveform visualizer"
        className="w-full h-14 block"
      />
    </div>
  );
}
