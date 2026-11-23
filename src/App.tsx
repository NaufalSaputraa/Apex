import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  Music,
  Activity,
  FolderDown,
  Timer,
  Pin,
  X,
  Laptop,
  CloudSun,
  ClipboardList,
  Settings,
  Bot,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { CompactIsland } from './components/CompactIsland';
import { PixelPeekingCat, usePeekingCatMood } from './components/PixelPeekingCat';

const MediaView = lazy(() => import('./components/MediaView').then((m) => ({ default: m.MediaView })));
const SystemView = lazy(() => import('./components/SystemView').then((m) => ({ default: m.SystemView })));
const TodayView = lazy(() => import('./components/TodayView').then((m) => ({ default: m.TodayView })));
const AgentView = lazy(() => import('./components/AgentView').then((m) => ({ default: m.AgentView })));
const ShelfView = lazy(() => import('./components/ShelfView').then((m) => ({ default: m.ShelfView })));
const ClipboardView = lazy(() => import('./components/ClipboardView').then((m) => ({ default: m.ClipboardView })));
const TimerView = lazy(() => import('./components/TimerView').then((m) => ({ default: m.TimerView })));
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
import {
  SystemStats,
  MediaInfo,
  MediaEventPayload,
  DownloadStatus,
  ShelfFile,
  IslandTab,
  SystemAlert,
  IdleCompanionStyle,
  ClipboardItem,
  ClipboardPollResult,
  AgentPermissionRequest,
  IslandSettings,
} from './types';
import './App.css';

const DEFAULT_SETTINGS: IslandSettings = {
  notchScale: 1,
  glassTheme: 'dark',
  animSpeed: 'normal',
  clock24h: false,
  emptyShelfOnStart: false,
  autoExpandOnHover: true,
  enabledTabs: ['media', 'today', 'agent', 'system', 'shelf', 'clipboard', 'timer'],
};

const GLASS_THEME_STYLES: Record<IslandSettings['glassTheme'], React.CSSProperties> = {
  auto: {},
  dark: {},
  light: {},
  glass: {
    background: 'rgba(20, 25, 36, 0.72)',
    backdropFilter: 'blur(24px) saturate(160%)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  midnight: {
    background: 'rgba(10, 20, 46, 0.82)',
    borderColor: 'rgba(59, 130, 246, 0.38)',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(96, 165, 250, 0.22)',
  },
  emerald: {
    background: 'rgba(7, 28, 21, 0.82)',
    borderColor: 'rgba(16, 185, 129, 0.38)',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(52, 211, 153, 0.22)',
  },
};

const TAB_HEIGHTS: Record<IslandTab, number> = {
  media: 215,
  lyrics: 330,
  today: 315,
  agent: 280,
  system: 265,
  shelf: 275,
  clipboard: 290,
  timer: 235,
  settings: 340,
};

