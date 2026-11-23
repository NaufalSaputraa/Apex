import React, { useState, useEffect, useRef } from 'react';
import { DownloadStatus, MediaInfo, SystemAlert, SystemStats } from '../types';

export type PeekingCatMood =
  | 'idle'
  | 'blink'
  | 'look_left'
  | 'look_right'
  | 'music'
  | 'charging'
  | 'downloading'
  | 'alert'
  | 'love';

interface PixelPeekingCatProps {
  mood?: PeekingCatMood;
  variant?: 'inline' | 'perched';
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title?: string;
}

const RIM_COLORS: Record<PeekingCatMood, string> = {
  idle: '#6366F1',
  blink: '#6366F1',
  look_left: '#6366F1',
  look_right: '#6366F1',
  music: '#38BDF8',
  charging: '#F59E0B',
  downloading: '#38BDF8',
  alert: '#EF4444',
  love: '#F43F5E',
};

export const PixelPeekingCat: React.FC<PixelPeekingCatProps> = ({
  mood = 'idle',
  variant = 'inline',
  onClick,
  onMouseEnter,
  onMouseLeave,
  title = 'Apex Peeking Cat (Klik untuk berinteraksi)',
}) => {
  const isPerched = variant === 'perched';
  const width = isPerched ? 36 : 24;
  const height = isPerched ? 23 : 15;
  const rimColor = RIM_COLORS[mood];

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursorOffset, setCursorOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current) return;
      if (resetTimer) clearTimeout(resetTimer);
      const rect = svgRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      const ox = dx < -12 ? -1 : dx > 12 ? 1 : 0;
      const oy = dy < -10 ? -1 : dy > 14 ? 1 : 0;
      setCursorOffset((prev) => (prev.x === ox && prev.y === oy ? prev : { x: ox, y: oy }));

      resetTimer = setTimeout(() => {
        setCursorOffset((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
      }, 1200);
    };

    const handleMouseLeave = () => {
      setCursorOffset((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, []);

  const baseOffsetX = mood === 'look_left' ? -1 : mood === 'look_right' ? 1 : 0;
  const eyeOffsetX = cursorOffset.x !== 0 ? cursorOffset.x : baseOffsetX;
  const eyeOffsetY = cursorOffset.y;

  return (
    <svg
      ref={svgRef}
      className={`pixel-peeking-cat ${isPerched ? 'is-perched' : 'is-inline'} mood-${mood} ${isHovered ? 'is-hovered' : ''}`}
      width={width}
      height={height}
      viewBox="0 0 22 14"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onMouseLeave?.();
      }}
      role="img"
      aria-label={title}
    >

      {/* Subtle outer pixel rim so the dark silhouette stays visible on dark wallpapers */}
      <g fill="rgba(255, 255, 255, 0.14)">
        <rect x="3" y="0" width="2" height="1" />
        <rect x="17" y="0" width="2" height="1" />
        <rect x="2" y="1" width="1" height="4" />
        <rect x="5" y="1" width="1" height="1" />
        <rect x="6" y="2" width="1" height="1" />
        <rect x="7" y="3" width="8" height="1" />
        <rect x="15" y="2" width="1" height="1" />
        <rect x="16" y="1" width="1" height="1" />
        <rect x="19" y="1" width="1" height="4" />
        <rect x="1" y="5" width="1" height="7" />
        <rect x="20" y="5" width="1" height="7" />
      </g>

      {/* Peeking Cat Head Silhouette (22x14 integer grid) */}
      <g fill="#080B14">
        {/* Left Ear */}
        <rect x="3" y="1" width="2" height="1" />
        <rect x="3" y="2" width="3" height="1" />
        <rect x="3" y="3" width="4" height="1" />
        {/* Right Ear */}
        <rect x="17" y="1" width="2" height="1" />
        <rect x="16" y="2" width="3" height="1" />
        <rect x="15" y="3" width="4" height="1" />
        {/* Head Body */}
        <rect x="2" y="4" width="18" height="9" />
        {/* Peeking Base Flare */}
        <rect x="1" y="13" width="20" height="1" />
      </g>

      {/* Accent Inner-Ear Pixels */}
      <g fill={rimColor} opacity="0.9">
        <rect x="4" y="2" width="1" height="2" />
        <rect x="17" y="2" width="1" height="2" />
      </g>

      {/* Eyes Layer (Pure integer <rect>s, follows cursor) */}
      <g transform={`translate(${eyeOffsetX}, ${eyeOffsetY})`}>
        {(mood === 'idle' || mood === 'look_left' || mood === 'look_right') && (
          <g className="peeking-eyes-blink" fill="#FFFFFF">
            {/* Left eye (Ref #4 peeking curve) */}
            <rect x="6" y="7" width="1" height="1" />
            <rect x="8" y="7" width="1" height="1" />
            <rect x="6" y="9" width="1" height="1" />
            <rect x="7" y="10" width="2" height="1" />
            <rect x="9" y="9" width="1" height="1" />
            {/* Right eye */}
            <rect x="13" y="7" width="1" height="1" />
            <rect x="15" y="7" width="1" height="1" />
            <rect x="12" y="9" width="1" height="1" />
            <rect x="13" y="10" width="2" height="1" />
            <rect x="15" y="9" width="1" height="1" />
          </g>
        )}

        {mood === 'blink' && (
          <g fill="#CBD5E1">
            <rect x="6" y="9" width="3" height="1" />
            <rect x="13" y="9" width="3" height="1" />
          </g>
        )}

        {mood === 'music' && (
          <g fill="#38BDF8">
            {/* Left happy ^ */}
            <rect x="6" y="9" width="1" height="1" />
            <rect x="7" y="8" width="1" height="1" />
            <rect x="8" y="9" width="1" height="1" />
            {/* Right happy ^ */}
            <rect x="13" y="9" width="1" height="1" />
            <rect x="14" y="8" width="1" height="1" />
            <rect x="15" y="9" width="1" height="1" />
          </g>
        )}

        {mood === 'charging' && (
          <g className="peeking-eyes-pulse" fill="#F59E0B">
            {/* Left + spark */}
            <rect x="7" y="7" width="1" height="3" />
            <rect x="6" y="8" width="3" height="1" />
            {/* Right + spark */}
            <rect x="14" y="7" width="1" height="3" />
            <rect x="13" y="8" width="3" height="1" />
          </g>
        )}

        {mood === 'downloading' && (
          <g className="peeking-eyes-pulse" fill="#38BDF8">
            <rect x="6" y="8" width="2" height="2" />
            <rect x="14" y="8" width="2" height="2" />
          </g>
        )}

        {mood === 'alert' && (
          <g fill="#F87171">
            <rect x="6" y="7" width="2" height="3" />
            <rect x="14" y="7" width="2" height="3" />
          </g>
        )}

        {mood === 'love' && (
          <g fill="#F43F5E">
            {/* Left pixel heart */}
            <rect x="5" y="7" width="1" height="1" />
            <rect x="7" y="7" width="1" height="1" />
            <rect x="5" y="8" width="3" height="1" />
            <rect x="6" y="9" width="1" height="1" />
            {/* Right pixel heart */}
            <rect x="14" y="7" width="1" height="1" />
            <rect x="16" y="7" width="1" height="1" />
            <rect x="14" y="8" width="3" height="1" />
            <rect x="15" y="9" width="1" height="1" />
          </g>
        )}
      </g>
    </svg>
  );
};

