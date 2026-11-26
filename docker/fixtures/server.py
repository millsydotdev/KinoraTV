#!/usr/bin/env python3
"""Kinora Local Mock Streaming, EPG and Xtream Fixture Server.

Provides synthetic M3U playlists, dynamic rolling HLS streams, XMLTV guides,
and Xtream Codes API mocks for reproducible local and containerized testing
without reaching external networks.
"""

import http.server
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import parse_qs, urlparse

HOST = os.environ.get("FIXTURE_HOST", "0.0.0.0")
PORT = int(os.environ.get("FIXTURE_PORT", "18765"))
PUBLIC_URL = os.environ.get("PUBLIC_URL", f"http://127.0.0.1:{PORT}")

class FixtureHandler(http.server.BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type, Authorization")
        self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_HEAD(self):
        self.handle_request(is_head=True)

    def do_GET(self):
        self.handle_request(is_head=False)

    def handle_request(self, is_head=False):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # 1. Healthcheck Endpoint
        if path == "/health":
            body = json.dumps({
                "status": "healthy",
                "service": "kinora-fixtures",
                "version": "0.6.0",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }).encode("utf-8")
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        # 2. Mock M3U Playlist Endpoint
        if path in ("/channels.m3u", "/playlist.m3u"):
            content = self.generate_m3u()
            body = content.encode("utf-8")
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        # 3. Dynamic Rolling Live HLS Master & Media Playlists
        if path == "/live/master.m3u8":
            content = (
                "#EXTM3U\n"
                "#EXT-X-VERSION:3\n"
                f'#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,NAME="Low"\n'
                f"{PUBLIC_URL}/live/index.m3u8?rendition=lo\n"
                f'#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720,NAME="High"\n'
                f"{PUBLIC_URL}/live/index.m3u8?rendition=hi\n"
            )
            body = content.encode("utf-8")
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/vnd.apple.mpegurl")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        if path == "/live/index.m3u8":
            seq = int(time.time() / 2)
            lines = [
                "#EXTM3U",
                "#EXT-X-VERSION:3",
                "#EXT-X-TARGETDURATION:2",
                f"#EXT-X-MEDIA-SEQUENCE:{seq - 6}",
                f"#EXT-X-DISCONTINUITY-SEQUENCE:{(seq - 6 + 299) // 300}"
            ]
            for n in range(seq - 6, seq + 1):
                if n % 300 == 0:
                    lines.append("#EXT-X-DISCONTINUITY")
                lines.append("#EXTINF:2.0,")
                lines.append(f"{PUBLIC_URL}/live/segment_{n % 300:03d}.ts")
            body = ("\n".join(lines) + "\n").encode("utf-8")
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/vnd.apple.mpegurl")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        # 4. Mock TS Segment (Synthetic MPEG-TS packet stream)
        if path.startswith("/live/segment_") and path.endswith(".ts"):
            # Generates a valid minimal MPEG-TS dummy packet structure (188 bytes packets with sync byte 0x47)
            packet = bytearray([0x47, 0x1F, 0xFF, 0x10] + [0xFF] * 184)
            body = bytes(packet * 200)  # ~37.6 KB synthetic chunk
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "video/mp2t")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        # 5. Mock XMLTV Guide Endpoint
        if path in ("/guide.xml", "/epg.xml"):
            content = self.generate_xmltv()
            body = content.encode("utf-8")
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/xml; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        # 6. Mock Xtream Codes API
        if path == "/player_api.php":
            action = query.get("action", [""])[0]
            if not action:
                # Login authentication query
                res = {
                    "user_info": {
                        "username": query.get("username", ["user"])[0],
                        "status": "Active",
                        "auth": 1,
                        "created_at": "1700000000",
                        "exp_date": "1890000000",
                        "is_trial": "0",
                        "active_cons": "0",
                        "max_connections": "3",
                        "allowed_output_formats": ["m3u8", "ts"]
                    },
                    "server_info": {
                        "url": PUBLIC_URL.replace("http://", "").replace("https://", ""),
                        "port": str(PORT),
                        "server_protocol": "http",
                        "time_now": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                        "timezone": "UTC"
                    }
                }
            elif action == "get_live_categories":
                res = [
                    {"category_id": "1", "category_name": "News", "parent_id": 0},
                    {"category_id": "2", "category_name": "Entertainment", "parent_id": 0},
                    {"category_id": "3", "category_name": "Documentaries", "parent_id": 0}
                ]
            elif action == "get_live_streams":
                res = [
                    {
                        "num": 1,
                        "name": "Kinora News 24/7",
                        "stream_type": "live",
                        "stream_id": 101,
                        "stream_icon": f"{PUBLIC_URL}/art/news.png",
                        "epg_channel_id": "kinora.news",
                        "category_id": "1"
                    },
                    {
                        "num": 2,
                        "name": "Kinora Cinema HD",
                        "stream_type": "live",
                        "stream_id": 102,
                        "stream_icon": f"{PUBLIC_URL}/art/cinema.png",
                        "epg_channel_id": "kinora.cinema",
                        "category_id": "2"
                    }
                ]
            elif action == "get_vod_categories":
                res = [
                    {"category_id": "10", "category_name": "Feature Films", "parent_id": 0}
                ]
            elif action == "get_vod_streams":
                res = [
                    {
                        "num": 1,
                        "name": "The Amber Sky (2024)",
                        "stream_type": "movie",
                        "stream_id": 501,
                        "stream_icon": f"{PUBLIC_URL}/art/amber-sky.jpg",
                        "rating": "8.4",
                        "category_id": "10",
                        "container_extension": "mp4"
                    }
                ]
            else:
                res = []

            body = json.dumps(res, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        # 404 Fallback
        self.send_response(404)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/plain")
        body = b"404 Not Found"
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not is_head:
            self.wfile.write(body)

    def generate_m3u(self):
        return f"""#EXTM3U
#EXTINF:-1 tvg-id="kinora.news" tvg-name="Kinora News" tvg-logo="{PUBLIC_URL}/art/news.png" group-title="News",Kinora News 24/7
{PUBLIC_URL}/live/master.m3u8?token=DEV_TOKEN
#EXTINF:-1 tvg-id="kinora.cinema" tvg-name="Kinora Cinema" tvg-logo="{PUBLIC_URL}/art/cinema.png" group-title="Entertainment",Kinora Cinema HD
{PUBLIC_URL}/live/master.m3u8?token=DEV_TOKEN
#EXTINF:-1 tvg-id="kinora.doc" tvg-name="Kinora Doc" group-title="Documentaries",Kinora Nature & Earth
{PUBLIC_URL}/live/master.m3u8?token=DEV_TOKEN
"""

    def generate_xmltv(self):
        now = datetime.now(timezone.utc)
        fmt = "%Y%m%d%H%M%S +0000"
        
        p1_start = (now - timedelta(hours=1)).strftime(fmt)
        p1_stop = (now + timedelta(hours=1)).strftime(fmt)
        p2_start = (now + timedelta(hours=1)).strftime(fmt)
        p2_stop = (now + timedelta(hours=3)).strftime(fmt)

        return f"""<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="Kinora Fixture Server 0.6.0">
  <channel id="kinora.news">
    <display-name>Kinora News 24/7</display-name>
  </channel>
  <channel id="kinora.cinema">
    <display-name>Kinora Cinema HD</display-name>
  </channel>
  <programme start="{p1_start}" stop="{p1_stop}" channel="kinora.news">
    <title lang="en">Global Horizon News Hour</title>
    <desc lang="en">Live coverage of international headlines, breaking financial analysis, and in-depth political discourse.</desc>
    <category lang="en">News</category>
  </programme>
  <programme start="{p2_start}" stop="{p2_stop}" channel="kinora.news">
    <title lang="en">Evening Focus &amp; Analysis</title>
    <desc lang="en">Detailed investigative journalism and retrospective reports on pressing global events.</desc>
    <category lang="en">News</category>
  </programme>
  <programme start="{p1_start}" stop="{p1_stop}" channel="kinora.cinema">
    <title lang="en">Midnight in Marrakesh</title>
    <desc lang="en">A gripping noir thriller unravelling through the shadows of an ancient desert citadel.</desc>
    <category lang="en">Movie</category>
  </programme>
  <programme start="{p2_start}" stop="{p2_stop}" channel="kinora.cinema">
    <title lang="en">Solaris Echoes</title>
    <desc lang="en">An evocative sci-fi odyssey exploring deep-space isolation and cognitive resonance.</desc>
    <category lang="en">Movie</category>
  </programme>
</tv>
"""

    def log_message(self, format, *args):
        # Clean formatted logging with timestamp
        sys.stderr.write(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {format % args}\n")

if __name__ == "__main__":
    server_address = (HOST, PORT)
    httpd = http.server.ThreadingHTTPServer(server_address, FixtureHandler)
    print(f"Kinora Fixture Server running on {PUBLIC_URL} (bound to {HOST}:{PORT})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down fixture server.")
        httpd.server_close()
