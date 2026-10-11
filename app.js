const SUPABASE_URL='https://xpxpjdnsbfdexwzovmpn.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhweHBqZG5zYmZkZXh3em92bXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NDkwMDgsImV4cCI6MjEwNzIyNTAwOH0.hH_v0zyTeRYsAPNMrcjnOe2YWbcGCEhy1u3bcf4jFtQ';
(() => {
  const music=document.getElementById('lobby-music'),volume=document.getElementById('lobby-volume'),volumeValue=document.getElementById('lobby-volume-value');
  const tracks=['And So It Begins – Artificial Music (No Copyright Music) - Audio Library.mp3','Bonus Points - Late Night Thoughts - Czech Vibes Sound.mp3','Dj Quads - It just makes me happy - Chilled Monkey.mp3','LAKEY INSPIRED - Better Days - LAKEY INSPIRED.mp3'];
  let trackIndex=Math.max(0,Math.min(tracks.length-1,Number(sessionStorage.getItem('lobby-track'))||0));
  const savedVolume=Math.max(0,Math.min(100,Number(localStorage.getItem('lobby-volume')??25)));music.volume=savedVolume/100;volume.value=String(savedVolume);
  function paintAudio(){const level=Number(volume.value);volume.style.setProperty('--volume',`${level}%`);volumeValue.textContent=`${level}%`}
  function loadTrack(){music.src=tracks[trackIndex];sessionStorage.setItem('lobby-track',String(trackIndex));music.load();music.play().catch(()=>{});paintAudio()}
  music.addEventListener('ended',()=>{trackIndex=(trackIndex+1)%tracks.length;loadTrack(true)});
  volume.addEventListener('input',()=>{music.volume=Number(volume.value)/100;localStorage.setItem('lobby-volume',volume.value);if(music.paused)music.play().catch(()=>{});paintAudio()});
  const unlockMusic=()=>{if(music.paused)music.play().catch(()=>{});document.removeEventListener('pointerdown',unlockMusic)};document.addEventListener('pointerdown',unlockMusic,{once:true});
  loadTrack();
  document.querySelectorAll('.game-card[href]').forEach(card=>card.addEventListener('pointermove',event=>{const rect=card.getBoundingClientRect();card.style.setProperty('--x',`${event.clientX-rect.left}px`);card.style.setProperty('--y',`${event.clientY-rect.top}px`);}));
  const code=location.pathname.split('/').filter(Boolean).at(-1)?.toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(code??''))return;
  const resolver=document.getElementById('code-resolver'),message=document.getElementById('resolver-message');resolver.hidden=false;
  const lookup=async rpc=>{const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({p_action:'lookup',p_data:{code}})});if(!response.ok)throw new Error();return response.json();};
  Promise.allSettled([lookup('bingo_api'),lookup('millionaire_api')]).then(results=>{
    const bingo=results[0].status==='fulfilled',monserrat=results[1].status==='fulfilled';
    if(bingo&&!monserrat)location.replace(`Bingo/?sala=${code}`);
    else if(monserrat&&!bingo)location.replace(`QuienQuiereSerMillonario/?sala=${code}`);
    else if(bingo&&monserrat){resolver.hidden=true;document.querySelector('.hero p').textContent='Este código existe en dos juegos. Elige cuál quieres abrir.';}
    else{message.textContent='No encontramos una sala con ese código. Revisa el enlace o vuelve al inicio.';setTimeout(()=>resolver.hidden=true,4500);}
  });
})();
