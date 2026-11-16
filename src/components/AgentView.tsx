import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, Check, Copy, Play, Power, ScanText, ShieldAlert, X } from 'lucide-react';
import { AgentBridgeInfo, AgentPermissionRequest } from '../types';

interface AgentHookStatus {
  installed: boolean;
  config_path: string;
}

interface AgentViewProps {
  pendingRequests: AgentPermissionRequest[];
  onRespondPermission: (id: string, approved: boolean) => void;
  lastOcrText: string;
  onTriggerOcr: (fullScreen?: boolean) => void;
  ocrLoading: boolean;
}

export const AgentView: React.FC<AgentViewProps> = ({
  pendingRequests,
  onRespondPermission,
  lastOcrText,
  onTriggerOcr,
  ocrLoading,
}) => {
  const [bridgeInfo, setBridgeInfo] = useState<AgentBridgeInfo | null>(null);
  const [hookStatus, setHookStatus] = useState<AgentHookStatus | null>(null);
  const [hookBusy, setHookBusy] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  useEffect(() => {
    invoke<AgentBridgeInfo>('get_agent_bridge_info')
      .then(setBridgeInfo)
      .catch(() => {});
    invoke<AgentHookStatus>('get_agent_hook_status')
      .then(setHookStatus)
      .catch(() => {});
  }, []);

  const handleToggleHook = async () => {
    if (hookBusy) return;
    setHookBusy(true);
    try {
      const nextEnable = !(hookStatus?.installed ?? false);
      const res = await invoke<AgentHookStatus>('toggle_agent_hook', { enable: nextEnable });
      setHookStatus(res);
    } catch {
      // Ignored in browser dev
    } finally {
      setHookBusy(false);
    }
  };

  const handleTestHook = async () => {
    try {
      await invoke('test_agent_hook');
    } catch {
      // Ignored
    }
  };

  const copyCurlExample = async () => {
    if (!bridgeInfo) return;
    const cmd = `curl -s -X POST http://127.0.0.1:${bridgeInfo.port}/hook/permission -H "X-Apex-Token: ${bridgeInfo.token}" -H "Content-Type: application/json" -d "{\\"agent\\":\\"Claude Code\\",\\"tool\\":\\"bash\\",\\"detail\\":\\"npm test\\"}"`;
    try {
      await invoke('write_clipboard', { text: cmd });
    } catch {
      navigator.clipboard.writeText(cmd);
    }
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px', overflowY: 'auto' }}>
      {/* Smart OCR Quick Card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.22)',
          borderRadius: '10px',
          padding: '8px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScanText size={16} style={{ color: '#38bdf8' }} />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Smart OCR (Ctrl + Alt + T)</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              Capture screen text via Windows OCR &amp; copy automatically
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onTriggerOcr(false)}
            disabled={ocrLoading}
            style={{
              background: '#38bdf8',
              color: '#000',
              border: 'none',
              borderRadius: '7px',
              padding: '5px 9px',
              fontSize: '10.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            data-tooltip="Drag to select area"
            data-tooltip-align="right"
          >
            {ocrLoading ? 'Scanning...' : 'Select Area'}
          </button>
          <button
            type="button"
            onClick={() => onTriggerOcr(true)}
            disabled={ocrLoading}
            style={{
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '7px',
              padding: '5px 7px',
              fontSize: '10.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            data-tooltip="Scan full screen"
            data-tooltip-align="right"
          >
            Full
          </button>
        </div>
      </div>

      {lastOcrText && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '6px 10px',
            fontSize: '11px',
            color: 'var(--text-primary)',
            maxHeight: '64px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {lastOcrText}
        </div>
      )}

      {/* Pending AI Agent Permission Requests */}
      {pendingRequests.length > 0 ? (
        pendingRequests.map((req) => (
          <div
            key={req.id}
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '10px',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontSize: '11.5px', fontWeight: 700 }}>
                <ShieldAlert size={14} />
                <span>{req.agent} • {req.tool}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => onRespondPermission(req.id, false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <X size={11} /> Deny
                </button>
                <button
                  onClick={() => onRespondPermission(req.id, true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    background: 'rgba(16, 185, 129, 0.22)',
                    color: '#6ee7b7',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Check size={11} /> Approve
                </button>
              </div>
            </div>
            {req.detail && (
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {req.detail}
              </div>
            )}
          </div>
        ))
      ) : (
        <div
          style={{
            background: hookStatus?.installed
              ? 'rgba(16, 185, 129, 0.08)'
              : 'var(--bg-card)',
            border: hookStatus?.installed
              ? '1px solid rgba(16, 185, 129, 0.28)'
              : '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <Bot size={16} style={{ color: hookStatus?.installed || bridgeInfo?.running ? '#10b981' : 'var(--text-muted)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Agent Hook {hookStatus?.installed ? '• Active' : ''}</span>
                {bridgeInfo?.running && (
                  <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)' }}>
                    :{bridgeInfo.port}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {hookStatus?.installed
                  ? 'Active in Antigravity (hooks.json) • Token auto-synced'
                  : 'Click Enable to auto-configure Antigravity hook'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleToggleHook}
              disabled={hookBusy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: hookStatus?.installed
                  ? 'rgba(239, 68, 68, 0.16)'
                  : '#10b981',
                border: hookStatus?.installed
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : 'none',
                borderRadius: '7px',
                padding: '5px 9px',
                color: hookStatus?.installed ? '#ef4444' : '#000',
                fontSize: '10.5px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              aria-label={hookStatus?.installed ? 'Disable Agent Hook' : 'Enable Agent Hook'}
              data-tooltip={hookStatus?.installed ? 'Disable Hook' : 'Enable Antigravity Hook'}
              data-tooltip-align="right"
            >
              <Power size={11} />
              <span>{hookBusy ? '...' : hookStatus?.installed ? 'Disable' : 'Enable Hook'}</span>
            </button>

            <button
              type="button"
              onClick={handleTestHook}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '7px',
                padding: '5px 7px',
                color: 'var(--text-primary)',
                fontSize: '10.5px',
                cursor: 'pointer',
              }}
              aria-label="Test Permission Popup"
              data-tooltip="Test Permission Popup"
              data-tooltip-align="right"
            >
              <Play size={10} />
            </button>

            {bridgeInfo && (
              <button
                type="button"
                onClick={copyCurlExample}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '7px',
                  padding: '5px 7px',
                  color: 'var(--text-primary)',
                  fontSize: '10.5px',
                  cursor: 'pointer',
                }}
                aria-label="Copy manual curl example"
                data-tooltip="Copy manual curl"
                data-tooltip-align="right"
              >
                {copiedToken ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
