import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Check, CloudSun, Compass, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { WeatherView } from './WeatherView';
import { CalendarEvent, PrayerTimesResult } from '../types';

type SubTab = 'prayer' | 'weather' | 'calendar';

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

const PRAYER_METHODS = [
  { id: 'kemenag', label: 'Kemenag' },
  { id: 'mwl', label: 'MWL' },
  { id: 'isna', label: 'ISNA' },
] as const;

function parseTimeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function formatCountdown(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}j ${mins}m ${secs.toString().padStart(2, '0')}d`;
  return `${mins}m ${secs.toString().padStart(2, '0')}d`;
}

export const TodayView: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('prayer');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(() => {
    try {
      const saved = localStorage.getItem('apex_prayer_coords');
      return saved ? JSON.parse(saved) : { lat: -6.2088, lng: 106.8456 };
    } catch {
      return { lat: -6.2088, lng: 106.8456 };
    }
  });
  const [method, setMethod] = useState<string>(() => localStorage.getItem('apex_prayer_method') || 'kemenag');
  const [prayer, setPrayer] = useState<PrayerTimesResult | null>(null);
  const [locating, setLocating] = useState<boolean>(false);
  const [locError, setLocError] = useState<string>('');
  const [nowDate, setNowDate] = useState<Date>(() => new Date());

  useEffect(() => {
    if (subTab !== 'prayer') return;
    setNowDate(new Date());
    const t = setInterval(() => setNowDate(new Date()), 1000);
    return () => clearInterval(t);
  }, [subTab]);

  const [icalUrl, setIcalUrl] = useState<string>(() => localStorage.getItem('apex_ical_url') || '');
  const [showIcalInput, setShowIcalInput] = useState<boolean>(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState<boolean>(false);
  const [calError, setCalError] = useState<string>('');
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try {
      const saved = localStorage.getItem('apex_todos');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [todoInput, setTodoInput] = useState<string>('');
  const [deletedTodo, setDeletedTodo] = useState<TodoItem | null>(null);
  const deleteTodoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('apex_todos', JSON.stringify(todos));
    } catch {}
  }, [todos]);

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = todoInput.trim();
    if (!trimmed) return;
    setTodos((prev) => [{ id: String(Date.now()), text: trimmed, done: false }, ...prev]);
    setTodoInput('');
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const deleteTodo = (id: string) => {
    const target = todos.find((t) => t.id === id) || null;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (target) {
      setDeletedTodo(target);
      if (deleteTodoTimerRef.current) clearTimeout(deleteTodoTimerRef.current);
      deleteTodoTimerRef.current = setTimeout(() => setDeletedTodo(null), 4000);
    }
  };

  const undoDeleteTodo = () => {
    if (!deletedTodo) return;
    if (deleteTodoTimerRef.current) clearTimeout(deleteTodoTimerRef.current);
    setTodos((prev) => [deletedTodo, ...prev]);
    setDeletedTodo(null);
  };

  useEffect(() => {
    const now = new Date();
    const tzHours = -now.getTimezoneOffset() / 60;
    const nowHours = now.getHours() + now.getMinutes() / 60;
    invoke<PrayerTimesResult>('get_prayer_times', {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      lat: coords.lat,
      lng: coords.lng,
      tzHours,
      nowHours,
      method,
    })
      .then(setPrayer)
      .catch(() => {});
  }, [coords, method]);

  const handleDetectLocation = async () => {
    setLocating(true);
    setLocError('');
    try {
      const loc = await invoke<{ latitude: number; longitude: number }>('get_windows_location');
      const next = { lat: Number(loc.latitude.toFixed(4)), lng: Number(loc.longitude.toFixed(4)) };
      setCoords(next);
      localStorage.setItem('apex_prayer_coords', JSON.stringify(next));
    } catch {
      setLocError('Enable Windows Location to auto-detect');
    } finally {
      setLocating(false);
    }
  };

  const handleFetchCalendar = async (urlToFetch = icalUrl) => {
    if (!urlToFetch.trim()) return;
    localStorage.setItem('apex_ical_url', urlToFetch.trim());
    setCalLoading(true);
    setCalError('');
    try {
      const res = await invoke<CalendarEvent[]>('fetch_ical_events', { url: urlToFetch.trim() });
      setEvents(res);
    } catch (e: any) {
      setCalError(typeof e === 'string' ? e : 'Gagal memuat iCal');
    } finally {
      setCalLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'calendar' && icalUrl.trim() && events.length === 0) {
      handleFetchCalendar(icalUrl);
    }
  }, [subTab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[
          { id: 'prayer' as SubTab, label: 'Prayer', icon: <Compass size={12} /> },
          { id: 'weather' as SubTab, label: 'Weather', icon: <CloudSun size={12} /> },
          { id: 'calendar' as SubTab, label: 'Calendar', icon: <Calendar size={12} /> },
        ].map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setSubTab(item.id)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '5px 8px',
              borderRadius: '8px',
              border: subTab === item.id ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid var(--border-subtle)',
              background: subTab === item.id ? 'rgba(16, 185, 129, 0.16)' : 'var(--bg-card)',
              color: subTab === item.id ? '#10b981' : 'var(--text-secondary)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Sub-view content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <AnimatePresence mode="wait">
        {subTab === 'prayer' && (
          <motion.div
            key="prayer"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
              <button
                type="button"
                onClick={handleDetectLocation}
                className="glass-pill-btn"
              >
                <MapPin size={11} style={{ color: '#10b981' }} />
                <span>{locating ? 'Locating...' : `${coords.lat}, ${coords.lng}`}</span>
              </button>

              {/* Inline Segmented Method Switcher */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '999px',
                  padding: '2px',
                  gap: '2px',
                }}
              >
                {PRAYER_METHODS.map((opt) => {
                  const isActive = opt.id === method;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setMethod(opt.id);
                        localStorage.setItem('apex_prayer_method', opt.id);
                      }}
                      style={{
                        border: 'none',
                        borderRadius: '999px',
                        padding: '3px 8px',
                        fontSize: '10px',
                        fontWeight: isActive ? 700 : 500,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        background: isActive ? 'rgba(16, 185, 129, 0.22)' : 'transparent',
                        color: isActive ? '#10b981' : 'var(--text-secondary)',
                        transition: 'all 0.16s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {locError && (
              <div style={{ fontSize: '10.5px', color: '#f59e0b' }}>{locError}</div>
            )}

            {prayer && (() => {
              const slots = [
                { name: 'Subuh', time: prayer.fajr },
                { name: 'Terbit', time: prayer.sunrise },
                { name: 'Dzuhur', time: prayer.dhuhr },
                { name: 'Ashar', time: prayer.asr },
                { name: 'Maghrib', time: prayer.maghrib },
                { name: 'Isya', time: prayer.isha },
              ];
              const prayerOnlySlots = slots.filter((s) => s.name !== 'Terbit');
              const nowTotalSecs =
                nowDate.getHours() * 3600 + nowDate.getMinutes() * 60 + nowDate.getSeconds();
              const nowMins = nowTotalSecs / 60;

              let nearest = prayerOnlySlots[0];
              let diffSecs = 0;
              const upcoming = prayerOnlySlots.find((s) => parseTimeToMins(s.time) * 60 > nowTotalSecs);
              if (upcoming) {
                nearest = upcoming;
                diffSecs = parseTimeToMins(upcoming.time) * 60 - nowTotalSecs;
              } else {
                nearest = prayerOnlySlots[0];
                diffSecs = parseTimeToMins(nearest.time) * 60 + 86400 - nowTotalSecs;
              }

              // Sun / Moon Horizon Arc math
              const sunriseMins = parseTimeToMins(prayer.sunrise);
              const maghribMins = parseTimeToMins(prayer.maghrib);
              const isDaytime = nowMins >= sunriseMins && nowMins <= maghribMins;
              let arcProgress = 0.5;
              if (isDaytime && maghribMins > sunriseMins) {
                arcProgress = (nowMins - sunriseMins) / (maghribMins - sunriseMins);
              } else {
                const nightDuration = 1440 - maghribMins + sunriseMins;
                const elapsedNight =
                  nowMins > maghribMins ? nowMins - maghribMins : 1440 - maghribMins + nowMins;
                arcProgress = nightDuration > 0 ? elapsedNight / nightDuration : 0.5;
              }
              arcProgress = Math.max(0.02, Math.min(0.98, arcProgress));
              const theta = Math.PI * (1 - arcProgress);
              const cx = 54;
              const cy = 36;
              const r = 38;
              const orbX = cx + r * Math.cos(theta);
              const orbY = cy - r * Math.sin(theta);

              return (
                <>
                  {/* Animated Sun/Moon Horizon Arc + Nearest Prayer Countdown */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isDaytime
                        ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(16, 185, 129, 0.08))'
                        : 'linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(99, 102, 241, 0.1))',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '6px 12px',
                      gap: '10px',
                    }}
                  >
                    <svg width="108" height="42" viewBox="0 0 108 42" style={{ flexShrink: 0, overflow: 'visible' }}>
                      {/* Horizon baseline */}
                      <line x1="10" y1="36" x2="98" y2="36" stroke="var(--border-strong)" strokeWidth="1" />
                      {/* Full sky arc */}
                      <path
                        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                        fill="none"
                        stroke="var(--border-subtle)"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                      />
                      {/* Traversed arc */}
                      <path
                        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${orbX.toFixed(1)} ${orbY.toFixed(1)}`}
                        fill="none"
                        stroke={isDaytime ? '#fbbf24' : '#38bdf8'}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      {!isDaytime && (
                        <g fill="rgba(255,255,255,0.45)">
                          <circle cx="24" cy="14" r="0.9" />
                          <circle cx="78" cy="10" r="1" />
                          <circle cx="88" cy="22" r="0.8" />
                        </g>
                      )}
                      {/* Glowing Sun / Moon Orb */}
                      <circle
                        cx={orbX}
                        cy={orbY}
                        r="7"
                        fill={isDaytime ? 'rgba(251, 191, 36, 0.25)' : 'rgba(56, 189, 248, 0.25)'}
                      />
                      <circle
                        cx={orbX}
                        cy={orbY}
                        r="4"
                        fill={isDaytime ? '#fbbf24' : '#38bdf8'}
                      />
                    </svg>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>
                        Next Prayer
                      </span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#10b981' }}>
                          {nearest.name}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {nearest.time}
                        </span>
                      </div>
                      <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: isDaytime ? '#f59e0b' : '#38bdf8' }}>
                        in {formatCountdown(diffSecs)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {slots.map((slot) => {
                      const isNext = nearest.name === slot.name;
                      return (
                        <div
                          key={slot.name}
                          style={{
                            background: isNext ? 'rgba(16, 185, 129, 0.16)' : 'var(--bg-card)',
                            border: isNext ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid var(--border-subtle)',
                            borderRadius: '10px',
                            padding: '7px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <span style={{ fontSize: '10px', color: isNext ? '#10b981' : 'var(--text-muted)', fontWeight: isNext ? 700 : 500 }}>
                            {slot.name}
                          </span>
                          <span style={{ fontSize: '13.5px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                            {slot.time}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}

        {subTab === 'weather' && (
          <motion.div
            key="weather"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <WeatherView />
          </motion.div>
        )}

        {subTab === 'calendar' && (() => {
          const now = new Date();
          const fullDate = now.toLocaleDateString('en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
          const startOfWeek = new Date(now);
          const dayIdx = (now.getDay() + 6) % 7; // Monday = 0
          startOfWeek.setDate(now.getDate() - dayIdx);
          const weekDays = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            return {
              label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3),
              num: d.getDate(),
              isToday: d.toDateString() === now.toDateString(),
            };
          });

          return (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {/* System Calendar Header + Week Strip (always populated from OS clock) */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {fullDate}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <button
                    type="button"
                    className="glass-pill-btn"
                    onClick={() => setShowIcalInput((prev) => !prev)}
                    style={{ padding: '2px 8px', fontSize: '10px' }}
                  >
                    {icalUrl ? 'Edit .ics' : '+ Add .ics'}
                  </button>
                  {icalUrl && (
                    <button
                      type="button"
                      onClick={() => handleFetchCalendar()}
                      className="icon-btn"
                      style={{ width: '22px', height: '22px' }}
                      aria-label="Refresh Calendar"
                      data-tooltip="Refresh Calendar"
                      data-tooltip-align="right"
                    >
                      <RefreshCw size={11} />
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {weekDays.map((wd) => (
                  <div
                    key={wd.num + wd.label}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '4px 2px',
                      borderRadius: '8px',
                      background: wd.isToday ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-card)',
                      border: wd.isToday ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: '9.5px', color: wd.isToday ? '#10b981' : 'var(--text-muted)' }}>
                      {wd.label}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: wd.isToday ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {wd.num}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily To-Do List */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  To-Do List
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {todos.filter((t) => !t.done).length} left
                </span>
              </div>

              <form onSubmit={handleAddTodo} style={{ display: 'flex', gap: '5px' }}>
                <input
                  type="text"
                  placeholder="Add a task..."
                  aria-label="Add a task"
                  value={todoInput}
                  onChange={(e) => setTodoInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '7px',
                    padding: '4px 8px',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  className="glass-pill-btn"
                  style={{ padding: '4px 8px', color: '#10b981', borderColor: 'rgba(16,185,129,0.35)' }}
                  aria-label="Add task"
                  data-tooltip="Add Task"
                  data-tooltip-align="right"
                >
                  <Plus size={12} />
                </button>
              </form>

              {deletedTodo && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '10.5px',
                    color: 'var(--text-secondary)',
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Deleted "{deletedTodo.text}"
                  </span>
                  <button
                    type="button"
                    onClick={undoDeleteTodo}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#38bdf8',
                      fontWeight: 700,
                      fontSize: '10.5px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginLeft: '8px',
                    }}
                  >
                    Undo
                  </button>
                </div>
              )}

              {todos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '76px', overflowY: 'auto' }}>
                  {todos.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        padding: '4px 6px',
                        borderRadius: '7px',
                        background: 'var(--bg-input)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTodo(item.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'transparent',
                          border: 'none',
                          color: item.done ? 'var(--text-muted)' : 'var(--text-primary)',
                          fontSize: '11px',
                          textDecoration: item.done ? 'line-through' : 'none',
                          cursor: 'pointer',
                          flex: 1,
                          textAlign: 'left',
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '4px',
                            border: item.done ? '1px solid #10b981' : '1px solid var(--border-strong)',
                            background: item.done ? 'rgba(16,185,129,0.25)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {item.done && <Check size={9} style={{ color: '#10b981' }} />}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.text}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTodo(item.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        aria-label={`Delete task ${item.text}`}
                        data-tooltip="Delete"
                        data-tooltip-align="right"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(showIcalInput || (!icalUrl && events.length > 0)) && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Paste Google / iCloud iCal (.ics) URL..."
                  aria-label="iCal feed URL"
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '5px 8px',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className="glass-pill-btn"
                  onClick={() => {
                    handleFetchCalendar();
                    setShowIcalInput(false);
                  }}
                >
                  Sync
                </button>
              </div>
            )}

            {calError && <div style={{ fontSize: '11px', color: '#ef4444' }}>{calError}</div>}
            {calLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loading events...</div>}

            {!calLoading && events.length === 0 && !calError && (
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
                {icalUrl
                  ? 'No upcoming events found in .ics feed.'
                  : 'Using system calendar • Click "+ Add .ics" to sync external events.'}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {events.map((ev, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.summary}
                    </div>
                    {ev.location && (
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{ev.location}</div>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#38bdf8', flexShrink: 0, marginLeft: '8px' }}>
                    {ev.start.slice(0, 15)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
          );
        })()}
        </AnimatePresence>
      </div>
    </div>
  );
};
