import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Music,
  Radio,
  Mic2,
  ArrowLeft,
} from 'lucide-react';
import { MediaInfo } from '../types';
import { LyricsView } from './LyricsView';

interface VolumeInfo {
  volume: number;
  muted: boolean;
}

interface MediaViewProps {
  media: MediaInfo;
  onSendMediaKey: (key: string) => void;
  onLyricsToggle?: (show: boolean) => void;
}

export const MediaView: React.FC<MediaViewProps> = ({
  media,
  onSendMediaKey,
  onLyricsToggle,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(70);
  const [showLyrics, setShowLyrics] = useState(false);
  const isDraggingVolRef = useRef(false);

  // Sync slider with real Windows system master volume
  useEffect(() => {
    const syncVolume = async () => {
      if (isDraggingVolRef.current) return;
      try {
        const info = await invoke<VolumeInfo>('get_system_volume');
        setVolume(info.volume);
        setIsMuted(info.muted);
      } catch {
        // Browser dev fallback: ignore
      }
    };
    syncVolume();
    const timer = setInterval(syncVolume, 1200);
    return () => clearInterval(timer);
  }, []);

  const toggleLyrics = (next: boolean) => {
    setShowLyrics(next);
    onLyricsToggle?.(next);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!media.duration_secs || media.duration_secs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSecs = ratio * media.duration_secs;
    invoke('seek_media', { positionSecs: targetSecs }).catch(() => {});
  };

  const title = media.title || (media.is_available ? 'Unknown Title' : 'No Active Media');
  const artist = media.artist || (media.is_available ? 'Unknown Artist' : 'Start Spotify, Apple Music or YouTube');
  const source = media.source ? media.source.replace('.exe', '') : (media.is_available ? 'Windows Media' : 'Idle');

  const handleMuteToggle = async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    try {
      const info = await invoke<VolumeInfo>('set_system_volume', {
        volume,
        muted: nextMuted,
      });
      setVolume(info.volume);
      setIsMuted(info.muted);
    } catch {
      onSendMediaKey('volume_mute');
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (isMuted && val > 0) setIsMuted(false);
    try {
      await invoke<VolumeInfo>('set_system_volume', {
        volume: val,
        muted: val === 0 ? true : false,
      });
    } catch {
      // Fallback for non-Tauri
    }
  };

  const formatTime = (totalSec: number) => {
    if (!totalSec || isNaN(totalSec) || totalSec <= 0) return '0:00';
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent =
    media.duration_secs > 0
      ? Math.min(100, Math.max(0, (media.position_secs / media.duration_secs) * 100))
      : media.is_playing ? 35 : 0;

  return (
    <div
      className="media-container"
      style={{
        display: 'grid',
        gridTemplateColumns: showLyrics ? '225px 1fr' : '1fr',
        gap: showLyrics ? '14px' : '10px',
        height: '100%',
        alignItems: 'stretch',
      }}
    >
      {/* Left Column: Media Player (always visible, compact when lyrics open) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '8px',
          minWidth: 0,
        }}
      >
        {/* Top Main Row: Album Art + Meta + Lyrics Toggle */}
        <div className="media-main-row">
          <div
            className="album-art-box"
            style={showLyrics ? { width: '48px', height: '48px', borderRadius: '11px' } : undefined}
          >
            <div
              className="album-art-glow"
              style={{
                backgroundImage: media.cover_url ? `url(${media.cover_url})` : undefined,
                backgroundSize: 'cover',
              }}
            />
            {media.cover_url ? (
              <img src={media.cover_url} alt="Cover" />
            ) : (
              <Music size={showLyrics ? 20 : 28} style={{ color: '#38bdf8', zIndex: 1, opacity: 0.8 }} />
            )}
          </div>

          <div className="media-meta" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <div className="media-source-pill">
                <Radio size={10} style={{ display: 'inline', marginRight: '4px' }} />
                {source}
              </div>
              <button
                type="button"
                className="glass-pill-btn"
                onClick={() => toggleLyrics(!showLyrics)}
                aria-label={showLyrics ? 'Close Lyrics' : 'Open Lyrics'}
                data-tooltip={showLyrics ? 'Close Lyrics' : 'Show Lyrics'}
                data-tooltip-align="right"
                style={{
                  color: showLyrics ? '#10b981' : '#38bdf8',
                  borderColor: showLyrics ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.28)',
                  background: showLyrics ? 'rgba(16, 185, 129, 0.16)' : undefined,
                  padding: '3px 8px',
                }}
              >
                {showLyrics ? <ArrowLeft size={10} /> : <Mic2 size={10} />}
                <span>{showLyrics ? 'Close' : 'Lyrics'}</span>
              </button>
            </div>
            <div className="media-title" style={showLyrics ? { fontSize: '13px' } : undefined}>
              {title}
            </div>
            <div className="media-artist" style={showLyrics ? { fontSize: '11px' } : undefined}>
              {artist}
            </div>
          </div>
        </div>

        {/* Real-time Progress Bar */}
        <div className="media-progress-box">
          <div
            className="media-progress-bar"
            onClick={handleSeek}
            data-tooltip="Click to seek"
          >
            <div
              className="media-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="media-progress-times">
            <span>{formatTime(media.position_secs)}</span>
            <span>{media.duration_secs > 0 ? formatTime(media.duration_secs) : '--:--'}</span>
          </div>
        </div>

        {/* Bottom Controls Row */}
        <div className="media-controls-row" style={showLyrics ? { gap: '6px' } : undefined}>
          <div className="playback-buttons" style={showLyrics ? { gap: '6px' } : undefined}>
            <button
              type="button"
              className="ctrl-btn"
              aria-label="Previous Track"
              data-tooltip="Previous Track"
              onClick={() => onSendMediaKey('prev')}
            >
              <SkipBack size={showLyrics ? 15 : 18} />
            </button>

            <button
              type="button"
              className="play-pause-btn"
              aria-label={media.is_playing ? 'Pause' : 'Play'}
              style={showLyrics ? { width: '30px', height: '30px' } : undefined}
              data-tooltip={media.is_playing ? 'Pause' : 'Play'}
              onClick={() => onSendMediaKey('play_pause')}
            >
              {media.is_playing ? (
                <Pause size={showLyrics ? 15 : 20} fill="currentColor" />
              ) : (
                <Play size={showLyrics ? 15 : 20} fill="currentColor" style={{ marginLeft: '2px' }} />
              )}
            </button>

            <button
              type="button"
              className="ctrl-btn"
              aria-label="Next Track"
              data-tooltip="Next Track"
              onClick={() => onSendMediaKey('next')}
            >
              <SkipForward size={showLyrics ? 15 : 18} />
            </button>
          </div>

          {/* Volume controls (Synced with Windows Master Volume) */}
          <div className="volume-controls" style={showLyrics ? { gap: '4px' } : undefined}>
            <button
              type="button"
              className="ctrl-btn"
              onClick={handleMuteToggle}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              data-tooltip={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onMouseDown={() => { isDraggingVolRef.current = true; }}
              onMouseUp={() => { isDraggingVolRef.current = false; }}
              onTouchStart={() => { isDraggingVolRef.current = true; }}
              onTouchEnd={() => { isDraggingVolRef.current = false; }}
              onChange={handleVolumeChange}
              className="volume-slider"
              style={showLyrics ? { width: '54px' } : undefined}
              data-tooltip={`Volume: ${isMuted ? 0 : volume}%`}
              data-tooltip-align="right"
            />
            {!showLyrics && (
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', opacity: 0.55, minWidth: '26px', textAlign: 'right' }}>
                {isMuted ? 0 : volume}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Live Synced Lyrics right next to Media Title/Player */}
      <AnimatePresence>
        {showLyrics && (
          <motion.div
            key="media-lyrics-pane"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              minWidth: 0,
              minHeight: 0,
              borderLeft: '1px solid var(--border-subtle)',
              paddingLeft: '12px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <LyricsView media={media} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
