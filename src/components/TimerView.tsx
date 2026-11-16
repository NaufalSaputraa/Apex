import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

export const TimerView: React.FC = () => {
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((sec) => sec - 1);
      }, 1000);
    } else if (secondsLeft === 0) {
      setIsActive(false);
    }
    return () => clearInterval(interval);
  }, [isActive, secondsLeft]);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReset = (mins: number) => {
    setIsActive(false);
    setSecondsLeft(mins * 60);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="timer-view">
        <div>
          <div className="timer-clock">{formatTime(secondsLeft)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {secondsLeft === 0 ? 'Session Complete!' : isActive ? 'Focusing...' : 'Paused'}
          </div>
        </div>

        <div className="timer-controls">
          <button
            className="timer-btn primary"
            onClick={() => setIsActive(!isActive)}
          >
            {isActive ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Pause size={12} fill="#fff" /> Pause
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Play size={12} fill="#fff" /> Start
              </span>
            )}
          </button>
          <button
            className="timer-btn secondary"
            onClick={() => handleReset(25)}
            data-tooltip="Reset ke 25m"
            data-tooltip-align="right"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => handleReset(25)}
          className="tab-btn"
          style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}
        >
          25m Focus
        </button>
        <button
          onClick={() => handleReset(5)}
          className="tab-btn"
          style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}
        >
          5m Break
        </button>
        <button
          onClick={() => handleReset(15)}
          className="tab-btn"
          style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}
        >
          15m Long
        </button>
      </div>
    </div>
  );
};
