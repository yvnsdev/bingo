(() => {
  const quiz=!!document.getElementById('preview');
  const audio=document.querySelector('#background-music,#lobby-music,#music,#preview,#casino-music');
  if(!audio)return;
  document.documentElement.dataset.playerTheme=audio.id==='casino-music'?'casino':quiz?'pasapalabra':audio.id==='background-music'?'bingo':audio.id==='music'?'millionaire':'latinos';
  const volume=document.getElementById('volume')||document.getElementById('casino-volume');
  const cover=document.getElementById('casino-music')?'assets/casino-club.png':quiz?'assets/logo-pasapalabra.png':document.getElementById('background-music')?'assets/logo-bingo-night.png':document.getElementById('music')?'assets/emblema-monserrat.png':'assets/logo-100-latinos.png';
  const dock=document.createElement('aside');dock.className='game-player-dock';
  dock.innerHTML=`<button class="gp-toggle" aria-expanded="false" aria-controls="gp-panel" aria-label="Abrir reproductor">♫ <span>Música</span></button><section id="gp-panel" class="gp-panel" hidden aria-label="Reproductor"><div class="gp-heading"><b>REPRODUCTOR</b><button class="gp-close" aria-label="Cerrar reproductor">×</button></div><div class="gp-vinyl"><img src="${cover}" alt=""></div><strong class="gp-title">${quiz?'Escucha musical':'Música del juego'}</strong><p class="gp-caption">${quiz?'Cinco segundos · dos escuchas':'Banda sonora'}</p><input class="gp-progress" type="range" min="0" max="1000" value="0" aria-label="Posición de la canción"><div class="gp-times"><span>0:00</span><span>0:00</span></div><div class="gp-controls"><button class="gp-back" aria-label="Retroceder diez segundos">−10</button><button class="gp-play" aria-label="Reproducir">▶</button><button class="gp-next" aria-label="Adelantar diez segundos">+10</button></div><label class="gp-volume">♫ <input type="range" min="0" max="100" value="25" aria-label="Volumen"><output>25%</output></label><p class="gp-status" role="status"></p></section>`;
  document.body.append(dock);
  const legacyCasino=document.querySelector('.casino-music-dock');if(legacyCasino)legacyCasino.hidden=true;
  const nav=document.createElement('nav');nav.className='game-common-nav';nav.setAttribute('aria-label','Controles comunes');
  nav.innerHTML='<a href="../" aria-label="Volver al menú de juegos"><span>Menú de juegos</span></a><button type="button" class="common-fullscreen" aria-label="Pantalla completa"><span>Pantalla completa</span></button>';
  document.querySelectorAll('header a[href="../"],.menu-return').forEach(el=>el.hidden=true);
  const originalFullscreen=document.getElementById('fullscreen');if(originalFullscreen)originalFullscreen.hidden=true;
  document.body.append(nav);
  nav.querySelector('button').onclick=async()=>{try{const adminFullscreen=document.getElementById('admin-fullscreen'),adminPreview=document.getElementById('admin-board-preview');if(document.fullscreenElement)await document.exitFullscreen();else if(adminFullscreen&&adminPreview&&adminPreview.offsetParent!==null)adminFullscreen.click();else if(originalFullscreen&&!originalFullscreen.disabled&&originalFullscreen.closest('section')?.hidden!==true)originalFullscreen.click();else await document.documentElement.requestFullscreen()}catch{}};
  const svg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+path+'</svg>';
  nav.querySelector('a').insertAdjacentHTML('afterbegin',svg('<path d="m10 5-7 7 7 7M3 12h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'));
  nav.querySelector('button').insertAdjacentHTML('afterbegin',svg('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'));
  const noteIcon=svg('<path d="M9 18V5l11-2v13M9 8l11-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="6" cy="18" rx="3" ry="2.5" fill="currentColor"/><ellipse cx="17" cy="16" rx="3" ry="2.5" fill="currentColor"/>');
  dock.querySelector('.gp-toggle').innerHTML=noteIcon+'<span>Música</span>';
  dock.querySelector('.gp-close').innerHTML=svg('<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
  dock.querySelector('.gp-volume').firstChild.replaceWith(document.createRange().createContextualFragment(svg('<path d="M11 4 5 9H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>')));
  const playIcon=svg('<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke-linejoin="round"/>');
  const pauseIcon=svg('<rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor"/>');
  dock.querySelector('.gp-back').innerHTML=svg('<path d="m11 6-8 6 8 6V6Zm10 0-8 6 8 6V6Z" fill="currentColor"/>')+'<span>−10 s</span>';
  dock.querySelector('.gp-next').innerHTML=svg('<path d="m3 6 8 6-8 6V6Zm10 0 8 6-8 6V6Z" fill="currentColor"/>')+'<span>+10 s</span>';
  dock.querySelectorAll('button').forEach(el=>{el.type='button';el.title=el.getAttribute('aria-label')||''});

  const $=s=>dock.querySelector(s),panel=$('.gp-panel'),button=$('.gp-play'),slider=$('.gp-volume input');
  if(volume)volume.closest('label').hidden=true;
  const setOpen=open=>{panel.hidden=!open;$('.gp-toggle').setAttribute('aria-expanded',String(open))};
  $('.gp-toggle').onclick=()=>setOpen(panel.hidden);$('.gp-close').onclick=()=>{setOpen(false);$('.gp-toggle').focus()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});
  document.addEventListener('click',e=>{if(!dock.contains(e.target))setOpen(false)});
  document.addEventListener('fullscreenchange',()=>{(document.fullscreenElement||document.body).append(dock,nav);nav.querySelector('button span').textContent=document.fullscreenElement?'Salir de pantalla':'Pantalla completa'});
  if(quiz){$('.gp-back').hidden=true;$('.gp-next').hidden=true;$('.gp-progress').disabled=true;try{audio.volume=Number(localStorage.getItem('pasapalabra-volume')??25)/100}catch{audio.volume=.25}}
  slider.oninput=()=>{if(volume){volume.value=slider.value;volume.dispatchEvent(new Event('input',{bubbles:true}))}else{audio.volume=Number(slider.value)/100;try{localStorage.setItem('pasapalabra-volume',slider.value)}catch{}}paint()};
  button.onclick=async()=>{if(quiz){document.getElementById('listen').click();return}try{if(audio.paused)await audio.play();else audio.pause();$('.gp-status').textContent=''}catch{$('.gp-status').textContent='No se pudo reproducir el audio.'}};
  $('.gp-back').onclick=()=>{audio.currentTime=Math.max(0,audio.currentTime-10)};
  $('.gp-next').onclick=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+10)};
  $('.gp-progress').oninput=e=>{if(!quiz&&Number.isFinite(audio.duration))audio.currentTime=Number(e.target.value)*audio.duration/1000};
  const time=n=>Number.isFinite(n)?`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`:'0:00';
  function paint(){const playing=!audio.paused;$('.gp-vinyl').classList.toggle('playing',playing);button.innerHTML=playing?pauseIcon:playIcon;button.title=playing?'Pausar':'Reproducir';button.setAttribute('aria-label',button.title);slider.value=Math.round(audio.volume*100);slider.style.setProperty('--fill',slider.value+'%');$('.gp-volume output').textContent=slider.value+'%';const ratio=Number.isFinite(audio.duration)&&audio.duration>0?audio.currentTime/audio.duration:0;$('.gp-progress').value=ratio*1000;$('.gp-progress').style.setProperty('--fill',ratio*100+'%');$('.gp-times').children[0].textContent=quiz?'Fragmento de 5 s':time(audio.currentTime);$('.gp-times').children[1].textContent=quiz?'':time(audio.duration);if(quiz)button.disabled=document.getElementById('listen').disabled;}
  ['play','pause','timeupdate','loadedmetadata','volumechange','emptied'].forEach(e=>audio.addEventListener(e,paint));
  if(quiz)new MutationObserver(paint).observe(document.getElementById('listen'),{attributes:true,attributeFilter:['disabled']});
  paint();
})();
