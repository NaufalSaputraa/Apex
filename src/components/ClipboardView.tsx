import React, { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Copy, Check, Link2, Code2, FileText, Trash2, Search, Shield, RotateCcw } from 'lucide-react';
import { ClipboardItem } from '../types';

interface ClipboardViewProps {
  history: ClipboardItem[];
  onClearHistory: () => void;
  onRestoreHistory?: (items: ClipboardItem[]) => void;
  privateSkippedCount: number;
}

export const ClipboardView: React.FC<ClipboardViewProps> = ({
  history,
  onClearHistory,
  onRestoreHistory,
  privateSkippedCount,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [undoItems, setUndoItems] = useState<ClipboardItem[] | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClearWithUndo = () => {
    if (history.length === 0) return;
    const snapshot = [...history];
    onClearHistory();
    if (onRestoreHistory) {
      setUndoItems(snapshot);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setUndoItems(null), 4000);
    }
  };

  const handleUndoClear = () => {
    if (!undoItems || !onRestoreHistory) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    onRestoreHistory(undoItems);
    setUndoItems(null);
  };

  const handleCopy = async (item: ClipboardItem) => {
    try {
      await invoke('write_clipboard', { text: item.text });
    } catch {
      navigator.clipboard.writeText(item.text);
    }
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const filtered = history.filter((item) =>
    item.text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
      {/* Search Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            borderRadius: '8px',
            padding: '5px 10px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-input)',
          }}
        >
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search clipboard..."
            aria-label="Search clipboard"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '11.5px',
              width: '100%',
              padding: 0,
              boxShadow: 'none',
            }}
          />
        </div>
        {privateSkippedCount > 0 && (
          <div
            data-tooltip="Sensitive items skipped automatically"
            data-tooltip-pos="bottom"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '6px',
              padding: '3px 6px',
              flexShrink: 0,
            }}
          >
            <Shield size={11} />
            <span>{privateSkippedCount}</span>
          </div>
        )}
        {history.length > 0 && (
          <button
            type="button"
            onClick={handleClearWithUndo}
            className="icon-btn"
            aria-label="Clear clipboard history"
            data-tooltip="Clear History"
            data-tooltip-pos="bottom"
            data-tooltip-align="right"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {undoItems && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            padding: '5px 10px',
            fontSize: '11px',
            color: 'var(--text-primary)',
          }}
        >
          <span>Cleared {undoItems.length} clips</span>
          <button
            type="button"
            onClick={handleUndoClear}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              fontWeight: 700,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={11} />
            <span>Undo</span>
          </button>
        </div>
      )}

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          paddingRight: '2px',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              color: 'var(--text-muted)',
              fontSize: '11.5px',
              textAlign: 'center',
              padding: '24px 12px',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
              {search ? 'No matching clips' : 'Clipboard history is empty'}
            </span>
            <span style={{ fontSize: '10.5px' }}>
              {search ? 'Try a different keyword.' : 'Copied links, code, and text will appear here.'}
            </span>
          </div>
        ) : (
          filtered.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => handleCopy(item)}
              aria-label={`Copy ${item.text.slice(0, 40)}`}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '8px 10px',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text-primary)',
                transition: 'background 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                {item.type === 'link' && <Link2 size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />}
                {item.type === 'code' && <Code2 size={14} style={{ color: '#a855f7', flexShrink: 0 }} />}
                {item.type === 'text' && <FileText size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '380px',
                      fontFamily: item.type === 'code' ? 'var(--font-mono)' : 'inherit',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {item.text}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {item.time}
                  </div>
                </div>
              </div>

              <div style={{ flexShrink: 0, paddingLeft: '8px' }}>
                {copiedId === item.id ? (
                  <Check size={14} style={{ color: '#10b981' }} />
                ) : (
                  <Copy size={13} style={{ color: 'var(--text-muted)' }} />
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
