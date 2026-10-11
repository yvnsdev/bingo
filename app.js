const SUPABASE_URL='https://xpxpjdnsbfdexwzovmpn.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhweHBqZG5zYmZkZXh3em92bXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NDkwMDgsImV4cCI6MjEwNzIyNTAwOH0.hH_v0zyTeRYsAPNMrcjnOe2YWbcGCEhy1u3bcf4jFtQ';
(() => {
  const music=document.getElementById('lobby-music'),volume=document.getElementById('lobby-volume'),volumeValue=document.getElementById('lobby-volume-value');
  // Song artwork displayed on the rotating vinyl label.
  const tracks=[
    {src:'100LatinosDijeron/100 Latinos Dijeron, Musica de Fondo.mp3',title:'Música de fondo',artist:'100 Latinos Dijeron',cover:'100LatinosDijeron/assets/logo-100-latinos.png'}
  ];
  const readSetting=(storage,key)=>{try{return window[storage].getItem(key)}catch{return null}};
  const saveSetting=(storage,key,value)=>{try{window[storage].setItem(key,value)}catch{}};
  const savedTrack=Number(readSetting('sessionStorage','lobby-track'));
  let trackIndex=Number.isInteger(savedTrack)&&savedTrack>=0&&savedTrack<tracks.length?savedTrack:0;
  const storedVolume=Number(readSetting('localStorage','lobby-volume')??25);
  const savedVolume=Number.isFinite(storedVolume)?Math.max(0,Math.min(100,storedVolume)):25;
  music.volume=savedVolume/100;volume.value=String(savedVolume);
  const panel=document.getElementById('music-player'),toggle=document.getElementById('music-toggle'),play=document.getElementById('music-play'),vinyl=document.getElementById('music-vinyl'),status=document.getElementById('music-status'),progress=document.getElementById('music-progress'),currentTime=document.getElementById('music-current'),durationTime=document.getElementById('music-duration');
  function setPanel(open){panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open))}
  toggle.addEventListener('click',()=>setPanel(panel.hidden));
  document.getElementById('music-close').addEventListener('click',()=>{setPanel(false);toggle.focus()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){setPanel(false);toggle.focus()}});
  document.addEventListener('click',event=>{if(!event.target.closest('.music-dock'))setPanel(false)});
  function paintAudio(){const level=Number(volume.value);volume.style.setProperty('--volume',`${level}%`);volumeValue.textContent=`${level}%`}
  function formatTime(seconds){if(!Number.isFinite(seconds))return '0:00';const minutes=Math.floor(seconds/60),rest=Math.floor(seconds%60);return `${minutes}:${String(rest).padStart(2,'0')}`}
  function paintProgress(){const duration=music.duration;const ratio=Number.isFinite(duration)&&duration>0?music.currentTime/duration:0;progress.value=String(Math.round(ratio*1000));progress.style.setProperty('--progress',`${ratio*100}%`);currentTime.textContent=formatTime(music.currentTime);durationTime.textContent=formatTime(duration)}
  function paintPlayback(){const playing=!music.paused&&!music.ended;vinyl.classList.toggle('is-playing',playing);play.classList.toggle('is-playing',playing);play.title=playing?'Pausar':'Reproducir';play.setAttribute('aria-label',playing?'Pausar':'Reproducir')}
  async function startMusic(){try{await music.play();status.textContent=''}catch(error){if(error.name==='AbortError')return;status.textContent=error.name==='NotAllowedError'?'La música comenzará al interactuar con el lobby.':'No se pudo reproducir esta canción. Prueba otra.';paintPlayback()}}
  function loadTrack(){const track=tracks[trackIndex];music.src=track.src;saveSetting('sessionStorage','lobby-track',String(trackIndex));document.getElementById('music-title').textContent=track.title;document.getElementById('music-artist').textContent=track.artist;const cover=document.getElementById('music-cover'),placeholder=document.getElementById('music-cover-placeholder');cover.hidden=!track.cover;placeholder.hidden=!!track.cover;if(track.cover)cover.src=track.cover;else cover.removeAttribute('src');status.textContent='';music.load();paintPlayback();startMusic()}
  document.getElementById('music-cover').addEventListener('error',()=>{document.getElementById('music-cover').hidden=true;document.getElementById('music-cover-placeholder').hidden=false});
  const changeTrack=step=>{trackIndex=(trackIndex+step+tracks.length)%tracks.length;loadTrack()};
  document.getElementById('music-previous').addEventListener('click',()=>changeTrack(-1));
  document.getElementById('music-next').addEventListener('click',()=>changeTrack(1));
  play.addEventListener('click',()=>{if(music.paused)startMusic();else music.pause()});
  music.addEventListener('ended',()=>changeTrack(1));
  music.addEventListener('timeupdate',paintProgress);
  music.addEventListener('loadedmetadata',paintProgress);
  progress.addEventListener('input',()=>{if(Number.isFinite(music.duration)){music.currentTime=Number(progress.value)/1000*music.duration;paintProgress()}});
  ['playing','pause','ended'].forEach(event=>music.addEventListener(event,paintPlayback));
  music.addEventListener('waiting',()=>vinyl.classList.remove('is-playing'));
  music.addEventListener('error',()=>{vinyl.classList.remove('is-playing');status.textContent='No se pudo cargar la canción. Prueba otra.'});
  volume.addEventListener('input',()=>{music.volume=Number(volume.value)/100;saveSetting('localStorage','lobby-volume',volume.value);paintAudio()});
  // Retry blocked autoplay on interaction until playback actually starts.
  // Track controls already start playback themselves; keep pause intentional.
  const unlockMusic=event=>{
    if(event.target.closest('#music-play,#music-previous,#music-next'))return;
    if(event.type==='keydown'&&(event.repeat||!['Enter',' '].includes(event.key)))return;
    if(music.paused)startMusic();
  };
  document.addEventListener('click',unlockMusic);
  document.addEventListener('keydown',unlockMusic);
  music.addEventListener('playing',()=>{
    document.removeEventListener('click',unlockMusic);
    document.removeEventListener('keydown',unlockMusic);
  },{once:true});
  loadTrack();paintAudio();paintProgress();
  document.querySelectorAll('.game-card[href]').forEach(card=>card.addEventListener('pointermove',event=>{const rect=card.getBoundingClientRect();card.style.setProperty('--x',`${event.clientX-rect.left}px`);card.style.setProperty('--y',`${event.clientY-rect.top}px`);}));
  const code=location.pathname.split('/').filter(Boolean).at(-1)?.toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(code??''))return;
  const resolver=document.getElementById('code-resolver'),message=document.getElementById('resolver-message');resolver.hidden=false;
  const lookup=async rpc=>{const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({p_action:'lookup',p_data:{code}})});if(!response.ok)throw new Error();return response.json();};
  Promise.allSettled([lookup('bingo_api'),lookup('millionaire_api'),lookup('latinos_api')]).then(results=>{
    const bingo=results[0].status==='fulfilled',monserrat=results[1].status==='fulfilled',latinos=results[2].status==='fulfilled',matches=Number(bingo)+Number(monserrat)+Number(latinos);
    if(matches===1&&bingo)location.replace(`Bingo/?sala=${code}`);
    else if(matches===1&&monserrat)location.replace(`QuienQuiereSerMillonario/?sala=${code}`);
    else if(matches===1&&latinos)location.replace(`100LatinosDijeron/?sala=${code}`);
    else if(matches>1){resolver.hidden=true;document.querySelector('.hero p').textContent='Este código existe en más de un juego. Elige cuál quieres abrir.';}
    else{message.textContent='No encontramos una sala con ese código. Revisa el enlace o vuelve al inicio.';setTimeout(()=>resolver.hidden=true,4500);}
  });
})();
