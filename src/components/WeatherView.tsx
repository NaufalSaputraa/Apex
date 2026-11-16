import React, { useState, useEffect } from 'react';
import { Sun, Cloud, CloudRain, CloudLightning, Wind, Droplets, MapPin, RefreshCw } from 'lucide-react';

interface WeatherData {
  city: string;
  temp: number;
  condition: string;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
  hourly: { time: string; temp: number; code: number }[];
}

export const WeatherView: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [weather, setWeather] = useState<WeatherData>({
    city: 'Detecting Location...',
    temp: 28,
    condition: 'Partly Cloudy',
    weatherCode: 2,
    humidity: 75,
    windSpeed: 10,
    hourly: [
      { time: '19:00', temp: 28, code: 2 },
      { time: '20:00', temp: 27, code: 3 },
      { time: '21:00', temp: 27, code: 61 },
      { time: '22:00', temp: 26, code: 61 },
      { time: '23:00', temp: 26, code: 3 },
    ],
  });

  const fetchWeatherForCoords = async (lat: number, lon: number, cityName: string) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&forecast_days=1`
      );
      if (res.ok) {
        const data = await res.json();
        const currentHour = new Date().getHours();
        const hourlyForecast = [];
        for (let i = currentHour; i < Math.min(currentHour + 5, 24); i++) {
          hourlyForecast.push({
            time: `${i}:00`,
            temp: Math.round(data.hourly.temperature_2m[i]),
            code: data.hourly.weather_code[i],
          });
        }

        const code = data.current.weather_code;
        let cond = 'Clear Sky';
        if (code >= 1 && code <= 3) cond = 'Partly Cloudy';
        else if (code >= 45 && code <= 48) cond = 'Foggy';
        else if (code >= 51 && code <= 67) cond = 'Rain Showers';
        else if (code >= 71 && code <= 77) cond = 'Snow';
        else if (code >= 80 && code <= 82) cond = 'Heavy Rain';
        else if (code >= 85) cond = 'Thunderstorms';

        setWeather({
          city: cityName,
          temp: Math.round(data.current.temperature_2m),
          condition: cond,
          weatherCode: code,
          humidity: data.current.relative_humidity_2m,
          windSpeed: Math.round(data.current.wind_speed_10m),
          hourly: hourlyForecast.length > 0 ? hourlyForecast : weather.hourly,
        });
      }
    } catch (e) {
      console.warn('Weather fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const detectLocationAndFetch = async () => {
    setLoading(true);
    // 1. Try IP Geolocation (instant city detection without OS prompt)
    try {
      const ipRes = await fetch('https://ipapi.co/json/');
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData.latitude && ipData.longitude) {
          const name = ipData.city ? `${ipData.city}, ${ipData.country_code || ''}` : 'Local';
          await fetchWeatherForCoords(ipData.latitude, ipData.longitude, name);
          return;
        }
      }
    } catch {
      // Fallback
    }

    // 2. Try browser navigator.geolocation
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await fetchWeatherForCoords(pos.coords.latitude, pos.coords.longitude, 'Current Location');
        },
        async () => {
          await fetchWeatherForCoords(-6.2088, 106.8456, 'Jakarta');
        },
        { timeout: 3500 }
      );
    } else {
      await fetchWeatherForCoords(-6.2088, 106.8456, 'Jakarta');
    }
  };

  useEffect(() => {
    detectLocationAndFetch();
  }, []);

  const getWeatherIcon = (code: number, size = 18) => {
    if (code === 0) return <Sun size={size} style={{ color: '#f59e0b' }} />;
    if (code >= 1 && code <= 3) return <Cloud size={size} style={{ color: '#38bdf8' }} />;
    if (code >= 51 && code <= 80) return <CloudRain size={size} style={{ color: '#06b6d4' }} />;
    if (code >= 80) return <CloudLightning size={size} style={{ color: '#a855f7' }} />;
    return <Sun size={size} style={{ color: '#f59e0b' }} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
      {/* Current Weather Card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-card)',
          borderRadius: '14px',
          padding: '12px 16px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {getWeatherIcon(weather.weatherCode, 36)}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {weather.temp}°
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {weather.condition}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <MapPin size={11} />
              <span>{weather.city}</span>
              <button
                type="button"
                onClick={detectLocationAndFetch}
                aria-label="Refresh weather location"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                }}
                data-tooltip="Refresh Location"
                data-tooltip-align="right"
              >
                <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Droplets size={12} style={{ color: '#38bdf8' }} /> {weather.humidity}% Humidity
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Wind size={12} style={{ color: '#10b981' }} /> {weather.windSpeed} km/h Wind
          </div>
        </div>
      </div>

      {/* Hourly Forecast Row */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
        {weather.hourly.map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-card)',
              borderRadius: '12px',
              padding: '8px 4px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {h.time}
            </span>
            {getWeatherIcon(h.code, 15)}
            <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {h.temp}°
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
