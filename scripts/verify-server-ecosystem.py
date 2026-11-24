#!/usr/bin/env python3
"""
Isolated end-to-end verification suite for the standalone Kinora Media Server binary.
Uses a disposable temporary KINORA_DATA_DIR and never touches the user's real Kinora data.
Zero em-dashes across all code, comments, and output.
"""

import json
import os
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


def fnv1a(s: str, seed: int) -> int:
    h = seed
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 0x0100000001B3) & 0xFFFFFFFFFFFFFFFF
    return h


def artwork_cache_filename(key: str) -> str:
    h1 = fnv1a(key, 0xCBF29CE484222325)
    h2 = fnv1a(key, 0x84222325CBF29CE4)
    return f"{h1:016x}{h2:016x}.bin"


def pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def http_req(url: str, method: str = "GET", headers=None, body=None, timeout: float = 3.0):
    hdrs = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8") if isinstance(body, (dict, list)) else body
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def wait_for_server(base_url: str, timeout_s: float = 5.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            status, _, raw = http_req(f"{base_url}/api/info", timeout=0.5)
            if status == 200:
                return json.loads(raw.decode("utf-8"))
        except Exception:
            time.sleep(0.05)
    raise RuntimeError(f"Kinora server did not become ready at {base_url}")


def seed_isolated_data(data_dir: str) -> bytes:
    sources_dir = os.path.join(data_dir, "sources")
    artwork_dir = os.path.join(sources_dir, "artwork")
    os.makedirs(artwork_dir, exist_ok=True)

    now_ms = int(time.time() * 1000)
    sources_doc = {
        "version": 3,
        "sources": [
            {
                "id": "pl-smoke",
                "name": "UK Public TV",
                "origin": "file",
                "url": None,
                "label": "uk-smoke.m3u",
                "addedAt": float(now_ms),
                "lastSuccess": float(now_ms),
                "skipped": 0,
                "duplicates": 0,
                "channels": [
                    {
                        "key": "bbc1.uk",
                        "tvgId": "bbc1.uk",
                        "name": "BBC One HD",
                        "group": "National",
                        "chno": 101,
                    }
                ],
            }
        ],
        "guides": [
            {
                "id": "gd-smoke",
                "name": "UK EPG",
                "origin": "file",
                "url": None,
                "label": "uk-epg.xml",
                "addedAt": float(now_ms),
                "lastSuccess": float(now_ms),
                "playlists": ["pl-smoke"],
            }
        ],
        "mappings": [],
        "xtreamSources": [],
    }
    with open(os.path.join(sources_dir, "sources.json"), "w", encoding="utf-8") as f:
        json.dump(sources_doc, f)

    guide_doc = {
        "version": 1,
        "id": "gd-smoke",
        "fetchedAt": now_ms,
        "guide": {
            "channels": [{"id": "bbc1.uk", "name": "BBC One"}],
            "schedules": [
                [
                    {
                        "start": now_ms - 600_000,
                        "stop": now_ms + 1_800_000,
                        "stopEstimated": False,
                        "title": "Six O'Clock News",
                        "subtitle": "Live National Bulletin",
                        "desc": "Latest headlines and weather.",
                        "category": "News",
                        "episode": None,
                    },
                    {
                        "start": now_ms + 1_800_000,
                        "stop": now_ms + 3_600_000,
                        "stopEstimated": False,
                        "title": "Horizon Special",
                        "subtitle": None,
                        "desc": "Science documentary.",
                        "category": "Documentary",
                        "episode": "S01E01",
                    },
                ]
            ],
            "skipped": 0,
            "duplicates": 0,
            "warnings": [],
        },
    }
    with open(os.path.join(sources_dir, "guide-gd-smoke.json"), "w", encoding="utf-8") as f:
        json.dump(guide_doc, f)

    # Minimal valid PNG header + IHDR bytes (matches detect_raster_mime)
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    with open(os.path.join(artwork_dir, artwork_cache_filename("channel:pl-smoke~bbc1.uk")), "wb") as f:
        f.write(png_bytes)

    return png_bytes


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    binary = os.path.join(repo_root, "src-tauri", "target", "debug", "kinora-server")
    if not os.path.exists(binary):
        print("Building standalone kinora-server binary...")
        subprocess.run(
            [
                "cargo",
                "build",
                "--manifest-path",
                os.path.join(repo_root, "src-tauri", "Cargo.toml"),
                "--no-default-features",
                "--bin",
                "kinora-server",
            ],
            check=True,
        )

    temp_dir = tempfile.mkdtemp(prefix="kinora-e2e-server-")
    port = pick_free_port()
    base = f"http://127.0.0.1:{port}"
    pin = "847291"
    proc = None

    try:
        png_bytes = seed_isolated_data(temp_dir)
        log_path = os.path.join(temp_dir, "server.log")
        log_file = open(log_path, "wb")
        proc = subprocess.Popen(
            [binary, "--port", str(port), "--pin", pin, "--data-dir", temp_dir],
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )

        # 1. Server info & embedded web remote
        info = wait_for_server(base)
        assert info["appName"] == "Kinora"
        assert info["version"] == "0.6.0"
        assert info["mode"] == "server"
        assert info["port"] == port
        print("[PASS] 1. Server boot & /api/info")

        st, _, html = http_req(f"{base}/")
        assert st == 200 and b"Kinora Remote" in html
        print("[PASS] 2. Embedded mobile web remote HTML served")

        # 2. Unauthenticated protection
        for ep in ("/api/channels", "/api/epg", "/api/media", "/api/artwork?key=channel:pl-smoke~bbc1.uk", "/api/library"):
            st, _, _ = http_req(f"{base}{ep}")
            assert st == 401, f"Expected 401 for {ep}, got {st}"
        print("[PASS] 3. Unauthenticated endpoints strictly return 401")

        # 3. Pair three device classes
        st, _, raw = http_req(
            f"{base}/pair",
            method="POST",
            body={"pin": pin, "deviceName": "Living Room TV", "deviceType": "desktopClient"},
        )
        assert st == 200
        tv = json.loads(raw)
        tv_hdr = {"Authorization": f"Bearer {tv['token']}"}

        st, _, raw = http_req(
            f"{base}/pair",
            method="POST",
            body={"pin": pin, "deviceName": "Phone Remote", "deviceType": "phone"},
        )
        assert st == 200
        phone = json.loads(raw)
        phone_hdr = {"Authorization": f"Bearer {phone['token']}"}

        st, _, raw = http_req(
            f"{base}/pair",
            method="POST",
            body={"pin": pin, "deviceName": "Jarvis Local", "deviceType": "aiAgent"},
        )
        assert st == 200
        agent = json.loads(raw)
        agent_hdr = {"Authorization": f"Bearer {agent['token']}"}
        print("[PASS] 4. Multi-device pairing (desktopClient, phone, aiAgent)")

        # 4. Capability enforcement
        st, _, _ = http_req(
            f"{base}/api/agent/command",
            method="POST",
            headers=phone_hdr,
            body={"command": "search", "payload": {"query": "News"}},
        )
        assert st == 403, f"Phone must not access /api/agent/command (got {st})"

        st, _, raw = http_req(
            f"{base}/api/agent/command",
            method="POST",
            headers=agent_hdr,
            body={"action": "navigate", "payload": {"destination": "livetv"}},
        )
        assert st == 200 and json.loads(raw)["dispatched"] is True

        # Two-way structured AI agent queries
        st, _, raw = http_req(
            f"{base}/api/agent/command",
            method="POST",
            headers=agent_hdr,
            body={"action": "search", "payload": {"query": "Horizon"}},
        )
        assert st == 200
        search_res = json.loads(raw)
        assert len(search_res["data"]["programmes"]) == 1
        assert search_res["data"]["programmes"][0]["title"] == "Horizon Special"

        st, _, raw = http_req(
            f"{base}/api/agent/command",
            method="POST",
            headers=agent_hdr,
            body={"action": "list_devices"},
        )
        assert st == 200
        dev_res = json.loads(raw)
        assert len(dev_res["data"]["devices"]) == 3
        assert "authToken" not in raw.decode("utf-8")

        st, _, _ = http_req(
            f"{base}/api/agent/command",
            method="POST",
            headers=agent_hdr,
            body={"action": "rm_rf_root"},
        )
        assert st == 400, f"Unknown agent action must be refused with 400 (got {st})"
        print("[PASS] 5. Capability scoping & two-way AI agent queries verified (phone 403, unknown 400, search/devices 200)")

        # 5. Hydrated channels, live EPG enrichment, /api/epg, and /api/artwork
        st, _, raw = http_req(f"{base}/api/channels", headers=tv_hdr)
        assert st == 200
        channels = json.loads(raw)
        assert len(channels) == 1
        assert channels[0]["name"] == "BBC One HD"
        assert channels[0]["currentProgramme"] == "Six O'Clock News"

        st, _, raw = http_req(f"{base}/api/epg?channelId=pl-smoke~bbc1.uk", headers=tv_hdr)
        assert st == 200
        epg = json.loads(raw)
        assert len(epg) == 2
        assert epg[0]["title"] == "Six O'Clock News"

        st, hdrs, img = http_req(
            f"{base}/api/artwork?key={urllib.parse.quote('channel:pl-smoke~bbc1.uk')}",
            headers=tv_hdr,
        )
        assert st == 200 and img == png_bytes

        st, _, _ = http_req(f"{base}/api/artwork?key=../../etc/passwd", headers=tv_hdr)
        assert st == 404
        print("[PASS] 6. Hydrated channels, live EPG enrichment, /api/epg, and /api/artwork verified")

        # 6. Live SSE + bidirectional watch progress & library sync
        sse_events = []
        sse_ready = threading.Event()

        def read_sse():
            req = urllib.request.Request(f"{base}/api/events?token={urllib.parse.quote(tv['token'])}")
            with urllib.request.urlopen(req, timeout=4) as resp:
                sse_ready.set()
                for raw_line in resp:
                    line = raw_line.decode("utf-8", errors="ignore").strip()
                    if line.startswith("data: "):
                        sse_events.append(json.loads(line[6:]))
                        if any(e.get("type") == "sync_library" for e in sse_events):
                            break

        t = threading.Thread(target=read_sse, daemon=True)
        t.start()
        assert sse_ready.wait(timeout=3.0), "SSE stream did not connect"

        st, _, _ = http_req(
            f"{base}/api/sync/progress",
            method="POST",
            headers=tv_hdr,
            body={"itemRef": "movie:solaris", "title": "Solaris", "position": 420.5, "duration": 9960.0},
        )
        assert st == 200

        st, _, _ = http_req(
            f"{base}/api/sync/library",
            method="POST",
            headers=tv_hdr,
            body={"action": "toggle_favourite", "id": "pl-smoke~bbc1.uk"},
        )
        assert st == 200

        t.join(timeout=3.0)
        assert any(e.get("type") == "sync_progress" for e in sse_events), f"Missing sync_progress SSE: {sse_events}"
        assert any(e.get("type") == "sync_library" for e in sse_events), f"Missing sync_library SSE: {sse_events}"

        st, _, raw = http_req(f"{base}/api/library", headers=tv_hdr)
        lib = json.loads(raw)
        assert "pl-smoke~bbc1.uk" in lib["favourites"]
        assert any(p["itemRef"] == "movie:solaris" and p["position"] == 420.5 for p in lib["watchProgress"])
        print("[PASS] 7. Live SSE event delivery and bidirectional library/progress sync verified")

        # 7. Cast handoff, remote input, and security audit trail
        st, _, _ = http_req(
            f"{base}/api/cast",
            method="POST",
            headers=phone_hdr,
            body={"title": "Solaris", "streamUrl": "https://example.invalid/solaris.m3u8", "position": 420.5},
        )
        assert st == 200

        st, _, _ = http_req(f"{base}/api/input", method="POST", headers=phone_hdr, body={"text": "Horizon"})
        assert st == 200

        st, _, raw = http_req(f"{base}/api/audit", headers=tv_hdr)
        audit = json.loads(raw)
        actions = {a["action"] for a in audit}
        assert {"PairDevice", "CastMedia", "InputText", "SyncProgress", "toggle_favourite"}.issubset(actions), f"Unexpected audit actions: {actions}"
        print("[PASS] 8. Cast handoff, remote keyboard input, and audit trail verified")

        # 8. Restart persistence check (devices.json + platform_config.json with 0600 permissions)
        proc.send_signal(signal.SIGINT)
        proc.wait(timeout=5)
        proc = None

        for fname in ("devices.json", "platform_config.json"):
            fpath = os.path.join(temp_dir, fname)
            assert os.path.exists(fpath), f"Missing persisted file {fname}"
            mode = os.stat(fpath).st_mode & 0o777
            assert mode == 0o600, f"Expected 0600 permissions on {fname}, got {oct(mode)}"

        proc = subprocess.Popen(
            [binary, "--port", str(port), "--data-dir", temp_dir],
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )
        wait_for_server(base)
        st, _, raw = http_req(f"{base}/api/channels", headers=tv_hdr)
        assert st == 200, "Previously paired device token must remain valid after server restart"
        print("[PASS] 9. Server restart persistence and 0600 file permissions verified")

        print("\nALL 9 END-TO-END MULTI-DEVICE SERVER CHECKS PASSED.")
    finally:
        if proc is not None and proc.poll() is None:
            proc.send_signal(signal.SIGINT)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        subprocess.run(["rm", "-rf", temp_dir], check=False)


if __name__ == "__main__":
    main()
