import React from 'react';
import { Cpu, HardDrive, Battery, BatteryCharging, Zap } from 'lucide-react';
import { SystemStats } from '../types';

interface SystemViewProps {
  stats: SystemStats | null;
}

export const SystemView: React.FC<SystemViewProps> = ({ stats }) => {
  if (!stats) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '24px 16px',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          System Telemetry Unavailable in Browser
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Run inside the Apex desktop app (Tauri) for live CPU, RAM, &amp; Battery stats.
        </span>
      </div>
    );
  }

  const getCpuColor = (usage: number) => {
    if (usage > 80) return '#ef4444';
    if (usage > 50) return '#f59e0b';
    return '#10b981';
  };

  const getCpuLabel = (usage: number) => {
    if (usage > 80) return 'High Load';
    if (usage > 50) return 'Moderate';
    return 'Optimal';
  };

  const getMemColor = (percent: number) => {
    if (percent > 85) return '#ef4444';
    if (percent > 65) return '#f59e0b';
    return '#3b82f6';
  };

  const cpuColor = getCpuColor(stats.cpu_usage);
  const memColor = getMemColor(stats.memory_percent);
  const powerColor = stats.is_charging ? '#10b981' : stats.battery_percent <= 20 ? '#ef4444' : '#06b6d4';
  const availGb = Math.max(0, stats.memory_total_gb - stats.memory_used_gb).toFixed(1);

  return (
    <div className="system-view">
      {/* CPU Card */}
      <div className="stat-card" style={{ '--card-accent': cpuColor } as React.CSSProperties}>
        <div className="stat-header">
          <span>Processor</span>
          <Cpu size={15} style={{ color: cpuColor }} />
        </div>
        <div>
          <div className="stat-val">{Math.round(stats.cpu_usage)}%</div>
          <div className="stat-subtext" style={{ color: cpuColor, opacity: 0.9 }}>
            {getCpuLabel(stats.cpu_usage)}
          </div>
        </div>
        <div className="stat-bar-bg">
          <div
            className="stat-bar-fill"
            style={{
              width: `${Math.min(100, Math.max(0, stats.cpu_usage))}%`,
              backgroundColor: cpuColor,
            }}
          />
        </div>
      </div>

      {/* RAM Card */}
      <div className="stat-card" style={{ '--card-accent': memColor } as React.CSSProperties}>
        <div className="stat-header">
          <span>Memory</span>
          <HardDrive size={15} style={{ color: memColor }} />
        </div>
        <div>
          <div className="stat-val">{Math.round(stats.memory_percent)}%</div>
          <div className="stat-subtext">
            {stats.memory_used_gb} / {stats.memory_total_gb} GB • {availGb} GB free
          </div>
        </div>
        <div className="stat-bar-bg">
          <div
            className="stat-bar-fill"
            style={{
              width: `${Math.min(100, Math.max(0, stats.memory_percent))}%`,
              backgroundColor: memColor,
            }}
          />
        </div>
      </div>

      {/* Battery Card */}
      <div className="stat-card" style={{ '--card-accent': powerColor } as React.CSSProperties}>
        <div className="stat-header">
          <span>Power</span>
          {stats.is_charging ? (
            <BatteryCharging size={16} style={{ color: powerColor }} />
          ) : (
            <Battery size={16} style={{ color: powerColor }} />
          )}
        </div>
        <div>
          <div className="stat-val">
            {stats.has_battery ? `${stats.battery_percent}%` : 'AC Power'}
          </div>
          <div className="stat-subtext">
            {stats.is_charging ? (
              <span style={{ color: powerColor, display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Zap size={11} /> Charging
              </span>
            ) : (
              stats.has_battery ? 'On Battery' : 'Desktop Connected'
            )}
          </div>
        </div>
        <div className="stat-bar-bg">
          <div
            className="stat-bar-fill"
            style={{
              width: stats.has_battery ? `${stats.battery_percent}%` : '100%',
              backgroundColor: powerColor,
            }}
          />
        </div>
      </div>
    </div>
  );
};
