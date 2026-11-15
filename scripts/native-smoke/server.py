# Fixture server on 127.0.0.1: serves files (query strings ignored), delays /slow/... by 5 s, and logs
# every request with its User-Agent and Referer so direct (non-Kinora) requests would show up.
import http.server, sys, time
root, port, log = sys.argv[1], int(sys.argv[2]), sys.argv[3]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=root, **k)
    def do_GET(s):
        with open(log, 'a') as f: f.write(f"{time.time():.2f} GET {s.path} ua={s.headers.get('User-Agent')} referer={s.headers.get('Referer')} origin={s.headers.get('Origin')}\n")
        path = s.path.split('?')[0]
        if path.startswith('/slow/'):
            time.sleep(5); path = path[5:]
        if path == '/live/index.m3u8':  # a sliding window over 10 minutes of 2 s segments
            seq = int(time.time() / 2)
            lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:2', f'#EXT-X-MEDIA-SEQUENCE:{seq - 7}']
            lines.append(f'#EXT-X-DISCONTINUITY-SEQUENCE:{(seq - 7 + 299) // 300}')
            for n in range(seq - 7, seq + 1):
                if n % 300 == 0: lines.append('#EXT-X-DISCONTINUITY')
                lines += ['#EXTINF:2.0,', f'/long/seg{n % 300:03d}.ts']
            body = ('\n'.join(lines) + '\n').encode()
            s.send_response(200); s.send_header('Content-Type', 'application/vnd.apple.mpegurl'); s.send_header('Content-Length', str(len(body))); s.end_headers()
            s.wfile.write(body)
            return
        s.path = path
        super().do_GET()
    def log_message(s, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