interface UsePeekingCatMoodOptions {
  media: MediaInfo;
  stats: SystemStats | null;
  download?: DownloadStatus | null;
  activeAlert?: SystemAlert | null;
  enabled?: boolean;
}

/** Computes the active Peeking Cat mood from system/media/interaction state. */
export function usePeekingCatMood({
  media,
  stats,
  download,
  activeAlert,
  enabled = true,
}: UsePeekingCatMoodOptions): {
  mood: PeekingCatMood;
  triggerLove: (e?: React.MouseEvent) => void;
} {
  const [idleMood, setIdleMood] = useState<'idle' | 'blink' | 'look_left' | 'look_right'>('idle');
  const [isLoved, setIsLoved] = useState(false);

  const isPlaying = media.is_available && media.is_playing;
  const isDownloading = Boolean(download?.is_downloading);
  const isCharging = Boolean(stats?.is_charging);

  useEffect(() => {
    if (!enabled || isPlaying || isDownloading || activeAlert || isLoved) return;

    let subTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      if (subTimer) clearTimeout(subTimer);
      const rand = Math.random();
      if (rand < 0.5) {
        setIdleMood('idle');
      } else if (rand < 0.78) {
        setIdleMood('blink');
        subTimer = setTimeout(() => setIdleMood('idle'), 260);
      } else if (rand < 0.9) {
        setIdleMood('look_left');
        subTimer = setTimeout(() => setIdleMood('idle'), 750);
      } else {
        setIdleMood('look_right');
        subTimer = setTimeout(() => setIdleMood('idle'), 750);
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      if (subTimer) clearTimeout(subTimer);
    };
  }, [enabled, isPlaying, isDownloading, activeAlert, isLoved]);

  const triggerLove = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsLoved(true);
    setTimeout(() => setIsLoved(false), 1400);
  };

  let mood: PeekingCatMood = idleMood;
  if (isLoved) {
    mood = 'love';
  } else if (activeAlert) {
    mood = activeAlert.type === 'charger' ? 'charging' : 'alert';
  } else if (isDownloading) {
    mood = 'downloading';
  } else if (isPlaying) {
    mood = 'music';
  } else if (isCharging) {
    mood = 'charging';
  }

  return { mood, triggerLove };
}