export function App() {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [visualExpanded, setVisualExpanded] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [isGhost, setIsGhost] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<IslandTab>('media');
  const [mediaLyricsOpen, setMediaLyricsOpen] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [notchMode, setNotchMode] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [prefersLight, setPrefersLight] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => setPrefersLight(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // System & Media State
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [media, setMedia] = useState<MediaInfo>({
    is_available: false,
    is_playing: false,
    title: '',
    artist: '',
    album: '',
    source: '',
    cover_url: null,
    position_secs: 0,
    duration_secs: 0,
  });
  const [download, setDownload] = useState<DownloadStatus | null>(null);

  const [settings, setSettings] = useState<IslandSettings>(() => {
    try {
      const saved = localStorage.getItem('apex_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const updateSettings = (patch: Partial<IslandSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem('apex_settings', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Persistent Shelf Files state
  const [shelfFiles, setShelfFiles] = useState<ShelfFile[]>(() => {
    try {
      const savedSettings = localStorage.getItem('apex_settings');
      const parsed = savedSettings ? JSON.parse(savedSettings) : null;
      if (parsed?.emptyShelfOnStart) return [];
      const saved = localStorage.getItem('apex_shelf_files');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('apex_shelf_files', JSON.stringify(shelfFiles));
    } catch {}
  }, [shelfFiles]);

  const [currentTime, setCurrentTime] = useState<string>('');

  // Dynamic HUD Alert State (Feature A)
  const [activeAlert, setActiveAlert] = useState<SystemAlert | null>(null);
  const [companionStyle, setCompanionStyle] = useState<IdleCompanionStyle>(() => {
    return (localStorage.getItem('apex_companion_style') as IdleCompanionStyle) || 'pet';
  });
  const [autoHideFullscreen, setAutoHideFullscreen] = useState<boolean>(() => {
    return localStorage.getItem('apex_autohide_fullscreen') !== 'false';
  });
  const [fullscreenBehavior, setFullscreenBehavior] = useState<'mini-notch' | 'hide'>(() => {
    const saved = localStorage.getItem('apex_fullscreen_behavior');
    return saved === 'hide' ? 'hide' : 'mini-notch';
  });
  const [miniNotchCorner, setMiniNotchCorner] = useState<'top-right' | 'top-center' | 'top-left'>(() => {
    const saved = localStorage.getItem('apex_mini_notch_corner');
    if (saved === 'top-left' || saved === 'top-center') return saved;
    return 'top-right';
  });
  const [isFullscreenApp, setIsFullscreenApp] = useState<boolean>(false);
  const isMiniNotchMode =
    autoHideFullscreen &&
    fullscreenBehavior === 'mini-notch' &&
    isFullscreenApp &&
    !isExpanded &&
    !activeAlert &&
    !isPinned;
  const [notifyOnFullscreen, setNotifyOnFullscreen] = useState<boolean>(() => {
    return localStorage.getItem('apex_notify_fullscreen') !== 'false';
  });
  const notifyOnFullscreenRef = useRef<boolean>(notifyOnFullscreen);
  notifyOnFullscreenRef.current = notifyOnFullscreen;
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardItem[]>(() => {
    try {
      const saved = localStorage.getItem('apex_clipboard_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [privateSkippedCount, setPrivateSkippedCount] = useState<number>(0);
  const [pendingAgentRequests, setPendingAgentRequests] = useState<AgentPermissionRequest[]>([]);
  const [lastOcrText, setLastOcrText] = useState<string>('');
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('apex_clipboard_history', JSON.stringify(clipboardHistory));
    } catch {}
  }, [clipboardHistory]);

  const wasExpandedRef = useRef<boolean>(false);
  const hiddenByFullscreenRef = useRef<boolean>(false);
  const hasActiveNotifRef = useRef<boolean>(false);
  hasActiveNotifRef.current = activeAlert !== null || pendingAgentRequests.length > 0 || isExpanded;

  const prevChargingRef = useRef<boolean | null>(null);
  const prevDownloadDownloadingRef = useRef<boolean>(false);
  const prevDownloadFilenameRef = useRef<string>('');
  const seenOsNotifIdsRef = useRef<Set<number>>(new Set());
  const osNotifInitializedRef = useRef<boolean>(false);

  const triggerAlert = (alert: SystemAlert) => {
    if (hiddenByFullscreenRef.current && notifyOnFullscreenRef.current) {
      invoke('set_window_visible', { visible: true }).catch(() => {});
    }
    setActiveAlert(alert);
    setTimeout(() => {
      setActiveAlert((cur) => (cur?.id === alert.id ? null : cur));
    }, 4500);
  };

  const handleAlertAction = (alert: SystemAlert) => {
    if (alert.actionPath) {
      invoke('open_file', { path: alert.actionPath }).catch(() => {});
    }
    setActiveAlert(null);
  };

  const hoverTimeoutRef = useRef<any>(null);

  // Tab navigation drag-to-scroll & wheel state (without scrollbars)
  const tabNavRef = useRef<HTMLDivElement>(null);
  const isDraggingNav = useRef<boolean>(false);
  const navStartX = useRef<number>(0);
  const navScrollLeft = useRef<number>(0);
  const hasDraggedTab = useRef<boolean>(false);

  const handleNavMouseDown = (e: React.MouseEvent) => {
    if (!tabNavRef.current) return;
    isDraggingNav.current = true;
    hasDraggedTab.current = false;
    navStartX.current = e.pageX - tabNavRef.current.offsetLeft;
    navScrollLeft.current = tabNavRef.current.scrollLeft;
  };

  const handleNavMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingNav.current || !tabNavRef.current) return;
    e.preventDefault();
    const x = e.pageX - tabNavRef.current.offsetLeft;
    const walk = (x - navStartX.current) * 1.5;
    if (Math.abs(walk) > 4) {
      hasDraggedTab.current = true;
    }
    tabNavRef.current.scrollLeft = navScrollLeft.current - walk;
  };

  const handleNavMouseUp = () => {
    isDraggingNav.current = false;
    setTimeout(() => {
      hasDraggedTab.current = false;
    }, 60);
  };

  const handleNavWheel = (e: React.WheelEvent) => {
    if (tabNavRef.current) {
      tabNavRef.current.scrollLeft += e.deltaY;
    }
  };

  // Center active tab smoothly when selected
  useEffect(() => {
    if (tabNavRef.current) {
      const activeEl = tabNavRef.current.querySelector('.tab-btn.active') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab]);

  // WebView2 & Rust state sync + working-set trim on collapse
  useEffect(() => {
    invoke('set_island_expanded', { expanded: isExpanded }).catch(() => {});
    if (wasExpandedRef.current && !isExpanded) {
      const t = setTimeout(() => {
        invoke('trim_working_set').catch(() => {});
      }, 600);
      wasExpandedRef.current = isExpanded;
      return () => clearTimeout(t);
    }
    wasExpandedRef.current = isExpanded;
  }, [isExpanded]);

  // Keyboard shortcuts when island is expanded: Escape to collapse, Ctrl+ArrowLeft/Right to switch tabs
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          (e.target as HTMLElement).blur();
          return;
        }
        setIsExpanded(false);
      } else if (e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const tabs = settings.enabledTabs;
        if (tabs.length <= 1) return;
        const idx = tabs.indexOf(activeTab);
        const nextIdx =
          e.key === 'ArrowRight'
            ? (idx + 1) % tabs.length
            : (idx - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[nextIdx]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, activeTab, settings.enabledTabs]);

  // Listen for Alt-key Ghost Mode & sync exact pill bounds for transparent click-through
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let active = true;
    let unlistenGhost: (() => void) | undefined;
    listen<boolean>('island-ghost', (event) => {
      if (active) setIsGhost(Boolean(event.payload));
    }).then((fn) => {
      if (!active) fn();
      else unlistenGhost = fn;
    });
    return () => {
      active = false;
      if (unlistenGhost) unlistenGhost();
    };
  }, []);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__ || visualExpanded) return;
    const syncBounds = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const winX = window.screenX || 0;
      const winY = window.screenY || 0;
      const topPad = !notchMode && !isMiniNotchMode && companionStyle !== 'minimal' && companionStyle !== 'orb' ? 22 : 0;
      invoke('set_pill_bounds', {
        left: Math.round((winX + rect.left) * dpr),
        top: Math.round((winY + Math.max(0, rect.top - topPad)) * dpr),
        right: Math.round((winX + rect.right) * dpr),
        bottom: Math.round((winY + rect.bottom) * dpr),
      }).catch(() => {});
    };
    const t1 = setTimeout(syncBounds, 280);
    const t2 = setTimeout(syncBounds, 520);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [visualExpanded, isMiniNotchMode, miniNotchCorner, isResizing, media.is_available, activeAlert, notchMode, companionStyle, settings.notchScale]);

  // Tab-nav overflow arrows
  const [navOverflow, setNavOverflow] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  const updateNavOverflow = () => {
    const el = tabNavRef.current;
    if (!el) return;
    setNavOverflow({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  useEffect(() => {
    if (!visualExpanded) return;
    const t = setTimeout(updateNavOverflow, 60);
    return () => clearTimeout(t);
  }, [visualExpanded, settings.enabledTabs]);

  // System Tray event listeners
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let active = true;
    let unlistenToggle: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;
    listen('tray-toggle-expand', () => {
      if (active) setIsExpanded((prev) => !prev);
    }).then((fn) => {
      if (!active) fn();
      else unlistenToggle = fn;
    });
    listen('tray-open-settings', () => {
      if (!active) return;
      setActiveTab('settings');
      setIsExpanded(true);
    }).then((fn) => {
      if (!active) fn();
      else unlistenSettings = fn;
    });
    return () => {
      active = false;
      if (unlistenToggle) unlistenToggle();
      if (unlistenSettings) unlistenSettings();
    };
  }, []);

  // Tier 2: Smart OCR Global Hotkey (Ctrl+Alt+T) & Agent Bridge Listeners
  const runOcrRegion = async (x: number, y: number, width: number, height: number) => {
    setOcrLoading(true);
    try {
      const text = await invoke<string>('capture_and_ocr', { x, y, width, height });
      setLastOcrText(text || '(No text detected)');
      if (text) {
        triggerAlert({
          id: 'ocr-' + Date.now(),
          type: 'download',
          title: 'Smart OCR Copied',
          message: text.slice(0, 60),
          timestamp: Date.now(),
        });
      }
    } catch (e: any) {
      setLastOcrText(typeof e === 'string' ? e : 'OCR failed');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleTriggerOcr = async (fullScreen = false) => {
    if (fullScreen) {
      await runOcrRegion(0, 0, 0, 0);
      return;
    }
    setOcrLoading(true);
    try {
      await invoke('open_ocr_snip_overlay');
    } catch {
      // Fallback to full screen if overlay fails
      await runOcrRegion(0, 0, 0, 0);
    }
  };

  const handleRespondPermission = async (id: string, approved: boolean) => {
    setPendingAgentRequests((prev) => prev.filter((r) => r.id !== id));
    await invoke('respond_agent_permission', { id, approved }).catch(() => {});
  };

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let active = true;
    let u1: (() => void) | undefined;
    let u2: (() => void) | undefined;
    let u3: (() => void) | undefined;
    let u4: (() => void) | undefined;
    let u5: (() => void) | undefined;
    let u6: (() => void) | undefined;

    listen('hotkey-ocr', () => {
      if (active) handleTriggerOcr(false);
    }).then((fn) => {
      if (!active) fn();
      else u1 = fn;
    });

    listen<{ x: number; y: number; width: number; height: number }>('ocr-region-selected', (event) => {
      if (!active) return;
      const { x, y, width, height } = event.payload;
      setTimeout(() => {
        if (active) runOcrRegion(x, y, width, height);
      }, 90);
    }).then((fn) => {
      if (!active) fn();
      else u4 = fn;
    });

    listen('ocr-region-cancelled', () => {
      if (active) setOcrLoading(false);
    }).then((fn) => {
      if (!active) fn();
      else u5 = fn;
    });

    listen<AgentPermissionRequest>('agent-permission-request', (event) => {
      if (!active) return;
      if (hiddenByFullscreenRef.current && notifyOnFullscreenRef.current) {
        invoke('set_window_visible', { visible: true }).catch(() => {});
      }
      setPendingAgentRequests((prev) => [...prev, event.payload]);
      setActiveTab('agent');
      setIsExpanded(true);
    }).then((fn) => {
      if (!active) fn();
      else u2 = fn;
    });

    listen<string>('agent-permission-expired', (event) => {
      if (!active) return;
      setPendingAgentRequests((prev) => prev.filter((r) => r.id !== event.payload));
    }).then((fn) => {
      if (!active) fn();
      else u6 = fn;
    });

    listen<{ agent: string; title: string; message: string }>('agent-notify', (event) => {
      if (!active) return;
      triggerAlert({
        id: 'agent-' + Date.now(),
        type: 'download',
        title: `${event.payload.agent}: ${event.payload.title}`,
        message: event.payload.message,
        timestamp: Date.now(),
      });
    }).then((fn) => {
      if (!active) fn();
      else u3 = fn;
    });

    return () => {
      active = false;
      if (u1) u1();
      if (u2) u2();
      if (u3) u3();
      if (u4) u4();
      if (u5) u5();
      if (u6) u6();
    };
  }, []);

  // Poll Windows OS Toast Notifications when running with MSIX Package Identity
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let active = true;

    const startListener = async () => {
      try {
        const access = await invoke<{ status: string; supported: boolean }>('check_os_notification_access');
        if (!active || !access.supported) return;

        const poll = async () => {
          try {
            const list = await invoke<{ id: number; app_name: string; title: string; body: string }[]>(
              'get_recent_os_notifications'
            );
            if (!osNotifInitializedRef.current) {
              list.forEach((n) => seenOsNotifIdsRef.current.add(n.id));
              osNotifInitializedRef.current = true;
              return;
            }
            for (const n of list) {
              if (!seenOsNotifIdsRef.current.has(n.id)) {
                seenOsNotifIdsRef.current.add(n.id);
                if (seenOsNotifIdsRef.current.size > 200) {
                  const oldest = seenOsNotifIdsRef.current.values().next().value;
                  if (oldest !== undefined) seenOsNotifIdsRef.current.delete(oldest);
                }
                triggerAlert({
                  id: `os-${n.id}-${Date.now()}`,
                  type: 'download',
                  title: `${n.app_name}${n.title ? ` • ${n.title}` : ''}`,
                  message: n.body || n.title || 'Notifikasi Baru',
                  timestamp: Date.now(),
                });
              }
            }
          } catch {
            // Ignored
          }
        };

        await poll();
        timer = setInterval(poll, 4000);
      } catch {
        // Unpackaged / unsupported
      }
    };

    startListener();
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  // Global privacy-respecting clipboard monitor
  useEffect(() => {
    const detectClipType = (str: string): 'link' | 'code' | 'text' => {
      if (str.startsWith('http://') || str.startsWith('https://')) return 'link';
      if (str.includes('{') || str.includes('const ') || str.includes('npm ') || str.includes('cargo ')) return 'code';
      return 'text';
    };

    const pollClipboard = async () => {
      try {
        const res = await invoke<ClipboardPollResult>('read_clipboard_safe');
        if (!res.changed) return;
        if (res.skipped_private) {
          setPrivateSkippedCount((c) => c + 1);
          return;
        }
        const text = res.text;
        if (text && text.trim().length > 0) {
          setClipboardHistory((prev) => {
            if (prev.length > 0 && prev[0].text === text) return prev;
            const newItem: ClipboardItem = {
              id: Math.random().toString(36).substring(2, 9),
              text,
              type: detectClipType(text),
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            return [newItem, ...prev.slice(0, 19)];
          });
        }
      } catch {
        // Ignored
      }
    };

    const interval = setInterval(pollClipboard, isMiniNotchMode ? 5000 : 2500);
    return () => clearInterval(interval);
  }, [isMiniNotchMode]);

  // Fullscreen / presentation auto-hide or corner mini-notch
  useEffect(() => {
    if (!autoHideFullscreen) {
      setIsFullscreenApp(false);
      if (hiddenByFullscreenRef.current) {
        hiddenByFullscreenRef.current = false;
        invoke('set_window_visible', { visible: true }).catch(() => {});
      }
      return;
    }

    if (fullscreenBehavior === 'mini-notch' && hiddenByFullscreenRef.current) {
      hiddenByFullscreenRef.current = false;
      invoke('set_window_visible', { visible: true }).catch(() => {});
    }

    let unhideStreak = 0;
    let firstCheck = true;
    const setVisibleIfChanged = async (visible: boolean) => {
      await invoke('set_window_visible', { visible });
    };

    const checkFullscreen = async () => {
      try {
        const active = await invoke<boolean>('is_fullscreen_app_active');
        const keepVisibleForNotif = notifyOnFullscreenRef.current && hasActiveNotifRef.current;

        if (fullscreenBehavior === 'mini-notch') {
          if (firstCheck || hiddenByFullscreenRef.current) {
            hiddenByFullscreenRef.current = false;
            await setVisibleIfChanged(true);
          }
          if (active && !isPinned && !keepVisibleForNotif) {
            unhideStreak = 0;
            setIsFullscreenApp(true);
          } else if (!active) {
            if (firstCheck) {
              unhideStreak = 0;
              setIsFullscreenApp(false);
            } else {
              unhideStreak += 1;
              if (unhideStreak >= 2) {
                unhideStreak = 0;
                setIsFullscreenApp(false);
              }
            }
          } else {
            unhideStreak = 0;
          }
          firstCheck = false;
          return;
        }

        // 'hide' mode
        setIsFullscreenApp(false);
        if (active && !isPinned && !keepVisibleForNotif) {
          unhideStreak = 0;
          if (!hiddenByFullscreenRef.current) {
            hiddenByFullscreenRef.current = true;
            setIsExpanded(false);
          }
          await setVisibleIfChanged(false);
        } else if (!active && (hiddenByFullscreenRef.current || firstCheck)) {
          if (firstCheck) {
            unhideStreak = 0;
            hiddenByFullscreenRef.current = false;
            await setVisibleIfChanged(true);
          } else {
            unhideStreak += 1;
            if (unhideStreak >= 2) {
              unhideStreak = 0;
              hiddenByFullscreenRef.current = false;
              await setVisibleIfChanged(true);
            }
          }
        } else {
          unhideStreak = 0;
        }
        firstCheck = false;
      } catch {
        // Ignored
      }
    };

    checkFullscreen();
    const interval = setInterval(checkFullscreen, 1500);
    return () => clearInterval(interval);
  }, [autoHideFullscreen, fullscreenBehavior, isPinned]);

  // Re-hide smoothly after a fullscreen peek-through notification clears
  useEffect(() => {
    if (!autoHideFullscreen || !hiddenByFullscreenRef.current) return;
    if (activeAlert === null && pendingAgentRequests.length === 0 && !isExpanded) {
      const t = setTimeout(() => {
        if (hiddenByFullscreenRef.current && !hasActiveNotifRef.current) {
          invoke('set_window_visible', { visible: false }).catch(() => {});
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [autoHideFullscreen, activeAlert, pendingAgentRequests.length, isExpanded]);

  // Event-driven download status (hydrated once on mount)
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    const applyDownload = (res: DownloadStatus) => {
      if (!active) return;
      if (prevDownloadDownloadingRef.current && !res.is_downloading && prevDownloadFilenameRef.current) {
        triggerAlert({
          id: 'dl-' + Date.now(),
          type: 'download',
          title: 'Download Selesai',
          message: prevDownloadFilenameRef.current,
          timestamp: Date.now(),
        });
      }
      prevDownloadDownloadingRef.current = res.is_downloading;
      if (res.filename) {
        prevDownloadFilenameRef.current = res.filename;
      }
      setDownload(res);
    };

    invoke<DownloadStatus>('get_download_status')
      .then(applyDownload)
      .catch(() => {});

    if ((window as any).__TAURI_INTERNALS__) {
      listen<DownloadStatus>('download-updated', (event) => {
        applyDownload(event.payload);
      }).then((fn) => {
        if (!active) {
          fn();
        } else {
          unlisten = fn;
        }
      });
    }

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  // Adaptive clock ticker (HH:MM only — 5s when expanded, 15s collapsed, 30s mini-notch)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: !settings.clock24h,
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, isExpanded ? 5000 : isMiniNotchMode ? 30000 : 15000);
    return () => clearInterval(interval);
  }, [isExpanded, isMiniNotchMode, settings.clock24h]);

  // Adaptive system stats polling: active on System tab, slow on laptops (battery alerts), idle on desktops
  const hasBattery = stats ? stats.has_battery : null;
  const isSystemTabOpen = isExpanded && activeTab === 'system';
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await invoke<SystemStats>('get_system_stats');
        if (res.has_battery && prevChargingRef.current !== null) {
          if (!prevChargingRef.current && res.is_charging) {
            triggerAlert({
              id: 'charge-' + Date.now(),
              type: 'charger',
              title: 'Pengisi Daya Terhubung',
              message: `${res.battery_percent}% Daya Tersedia`,
              timestamp: Date.now(),
            });
          } else if (prevChargingRef.current && !res.is_charging) {
            triggerAlert({
              id: 'battery-' + Date.now(),
              type: 'charger',
              title: 'Mode Baterai Aktif',
              message: `Tersisa ${res.battery_percent}%`,
              timestamp: Date.now(),
            });
          }
        }
        if (res.has_battery && !res.is_charging && res.battery_percent <= 20 && (prevChargingRef.current === null || prevChargingRef.current)) {
          triggerAlert({
            id: 'lowbat-' + Date.now(),
            type: 'battery_low',
            title: 'Baterai Lemah!',
            message: `Sisa ${res.battery_percent}% • Hubungkan charger`,
            timestamp: Date.now(),
          });
        }
        prevChargingRef.current = res.is_charging;
        setStats(res);
      } catch {
        setStats(null);
      }
    };

    if (isSystemTabOpen) {
      fetchStats();
      const interval = setInterval(fetchStats, 2000);
      return () => clearInterval(interval);
    }

    if (hasBattery === false) {
      return;
    }

    if (hasBattery === null) {
      fetchStats();
    }
    const interval = setInterval(fetchStats, isMiniNotchMode ? 20000 : 10000);
    return () => clearInterval(interval);
  }, [isSystemTabOpen, isMiniNotchMode, hasBattery]);

  // Event-driven GSMTC Media info (zero Base64 re-transfer when track unchanged)
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    invoke<MediaInfo>('get_media_info')
      .then((res) => {
        if (active) setMedia(res);
      })
      .catch(() => {});

    if ((window as any).__TAURI_INTERNALS__) {
      listen<MediaEventPayload>('media-updated', (event) => {
        if (!active) return;
        const p = event.payload;
        setMedia((prev) => ({
          is_available: p.is_available,
          is_playing: p.is_playing,
          title: p.title,
          artist: p.artist,
          album: p.album,
          source: p.source,
          cover_url: p.cover_changed ? p.cover_url : prev.cover_url,
          position_secs: p.position_secs,
          duration_secs: p.duration_secs,
        }));
      }).then((fn) => {
        if (!active) {
          fn();
        } else {
          unlisten = fn;
        }
      });
    }

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  // Refresh media timeline once when opening the Media tab
  useEffect(() => {
    if (!isExpanded || activeTab !== 'media') return;
    invoke<MediaInfo>('get_media_info')
      .then(setMedia)
      .catch(() => {});
  }, [isExpanded, activeTab]);

  // Real-time second-by-second playback position advancement ONLY when Media tab is visible
  useEffect(() => {
    if (!isExpanded || activeTab !== 'media' || !media.is_playing || !media.is_available) return;
    const interval = setInterval(() => {
      setMedia((prev) => {
        if (!prev.is_playing) return prev;
        const nextPos = prev.position_secs + 1;
        if (prev.duration_secs > 0 && nextPos > prev.duration_secs) {
          return { ...prev, position_secs: prev.duration_secs };
        }
        return { ...prev, position_secs: nextPos };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isExpanded, activeTab, media.is_playing, media.is_available]);

  const isPerchedCatMode = !notchMode && companionStyle !== 'minimal' && companionStyle !== 'orb';
  const showPerchedCat = isPerchedCatMode && !isExpanded;
  const { mood: perchedMood, triggerLove: triggerPerchedLove } = usePeekingCatMood({
    media,
    stats,
    download,
    activeAlert,
    enabled: showPerchedCat,
  });

  // Precision adaptive window sizing: expand OS window BEFORE pill animation, shrink AFTER collapse
  useEffect(() => {
    let cancelled = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    if (isExpanded) {
      setIsResizing(true);
      invoke('resize_and_reposition_island', {
        width: 620,
        height: 360,
        notchMode,
        position: 'center',
      })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) {
            requestAnimationFrame(() => {
              if (!cancelled) setVisualExpanded(true);
            });
          }
        });
      settleTimer = setTimeout(() => {
        if (!cancelled) setIsResizing(false);
      }, 280);
    } else if (isMiniNotchMode) {
      setIsResizing(true);
      setVisualExpanded(false);
      settleTimer = setTimeout(() => {
        if (cancelled) return;
        invoke('resize_and_reposition_island', {
          width: 56,
          height: 24,
          notchMode,
          position: miniNotchCorner,
        })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setIsResizing(false);
          });
      }, 240);
    } else {
      setIsResizing(true);
      setVisualExpanded(false);
      settleTimer = setTimeout(() => {
        if (cancelled) return;
        const baseW = activeAlert ? 360 : media.is_available ? 310 : 210;
        const baseH = isPerchedCatMode ? 74 : 52;
        invoke('resize_and_reposition_island', {
          width: Math.round(baseW * settings.notchScale),
          height: Math.round(baseH * settings.notchScale),
          notchMode,
          position: 'center',
        })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setIsResizing(false);
          });
      }, 240);
    }

    return () => {
      cancelled = true;
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [isExpanded, isMiniNotchMode, miniNotchCorner, notchMode, isPerchedCatMode, media.is_available, activeAlert, settings.notchScale]);

  // Handle pin always-on-top
  const handleTogglePin = async () => {
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    try {
      await invoke('toggle_pin', { pinned: newPinned });
    } catch (e) {
      // Ignored
    }
  };

  const handleSendMediaKey = async (key: string) => {
    try {
      await invoke('send_media_key', { key });
    } catch (e) {
      console.warn('Media key error:', e);
    }
  };

  const handleOpenFile = async (path: string) => {
    try {
      await invoke('open_file', { path });
    } catch (e) {
      console.warn('Open file error:', e);
    }
  };

  const handleRevealFile = async (path: string) => {
    try {
      await invoke('reveal_in_explorer', { path });
    } catch (e) {
      console.warn('Reveal file error:', e);
    }
  };

  // Mouse leave auto-collapse
  const hoverExpandRef = useRef<any>(null);
  const justRepositionedFromCornerRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isExpanded) {
      justRepositionedFromCornerRef.current = false;
      return;
    }
    if (isPinned) return;

    let armed = false;
    const armTimer = setTimeout(() => {
      armed = true;
    }, 350);

    const onBlur = () => {
      if (armed && !isPinned) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('blur', onBlur);
    return () => {
      clearTimeout(armTimer);
      window.removeEventListener('blur', onBlur);
    };
  }, [isExpanded, isPinned]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    if (isExpanded) {
      justRepositionedFromCornerRef.current = false;
    }
    if (!isExpanded && settings.autoExpandOnHover) {
      hoverExpandRef.current = setTimeout(() => {
        if (isMiniNotchMode) {
          justRepositionedFromCornerRef.current = true;
        }
        setIsExpanded(true);
      }, 220);
    }
  };

  const handleMouseLeave = () => {
    if (hoverExpandRef.current) {
      clearTimeout(hoverExpandRef.current);
      hoverExpandRef.current = null;
    }
    if (justRepositionedFromCornerRef.current) {
      return;
    }
    if (!isPinned && isExpanded) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 700);
    }
  };

  // Native Tauri v2 Drag & Drop listener for Shelf
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let active = true;
    let unlistenFn: (() => void) | null = null;

    const setupDragDrop = async () => {
      try {
        const webview = getCurrentWebview();
        const unlisten = await webview.onDragDropEvent((event) => {
          if (!active) return;
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            setIsDraggingOver(true);
            setIsExpanded(true);
            setActiveTab('shelf');
          } else if (event.payload.type === 'leave') {
            setIsDraggingOver(false);
          } else if (event.payload.type === 'drop') {
            setIsDraggingOver(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const added: ShelfFile[] = paths.map((filePath) => {
                const normalized = filePath.replace(/\\/g, '/');
                const name = normalized.split('/').pop() || filePath;
                const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
                return {
                  id: Math.random().toString(36).substring(2, 9),
                  name,
                  path: filePath,
                  sizeFormatted: 'Shelved',
                  extension: ext,
                  addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
              });
              setShelfFiles((prev) => {
                const existingPaths = new Set(prev.map((f) => f.path));
                const uniqueNew = added.filter((f) => !existingPaths.has(f.path));
                return [...uniqueNew, ...prev];
              });
            }
          }
        });
        if (!active) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      } catch (err) {
        console.warn('Tauri onDragDropEvent listener error:', err);
      }
    };

    setupDragDrop();
    return () => {
      active = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // HTML5 drop handler fallback
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const added: ShelfFile[] = Array.from(e.dataTransfer.files).map((f) => {
        const anyFile = f as any;
        const filePath = anyFile.path || f.name;
        const ext = f.name.includes('.') ? f.name.split('.').pop()?.toLowerCase() || '' : '';
        return {
          id: Math.random().toString(36).substring(2, 9),
          name: f.name,
          path: filePath,
          sizeFormatted: (f.size / (1024 * 1024)).toFixed(1) + ' MB',
          extension: ext,
          addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      });
      setShelfFiles((prev) => {
        const existingPaths = new Set(prev.map((item) => item.path));
        const uniqueNew = added.filter((item) => !existingPaths.has(item.path));
        return [...uniqueNew, ...prev];
      });
    }
  };

  // Drag over window automatically expands to shelf tab
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
    setIsExpanded(true);
    setActiveTab('shelf');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  // Ensure window is always pinned to (0,0) and never shifted down
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab, isExpanded]);

  const springCfg =
    settings.animSpeed === 'snappy'
      ? { type: 'spring' as const, stiffness: 600, damping: 36, mass: 0.6 }
      : settings.animSpeed === 'smooth'
      ? { type: 'spring' as const, stiffness: 280, damping: 28, mass: 1.0 }
      : { type: 'spring' as const, stiffness: 420, damping: 32, mass: 0.8 };

  const isLightEffective =
    settings.glassTheme === 'light' || (settings.glassTheme === 'auto' && prefersLight);

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`island-wrapper ${notchMode || isMiniNotchMode ? 'is-notch-mode' : ''} ${isGhost ? 'is-ghost' : ''}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {showPerchedCat && !isMiniNotchMode && (
        <PixelPeekingCat
          variant="perched"
          mood={perchedMood}
          onClick={triggerPerchedLove}
        />
      )}
      <motion.div
        ref={containerRef}
        className={`island-container ${isDraggingOver ? 'is-dragging-over' : ''} ${notchMode ? 'is-notch-mode' : ''} ${isResizing ? 'is-resizing' : ''} ${isLightEffective ? 'is-light-theme' : ''}`}
        style={GLASS_THEME_STYLES[settings.glassTheme]}
        initial={false}
        animate={{
          width: visualExpanded
            ? 590
            : isMiniNotchMode
            ? 48
            : Math.round((activeAlert ? 340 : media.is_available ? 280 : 190) * settings.notchScale),
          height: visualExpanded
            ? activeTab === 'media' && mediaLyricsOpen
              ? 330
              : TAB_HEIGHTS[activeTab] || 260
            : isMiniNotchMode
            ? 18
            : Math.round(38 * settings.notchScale),
          borderRadius: isMiniNotchMode
            ? '0px 0px 10px 10px'
            : notchMode
            ? visualExpanded
              ? '0px 0px 24px 24px'
              : '0px 0px 16px 16px'
            : visualExpanded
            ? '24px 24px 24px 24px'
            : '20px 20px 20px 20px',
        }}
        transition={springCfg}
        onClick={() => {
          if (!isExpanded) {
            if (isMiniNotchMode) {
              justRepositionedFromCornerRef.current = true;
            }
            setIsExpanded(true);
          }
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <AnimatePresence initial={false}>
          {!visualExpanded ? (
            <motion.div
              key={isMiniNotchMode ? 'mini-notch' : 'compact'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
              style={{ width: '100%', height: '100%' }}
            >
              {isMiniNotchMode ? (
                <motion.div
                  title="Apex Island (click to expand)"
                  whileHover={{ scale: 1.06 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <span
                    className={`mini-notch-dot ${media.is_playing ? 'is-playing' : ''}`}
                  />
                  {media.is_playing ? (
                    <span className="mini-notch-eq">
                      <span className="mini-notch-eq-bar" />
                      <span className="mini-notch-eq-bar" />
                      <span className="mini-notch-eq-bar" />
                    </span>
                  ) : (
                    <span className="mini-notch-idle-bar" />
                  )}
                </motion.div>
              ) : (
                <CompactIsland
                  media={media}
                  stats={stats}
                  download={download}
                  currentTime={currentTime}
                  activeAlert={activeAlert}
                  onAlertAction={handleAlertAction}
                  companionStyle={companionStyle}
                  isPerchedCatActive={showPerchedCat}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              className="expanded-island"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              {/* Top Navigation Bar */}
              <div className="expanded-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0, flex: 1 }}>
                  {navOverflow.left && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: '20px', height: '22px', borderRadius: '999px' }}
                      aria-label="Scroll tabs left"
                      onClick={(e) => {
                        e.stopPropagation();
                        tabNavRef.current?.scrollBy({ left: -110, behavior: 'smooth' });
                      }}
                    >
                      <ChevronLeft size={12} />
                    </button>
                  )}
                <div
                  ref={tabNavRef}
                  role="tablist"
                  aria-label="Island Pages"
                  className="tab-nav"
                  onScroll={updateNavOverflow}
                  onMouseDown={handleNavMouseDown}
                  onMouseMove={handleNavMouseMove}
                  onMouseUp={handleNavMouseUp}
                  onMouseLeave={handleNavMouseUp}
                  onWheel={handleNavWheel}
                >
                  {[
                    { id: 'media' as IslandTab, label: 'Media', icon: <Music size={12} />, title: 'Media & Lyrics' },
                    { id: 'system' as IslandTab, label: 'System', icon: <Activity size={12} />, title: 'Hardware Monitor' },
                    { id: 'today' as IslandTab, label: 'Today', icon: <CloudSun size={12} />, title: 'Prayer, Weather & Calendar' },
                    {
                      id: 'agent' as IslandTab,
                      label: `Agent${pendingAgentRequests.length > 0 ? ` (${pendingAgentRequests.length})` : ''}`,
                      icon: <Bot size={12} />,
                      title: 'AI Agent Bridge & Smart OCR',
                    },
                    {
                      id: 'shelf' as IslandTab,
                      label: `Shelf${shelfFiles.length > 0 ? ` (${shelfFiles.length})` : ''}`,
                      icon: <FolderDown size={12} />,
                      title: 'File Shelf Drop Zone',
                    },
                    { id: 'clipboard' as IslandTab, label: 'Clips', icon: <ClipboardList size={12} />, title: 'Smart Clipboard History' },
                    { id: 'timer' as IslandTab, label: 'Focus', icon: <Timer size={12} />, title: 'Focus Pomodoro Timer' },
                  ]
                    .filter((t) => settings.enabledTabs.includes(t.id))
                    .map((t) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === t.id}
                        key={t.id}
                        className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasDraggedTab.current) return;
                          setActiveTab(t.id);
                        }}
                        data-tooltip={t.title}
                        data-tooltip-pos="bottom"
                      >
                        {t.icon}
                        <span>{t.label}</span>
                      </button>
                    ))}
                </div>
                  {navOverflow.right && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: '20px', height: '22px', borderRadius: '999px' }}
                      aria-label="Scroll tabs right"
                      onClick={(e) => {
                        e.stopPropagation();
                        tabNavRef.current?.scrollBy({ left: 110, behavior: 'smooth' });
                      }}
                    >
                      <ChevronRight size={12} />
                    </button>
                  )}
                </div>

                <div className="header-actions">
                  <button
                    type="button"
                    className={`icon-btn ${activeTab === 'settings' ? 'active-pinned' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab(activeTab === 'settings' ? 'media' : 'settings');
                    }}
                    aria-label="Settings"
                    data-tooltip="Settings"
                    data-tooltip-pos="bottom"
                  >
                    <Settings size={13} />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn ${notchMode ? 'active-pinned' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotchMode(!notchMode);
                    }}
                    aria-label={notchMode ? 'Switch to Floating Mode' : 'Switch to Notch Mode'}
                    data-tooltip={notchMode ? 'Notch Mode' : 'Floating Mode'}
                    data-tooltip-pos="bottom"
                  >
                    <Laptop size={13} />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn ${isPinned ? 'active-pinned' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePin();
                    }}
                    aria-label={isPinned ? 'Unpin Island' : 'Pin Island Open'}
                    data-tooltip={isPinned ? 'Unpin' : 'Pin Open'}
                    data-tooltip-pos="bottom"
                    data-tooltip-align="right"
                  >
                    <Pin size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(false);
                    }}
                    aria-label="Collapse Island"
                    data-tooltip="Close"
                    data-tooltip-pos="bottom"
                    data-tooltip-align="right"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Tab Views Content */}
              <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <Suspense fallback={null}>
                {activeTab === 'media' && (
                  <MediaView
                    media={media}
                    onSendMediaKey={handleSendMediaKey}
                    onLyricsToggle={setMediaLyricsOpen}
                  />
                )}
                {activeTab === 'system' && <SystemView stats={stats} />}
                {activeTab === 'today' && <TodayView />}
                {activeTab === 'agent' && (
                  <AgentView
                    pendingRequests={pendingAgentRequests}
                    onRespondPermission={handleRespondPermission}
                    lastOcrText={lastOcrText}
                    onTriggerOcr={handleTriggerOcr}
                    ocrLoading={ocrLoading}
                  />
                )}
                {activeTab === 'shelf' && (
                  <ShelfView
                    files={shelfFiles}
                    onAddFiles={(newFiles) => setShelfFiles((prev) => [...prev, ...newFiles])}
                    onOpenFile={handleOpenFile}
                    onRevealFile={handleRevealFile}
                    onRemoveFile={(id) => setShelfFiles((prev) => prev.filter((f) => f.id !== id))}
                    onClearFiles={() => setShelfFiles([])}
                  />
                )}
                {activeTab === 'clipboard' && (
                  <ClipboardView
                    history={clipboardHistory}
                    onClearHistory={() => setClipboardHistory([])}
                    onRestoreHistory={(items) => setClipboardHistory(items)}
                    privateSkippedCount={privateSkippedCount}
                  />
                )}
                {activeTab === 'timer' && <TimerView />}
                {activeTab === 'settings' && (
                  <SettingsView
                    notchMode={notchMode}
                    onToggleNotch={() => setNotchMode(!notchMode)}
                    companionStyle={companionStyle}
                    onChangeCompanionStyle={(style) => {
                      setCompanionStyle(style);
                      localStorage.setItem('apex_companion_style', style);
                    }}
                    autoHideFullscreen={autoHideFullscreen}
                    onToggleAutoHideFullscreen={() => {
                      const next = !autoHideFullscreen;
                      setAutoHideFullscreen(next);
                      localStorage.setItem('apex_autohide_fullscreen', String(next));
                    }}
                    fullscreenBehavior={fullscreenBehavior}
                    onChangeFullscreenBehavior={(mode) => {
                      setFullscreenBehavior(mode);
                      localStorage.setItem('apex_fullscreen_behavior', mode);
                    }}
                    miniNotchCorner={miniNotchCorner}
                    onChangeMiniNotchCorner={(corner) => {
                      setMiniNotchCorner(corner);
                      localStorage.setItem('apex_mini_notch_corner', corner);
                    }}
                    notifyOnFullscreen={notifyOnFullscreen}
                    onToggleNotifyOnFullscreen={() => {
                      const next = !notifyOnFullscreen;
                      setNotifyOnFullscreen(next);
                      localStorage.setItem('apex_notify_fullscreen', String(next));
                    }}
                    settings={settings}
                    onUpdateSettings={updateSettings}
                  />
                )}
                </Suspense>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
    </MotionConfig>
  );
}

export default App;
