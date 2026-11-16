use windows::core::HSTRING;
use windows::Devices::Geolocation::Geolocator;
use windows::Foundation::Uri;
use windows::Web::Http::HttpClient;

#[derive(serde::Serialize, Clone, Debug)]
pub struct PrayerTimesResult {
    pub fajr: String,
    pub sunrise: String,
    pub dhuhr: String,
    pub asr: String,
    pub maghrib: String,
    pub isha: String,
    pub next_name: String,
    pub next_time: String,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct CalendarEvent {
    pub summary: String,
    pub start: String,
    pub location: String,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct GeoLocation {
    pub latitude: f64,
    pub longitude: f64,
}

fn julian_day(year: i32, month: i32, day: i32) -> f64 {
    let (y, m) = if month <= 2 {
        (year - 1, month + 12)
    } else {
        (year, month)
    };
    let a = (y as f64 / 100.0).floor();
    let b = 2.0 - a + (a / 4.0).floor();
    (365.25 * (y as f64 + 4716.0)).floor()
        + (30.6001 * (m as f64 + 1.0)).floor()
        + day as f64
        + b
        - 1524.5
}

fn sun_position(jd: f64) -> (f64, f64) {
    let d = jd - 2451545.0;
    let g = (357.529 + 0.98560028 * d).to_radians();
    let q = 280.459 + 0.98564736 * d;
    let l = (q + 1.915 * g.sin() + 0.020 * (2.0 * g).sin()).to_radians();
    let e = (23.439 - 0.00000036 * d).to_radians();
    let ra = (e.cos() * l.sin()).atan2(l.cos()).to_degrees() / 15.0;
    let decl = (e.sin() * l.sin()).asin();
    let eqt = ((q / 15.0) % 24.0) - ((ra + 24.0) % 24.0);
    let eqt_fixed = if eqt > 12.0 {
        eqt - 24.0
    } else if eqt < -12.0 {
        eqt + 24.0
    } else {
        eqt
    };
    (decl, eqt_fixed)
}

fn format_hours(hours: f64) -> String {
    let h_norm = ((hours % 24.0) + 24.0) % 24.0;
    let total_mins = (h_norm * 60.0).round() as i32;
    let h = (total_mins / 60) % 24;
    let m = total_mins % 60;
    format!("{:02}:{:02}", h, m)
}

/// Pure offline astronomical prayer time calculation (Kemenag RI / MWL / ISNA).
pub fn compute_prayer_times(
    year: i32,
    month: i32,
    day: i32,
    lat: f64,
    lng: f64,
    tz_hours: f64,
    now_hours: f64,
    method: &str,
) -> PrayerTimesResult {
    let (fajr_angle, isha_angle) = match method {
        "mwl" => (18.0_f64, 17.0_f64),
        "isna" => (15.0_f64, 15.0_f64),
        _ => (20.0_f64, 18.0_f64), // Kemenag RI default
    };

    let jd = julian_day(year, month, day) - lng / 360.0;
    let (decl, eqt) = sun_position(jd);
    let lat_r = lat.to_radians();

    let dhuhr = 12.0 + tz_hours - lng / 15.0 - eqt + (2.0 / 60.0);

    let hour_angle = |angle_deg: f64| -> f64 {
        let num = -angle_deg.to_radians().sin() - lat_r.sin() * decl.sin();
        let den = lat_r.cos() * decl.cos();
        let cos_ha = (num / den).clamp(-1.0, 1.0);
        cos_ha.acos().to_degrees() / 15.0
    };

    let sunrise_ha = hour_angle(0.833);
    let sunrise = dhuhr - sunrise_ha;
    let maghrib = dhuhr + sunrise_ha + (2.0 / 60.0);
    let fajr = dhuhr - hour_angle(fajr_angle);
    let isha = dhuhr + hour_angle(isha_angle);

    // Asr (Shafi'i: shadow factor = 1)
    let asr_alt = (1.0 / (1.0 + (lat_r - decl).abs().tan())).atan();
    let asr_cos = ((asr_alt.sin() - lat_r.sin() * decl.sin()) / (lat_r.cos() * decl.cos()))
        .clamp(-1.0, 1.0);
    let asr = dhuhr + asr_cos.acos().to_degrees() / 15.0;

    let slots = [
        ("Subuh", fajr),
        ("Terbit", sunrise),
        ("Dzuhur", dhuhr),
        ("Ashar", asr),
        ("Maghrib", maghrib),
        ("Isya", isha),
    ];

    let mut next_name = "Subuh".to_string();
    let mut next_time = format_hours(fajr);
    for (name, t) in slots {
        if t > now_hours {
            next_name = name.to_string();
            next_time = format_hours(t);
            break;
        }
    }

    PrayerTimesResult {
        fajr: format_hours(fajr),
        sunrise: format_hours(sunrise),
        dhuhr: format_hours(dhuhr),
        asr: format_hours(asr),
        maghrib: format_hours(maghrib),
        isha: format_hours(isha),
        next_name,
        next_time,
    }
}

pub async fn get_windows_location() -> Result<GeoLocation, String> {
    let locator = Geolocator::new().map_err(|e| e.to_string())?;
    let pos = locator
        .GetGeopositionAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;
    let coord = pos.Coordinate().map_err(|e| e.to_string())?;
    let point = coord.Point().map_err(|e| e.to_string())?;
    let basic = point.Position().map_err(|e| e.to_string())?;
    Ok(GeoLocation {
        latitude: basic.Latitude,
        longitude: basic.Longitude,
    })
}

pub async fn fetch_ical_events(url: &str) -> Result<Vec<CalendarEvent>, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("URL iCal harus diawali https:// atau http://".into());
    }
    let client = HttpClient::new().map_err(|e| e.to_string())?;
    let uri = Uri::CreateUri(&HSTRING::from(url)).map_err(|e| e.to_string())?;
    let body = client
        .GetStringAsync(&uri)
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?
        .to_string();

    let mut events = Vec::new();
    let mut in_event = false;
    let mut summary = String::new();
    let mut start = String::new();
    let mut location = String::new();

    for raw_line in body.lines() {
        let line = raw_line.trim_end_matches('\r');
        if line == "BEGIN:VEVENT" {
            in_event = true;
            summary.clear();
            start.clear();
            location.clear();
        } else if line == "END:VEVENT" {
            if in_event && !summary.is_empty() {
                events.push(CalendarEvent {
                    summary: summary.clone(),
                    start: start.clone(),
                    location: location.clone(),
                });
            }
            in_event = false;
        } else if in_event {
            if let Some(v) = line.strip_prefix("SUMMARY:") {
                summary = v.to_string();
            } else if let Some((_, v)) = line.split_once(':') {
                if line.starts_with("DTSTART") {
                    start = v.to_string();
                } else if line.starts_with("LOCATION") {
                    location = v.to_string();
                }
            }
        }
    }

    events.sort_by(|a, b| a.start.cmp(&b.start));
    events.truncate(12);
    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prayer_times_jakarta_kemenag_reasonable() {
        let res = compute_prayer_times(2026, 11, 16, -6.2088, 106.8456, 7.0, 9.5, "kemenag");
        assert_eq!(res.fajr.len(), 5);
        assert_eq!(res.dhuhr.len(), 5);
        assert!(res.fajr < res.sunrise);
        assert!(res.sunrise < res.dhuhr);
        assert!(res.dhuhr < res.asr);
        assert!(res.asr < res.maghrib);
        assert!(res.maghrib < res.isha);
        assert_eq!(res.next_name, "Dzuhur");
    }
}
