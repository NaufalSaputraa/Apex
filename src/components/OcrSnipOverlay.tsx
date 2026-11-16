import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

interface DragRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const OcrSnipOverlay: React.FC = () => {
  const [drag, setDrag] = useState<DragRect | null>(null);
  const dragRef = useRef<DragRect | null>(null);
  dragRef.current = drag;

  const closeOverlay = async () => {
    try {
      await invoke('close_ocr_snip_overlay');
    } catch {
      // Ignore
    }
  };

  const cancelSnip = async () => {
    try {
      await emit('ocr-region-cancelled', {});
    } catch {
      // Ignore
    }
    await closeOverlay();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelSnip();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setDrag((prev) =>
        prev ? { ...prev, endX: e.clientX, endY: e.clientY } : null
      );
    };

    const onMouseUp = async () => {
      const current = dragRef.current;
      if (!current) return;
      setDrag(null);
      dragRef.current = null;

      const x = Math.min(current.startX, current.endX);
      const y = Math.min(current.startY, current.endY);
      const w = Math.abs(current.endX - current.startX);
      const h = Math.abs(current.endY - current.startY);

      if (w < 10 || h < 10) {
        await cancelSnip();
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const payload = {
        x: Math.round(x * dpr),
        y: Math.round(y * dpr),
        width: Math.round(w * dpr),
        height: Math.round(h * dpr),
      };

      try {
        await emit('ocr-region-selected', payload);
      } catch {
        // Ignore
      }
      await closeOverlay();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      cancelSnip();
      return;
    }
    const next = {
      startX: e.clientX,
      startY: e.clientY,
      endX: e.clientX,
      endY: e.clientY,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const left = drag ? Math.min(drag.startX, drag.endX) : 0;
  const top = drag ? Math.min(drag.startY, drag.endY) : 0;
  const width = drag ? Math.abs(drag.endX - drag.startX) : 0;
  const height = drag ? Math.abs(drag.endY - drag.startY) : 0;

  return (
    <div
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelSnip();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        cursor: 'crosshair',
        userSelect: 'none',
        // Non-zero alpha keeps WebView2 hit-testing active across the entire screen
        background: drag ? 'rgba(7, 10, 18, 0.01)' : 'rgba(7, 10, 18, 0.35)',
        overflow: 'hidden',
      }}
    >
      {/* Top Instruction Pill */}
      <div
        style={{
          position: 'fixed',
          top: '18px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(11, 15, 25, 0.92)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: '999px',
          padding: '6px 14px',
          color: '#f8fafc',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        Drag to select area for Smart OCR • Esc or Right-Click to cancel
      </div>

      {/* Active Selection Box */}
      {drag && width > 2 && height > 2 && (
        <div
          style={{
            position: 'fixed',
            left,
            top,
            width,
            height,
            border: '1.5px solid #38bdf8',
            borderRadius: '4px',
            boxShadow: '0 0 0 9999px rgba(7, 10, 18, 0.45)',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              bottom: '-22px',
              right: 0,
              background: '#0f172a',
              color: '#38bdf8',
              fontSize: '10px',
              fontFamily: 'monospace',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(56, 189, 248, 0.35)',
            }}
          >
            {Math.round(width)} × {Math.round(height)}
          </span>
        </div>
      )}
    </div>
  );
};
