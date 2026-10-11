"""Check that removing the brake animation preserves the wheel's angle in Edge."""
import subprocess
import threading
from pathlib import Path
import browser_check as check

check.FIXTURE = r"""
window.addEventListener('load', () => {
  try {
    for (const name of ['last-ball', 'presentation-ball']) {
      const ball = document.createElement('div');
      ball.className = name;
      ball.style.setProperty('--wheel-start', '123deg');
      ball.style.setProperty('--wheel-stop', 'calc(var(--wheel-start) + var(--wheel-brake-distance))');
      document.body.append(ball);
      ball.classList.add('is-slowing');
      getComputedStyle(ball, '::before').transform;
      ball.getAnimations({subtree:true}).find(a => a.animationName === 'roulette-brake').finish();
      const end = getComputedStyle(ball, '::before').transform;
      ball.classList.remove('is-slowing');
      const rest = getComputedStyle(ball, '::before').transform;
      if (end !== rest || rest === 'none') throw Error(name + ': stopping angle changed');
      ball.classList.add('is-spinning');
      getComputedStyle(ball, '::before').transform;
      const animations = ball.getAnimations({subtree:true});
      const start = animations.find(a => a.animationName === 'roulette-start');
      const spin = animations.find(a => a.animationName === 'roulette-turn');
      start.pause(); start.currentTime = 0;
      spin.pause(); spin.currentTime = 0;
      if (getComputedStyle(ball, '::before').transform !== rest) throw Error(name + ': starting angle changed');
      const angle = () => {
        const values = getComputedStyle(ball, '::before').transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
        return Math.atan2(values[1], values[0]) * 180 / Math.PI;
      };
      const sample = time => { start.currentTime = time; spin.currentTime = time; return angle(); };
      const delta = (a,b) => (b-a+360)%360;
      const a = sample(0), b = sample(300), c = sample(600), d = sample(900);
      if (!(delta(a,b) < delta(b,c) && delta(b,c) < delta(c,d))) throw Error(name + ': startup does not accelerate');
      const before = sample(899), after = sample(901);
      if (Math.abs(delta(before,after) - 360/1.2*.002) > .01) throw Error(name + ': jump at cruising speed');
      const cruise = sample(1200);
      if (Math.abs(delta(d,cruise) - 360/1.2*.3) > .01) throw Error(name + ': incorrect cruising speed');
      ball.remove();
    }
    document.body.dataset.qa = 'ready';
  } catch(e) { document.body.dataset.qa = 'failed'; document.body.dataset.error = e.message; }
});
"""

server = check.ThreadingHTTPServer(('127.0.0.1', 0), check.Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    output = check.ROOT / '.browser-check'
    output.mkdir(exist_ok=True)
    result = subprocess.run([
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        f'--user-data-dir={output / "wheel-profile"}', '--virtual-time-budget=3000',
        '--dump-dom', f'http://127.0.0.1:{server.server_port}/',
    ], capture_output=True, timeout=40, creationflags=subprocess.CREATE_NO_WINDOW)
    dom = result.stdout.decode('utf-8', errors='replace')
    (output / 'wheel.html').write_text(dom, encoding='utf-8')
    assert 'data-qa="ready"' in dom, 'Inspect .browser-check/wheel.html for failure'
    print('PASS Edge: host and projection keep the stopping angle and restart from that position.')
finally:
    server.shutdown()
    server.server_close()
