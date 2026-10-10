"""Run: python tests/check.py (mini-racer + pglast in .test-tools or environment)."""
from pathlib import Path
import sys
import re
import json
import threading
import urllib.request
from html.parser import HTMLParser
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.test-tools'))
sys.path.insert(0, str(ROOT))
from py_mini_racer import MiniRacer
from pglast import parse_sql, parser
from server import BingoHandler

with MiniRacer() as js:
    js.eval((ROOT / 'game.js').read_text(encoding='utf-8'))
    js.eval((ROOT / 'tests/game.test.js').read_text(encoding='utf-8'))
    print(js.eval('testResult'))
    js.eval('new Function(' + json.dumps((ROOT / 'app.js').read_text(encoding='utf-8')) + ')')
    print('PASS: app.js parsed by V8')
    js.eval((ROOT / 'auth.js').read_text(encoding='utf-8'))
    js.eval((ROOT / 'tests/auth.test.js').read_text(encoding='utf-8'))
    print(js.eval('runAuthTests()').get())

sql = (ROOT / 'supabase.sql').read_text(encoding='utf-8')
parse_sql(sql)
for function in re.findall(r'create or replace function.*?\$\$;', sql, re.S | re.I):
    parser.parse_plpgsql_json(function)
print('PASS: PostgreSQL statements and both PL/pgSQL functions parsed')

class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.text = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
    def handle_data(self, data):
        self.text.append(data)

html = (ROOT / 'index.html').read_text(encoding='utf-8')
doc = Document()
doc.feed(html)
refs = re.findall(r"\$\('([^']+)'\)", (ROOT / 'app.js').read_text(encoding='utf-8'))
assert len(doc.ids) == len(set(doc.ids))
assert not set(refs) - set(doc.ids), set(refs) - set(doc.ids)
assert not re.search(r'[A-Za-z]\?[A-Za-z]', ' '.join(doc.text)), 'Corrupted accents in HTML text'
assert not re.search(r'\?(?:Crear|Quiero|Ya|Usar|Ir|T\?)', ' '.join(doc.text)), 'Corrupted special characters'
assert '\ufffd' not in html and 'sesi\u00f3n' in html and 'Contrase\u00f1a' in html
print(f'PASS: {len(doc.ids)} unique HTML IDs and all JS DOM references')
print('PASS: UTF-8 accents and special characters')

with MiniRacer() as js:
    js.eval('globalThis.elementIDs=' + json.dumps(doc.ids))
    js.eval('''
    class Element {
      constructor(){this.hidden=false;this.value='';this.textContent='';this.children=[];this.open=false;this.classList={toggle(){},add(){},remove(){}};this.style={};this.dataset={};}
      append(...items){this.children.push(...items);} replaceChildren(){this.children=[];}
      cloneNode(){const copy=new Element();copy.children=[...this.children];return copy;}
      setAttribute(){} querySelector(tag){this.parts??={};return this.parts[tag]??=new Element();}
      showModal(){this.open=true;} close(){this.open=false;} focus(){} select(){} remove(){}
    }
    globalThis.elements=Object.fromEntries(elementIDs.map(id=>[id,new Element()]));
    elements['join-form'].hidden=true;elements['code-form'].hidden=false;
    globalThis.listeners={};
    const queried={};
    globalThis.document={getElementById:id=>elements[id],createElement:()=>new Element(),createTextNode:s=>s,querySelectorAll:()=>[],querySelector:s=>queried[s]??=new Element(),body:new Element(),addEventListener(name,fn){listeners[name]=fn;}};
    globalThis.window=globalThis;globalThis.addEventListener=()=>{};
    const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
    globalThis.location={href:'http://localhost:5500/',protocol:'http:'};globalThis.history={replaceState(){}};
    let seed=0;globalThis.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=++seed;return a;}};
    let timerID=0;const timers=new Map();
    globalThis.setTimeout=(callback,delay)=>{const id=++timerID;timers.set(id,{callback,delay});return id;};
    globalThis.clearTimeout=id=>timers.delete(id);globalThis.setInterval=()=>1;
    globalThis.flushAnimation=()=>{let count=0;while(count<100){const next=[...timers].find(([id,t])=>t.delay<=2500);if(!next)break;timers.delete(next[0]);next[1].callback();count++;}return count;};
    ''')
    js.eval((ROOT / 'game.js').read_text(encoding='utf-8'))
    js.eval("BingoGame.routeCode=()=>null;BingoGame.invitation=(href,code)=>'http://localhost:5500/'+code.toLowerCase();")
    js.eval((ROOT / 'auth.js').read_text(encoding='utf-8'))
    app_js = (ROOT / 'app.js').read_text(encoding='utf-8')
    app_js = re.sub(r'^const SUPABASE_(URL|ANON_KEY) = .*?;', r"const SUPABASE_\1 = '';", app_js, flags=re.M)
    js.eval(app_js)
    js.eval((ROOT / 'tests/ui.test.js').read_text(encoding='utf-8'))
    print(js.eval('runUITests()').get())

class QuietHandler(BingoHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    for path in ['/', '/abc123', '/ABC123/', '/?sala=ABC123', '/style.css', '/casino.css', '/game.js', '/auth.js', '/app.js']:
        with urllib.request.urlopen(f'http://127.0.0.1:{server.server_port}{path}') as response:
            assert response.status == 200
            assert 'charset=utf-8' in response.headers.get('Content-Type', '')
            body = response.read().decode('utf-8')
            if not path.endswith(('.css', '.js')):
                assert '<title>MONC TICELLO' in body
        print(f'PASS HTTP 200: {path}')
finally:
    server.shutdown()
    server.server_close()
