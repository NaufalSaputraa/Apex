use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const BRIDGE_PORT: u16 = 47291;

#[derive(serde::Serialize, Clone, Debug)]
pub struct AgentPermissionRequest {
    pub id: String,
    pub agent: String,
    pub tool: String,
    pub detail: String,
    pub timestamp: u64,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct AgentNotifyEvent {
    pub agent: String,
    pub title: String,
    pub message: String,
    pub timestamp: u64,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct AgentBridgeInfo {
    pub port: u16,
    pub token: String,
    pub running: bool,
}

pub struct PendingDecision {
    pub decision: Mutex<Option<bool>>,
    pub cvar: Condvar,
}

pub struct AgentBridgeState {
    pub token: String,
    pub running: Mutex<bool>,
    pub pending: Mutex<HashMap<String, Arc<PendingDecision>>>,
}

impl AgentBridgeState {
    pub fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let pid = std::process::id() as u128;
        let raw = nanos ^ (pid << 48) ^ 0xA9E1_51A4_D001;
        let token = format!("{:032x}", raw);
        Self {
            token,
            running: Mutex::new(false),
            pending: Mutex::new(HashMap::new()),
        }
    }
}

fn send_json_response(stream: &mut TcpStream, status: &str, body: &str) {
    let resp = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
    let _ = stream.shutdown(std::net::Shutdown::Write);
    std::thread::sleep(Duration::from_millis(15));
}

fn handle_client(mut stream: TcpStream, app: AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 8192];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req_str = String::from_utf8_lossy(&buf[..n]);
    let mut parts = req_str.split("\r\n\r\n");
    let headers_part = parts.next().unwrap_or("");
    let body_part = parts.next().unwrap_or("").trim();

    let first_line = headers_part.lines().next().unwrap_or("");
    let mut line_parts = first_line.split_whitespace();
    let method = line_parts.next().unwrap_or("");
    let path = line_parts.next().unwrap_or("");

    if method == "GET" && path == "/health" {
        send_json_response(&mut stream, "200 OK", r#"{"status":"ok","app":"Apex Island"}"#);
        return;
    }

    let state = match app.try_state::<AgentBridgeState>() {
        Some(s) => s,
        None => {
            send_json_response(&mut stream, "500 Internal Server Error", r#"{"error":"state_unavailable"}"#);
            return;
        }
    };

    // Require bearer/custom token for mutating hook endpoints
    let expected = &state.token;
    let authorized = headers_part.lines().any(|l| {
        let lower = l.to_ascii_lowercase();
        if let Some(val) = lower.strip_prefix("x-apex-token:") {
            val.trim() == expected.as_str()
        } else if let Some(val) = l.splitn(2, ':').nth(1) {
            lower.starts_with("authorization:") && val.trim().strip_prefix("Bearer ").unwrap_or("") == expected.as_str()
        } else {
            false
        }
    });

    if !authorized {
        send_json_response(&mut stream, "401 Unauthorized", r#"{"error":"unauthorized"}"#);
        return;
    }

    let json: serde_json::Value = serde_json::from_str(body_part).unwrap_or(serde_json::json!({}));
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if method == "POST" && path == "/hook/notify" {
        let evt = AgentNotifyEvent {
            agent: json["agent"].as_str().unwrap_or("AI Agent").to_string(),
            title: json["title"].as_str().unwrap_or("Agent Update").to_string(),
            message: json["message"].as_str().unwrap_or("").to_string(),
            timestamp: now,
        };
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
        }
        let _ = app.emit("agent-notify", evt);
        send_json_response(&mut stream, "200 OK", r#"{"ok":true}"#);
        return;
    }

    if method == "POST" && path == "/hook/permission" {
        let req_id = format!(
            "perm-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let pending = Arc::new(PendingDecision {
            decision: Mutex::new(None),
            cvar: Condvar::new(),
        });
        state.pending.lock().unwrap().insert(req_id.clone(), pending.clone());

        let req_evt = AgentPermissionRequest {
            id: req_id.clone(),
            agent: json["agent"].as_str().unwrap_or("AI Agent").to_string(),
            tool: json["tool"].as_str().unwrap_or("action").to_string(),
            detail: json["detail"].as_str().unwrap_or("").to_string(),
            timestamp: now,
        };

        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
        }
        let _ = app.emit("agent-permission-request", req_evt);

        let guard = pending.decision.lock().unwrap();
        let (guard, wait_res) = pending
            .cvar
            .wait_timeout_while(guard, Duration::from_secs(60), |d| d.is_none())
            .unwrap();
        let approved = guard.unwrap_or(false);
        state.pending.lock().unwrap().remove(&req_id);
        if wait_res.timed_out() || guard.is_none() {
            let _ = app.emit("agent-permission-expired", &req_id);
        }

        let resp_body = format!(r#"{{"approved":{}}}"#, approved);
        send_json_response(&mut stream, "200 OK", &resp_body);
        return;
    }

    send_json_response(&mut stream, "404 Not Found", r#"{"error":"not_found"}"#);
}

pub fn spawn_agent_bridge_server(app: AppHandle) {
    std::thread::spawn(move || {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", BRIDGE_PORT)) {
            if let Some(state) = app.try_state::<AgentBridgeState>() {
                *state.running.lock().unwrap() = true;
            }
            for stream in listener.incoming().flatten() {
                let app_clone = app.clone();
                std::thread::spawn(move || handle_client(stream, app_clone));
            }
        }
    });
}
