import React, { useState } from 'react';
import {
  Disc3,
  BatteryWarning,
  ArrowDownCircle,
  CheckCircle2,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { MediaInfo, SystemStats, DownloadStatus, SystemAlert, IdleCompanionStyle } from '../types';
import { PixelPeekingCat, usePeekingCatMood } from './PixelPeekingCat';

interface CompactIslandProps {
  media: MediaInfo;
  stats: SystemStats | null;
  download?: DownloadStatus | null;
  currentTime: string;
  activeAlert?: SystemAlert | null;
  onAlertAction?: (alert: SystemAlert) => void;
  companionStyle?: IdleCompanionStyle;
  isPerchedCatActive?: boolean;
}

export const CompactIsland: React.FC<CompactIslandProps> = ({
  media,
  stats,
  download,
  currentTime,
  activeAlert,
  onAlertAction,
  companionStyle = 'pet',
  isPerchedCatActive = false,
}) => {
  const isPlaying = media.is_available && media.is_playing;
  const isDownloading = download && download.is_downloading;
  const [isHovered, setIsHovered] = useState(false);

  const { mood, triggerLove } = usePeekingCatMood({
    media,
    stats,
    download,
    activeAlert,
    enabled: !isPerchedCatActive && companionStyle !== 'orb',
  });

  // 1. DYNAMIC SYSTEM HUD NOTIFICATION MODE
  if (activeAlert) {
    return (
      <div className="compact-island" style={{ padding: '0 12px', gap: '8px' }}>
        <div className="compact-left">
          {activeAlert.type === 'download' && (
            <CheckCircle2 size={16} style={{ color: '#10b981', filter: 'drop-shadow(0 0 6px #10b981)' }} />
          )}
          {activeAlert.type === 'charger' && (
            <Zap size={16} style={{ color: '#f59e0b', fill: '#f59e0b', filter: 'drop-shadow(0 0 6px #f59e0b)' }} />
          )}
          {activeAlert.type === 'battery_low' && (
            <BatteryWarning size={16} style={{ color: '#ef4444', filter: 'drop-shadow(0 0 6px #ef4444)' }} />
          )}
        </div>

        <div className="compact-center" style={{ justifyContent: 'flex-start' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {activeAlert.title}
          </span>
          <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeAlert.message}
          </span>
        </div>

        <div className="compact-right">
          {activeAlert.actionPath && onAlertAction && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAlertAction(activeAlert);
              }}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '999px',
                padding: '2px 8px',
                color: 'var(--text-primary)',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>Open</span>
              <ExternalLink size={9} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. ACTIVE DOWNLOAD / MEDIA / IDLE MODE
  return (
    <div
      className="compact-island"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left section */}
      <div className="compact-left">
        {isDownloading ? (
          <ArrowDownCircle size={17} style={{ color: '#38bdf8' }} />
        ) : media.is_available ? (
          media.cover_url ? (
            <img
              src={media.cover_url}
              alt="cover"
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                animation: isPlaying ? 'spin 5s linear infinite' : 'none',
              }}
            />
          ) : (
            <Disc3
              size={18}
              style={{
                color: '#34d399',
                animation: isPlaying ? 'spin 4s linear infinite' : 'none',
              }}
            />
          )
        ) : companionStyle === 'orb' ? (
          /* Siri/Cyberpunk Hologram Orb */
          <div
            className="compact-holo-orb"
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #06b6d4, #8b5cf6, #3b82f6)',
              boxShadow: isHovered
                ? '0 0 12px rgba(6, 182, 212, 0.8), 0 0 4px #8b5cf6'
                : '0 0 8px rgba(6, 182, 212, 0.5)',
              position: 'relative',
              animation: 'pulse 2.5s infinite ease-in-out',
            }}
          />
        ) : isPerchedCatActive ? (
          /* Option B active: Peeking Cat sits on top of the capsule, keep left slot minimal */
          <div className="compact-notch-orb" />
        ) : (
          /* Option A: Peeking Cat inside the capsule (Notch mode or Minimalist style) */
          <PixelPeekingCat
            variant="inline"
            mood={mood}
            onClick={triggerLove}
          />
        )}
      </div>

      {/* Center dynamic text */}
      <div className="compact-center">
        {isDownloading ? (
          <>
            <span className="compact-title">
              {download.filename}
            </span>
            <span style={{ opacity: 0.6, fontSize: '10.5px', fontFamily: 'var(--font-mono)' }}>
              • {download.speed_formatted}
            </span>
          </>
        ) : media.is_available ? (
          <>
            <span className="compact-title">{media.title || 'Now Playing'}</span>
            {media.artist && (
              <>
                <span style={{ opacity: 0.3, fontSize: '10px' }}>•</span>
                <span className="compact-artist">{media.artist}</span>
              </>
            )}
          </>
        ) : (
          <span
            style={{
              fontSize: '12.5px',
              fontWeight: 700,
              letterSpacing: '-0.2px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {currentTime}
          </span>
        )}
      </div>

      {/* Right dynamic status */}
      <div className="compact-right">
        {isDownloading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: '#38bdf8',
            }}
          >
            <span>{Math.round(download.percent)}%</span>
          </div>
        ) : media.is_available ? (
          <div className={`equalizer-bars ${!isPlaying ? 'paused' : ''}`}>
            <div className="equalizer-bar" />
            <div className="equalizer-bar" />
            <div className="equalizer-bar" />
            <div className="equalizer-bar" />
          </div>
        ) : null}
      </div>
    </div>
  );
};
