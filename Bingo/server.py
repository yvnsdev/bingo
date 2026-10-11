"""Servidor de desarrollo con soporte para las invitaciones /codigo."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import re


class BingoHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
    }
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parent), **kwargs)

    def do_GET(self):
        if re.fullmatch(r"/[a-zA-Z0-9]{6}/?", urlsplit(self.path).path):
            self.path = "/index.html"
        super().do_GET()

    def do_HEAD(self):
        if re.fullmatch(r"/[a-zA-Z0-9]{6}/?", urlsplit(self.path).path):
            self.path = "/index.html"
        super().do_HEAD()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5500)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), BingoHandler)
    print(f"Bingo Club: http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
