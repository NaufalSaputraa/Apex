export interface SystemStats {
  cpu_usage: number;
  memory_total_gb: number;
  memory_used_gb: number;
  memory_percent: number;
  has_battery: boolean;
  battery_percent: number;
  is_charging: boolean;
}

export interface MediaInfo {
  is_available: boolean;
  is_playing: boolean;
  title: string;
  artist: string;
  album: string;
  source: string;
  cover_url: string | null;
  position_secs: number;
  duration_secs: number;
}

export interface MediaEventPayload extends Omit<MediaInfo, 'cover_url'> {
  cover_changed: boolean;
  cover_url: string | null;
}

export interface DownloadStatus {
  is_downloading: boolean;
  filename: string;
  bytes_downloaded: number;
  speed_formatted: string;
  percent: number;
  is_completed: boolean;
}

export interface ShelfFile {
  id: string;
  name: string;
  path: string;
  sizeFormatted: string;
  extension: string;
  addedAt: string;
}

export type IslandTab =
  | 'media'
  | 'lyrics'
  | 'today'
  | 'agent'
  | 'system'
  | 'shelf'
  | 'clipboard'
  | 'timer'
  | 'settings';

export type IdleCompanionStyle = 'pet' | 'orb' | 'minimal';

export interface SystemAlert {
  id: string;
  type: 'download' | 'charger' | 'battery_low';
  title: string;
  message: string;
  actionPath?: string;
  timestamp: number;
}

export interface ClipboardItem {
  id: string;
  text: string;
  type: 'link' | 'code' | 'text';
  time: string;
}

export interface ClipboardPollResult {
  changed: boolean;
  seq: number;
  text: string | null;
  skipped_private: boolean;
}

export interface AgentPermissionRequest {
  id: string;
  agent: string;
  tool: string;
  detail: string;
  timestamp: number;
}

export interface AgentBridgeInfo {
  port: number;
  token: string;
  running: boolean;
}

export interface PrayerTimesResult {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  next_name: string;
  next_time: string;
}

export interface CalendarEvent {
  summary: string;
  start: string;
  location: string;
}

export type GlassTheme = 'auto' | 'dark' | 'light' | 'glass' | 'midnight' | 'emerald';
export type AnimSpeed = 'snappy' | 'normal' | 'smooth';

export interface IslandSettings {
  notchScale: 1 | 1.15 | 1.3;
  glassTheme: GlassTheme;
  animSpeed: AnimSpeed;
  clock24h: boolean;
  emptyShelfOnStart: boolean;
  autoExpandOnHover: boolean;
  enabledTabs: IslandTab[];
}
