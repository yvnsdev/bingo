"""Servidor de desarrollo para el selector y los enlaces /codigo."""
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse,re
ROOT=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def route(self):
        if re.fullmatch(r'/[A-Za-z0-9]{6}/?',urlsplit(self.path).path):self.path='/index.html'
    def do_GET(self):self.route();super().do_GET()
    def do_HEAD(self):self.route();super().do_HEAD()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=5500);parser.add_argument('--host',default='127.0.0.1');args=parser.parse_args();server=ThreadingHTTPServer((args.host,args.port),Handler);print(f'Noche de juegos: http://{args.host}:{args.port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
