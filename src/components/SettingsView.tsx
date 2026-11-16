import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Power,
  Sparkles,
  Clock,
  Laptop,
  ShieldCheck,
  MonitorOff,
  Bell,
  Palette,
  Gauge,
  FolderX,
  LayoutGrid,
  Maximize2,
  SlidersHorizontal,
} from 'lucide-react';
import { AnimSpeed, GlassTheme, IdleCompanionStyle, IslandSettings, IslandTab } from '../types';
import { PixelPeekingCat } from './PixelPeekingCat';

type SettingsTab = 'general' | 'appearance' | 'pages';

interface SettingsViewProps {
  notchMode: boolean;
  onToggleNotch: () => void;
  companionStyle: IdleCompanionStyle;
  onChangeCompanionStyle: (style: IdleCompanionStyle) => void;
  autoHideFullscreen: boolean;
  onToggleAutoHideFullscreen: () => void;
  fullscreenBehavior: 'mini-notch' | 'hide';
  onChangeFullscreenBehavior: (mode: 'mini-notch' | 'hide') => void;
  miniNotchCorner: 'top-right' | 'top-center' | 'top-left';
  onChangeMiniNotchCorner: (corner: 'top-right' | 'top-center' | 'top-left') => void;
  notifyOnFullscreen: boolean;
  onToggleNotifyOnFullscreen: () => void;
  settings: IslandSettings;
  onUpdateSettings: (patch: Partial<IslandSettings>) => void;
}

