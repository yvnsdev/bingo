"""Capturas de QA con Edge headless y un perfil aislado, sin usar cuentas reales."""
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs
import json
import re
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import BingoHandler

FIXTURE = r"""
window.addEventListener('load', async () => {
  try {
    const $ = id => document.getElementById(id);
    const wait = () => new Promise(resolve => setTimeout(resolve, 150));
    // Edge headless puede imponer 500px al viewport de una ventana más estrecha.
    if (MODE === 'entry') { document.documentElement.style.width = '390px'; document.body.style.width = '390px'; }
    if (MODE !== 'entry') {
      $('organizer-login').click(); await $('demo-host').onclick();
      $('party-name').value = 'La noche del bingo';
      $('create-form').dispatchEvent(new Event('submit', {cancelable:true})); await wait();
      const rooms = JSON.parse(localStorage.getItem('bingo-demo-rooms'));
      const code = JSON.parse(localStorage.getItem('bingo-session-demo')).hostCode;
      rooms[code].drawn = Array.from({length: 23}, (_, i) => ((i * 17) % 75) + 1);
      localStorage.setItem('bingo-demo-rooms', JSON.stringify(rooms));
      window.dispatchEvent(new StorageEvent('storage')); await wait();
      const highlighted = document.querySelectorAll('#number-board .scanning').length;
      if (highlighted !== 1) throw new Error('Roulette must highlight one random candidate');
      if (Number($('draw-count').textContent) !== rooms[code].drawn.length - 1) throw new Error('Result marked before roulette settles');
      await new Promise(resolve => setTimeout(resolve, 4800));
      if (document.querySelectorAll('#number-board .scanning').length !== 0) throw new Error('Roulette did not settle');
      if ($('reveal').hidden) throw new Error('Final result closed automatically');
      $('reveal-close').click(); await wait();
      if (!$('reveal').hidden) throw new Error('Final result close button failed');
      if (Number($('draw-count').textContent) !== rooms[code].drawn.length) throw new Error('Final result not marked');
      if (MODE === 'projection') {
        await $('fullscreen').onclick();
        $('presentation-last').click(); await wait();
        const projectedHighlights = document.querySelectorAll('#presentation-board .scanning').length;
        if (projectedHighlights !== 1) throw new Error('Projection must highlight one random candidate');
        await new Promise(resolve => setTimeout(resolve, 4800));
        if ($('reveal').hidden) throw new Error('Chosen ball not displayed over projection');
        if ($('reveal').getBoundingClientRect().width < innerWidth - 2) throw new Error('Chosen ball does not cover projection');
        $('reveal-close').click(); await wait();
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) throw new Error('Horizontal overflow');
    if ([...document.images].some(img => !img.complete || !img.naturalWidth)) throw new Error('Logo did not load');
    if (MODE === 'entry' && $('join-panel').getBoundingClientRect().right > 390) throw new Error('Mobile form overflow');
    if (MODE === 'projection') {
      if (document.querySelector('.topbar').offsetHeight !== 0) throw new Error('Header visible in projection');
      if ($('presentation-code').getBoundingClientRect().bottom > innerHeight) throw new Error('Room code outside viewport');
      if ($('presentation-history').children.length !== 24) throw new Error('Incomplete projection history');
    }
    document.body.dataset.qa = 'ready';
  } catch (error) { document.body.dataset.qa = 'failed'; document.body.dataset.error = error.message; }
});
"""

class Handler(BingoHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == '/':
            mode = parse_qs(parsed.query).get('mode', ['entry'])[0]
            html = (ROOT / 'index.html').read_text(encoding='utf-8')
            script = '<script>' + 'const MODE=' + json.dumps(mode) + ';' + FIXTURE + '</script>'
            self.respond(html.replace('</body>', script + '</body>'), 'text/html; charset=utf-8')
        elif parsed.path == '/app.js':
            script = (ROOT / 'app.js').read_text(encoding='utf-8')
            script = re.sub(r'^const SUPABASE_(URL|ANON_KEY) = .*?;', r"const SUPABASE_\1 = '';", script, flags=re.M)
            self.respond(script, 'text/javascript; charset=utf-8')
        elif parsed.path == '/style.css':
            # Evita depender de una descarga de tipografías para finalizar la captura.
            css = (ROOT / 'style.css').read_text(encoding='utf-8')
            self.respond(re.sub(r'^@import[^\n]*\n', '', css), 'text/css; charset=utf-8')
        else:
            super().do_GET()

    def respond(self, value, mime):
        data = value.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

if __name__ == '__main__':
    edge = Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
    output = ROOT / '.browser-check'
    output.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        for mode, size in [('entry', '390,844'), ('host', '1440,1100'), ('projection', '1920,1080')]:
            if len(sys.argv) > 1 and mode not in sys.argv[1:]:
                continue
            screenshot = output / f'{mode}.png'
            args = [str(edge), '--headless', '--disable-gpu', '--no-first-run',
                    '--no-default-browser-check', '--hide-scrollbars',
                    f'--user-data-dir={output / (mode + "-profile")}',
                    f'--window-size={size}', '--virtual-time-budget=15000',
                    '--dump-dom', f'--screenshot={screenshot}',
                    f'http://127.0.0.1:{server.server_port}/?mode={mode}']
            result = subprocess.run(args, capture_output=True, timeout=40,
                                    creationflags=subprocess.CREATE_NO_WINDOW)
            dom = result.stdout.decode('utf-8', errors='replace')
            (output / f'{mode}.html').write_text(dom, encoding='utf-8')
            assert 'data-qa="ready"' in dom, f'{mode}: browser fixture did not finish; inspect output DOM'
            assert screenshot.exists(), f'{mode}: no screenshot'
            print(f'PASS Edge: {mode} -> {screenshot}', flush=True)
    finally:
        server.shutdown()
        server.server_close()
