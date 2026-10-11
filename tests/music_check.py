"""Verify background playback and the existing sound control in Edge."""
import subprocess
import threading
import browser_check as check

check.FIXTURE = r"""
window.addEventListener('load', async () => {
  try {
    const music = document.getElementById('background-music');
    const volume = document.getElementById('volume');
    const assert = (ok, message) => { if (!ok) throw Error(message); };
    const initialVolume = Number(localStorage.getItem('bingo-volume') ?? 25);
    assert(music.autoplay && music.loop, 'Music must autoplay and loop');
    await music.play();
    assert(!music.paused && music.volume === initialVolume / 100, 'Saved background volume');
    assert(Number(volume.value) === initialVolume, 'Saved volume control');
    volume.value = '0'; volume.oninput();
    const pausedAt = music.currentTime;
    assert(music.paused && music.volume === 0, 'Zero volume must silence music');
    document.body.click();
    assert(music.paused, 'Other clicks must not override zero volume');
    volume.value = '60'; volume.oninput();
    await music.play();
    assert(!music.paused && music.volume === .6 && music.currentTime >= pausedAt, 'Volume and resume without restarting');
    assert(localStorage.getItem('bingo-volume') === '60', 'Volume preference persisted');
    document.body.dataset.qa = 'ready';
  } catch (error) { document.body.dataset.qa = 'failed'; document.body.dataset.error = error.message; }
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
        '--autoplay-policy=no-user-gesture-required',
        f'--user-data-dir={output / "music-profile"}', '--virtual-time-budget=8000',
        '--dump-dom', f'http://127.0.0.1:{server.server_port}/',
    ], capture_output=True, timeout=40, creationflags=subprocess.CREATE_NO_WINDOW)
    dom = result.stdout.decode('utf-8', errors='replace')
    (output / 'music.html').write_text(dom, encoding='utf-8')
    assert 'data-qa="ready"' in dom, 'Inspect .browser-check/music.html for failure'
    print('PASS Edge: volume adjustment, persistence, zero level, and resume without restarting.')
finally:
    server.shutdown()
    server.server_close()