const ALL_TABS: { id: IslandTab; label: string }[] = [
  { id: 'media', label: 'Media' },
  { id: 'today', label: 'Today' },
  { id: 'agent', label: 'Agent' },
  { id: 'system', label: 'System' },
  { id: 'shelf', label: 'Shelf' },
  { id: 'clipboard', label: 'Clips' },
  { id: 'timer', label: 'Focus' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  notchMode,
  onToggleNotch,
  companionStyle,
  onChangeCompanionStyle,
  autoHideFullscreen,
  onToggleAutoHideFullscreen,
  fullscreenBehavior,
  onChangeFullscreenBehavior,
  miniNotchCorner,
  onChangeMiniNotchCorner,
  notifyOnFullscreen,
  onToggleNotifyOnFullscreen,
  settings,
  onUpdateSettings,
}) => {
  const [subTab, setSubTab] = useState<SettingsTab>('general');
  const [autostart, setAutostart] = useState<boolean>(false);
  const [osNotifStatus, setOsNotifStatus] = useState<string>('checking');

  useEffect(() => {
    invoke<boolean>('get_autostart')
      .then(setAutostart)
      .catch(() => {});
    invoke<{ status: string; supported: boolean }>('check_os_notification_access')
      .then((res) => setOsNotifStatus(res.status))
      .catch(() => setOsNotifStatus('needs_identity'));
  }, []);

  const handleToggleAutostart = async () => {
    const next = !autostart;
    setAutostart(next);
    try {
      await invoke('set_autostart', { enable: next });
    } catch {
      // Ignore outside Tauri
    }
  };

  const toggleTab = (id: IslandTab) => {
    const exists = settings.enabledTabs.includes(id);
    if (exists && settings.enabledTabs.length <= 1) return;
    const next = exists
      ? settings.enabledTabs.filter((t) => t !== id)
      : [...settings.enabledTabs, id];
    onUpdateSettings({ enabledTabs: next });
  };

  const renderToggle = (active: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      style={{
        width: '38px',
        height: '20px',
        borderRadius: '10px',
        background: active ? '#10b981' : 'var(--border-strong)',
        border: 'none',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: '#ffffff',
          position: 'absolute',
          top: '3px',
          left: active ? '21px' : '3px',
          transition: 'left 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );

  const chipStyle = (active: boolean, color = '#10b981'): React.CSSProperties => ({
    flex: 1,
    padding: '5px 8px',
    borderRadius: '8px',
    border: active ? `1px solid ${color}` : '1px solid var(--border-subtle)',
    background: active ? `${color}26` : 'var(--bg-card)',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontSize: '10.5px',
    fontWeight: active ? 700 : 600,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.16s ease',
  });

  const iconBoxStyle: React.CSSProperties = {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    borderRadius: '12px',
    padding: '10px 12px',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
      {/* Sub-navigation bar */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {(
          [
            { id: 'general', label: 'General', icon: <SlidersHorizontal size={12} /> },
            { id: 'appearance', label: 'Appearance', icon: <Palette size={12} /> },
            { id: 'pages', label: 'Pages', icon: <LayoutGrid size={12} /> },
          ] as { id: SettingsTab; label: string; icon: React.ReactNode }[]
        ).map((item) => {
          const active = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                padding: '5px 8px',
                borderRadius: '8px',
                border: active ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid var(--border-subtle)',
                background: active ? 'rgba(56, 189, 248, 0.14)' : 'var(--bg-card)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: active ? 700 : 600,
                cursor: 'pointer',
                transition: 'all 0.16s ease',
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '2px' }}>
        <AnimatePresence mode="wait">
          {subTab === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={iconBoxStyle}>
                      <Power size={14} style={{ color: autostart ? '#10b981' : 'var(--text-muted)' }} />
                    </span>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Run on Windows Startup
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        Launch automatically at sign-in
                      </div>
                    </div>
                  </div>
                  {renderToggle(autostart, handleToggleAutostart, 'Run on Windows Startup')}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={iconBoxStyle}>
                      <MonitorOff size={14} style={{ color: autoHideFullscreen ? '#10b981' : 'var(--text-muted)' }} />
                    </span>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Fullscreen / Maximize Mode
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        Shrink to corner mini-notch or hide over fullscreen apps
                      </div>
                    </div>
                  </div>
                  {renderToggle(autoHideFullscreen, onToggleAutoHideFullscreen, 'Fullscreen / Maximize Mode')}
                </div>

                {autoHideFullscreen && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '36px', gap: '8px' }}>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Action
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {([
                          { id: 'mini-notch', label: 'Mini-Notch' },
                          { id: 'hide', label: 'Auto-Hide' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onChangeFullscreenBehavior(opt.id)}
                            style={{
                              padding: '3px 9px',
                              borderRadius: '999px',
                              border: fullscreenBehavior === opt.id
                                ? '1px solid rgba(16, 185, 129, 0.55)'
                                : '1px solid var(--border-subtle)',
                              background: fullscreenBehavior === opt.id
                                ? 'rgba(16, 185, 129, 0.16)'
                                : 'var(--bg-card)',
                              color: fullscreenBehavior === opt.id ? '#34d399' : 'var(--text-muted)',
                              fontSize: '10px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {fullscreenBehavior === 'mini-notch' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '36px', gap: '8px' }}>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Notch Position
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {([
                            { id: 'top-left', label: 'Top-Left' },
                            { id: 'top-center', label: 'Top-Center' },
                            { id: 'top-right', label: 'Top-Right' },
                          ] as const).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => onChangeMiniNotchCorner(opt.id)}
                              style={{
                                padding: '3px 9px',
                                borderRadius: '999px',
                                border: miniNotchCorner === opt.id
                                  ? '1px solid rgba(56, 189, 248, 0.55)'
                                  : '1px solid var(--border-subtle)',
                                background: miniNotchCorner === opt.id
                                  ? 'rgba(56, 189, 248, 0.16)'
                                  : 'var(--bg-card)',
                                color: miniNotchCorner === opt.id ? '#38bdf8' : 'var(--text-muted)',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={iconBoxStyle}>
                          <Bell size={14} style={{ color: notifyOnFullscreen ? '#38bdf8' : 'var(--text-muted)' }} />
                        </span>
                        <div>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Notify in Fullscreen
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                            Peek alerts &amp; agent hooks over fullscreen apps
                          </div>
                        </div>
                      </div>
                      {renderToggle(notifyOnFullscreen, onToggleNotifyOnFullscreen, 'Notify in Fullscreen')}
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={iconBoxStyle}>
                      <Bell size={14} style={{ color: osNotifStatus === 'allowed' ? '#10b981' : '#f59e0b' }} />
                    </span>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        OS Toast Listener (All Apps)
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        {osNotifStatus === 'allowed'
                          ? 'Active • Listening to Windows notifications'
                          : osNotifStatus === 'denied'
                          ? 'Blocked in Windows Privacy -> Notifications'
                          : 'Requires MSIX package (scripts/build-msix.ps1)'}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: osNotifStatus === 'allowed' ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.16)',
                      color: osNotifStatus === 'allowed' ? '#10b981' : '#f59e0b',
                      border: osNotifStatus === 'allowed' ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(245,158,11,0.35)',
                      flexShrink: 0,
                    }}
                  >
                    {osNotifStatus === 'allowed' ? 'Active' : osNotifStatus === 'denied' ? 'Denied' : 'MSIX'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={iconBoxStyle}>
                      <FolderX size={14} style={{ color: settings.emptyShelfOnStart ? '#10b981' : 'var(--text-muted)' }} />
                    </span>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Start with Empty Shelf
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        Clear temporary File Shelf on app launch
                      </div>
                    </div>
                  </div>
                  {renderToggle(
                    settings.emptyShelfOnStart,
                    () => onUpdateSettings({ emptyShelfOnStart: !settings.emptyShelfOnStart }),
                    'Start with Empty Shelf'
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={iconBoxStyle}>
                      <Clock size={14} style={{ color: settings.clock24h ? '#10b981' : 'var(--text-muted)' }} />
                    </span>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        24-Hour Clock
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        Display 14:30 instead of 02:30 PM
                      </div>
                    </div>
                  </div>
                  {renderToggle(
                    settings.clock24h,
                    () => onUpdateSettings({ clock24h: !settings.clock24h }),
                    '24-Hour Clock'
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={iconBoxStyle}>
                      <Sparkles size={14} style={{ color: settings.autoExpandOnHover ? '#10b981' : 'var(--text-muted)' }} />
                    </span>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Auto-Expand on Hover
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        Open island automatically when cursor rests
                      </div>
                    </div>
                  </div>
                  {renderToggle(
                    settings.autoExpandOnHover,
                    () => onUpdateSettings({ autoExpandOnHover: !settings.autoExpandOnHover }),
                    'Auto-Expand on Hover'
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  fontSize: '10.5px',
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <ShieldCheck size={12} style={{ color: '#10b981' }} />
                  <span>Zero telemetry • DPAPI local encryption</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)' }}>Apex v0.1</span>
              </div>
            </motion.div>
          )}

          {subTab === 'appearance' && (
            <motion.div
              key="appearance"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <Palette size={13} style={{ color: '#38bdf8' }} />
                    <span>Glass Style</span>
                  </div>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    {notchMode ? 'Notch Mode' : 'Floating'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                  {(
                    [
                      { id: 'auto', label: 'Auto OS', color: '#f59e0b' },
                      { id: 'dark', label: 'OLED Dark', color: '#a78bfa' },
                      { id: 'light', label: 'Light Glass', color: '#38bdf8' },
                      { id: 'glass', label: 'Frosted', color: '#38bdf8' },
                      { id: 'midnight', label: 'Midnight', color: '#3b82f6' },
                      { id: 'emerald', label: 'Emerald', color: '#10b981' },
                    ] as { id: GlassTheme; label: string; color: string }[]
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onUpdateSettings({ glassTheme: t.id })}
                      style={chipStyle(settings.glassTheme === t.id, t.color)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <Maximize2 size={13} style={{ color: '#f59e0b' }} />
                    <span>Notch Size</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', width: '58%' }}>
                    {([1, 1.15, 1.3] as const).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => onUpdateSettings({ notchScale: sc })}
                        style={chipStyle(settings.notchScale === sc, '#f59e0b')}
                      >
                        {Math.round(sc * 100)}%
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <Gauge size={13} style={{ color: '#10b981' }} />
                    <span>Animation Speed</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', width: '58%' }}>
                    {(
                      [
                        { id: 'snappy', label: 'Snappy' },
                        { id: 'normal', label: 'Normal' },
                        { id: 'smooth', label: 'Smooth' },
                      ] as { id: AnimSpeed; label: string }[]
                    ).map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => onUpdateSettings({ animSpeed: sp.id })}
                        style={chipStyle(settings.animSpeed === sp.id, '#10b981')}
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <Laptop size={13} style={{ color: '#3b82f6' }} />
                    <span>Island Position</span>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleNotch}
                    className="glass-pill-btn"
                    style={{ borderRadius: '8px', padding: '4px 10px' }}
                  >
                    {notchMode ? 'Notch (Bezel)' : 'Floating'} • Switch
                  </button>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  <Sparkles size={13} style={{ color: '#a78bfa' }} />
                  <span>Idle Companion</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    {
                      id: 'pet' as IdleCompanionStyle,
                      label: 'Peeking Cat',
                      icon: <PixelPeekingCat variant="inline" mood="idle" />,
                      color: '#a78bfa',
                      hint: 'Perched on capsule (Floating) or inside (Notch)',
                    },
                    {
                      id: 'orb' as IdleCompanionStyle,
                      label: 'Hologram',
                      icon: <Sparkles size={14} />,
                      color: '#06b6d4',
                      hint: 'Minimal glowing orb inside capsule',
                    },
                    {
                      id: 'minimal' as IdleCompanionStyle,
                      label: 'Minimalist',
                      icon: <Clock size={14} />,
                      color: '#10b981',
                      hint: 'Compact Peeking Cat inside capsule',
                    },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onChangeCompanionStyle(c.id)}
                      data-tooltip={c.hint}
                      style={{
                        ...chipStyle(companionStyle === c.id, c.color),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        padding: '6px',
                      }}
                    >
                      {c.icon}
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {subTab === 'pages' && (
            <motion.div
              key="pages"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <LayoutGrid size={13} style={{ color: '#38bdf8' }} />
                    <span>Visible Pages in Island</span>
                  </div>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    {settings.enabledTabs.length} active
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {ALL_TABS.map((t) => {
                    const active = settings.enabledTabs.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTab(t.id)}
                        style={chipStyle(active, '#38bdf8')}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  At least 1 page must remain active in the navigation bar.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
