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
        s.path = path
        super().do_GET()
    def log_message(s, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
