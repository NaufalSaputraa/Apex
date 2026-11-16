import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Mic2, MicOff, RefreshCw, Search, FastForward, Rewind } from 'lucide-react';
import { MediaInfo } from '../types';

interface LyricLine {
  time: number;
  text: string;
}

interface LyricsViewProps {
  media: MediaInfo;
}

export const LyricsView: React.FC<LyricsViewProps> = ({ media }) => {
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [timeOffset, setTimeOffset] = useState<number>(0);
  const [manualQuery, setManualQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [trackName, setTrackName] = useState<string>('');
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Parse LRC text into time & text
  const parseLRC = (lrcText: string): LyricLine[] => {
    const lines = lrcText.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.?(\d{0,3})\]/;

    for (const line of lines) {
      const match = timeRegex.exec(line);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
        const timeInSec = min * 60 + sec + ms / 1000;
        const text = line.replace(timeRegex, '').trim();
        if (text) {
          result.push({ time: timeInSec, text });
        }
      }
    }
    return result.sort((a, b) => a.time - b.time);
  };

  const fetchLyricsFor = async (queryTitle: string, queryArtist = '') => {
    if (!queryTitle.trim()) {
      setLyrics([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setTrackName(queryTitle);
    setHasSearched(true);

    try {
      const cleanTitle = queryTitle
        .replace(/\(.*\)|\[.*\]/g, '')
        .replace(/official.*video/i, '')
        .replace(/official.*audio/i, '')
        .replace(/lyric.*video/i, '')
        .replace(/feat\..*/i, '')
        .trim();

      const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
        cleanTitle
      )}&artist_name=${encodeURIComponent(queryArtist.trim())}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.syncedLyrics) {
          setLyrics(parseLRC(data.syncedLyrics));
          setTimeOffset(0);
          setLoading(false);
          return;
        }
        if (data.plainLyrics) {
          const plain = data.plainLyrics
            .split('\n')
            .filter((l: string) => l.trim())
            .map((text: string, i: number) => ({ time: i * 4, text }));
          setLyrics(plain);
          setTimeOffset(0);
          setLoading(false);
          return;
        }
      }

      // Try search endpoint if exact match wasn't found
      const searchRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`
      );
      if (searchRes.ok) {
        const results = await searchRes.json();
        if (Array.isArray(results) && results.length > 0 && results[0].syncedLyrics) {
          setLyrics(parseLRC(results[0].syncedLyrics));
          setTimeOffset(0);
          setLoading(false);
          return;
        }
      }

      // If truly not found, leave EMPTY as requested
      setLyrics([]);
    } catch {
      // If network fails or no lyrics, leave EMPTY
      setLyrics([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when media title changes
  useEffect(() => {
    if (!media.title) {
      setLyrics([]);
      setTrackName('');
      return;
    }

    let title = media.title;
    let artist = media.artist || '';

    // If YouTube title is "Artist - Song Title"
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      artist = parts[0].trim();
      title = parts[1].trim();
    }

    fetchLyricsFor(title, artist);
  }, [media.title]);

  // Real-time synchronization directly bound to GSMTC position!
  const effectiveTime = Math.max(0, (media.position_secs || 0) + timeOffset);

  // Update active index based on live playback position
  useEffect(() => {
    if (lyrics.length === 0) return;
    let currentIdx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (effectiveTime >= lyrics[i].time) {
        currentIdx = i;
      } else {
        break;
      }
    }
    setActiveIdx(currentIdx);
  }, [effectiveTime, lyrics]);

  // Safe container-only scrolling (never scrolls parent window or body!)
  useEffect(() => {
    if (activeLineRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const line = activeLineRef.current;
      const targetScroll =
        line.offsetTop - container.offsetTop - container.clientHeight / 2 + line.clientHeight / 2;
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [activeIdx]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualQuery.trim()) {
      fetchLyricsFor(manualQuery.trim());
      setIsSearching(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '6px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#10b981' }}>
          <Mic2 size={13} />
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {trackName ? trackName.slice(0, 32) : 'Live Synced Lyrics'}
          </span>
        </div>

        {/* Sync Controls & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {lyrics.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setTimeOffset((t) => t - 1.5)}
                aria-label="Shift lyrics back 1.5 seconds"
                data-tooltip="Shift -1.5s"
                data-tooltip-pos="bottom"
                style={{
                  background: 'var(--bg-input)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  color: 'var(--text-secondary)',
                  fontSize: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Rewind size={10} /> -1.5s
              </button>
              <button
                type="button"
                onClick={() => setTimeOffset((t) => t + 1.5)}
                aria-label="Shift lyrics forward 1.5 seconds"
                data-tooltip="Shift +1.5s"
                data-tooltip-pos="bottom"
                style={{
                  background: 'var(--bg-input)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  color: 'var(--text-secondary)',
                  fontSize: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                +1.5s <FastForward size={10} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsSearching(!isSearching)}
            aria-label="Search song lyrics"
            data-tooltip="Search lyrics"
            data-tooltip-pos="bottom"
            data-tooltip-align="right"
            style={{
              background: isSearching ? 'rgba(56, 189, 248, 0.2)' : 'var(--bg-input)',
              border: 'none',
              borderRadius: '6px',
              padding: '3px 6px',
              color: isSearching ? '#38bdf8' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <Search size={12} />
          </button>
          {loading && <RefreshCw size={11} className="animate-spin" style={{ color: '#10b981' }} />}
        </div>
      </div>

      {/* Manual Search Form */}
      {isSearching && (
        <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            placeholder="Search song title..."
            aria-label="Search song title"
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '4px 10px',
              color: 'var(--text-primary)',
              fontSize: '11px',
              outline: 'none',
              boxShadow: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              background: '#10b981',
              border: 'none',
              borderRadius: '8px',
              padding: '4px 12px',
              color: '#000',
              fontWeight: 700,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </form>
      )}

      {/* Main Lyrics Viewport */}
      {lyrics.length > 0 ? (
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px 6px',
            maskImage:
              'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
          }}
        >
          {lyrics.map((line, idx) => {
            const isActive = idx === activeIdx;
            return (
              <div
                key={idx}
                ref={isActive ? activeLineRef : null}
                onClick={() => {
                  invoke('seek_media', { positionSecs: line.time }).catch(() => {});
                }}
                style={{
                  fontSize: isActive ? '15.5px' : '13px',
                  fontWeight: isActive ? 800 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  transform: isActive ? 'scale(1.03)' : 'scale(1)',
                  transformOrigin: 'left center',
                  transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                  textShadow: isActive ? '0 0 16px rgba(16, 185, 129, 0.4)' : 'none',
                  lineHeight: 1.38,
                  cursor: 'pointer',
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>
      ) : (
        /* Clean Empty State - No fake/mismatched lyrics */
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '20px',
          }}
        >
          <MicOff size={28} style={{ opacity: 0.45, color: 'var(--text-muted)' }} />
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {hasSearched ? 'Lyrics Unavailable' : 'No Track Playing'}
          </div>
          <div style={{ fontSize: '11px', maxWidth: '280px', lineHeight: 1.4 }}>
            {hasSearched
              ? 'Synced lyrics were not found for this track. Try searching the song title above.'
              : 'Play music on Spotify, Apple Music, or YouTube for live synced lyrics.'}
          </div>
        </div>
      )}
    </div>
  );
};
