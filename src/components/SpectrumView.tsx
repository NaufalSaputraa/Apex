import React, { useState, useEffect } from 'react';
import { Waves } from 'lucide-react';
import { MediaInfo } from '../types';

interface SpectrumViewProps {
  media: MediaInfo;
}

export const SpectrumView: React.FC<SpectrumViewProps> = ({ media }) => {
  const [bars, setBars] = useState<number[]>(new Array(28).fill(10));
  const [mode, setMode] = useState<'mirror' | 'bars' | 'wave'>('mirror');

  useEffect(() => {
    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map((_, i) => {
          if (!media.is_playing) {
            // Gentle ambient breathing wave
            const sin = Math.sin((Date.now() / 400) + i * 0.3);
            return Math.max(8, 12 + sin * 8);
          }
          // High dynamic active audio response
          const base = Math.sin((Date.now() / 150) + i * 0.4) * 25 + 35;
          const noise = Math.random() * 30;
          return Math.min(85, Math.max(12, base + noise));
        })
      );
    }, 60);

    return () => clearInterval(interval);
  }, [media.is_playing]);

  const getGradient = (index: number) => {
    const ratio = index / 28;
    if (ratio < 0.3) return 'linear-gradient(180deg, #38bdf8, #0284c7)';
    if (ratio < 0.6) return 'linear-gradient(180deg, #34d399, #059669)';
    if (ratio < 0.85) return 'linear-gradient(180deg, #a855f7, #7c3aed)';
    return 'linear-gradient(180deg, #f59e0b, #d97706)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
      {/* Header with Mode Toggles */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#38bdf8' }}>
          <Waves size={14} />
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Full Spectrum Visualizer
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setMode('mirror')}
            className={`tab-btn ${mode === 'mirror' ? 'active' : ''}`}
            style={{ padding: '3px 8px', fontSize: '10.5px' }}
          >
            Mirror
          </button>
          <button
            onClick={() => setMode('bars')}
            className={`tab-btn ${mode === 'bars' ? 'active' : ''}`}
            style={{ padding: '3px 8px', fontSize: '10.5px' }}
          >
            Bars
          </button>
          <button
            onClick={() => setMode('wave')}
            className={`tab-btn ${mode === 'wave' ? 'active' : ''}`}
            style={{ padding: '3px 8px', fontSize: '10.5px' }}
          >
            Wave
          </button>
        </div>
      </div>

      {/* Visualizer Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: mode === 'mirror' ? 'center' : 'flex-end',
          justifyContent: 'center',
          gap: '4px',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '16px',
          padding: '16px 20px',
          border: '1px solid rgba(255,255,255,0.06)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.12), transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {bars.map((val, idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              maxWidth: '8px',
              height: `${val}%`,
              background: getGradient(idx),
              borderRadius: '999px',
              transition: 'height 0.08s ease',
              boxShadow: media.is_playing ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
};
