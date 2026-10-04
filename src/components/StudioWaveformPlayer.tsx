import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Sliders } from "lucide-react";
import { ProsodicClause } from "../data/italianStudioPresets";
import { AcousticPresetId } from "../utils/audioExporter";

interface StudioWaveformPlayerProps {
  audioBuffer: AudioBuffer | null;
  peaks: number[];
  clauses: ProsodicClause[];
  activeClauseId: string | null;
  onActiveClauseChange: (clauseId: string | null) => void;
  acousticPreset: AcousticPresetId;
  onAcousticPresetChange: (preset: AcousticPresetId) => void;
  isMastering: boolean;
  voiceLabel: string;
  sampleRate: number;
  peakDb: number;
}

export interface ClauseTimelineMarker {
  clauseId: string;
  index: number;
  startRatio: number;
  endRatio: number;
  punctuationMark: string;
  pauseMs: number;
  tone: string;
}

export function computeClauseTimeline(clauses: ProsodicClause[]): ClauseTimelineMarker[] {
  if (!clauses.length) return [];
  const weights = clauses.map((c) => {
    const charWeight = Math.max(8, c.text.length * 52);
    return charWeight + (c.pauseMs || 220);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  let accum = 0;
  return clauses.map((c, idx) => {
    const startRatio = accum / totalWeight;
    accum += weights[idx];
    const endRatio = accum / totalWeight;
    return {
      clauseId: c.id,
      index: idx + 1,
      startRatio,
      endRatio,
      punctuationMark: c.punctuationMark,
      pauseMs: c.pauseMs,
      tone: c.tone,
    };
  });
}

export const StudioWaveformPlayer: React.FC<StudioWaveformPlayerProps> = ({
  audioBuffer,
  peaks,
  clauses,
  activeClauseId,
  onActiveClauseChange,
  acousticPreset,
  onAcousticPresetChange,
  isMastering,
  voiceLabel,
  sampleRate,
  peakDb,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [liveDb, setLiveDb] = useState<number>(-60);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const duration = audioBuffer ? audioBuffer.duration : 0;
  const markers = React.useMemo(() => computeClauseTimeline(clauses), [clauses]);

  const stopPlayback = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setLiveDb(-60);
  }, []);

  const startPlaybackFrom = useCallback(
    async (startOffsetSec: number) => {
      if (!audioBuffer) return;
      stopPlayback();

      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = playbackRate;

      const gainNode = ctx.createGain();
      gainNode.gain.value = isMuted ? 0 : 1;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(ctx.destination);

      const clampedOffset = Math.max(0, Math.min(startOffsetSec, audioBuffer.duration - 0.02));
      offsetTimeRef.current = clampedOffset;
      startTimeRef.current = ctx.currentTime;

      sourceNodeRef.current = source;
      gainNodeRef.current = gainNode;
      analyserNodeRef.current = analyser;

      setIsPlaying(true);
      source.start(0, clampedOffset);

      const timeData = new Float32Array(analyser.fftSize);

      const updateLoop = () => {
        if (!ctx || !sourceNodeRef.current) return;
        const elapsed = (ctx.currentTime - startTimeRef.current) * playbackRate;
        const nowSec = Math.min(audioBuffer.duration, offsetTimeRef.current + elapsed);
        setCurrentTime(nowSec);

        // Compute live RMS dB meter
        analyser.getFloatTimeDomainData(timeData);
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
          sum += timeData[i] * timeData[i];
        }
        const rms = Math.sqrt(sum / timeData.length);
        const db = rms > 0.0001 ? Math.max(-55, 20 * Math.log10(rms)) : -60;
        setLiveDb(Number(db.toFixed(1)));

        // Sync active prosodic clause
        const ratio = audioBuffer.duration > 0 ? nowSec / audioBuffer.duration : 0;
        const matching = markers.find((m) => ratio >= m.startRatio && ratio <= m.endRatio);
        if (matching) {
          onActiveClauseChange(matching.clauseId);
        }

        if (nowSec < audioBuffer.duration) {
          rafRef.current = requestAnimationFrame(updateLoop);
        }
      };

      rafRef.current = requestAnimationFrame(updateLoop);

      source.onended = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setIsPlaying(false);
        setCurrentTime(audioBuffer.duration);
        offsetTimeRef.current = 0;
        setLiveDb(-60);
      };
    },
    [audioBuffer, isMuted, markers, onActiveClauseChange, playbackRate, stopPlayback]
  );

  // Stop playback when buffer changes
  useEffect(() => {
    stopPlayback();
    setCurrentTime(0);
    offsetTimeRef.current = 0;
  }, [audioBuffer, stopPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopPlayback]);

  // Update mute dynamically
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : 1;
    }
  }, [isMuted]);

  // Update playback rate dynamically
  useEffect(() => {
    if (isPlaying) {
      startPlaybackFrom(currentTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackRate]);

  // Draw waveform + comma pause markers on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

    // Subtle horizontal zero-crossing center line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw clause comma/punctuation vertical guides
    markers.forEach((m, i) => {
      if (i < markers.length - 1) {
        const x = m.endRatio * width;
        ctx.strokeStyle = m.punctuationMark === "," ? "rgba(224, 122, 56, 0.28)" : "rgba(16, 185, 129, 0.32)";
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, height - 8);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw tiny punctuation symbol at top of guide
        ctx.fillStyle = m.punctuationMark === "," ? "rgba(224, 122, 56, 0.85)" : "rgba(16, 185, 129, 0.85)";
        ctx.font = "600 10px 'JetBrains Mono', monospace";
        ctx.fillText(m.punctuationMark, x - 3, 12);
      }
    });

    // Draw waveform bars
    const displayPeaks = peaks.length > 0 ? peaks : Array.from({ length: 120 }, (_, i) => 0.12 + 0.06 * Math.sin(i * 0.3));
    const barCount = displayPeaks.length;
    const gap = 2;
    const barWidth = Math.max(1.5, (width - (barCount - 1) * gap) / barCount);

    for (let i = 0; i < barCount; i++) {
      const barRatio = i / barCount;
      const x = i * (barWidth + gap);
      const amp = displayPeaks[i];
      const barHeight = Math.max(4, amp * (height - 32));
      const y = (height - barHeight) / 2;

      const isPlayed = barRatio <= progressRatio;
      const isHovered = hoverRatio !== null && barRatio <= hoverRatio;

      if (audioBuffer) {
        if (isPlayed) {
          ctx.fillStyle = "#E07A38";
        } else if (isHovered) {
          ctx.fillStyle = "rgba(224, 122, 56, 0.45)";
        } else {
          ctx.fillStyle = "rgba(244, 244, 240, 0.22)";
        }
      } else {
        ctx.fillStyle = "rgba(244, 244, 240, 0.08)";
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    }

    // Playhead cursor line
    if (audioBuffer && duration > 0) {
      const playheadX = progressRatio * width;
      ctx.strokeStyle = "#F4F4F0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, 4);
      ctx.lineTo(playheadX, height - 4);
      ctx.stroke();
    }
  }, [audioBuffer, currentTime, duration, hoverRatio, markers, peaks]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioBuffer || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = clickRatio * audioBuffer.duration;
    setCurrentTime(targetSec);
    offsetTimeRef.current = targetSec;

    const matching = markers.find((m) => clickRatio >= m.startRatio && clickRatio <= m.endRatio);
    if (matching) {
      onActiveClauseChange(matching.clauseId);
    }

    if (isPlaying) {
      startPlaybackFrom(targetSec);
    }
  };

  const handleTogglePlay = () => {
    if (!audioBuffer) return;
    if (isPlaying) {
      const elapsed = audioCtxRef.current
        ? (audioCtxRef.current.currentTime - startTimeRef.current) * playbackRate
        : 0;
      offsetTimeRef.current = Math.min(audioBuffer.duration, offsetTimeRef.current + elapsed);
      stopPlayback();
    } else {
      const startAt = currentTime >= audioBuffer.duration - 0.05 ? 0 : currentTime;
      startPlaybackFrom(startAt);
    }
  };

  const handleRestart = () => {
    if (!audioBuffer) return;
    setCurrentTime(0);
    offsetTimeRef.current = 0;
    if (clauses[0]) onActiveClauseChange(clauses[0].id);
    if (isPlaying) {
      startPlaybackFrom(0);
    }
  };

  const formatTimecode = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const tenths = Math.floor((sec % 1) * 10);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
  };

  const activeClause = clauses.find((c) => c.id === activeClauseId) || clauses[0];

  return (
    <div className="bg-[#121418] border border-white/[0.08] rounded-xl p-5 flex flex-col gap-4">
      {/* Top Info Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#F4F4F0]">Banco d'Ascolto Master</span>
          <span className="text-white/20" aria-hidden="true">·</span>
          <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
            {voiceLabel} · {(sampleRate / 1000).toFixed(1)} kHz · 16-bit PCM · Picco {peakDb.toFixed(1)} dBFS
          </span>
        </div>

        {/* Live Level Meter */}
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[#9CA3AF]">
          <span>Livello Uscita</span>
          <div className="w-24 h-2 bg-[#0B0C0E] rounded overflow-hidden border border-white/[0.08] flex items-center">
            <div
              className="h-full bg-[#10B981] transition-transform duration-75 origin-left"
              style={{
                width: "100%",
                transform: `scaleX(${isPlaying ? Math.max(0.08, Math.min(1, (liveDb + 55) / 55)) : 0.04})`,
              }}
            />
          </div>
          <span className="w-16 text-right text-[#F4F4F0]">
            {isPlaying ? `${liveDb.toFixed(1)} dB` : "-∞ dB"}
          </span>
        </div>
      </div>

      {/* Interactive Waveform Canvas */}
      <div className="relative group">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={(e) => {
            if (!canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            setHoverRatio(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
          }}
          onMouseLeave={() => setHoverRatio(null)}
          className={`w-full h-32 rounded-lg bg-[#0B0C0E] border border-white/[0.06] transition-colors ${
            audioBuffer ? "cursor-pointer hover:border-[#E07A38]/40" : "cursor-default"
          }`}
        />

        {!audioBuffer && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
            <p className="text-xs text-[#9CA3AF]">
              Traccia vocale pronta per la generazione · Le linee tratteggiate indicano le virgole e le pause dello spartito
            </p>
          </div>
        )}
      </div>

      {/* Synchronized Active Clause Readout */}
      {activeClause && (
        <div className="bg-[#0B0C0E] border border-white/[0.06] rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="text-xs font-mono tabular-nums text-[#E07A38] shrink-0">
              Clausola attiva
            </span>
            <p className="text-sm text-[#F4F4F0] truncate font-medium">
              “{activeClause.text}”
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#9CA3AF] font-mono tabular-nums shrink-0">
            <span>Tono: <strong className="text-[#F4F4F0] font-normal">{activeClause.tone}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Segno <strong className="text-[#E07A38]">{activeClause.punctuationMark}</strong> ({activeClause.pauseMs}ms)</span>
          </div>
        </div>
      )}

      {/* Transport & Mastering EQ Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        {/* Left Transport Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={!audioBuffer || isMastering}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E07A38] hover:bg-[#d06928] disabled:opacity-40 disabled:pointer-events-none text-[#0B0C0E] font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? "Pausa Ascolto" : "Ascolta Voce"}</span>
          </button>

          <button
            type="button"
            onClick={handleRestart}
            disabled={!audioBuffer || isMastering}
            title="Riavvolgi all'inizio"
            className="p-2.5 rounded-lg bg-[#171A20] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-40 text-[#F4F4F0] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            disabled={!audioBuffer}
            title={isMuted ? "Riattiva audio" : "Silenzia"}
            className="p-2.5 rounded-lg bg-[#171A20] hover:bg-white/[0.08] border border-white/[0.08] disabled:opacity-40 text-[#F4F4F0] transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-[#E07A38]" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <div className="text-sm font-mono tabular-nums text-[#F4F4F0] pl-1">
            <span>{formatTimecode(currentTime)}</span>
            <span className="text-[#9CA3AF] mx-1.5">/</span>
            <span className="text-[#9CA3AF]">{formatTimecode(duration)}</span>
          </div>
        </div>

        {/* Right Speed & Acoustic Mastering Filter Selector */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-[#0B0C0E] p-1 rounded-lg border border-white/[0.08]">
            {[0.85, 1.0, 1.12, 1.25].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setPlaybackRate(rate)}
                className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  playbackRate === rate
                    ? "bg-[#171A20] text-[#E07A38] font-semibold border border-white/[0.08]"
                    : "text-[#9CA3AF] hover:text-[#F4F4F0]"
                }`}
              >
                {rate.toFixed(2).replace(/\.00$/, ".0")}x
              </button>
            ))}
          </div>

          {/* Acoustic Mastering EQ Selector */}
          <div className="flex items-center gap-1.5 bg-[#0B0C0E] p-1 rounded-lg border border-white/[0.08]">
            <Sliders className="w-3.5 h-3.5 text-[#9CA3AF] ml-2 shrink-0" />
            {(
              [
                { id: "neutro", label: "Neutro" },
                { id: "valvolare", label: "Calore Valvolare" },
                { id: "broadcast", label: "Broadcast" },
                { id: "podcast", label: "Podcast Intimo" },
              ] as { id: AcousticPresetId; label: string }[]
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={isMastering}
                onClick={() => onAcousticPresetChange(preset.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  acousticPreset === preset.id
                    ? "bg-[#171A20] text-[#F4F4F0] border border-white/[0.08]"
                    : "text-[#9CA3AF] hover:text-[#F4F4F0]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
