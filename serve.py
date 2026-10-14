"""Servidor local para probar: python serve.py [puerto]. Igual que http.server pero sin caché."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f"http://localhost:{port}")
ThreadingHTTPServer(("0.0.0.0", port), NoCache).serve_forever()
