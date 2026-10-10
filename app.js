/* CONEXIÓN SUPABASE: ejecuta supabase.sql y completa SOLO estas dos variables.
   Usa la clave publishable o anon. Nunca uses service_role ni una clave secreta.
   Sin configuración, la demo guarda los datos únicamente en este navegador. */
const SUPABASE_URL = 'https://xpxpjdnsbfdexwzovmpn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhweHBqZG5zYmZkZXh3em92bXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NDkwMDgsImV4cCI6MjEwNzIyNTAwOH0.hH_v0zyTeRYsAPNMrcjnOe2YWbcGCEhy1u3bcf4jFtQ';

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const online = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const game = BingoGame;
  const requestedCode = game.routeCode(location.href);
  const letters = 'BINGO';
  const letter = n => letters[Math.floor((n - 1) / 15)];
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const sessionKey = online ? 'bingo-session-online' : 'bingo-session-demo';
  let session = read(sessionKey, {}), state = null, busy = false, autoTimer = null, pollBusy = false, sound = false, lastSeen = 0, revealTimer, toastTimer, revision = 0;
  let view = 'entry', selectedRoom = null, hostUser = null, demoHost = false, hostRooms = [];
  let presenting = false, nativePresentation = false;
  let drawAnimation = null, spinTimer = null;
  const visibleDrawn = () => drawAnimation ? drawAnimation.previous : (state?.drawn ?? []);
  const visibleBall = () => drawAnimation ? drawAnimation.candidate : visibleDrawn().at(-1);
  const visibleCandidates = () => ['spin','slowing','reveal'].includes(drawAnimation?.phase) ? [drawAnimation.candidate] : [];
  function cancelDrawAnimation(){
    clearTimeout(spinTimer);clearTimeout(revealTimer);drawAnimation=null;spinTimer=null;
    $('reveal').hidden=true;
    for(const ball of [$('last-ball'),document.querySelector('.presentation-ball')])ball?.classList.remove('is-spinning','is-slowing');
  }
  const auth = online ? createBingoAuth({url:SUPABASE_URL,key:SUPABASE_ANON_KEY,onInvalid:()=>{
    hostUser=null;hostRooms=[];stopAuto();if(view==='host')setView('entry');else render();
  }}) : null;
  const canHost = () => online ? Boolean(hostUser) : demoHost;
  let roundAction = 'restart', roundDialogContext = null;
  session.players ??= {};
  if (session.playerCode && session.playerToken) session.players[session.playerCode] = session.playerToken;
  const randomIndex = max => { const a = new Uint32Array(1); const limit = Math.floor(4294967296 / max) * max; do { crypto.getRandomValues(a); } while (a[0] >= limit); return a[0] % max; };
  const token = () => { const a = crypto.getRandomValues(new Uint8Array(16)); a[6] = (a[6] & 15) | 64; a[8] = (a[8] & 63) | 128; return [...a].map((v,i) => ([4,6,8,10].includes(i) ? '-' : '') + v.toString(16).padStart(2,'0')).join(''); };
  function card() { const columns = Array.from({length:5}, (_,c) => { const pool = Array.from({length:15}, (_,i) => c*15+i+1); return Array.from({length:5}, () => pool.splice(randomIndex(pool.length),1)[0]).sort((a,b)=>a-b); }); return Array.from({length:25},(_,i)=> i===12 ? 0 : columns[i%5][Math.floor(i/5)]); }
  function notify(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(()=> $('toast').hidden = true, 4500); }
  function snapshot(room, playerToken) { game.normalize(room); return {code:room.code,title:room.title,drawn:room.drawn,round:room.round,stages:room.stages,stage:room.stage,awards:room.awards,winner:room.winner?`${room.round}:${room.stage}`:null,players:room.players.map(p=>({name:p.name,winner:p.token===room.winner})),card:room.players.find(p=>p.token===playerToken)?.card ?? null,name:room.players.find(p=>p.token===playerToken)?.name ?? null}; }
  async function api(action, payload = {}) {
    if (online) {
      const headers = {'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY};
      const hostAction=['create','rooms','adopt','draw','advance','restart','configure'].includes(action)||payload.as_host;
      const ownerAtStart=hostAction?auth.session()?.user?.id:null;
      if(hostAction){const jwt=await auth.accessToken();if(!jwt)throw new Error('Inicia sesión como organizador.');headers.Authorization=`Bearer ${jwt}`;}
      else if (SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
      const response = await fetch(`${SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/bingo_api`, {method:'POST',headers,body:JSON.stringify({p_action:action,p_data:payload}),signal:AbortSignal.timeout(12000)});
      const data = await response.json(); if (!response.ok) {const error=new Error(data.message || 'No se pudo conectar con la sala.');error.code=data.code;error.status=response.status;throw error;}
      if(hostAction&&(!auth.session()||auth.session().user.id!==ownerAtStart))throw new Error('La sesión cambió. Vuelve a ingresar al panel.');
      return data;
    }
    const rooms = read('bingo-demo-rooms', {});
    if(action==='rooms')return Object.values(rooms).filter(r=>r.host===session.hostToken).map(r=>({code:r.code,title:r.title}));
    if(action==='lookup'){const found=rooms[payload.code];if(!found)throw new Error('No encontramos esa sala. Revisa el código.');return {code:found.code,title:found.title,open:found.drawn.length===0};}
    if(['create','draw','advance','restart','configure'].includes(action)&&!demoHost)throw new Error('Abre el panel de demostración.');
    if (action === 'create') { if(!game.validStages(payload.stages)) throw new Error('Selecciona un estilo de juego válido.'); let code; const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; do { code = Array.from({length:6},()=> alphabet[randomIndex(alphabet.length)]).join(''); } while (rooms[code]); rooms[code] = {code,title:payload.title,host:payload.token,drawn:[],players:[],winner:null,round:1,stage:0,stages:payload.stages,awards:[]}; save('bingo-demo-rooms',rooms); return snapshot(rooms[code]); }
    const room = rooms[payload.code]; if (!room) throw new Error('No encontramos esa sala. Revisa el código.');
    game.mutate(room, action, payload, card, randomIndex);
    if(action!=='state') save('bingo-demo-rooms', rooms); return snapshot(room,payload.token);
  }
  const currentCode = () => view === 'host' ? session.hostCode : view==='player' ? session.playerCode : null;
  const currentToken = () => view === 'host' ? session.hostToken : session.playerToken;
  function setView(next) { if(next==='host'&&!canHost()){openLogin();return;}if(presenting)leavePresentation();stopAuto(); revision++;cancelDrawAnimation();view=next; state=null; lastSeen=0;render(); refresh(); }
  function renderPresentation(){
    if(!presenting)return;
    const drawn=visibleDrawn(),latest=visibleBall();
    $('presentation-board').replaceChildren(...Array.from($('number-board').children, row=>row.cloneNode(true)));
    $('presentation-count').textContent=`${drawn.length} / 75`;
    $('presentation-letter').textContent=latest?letter(latest):'BINGO';
    $('presentation-number').textContent=latest??'—';
    $('presentation-code').textContent=state?.code??'———';
    $('presentation-last').disabled=busy||drawAnimation?.phase==='reveal'||!state||Boolean(state.winner)||drawn.length===75;
    const presentationBall=document.querySelector('.presentation-ball');
    presentationBall?.classList.toggle('is-spinning',drawAnimation?.phase==='spin');
    presentationBall?.classList.toggle('is-slowing',drawAnimation?.phase==='slowing');
    $('presentation-caption').textContent=drawAnimation?.phase==='spin'?'Pulsa otra vez para detener y elegir':drawAnimation?.phase==='slowing'?'La ruleta está frenando…':state?.winner?`¡Premio para ${state.players.find(p=>p.winner)?.name??'el ganador'}!`:latest?`¡Salió el ${latest}!`:'La suerte está por llegar';
    $('presentation-history').replaceChildren();
    if(!drawn.length){const p=document.createElement('p');p.textContent='Aquí aparecerán todas las bolillas sorteadas.';$('presentation-history').append(p);}
    for(const n of [...drawn].reverse()){const ball=document.createElement('div');ball.className='mini-ball';const small=document.createElement('small');small.textContent=letter(n);ball.append(small,document.createTextNode(n));$('presentation-history').append(ball);}
  }
  function closePresentation(){presenting=false;nativePresentation=false;$('presentation').hidden=true;document.body.classList.remove('projecting');$('fullscreen').setAttribute('aria-pressed','false');$('fullscreen').focus();}
  async function leavePresentation(){
    const shouldExit=Boolean(document.fullscreenElement);
    closePresentation();
    if(shouldExit){try{await document.exitFullscreen();}catch{/* La vista normal ya está restaurada. */}}
  }
  async function enterPresentation(){
    if(!canHost()||view!=='host'||!state){notify('Selecciona o crea una sala antes de proyectar.');return;}
    presenting=true;$('reveal').hidden=true;$('presentation').hidden=false;
    document.body.classList.add('projecting');$('fullscreen').setAttribute('aria-pressed','true');renderPresentation();$('presentation').focus();
    try{if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();nativePresentation=true;}}
    catch{/* Si el navegador no admite fullscreen, la misma vista ocupa la ventana. */}
  }
  function renderAccess(){
    $('host-view').hidden=view!=='host'||!canHost();$('player-view').hidden=view==='host';
    $('game-toolbar').hidden=view==='entry';$('host-tab').hidden=!canHost();
    $('host-tab').classList.toggle('active',view==='host');$('player-tab').classList.toggle('active',view==='player');
    $('new-room').hidden=view!=='host';$('logout').hidden=!canHost();
    $('account-email').textContent=canHost()?(online?hostUser.email:'Panel de demostración'):'';
    document.body.classList.toggle('entry-screen',view==='entry');
    for(const id of ['organizer-login','host-create','logout','host-rooms','leave-room','change-code'])$(id).disabled=busy;
  }
  function resetEntry(){selectedRoom=null;$('code-form').hidden=false;$('join-form').hidden=true;$('entry-message').textContent='';setView('entry');if(location.protocol!=='file:')history.replaceState(null,'','/');}
  function openLogin(){
    stopAuto();$('login-error').textContent='';$('login-password').value='';
    $('login-email').disabled=!online;$('login-password').disabled=!online;$('login-submit').hidden=!online;$('demo-host').hidden=online;
    $('login-note').textContent=online?'Usa tu cuenta de organizador. Los jugadores no necesitan iniciar sesión.':'Configura Supabase para iniciar sesión. Mientras tanto puedes probar el panel en modo demostración local.';
    if(!$('login-dialog').open)$('login-dialog').showModal();
  }
  async function loadHostRooms(){
    hostRooms=await api('rooms');
    if(online&&session.hostCode&&session.hostToken&&!hostRooms.some(r=>r.code===session.hostCode)){
      try{await api('adopt',{code:session.hostCode,token:session.hostToken});delete session.hostToken;save(sessionKey,session);hostRooms=await api('rooms');}catch(error){if(error.code!=='P0001')throw error;/* Una sala ya vinculada nunca se transfiere a otra cuenta. */}
    }
    const oldCode=session.hostCode;
    if(!hostRooms.some(r=>r.code===session.hostCode))session.hostCode=hostRooms[0]?.code;
    // Conserva el token antiguo si la migración falló por una desconexión.
    if(!session.hostCode&&session.hostToken)session.hostCode=oldCode;
    $('host-rooms').replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=hostRooms.length?'Selecciona una sala':'Todavía no tienes salas';$('host-rooms').append(empty);
    hostRooms.forEach(room=>{const option=document.createElement('option');option.value=room.code;option.textContent=`${room.title} · ${room.code}`;$('host-rooms').append(option);});
    if(!hostRooms.some(r=>r.code===session.hostCode))session.hostCode=null;
    $('host-rooms').value=session.hostCode??'';save(sessionKey,session);
  }
  async function enterHost(){
    if(online){const user=await auth.validate();if(!user){openLogin();return;}hostUser=user;}
    if(!canHost()){openLogin();return;}
    await loadHostRooms();$('login-dialog').close();setView('host');
    if(session.hostCode)accept(await api('state',{code:session.hostCode,token:session.hostToken,as_host:true}),false);
    if(location.protocol!=='file:')history.replaceState(null,'','/');
  }
  async function findRoom(code){
    $('entry-message').textContent='Buscando tu sala…';
    try{
      const room=await api('lookup',{code});
      session.players={...session.players,...read(sessionKey,{}).players};
      const savedToken=session.players[code];
      if(savedToken){
        try{const next=await api('state',{code,token:savedToken});
          session.playerCode=code;session.playerToken=savedToken;save(sessionKey,session);view='player';state=null;accept(next,false);
          if(location.protocol!=='file:')history.replaceState(null,'',game.invitation(location.href,code));return;
        }catch(error){if(!error.message.includes('Debes unirte a la sala'))throw error;}
      }
      selectedRoom=room;
      if(!room.open){$('entry-message').textContent='La sala existe, pero la ronda ya comenzó. Podrás unirte cuando el organizador la reinicie.';return;}
      $('entry-message').textContent='¡Sala encontrada! Solo falta tu nombre.';$('join-room-title').textContent=`${room.title} · ${room.code}`;
      $('code-form').hidden=true;$('join-form').hidden=false;$('player-name').focus();
    }catch(error){$('entry-message').textContent=error.message;throw error;}
  }
  const context = () => ({round:state?.round,stage:state?.stage});
  const activePattern = () => state?.stages?.[state.stage] ?? 'full';
  const hasNext = () => state && state.stage < state.stages.length - 1;
  function renderAwards(target) {
    $(target).replaceChildren();
    for(const award of state?.awards ?? []) {const el=document.createElement('span');el.className='award';el.textContent=`🏆 ${game.patterns[award.pattern]?.name ?? award.pattern}: ${award.name}`;$(target).append(el);}
  }
  function renderRound() {
    const pattern=game.patterns[activePattern()];
    $('round-label').textContent=state?`RONDA ${state.round} · SALA ${state.code}`:'UNA SALA, TODAS LAS RONDAS';
    $('stage-title').textContent=state?pattern.name:'Elige cómo jugar';
    $('stage-description').textContent=state?.winner?(hasNext()?'Premio entregado. Continúa al cartón completo con las mismas bolillas.':'¡Ronda terminada! Reinicia aquí y todos conservan su cartón.'):pattern.description;
    $('stage-steps').replaceChildren();
    (state?.stages??[]).forEach((key,i)=>{const el=document.createElement('span');const won=state.awards.some(a=>a.stage===i);el.className=`stage-step${i===state.stage?' active':''}${won?' complete':''}`;el.textContent=`${won?'✓':i+1} ${game.patterns[key].name}`;$('stage-steps').append(el);});
    $('configure').disabled=busy||!state||Boolean(state.drawn.length)||Boolean(state.winner);
    $('restart').disabled=busy||!state;
    $('advance').hidden=!state?.winner||!hasNext();$('advance').disabled=busy;
    renderAwards('awards');renderAwards('player-awards');
    if(state?.card){
      $('player-round').textContent=`RONDA ${state.round} · PREMIO ${state.stage+1} DE ${state.stages.length}`;
      $('player-stage-title').textContent=pattern.name;$('claim-rule').textContent=pattern.description;
      const ready=game.matches(state.card,visibleDrawn(),activePattern());
      $('claim').textContent=state.winner?'Premio entregado ✓':`${pattern.button} ✦`;
      $('claim').classList.toggle('ready',ready&&!state.winner);
      $('claim-status').textContent=state.winner?(hasNext()?'Espera al anfitrión para continuar al cartón completo.':'Ronda terminada. Tu cartón seguirá aquí cuando reinicien.'):(ready?'¡Lo tienes! Pulsa el botón para reclamar tu premio.':'Los números se marcan solos. Reclama cuando completes la figura.');
    }
  }
  function render() {
    renderAccess();
    for(const id of ['host-tab','player-tab','new-room','invite']) $(id).disabled=busy;
    document.querySelectorAll('button[type="submit"]').forEach(button=>button.disabled=busy);
    const drawn = visibleDrawn(), latest = visibleBall();
    $('number-board').replaceChildren();
    const candidates=visibleCandidates();
    for(let c=0;c<5;c++) { const row=document.createElement('div'); row.className='number-row'; const label=document.createElement('b'); label.className='row-letter'; label.textContent=letters[c]; row.append(label); for(let i=1;i<=15;i++){const n=c*15+i, cell=document.createElement('span');cell.className=`number${drawn.includes(n)?' drawn':''}${n===latest&&!drawAnimation?' latest':''}${candidates.includes(n)?' scanning':''}`;cell.textContent=n;cell.setAttribute('aria-label',`${n}${drawn.includes(n)?', ya salió':', por salir'}`);row.append(cell);} $('number-board').append(row); }
    $('draw-count').textContent=drawn.length; $('remaining').textContent=`${75-drawn.length} por descubrir`;
    $('room-label').textContent=state ? `${state.title} · ${state.code}` : 'Tu próxima gran partida';
    $('last-ball').querySelector('small').textContent=latest?letter(latest):'¿LISTOS?'; $('last-ball').querySelector('strong').textContent=latest??'?';
    $('last-ball').classList.toggle('is-spinning',drawAnimation?.phase==='spin');
    $('last-ball').classList.toggle('is-slowing',drawAnimation?.phase==='slowing');
    $('draw-title').textContent=drawAnimation?.phase==='spin'?'La ruleta está girando…':drawAnimation?.phase==='slowing'?'La ruleta está frenando…':state?.winner?'¡Tenemos bingo!':latest?`¡Salió el ${latest}!`:'La suerte está por llegar';
    $('draw-caption').textContent=state?.winner?'Una ronda de aplausos para quien ganó.':drawn.length===75?'Todas las bolillas están en el tablero.':'Una bolilla puede cambiarlo todo.';
    $('draw').textContent=drawAnimation?.phase==='spin'?'◆  Detener y elegir':'✦  Sacar un número';
    $('draw').disabled=busy || drawAnimation?.phase==='reveal' || drawn.length===75 || Boolean(state?.winner) || Boolean(session.hostCode&&!state); $('auto').disabled=busy || drawn.length===75 || Boolean(state?.winner) || Boolean(session.hostCode&&!state);
    $('history').replaceChildren(); if(!drawn.length){const p=document.createElement('p');p.textContent='Aquí aparecerán los números que vayan saliendo.';$('history').append(p);} else drawn.slice(-10).reverse().forEach(n=>{const ball=document.createElement('div');ball.className='mini-ball';const small=document.createElement('small');small.textContent=letter(n);ball.append(small,document.createTextNode(n));$('history').append(ball);});
    $('people').replaceChildren(); const players=state?.players??[]; $('player-count').textContent=`${players.length} JUGADORES`;
    if(!players.length){const p=document.createElement('p');p.textContent='Falta lo mejor: tu gente.';$('people').append(p);}
    players.forEach(p=>{const el=document.createElement('div');el.className=`person${p.winner?' winner':''}`;const a=document.createElement('span');a.className='avatar';a.textContent=p.name.slice(0,1).toUpperCase();el.append(a,document.createTextNode(p.name+(p.winner?' · ¡BINGO! 🏆':'')));$('people').append(el);});
    const hasCard=view==='player' && Boolean(state?.card); $('join-panel').hidden=hasCard; $('card-panel').hidden=!hasCard;
    if(hasCard){$('card-room').textContent=`SALA ${state.code} · ${state.title}`;$('card-name').textContent=`¡Vamos, ${state.name}!`;$('player-card').replaceChildren();state.card.forEach(n=>{const el=document.createElement('div');el.className=`card-cell${!n||drawn.includes(n)?' marked':''}${!n?' free':''}`;el.textContent=n||'✦';el.setAttribute('aria-label',n?`${n}${drawn.includes(n)?', marcado':''}`:'Centro libre');$('player-card').append(el);});const count=state.card.filter(n=>n&&drawn.includes(n)).length;$('card-progress').textContent=`${count} de 24 números marcados`;$('claim').disabled=busy||Boolean(drawAnimation)||Boolean(state.winner);}
    $('player-latest').textContent=drawAnimation?.phase==='spin'?`Sorteando… ${letter(latest)} · ${latest}`:latest?`Última bolilla: ${letter(latest)} · ${latest}`:'Esperando la primera bolilla…';
    renderRound();
    renderPresentation();
  }
  function showNumber(n) {
    clearTimeout(spinTimer);spinTimer=null;
    const animation=drawAnimation??{previous:state.drawn.slice(0,-1)};
    drawAnimation=animation;animation.phase='reveal';animation.number=n;animation.candidate=n;
    $('reveal-letter').textContent=letter(n);$('reveal-number').textContent=n;$('reveal').hidden=false;$('reveal-close').focus();
    if(sound&&'speechSynthesis' in window){speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(`${letter(n)}. ${n}`);utterance.lang='es-CL';speechSynthesis.speak(utterance);}
    render();
  }
  function prepareWheelBrake(){
    if(typeof getComputedStyle!=='function')return;
    for(const ball of [$('last-ball'),document.querySelector('.presentation-ball')]){
      if(!ball)continue;
      const transform=getComputedStyle(ball,'::before').transform;
      const values=transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(',').map(Number);
      const matrix3d=transform.match(/^matrix3d\(([^)]+)\)$/)?.[1].split(',').map(Number);
      const cosine=values?.[0] ?? matrix3d?.[0];
      const sine=values?.[1] ?? matrix3d?.[1];
      if(!Number.isFinite(cosine)||!Number.isFinite(sine))continue;
      ball.style.setProperty('--wheel-start',`${Math.atan2(sine,cosine)*180/Math.PI}deg`);
      ball.style.setProperty('--wheel-stop','calc(var(--wheel-start) + var(--wheel-brake-distance))');
    }
  }
  function startDrawSimulation(){
    if(!state||drawAnimation)return;
    const previous=[...state.drawn];
    const pool=Array.from({length:75},(_,i)=>i+1).filter(value=>!previous.includes(value));
    if(!pool.length)return;
    const animation={previous,pool,candidate:null,recent:[],phase:'spin',frame:0,round:state.round,stage:state.stage};
    const nextCandidate=()=>{
      const available=pool.filter(value=>!animation.recent.includes(value));
      const candidates=available.length?available:pool;
      animation.candidate=candidates[randomIndex(candidates.length)];
      animation.recent=[...animation.recent.slice(-4),animation.candidate];
    };
    nextCandidate();
    drawAnimation=animation;
    const tick=()=>{
      if(drawAnimation!==animation||animation.phase!=='spin')return;
      nextCandidate();
      animation.frame++;render();
      spinTimer=setTimeout(tick,globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?300:100);
    };
    render();spinTimer=setTimeout(tick,100);
  }
  const wait = delay => new Promise(resolve=>setTimeout(resolve,delay));
  async function slowToResult(animation, number) {
    prepareWheelBrake();
    animation.phase='slowing';
    clearTimeout(spinTimer);spinTimer=null;
    const options=animation.pool.filter(value=>value!==number);
    const delays=[120,150,190,240,300,380,470,580,700,850];
    for(const delay of delays){
      const available=options.filter(value=>value!==animation.candidate);
      animation.candidate=available.length?available[randomIndex(available.length)]:number;
      animation.frame++;render();
      await wait(delay);
    }
    animation.candidate=number;animation.frame++;render();
    await wait(650);
    showNumber(number);
  }
  function confetti(){for(let i=0;i<55;i++){const el=document.createElement('i');el.className='celebration';el.style.left=`${randomIndex(100)}%`;el.style.background=['#ee715b','#bba2d3','#e7c267','#83a58d'][i%4];el.style.animationDelay=`${Math.random()*.6}s`;document.body.append(el);setTimeout(()=>el.remove(),4000);}}
  function accept(next, animate=true){
    const previous=state;
    const restarted=previous&&next.round!==previous.round;
    const transitioned=previous&&next.stage!==previous.stage;
    const won=next.winner && next.winner!==previous?.winner;
    const newNumber=next.drawn.length>lastSeen;
    state=next;lastSeen=next.drawn.length;
    if(restarted||transitioned||next.winner){stopAuto();cancelDrawAnimation();if('speechSynthesis' in window)speechSynthesis.cancel();}
    if(restarted){render();notify(`¡Ronda ${next.round}! Conservas tu cartón; empezamos de nuevo.`);}
    else if(animate&&newNumber&&!next.winner)showNumber(next.drawn.at(-1));else if($('reveal').hidden)render();
    if(transitioned&&!restarted)notify(`Ahora jugamos por ${game.patterns[activePattern()].name.toLowerCase()}.`);
    if(won){stopAuto();confetti();notify(`¡${game.patterns[activePattern()].name}! Ganó ${next.players.find(p=>p.winner)?.name ?? 'un jugador'}.`);}
  }
  async function refresh(){if(!currentCode()||pollBusy||busy)return;pollBusy=true;const code=currentCode(), selectedView=view, startedRevision=revision;try{const next=await api('state',{code,token:currentToken(),as_host:view==='host'});if(code===currentCode()&&view===selectedView&&startedRevision===revision){accept(next,Boolean(state));$('connection').textContent=online?'● Sala conectada · actualiza cada 2 s':'● Modo demo · en este navegador';}}catch(error){$('connection').textContent='● No se pudo actualizar · reintentando';}finally{pollBusy=false;}}
  async function execute(fn){if(busy)return;busy=true;revision++;render();let failed=false;try{await fn();}catch(error){failed=true;cancelDrawAnimation();if(presenting)await leavePresentation();notify(error.message || 'Ocurrió un problema. Inténtalo otra vez.');stopAuto();}finally{busy=false;if($('reveal').hidden)render();if(failed)refresh();}}
  function stopAuto(){clearTimeout(autoTimer);autoTimer=null;$('auto').textContent='▷ Automático';}
  async function draw(){
    if(busy||drawAnimation?.phase==='reveal')return;
    if(!session.hostCode){$('create-dialog').showModal();return;}if(!state)return;
    if(!drawAnimation){startDrawSimulation();return;}
    const simulation=drawAnimation;
    await execute(async()=>{
      const next=await api('draw',{code:session.hostCode,token:session.hostToken,round:simulation.round,stage:simulation.stage});
      accept(next,false);
      await slowToResult(simulation,next.drawn.at(-1));
    });
  }
  $('draw').onclick=draw;
  $('auto').onclick=()=>{if(autoTimer){stopAuto();return;}if(!session.hostCode){$('create-dialog').showModal();return;}$('auto').textContent='Ⅱ Pausar';const tick=async()=>{await draw();if(autoTimer&&!state?.winner&&state?.drawn.length<75){autoTimer=setTimeout(tick,6500);}else stopAuto();};autoTimer=setTimeout(tick,0);};
  $('host-tab').onclick=()=>execute(enterHost);$('player-tab').onclick=()=>{const code=session.hostCode;resetEntry();if(code)$('room-code').value=code;};
  $('organizer-login').onclick=()=>{if(canHost()||auth?.session())execute(enterHost);else openLogin();};
  $('login-form').onsubmit=e=>{e.preventDefault();if(!online)return;execute(async()=>{try{$('login-error').textContent='';await auth.signIn($('login-email').value.trim(),$('login-password').value);$('login-password').value='';await enterHost();}catch(error){$('login-error').textContent=error.message;throw error;}});};
  $('demo-host').onclick=()=>execute(async()=>{if(online)return;demoHost=true;await enterHost();});
  $('logout').onclick=()=>execute(async()=>{stopAuto();demoHost=false;hostUser=null;hostRooms=[];resetEntry();if(online){try{await auth.signOut();}catch{notify('Sesión cerrada en este navegador. No se pudo confirmar el cierre remoto.');}}});
  $('host-rooms').onchange=()=>execute(async()=>{stopAuto();cancelDrawAnimation();session.hostCode=$('host-rooms').value||null;save(sessionKey,session);state=null;lastSeen=0;if(session.hostCode)accept(await api('state',{code:session.hostCode,token:session.hostToken,as_host:true}),false);});
  $('host-create').onclick=()=>{if(canHost())$('create-dialog').showModal();else openLogin();};
  $('create-form').onsubmit=e=>{e.preventDefault();if(!canHost()){openLogin();return;}const title=$('party-name').value.trim();if(!title)return;execute(async()=>{const hostToken=session.hostToken??token();const next=await api('create',{title,token:hostToken,stages:game.presets[$('create-style').value]});session.hostCode=next.code;if(!online)session.hostToken=hostToken;save(sessionKey,session);$('create-dialog').close();stopAuto();cancelDrawAnimation();view='host';state=null;lastSeen=0;accept(next,false);await loadHostRooms();if(location.protocol!=='file:')history.replaceState(null,'','/');notify(`Sala ${next.code} creada. Invita a todos antes de sortear.`);});};
  $('code-form').onsubmit=e=>{e.preventDefault();execute(()=>findRoom($('room-code').value.trim().toUpperCase()));};
  $('change-code').onclick=resetEntry;$('leave-room').onclick=resetEntry;
  $('join-form').onsubmit=e=>{e.preventDefault();const name=$('player-name').value.trim(),code=selectedRoom?.code;if(!name||!code)return;execute(async()=>{const playerToken=session.players[code]??token();session.players[code]=playerToken;save(sessionKey,session);const next=await api('join',{name,code,token:playerToken});session.playerToken=playerToken;session.playerCode=code;save(sessionKey,session);view='player';state=null;accept(next,false);if(location.protocol!=='file:')history.replaceState(null,'',game.invitation(location.href,code));notify('¡Ya tienes tu cartón! Que empiece la partida.');});};
  $('claim').onclick=()=>execute(async()=>accept(await api('claim',{code:session.playerCode,token:session.playerToken,...context()}),false));
  function openRound(action){
    if(!state)return;stopAuto();roundAction=action;roundDialogContext={code:session.hostCode,token:session.hostToken,...context()};
    $('round-style').value=Object.keys(game.presets).find(key=>JSON.stringify(game.presets[key])===JSON.stringify(state.stages))??'full';
    $('round-dialog-title').textContent=action==='restart'?'Reiniciar la ronda':'Estilo de juego';
    $('round-dialog-description').textContent=action==='restart'?'Se borrarán las bolillas y los premios de esta ronda. Todos conservan su cartón, su nombre y el mismo enlace. Nadie tiene que volver a entrar.':'Elige qué premios se jugarán, en orden. Puedes cambiar el estilo antes de sacar la primera bolilla.';
    $('round-submit').textContent=action==='restart'?'Reiniciar y conservar cartones ↻':'Guardar estilo de juego';$('round-dialog').showModal();
  }
  $('configure').onclick=()=>openRound('configure');$('restart').onclick=()=>openRound('restart');
  $('round-form').onsubmit=e=>{e.preventDefault();execute(async()=>{const next=await api(roundAction,{...roundDialogContext,stages:game.presets[$('round-style').value]});$('round-dialog').close();accept(next,false);});};
  $('advance').onclick=()=>{stopAuto();execute(async()=>accept(await api('advance',{code:session.hostCode,token:session.hostToken,...context()}),false));};
  $('new-room').onclick=()=>{stopAuto();if(canHost())$('create-dialog').showModal();else openLogin();};
  $('invite').onclick=()=>{if(!session.hostCode){$('create-dialog').showModal();return;}$('share-code').textContent=session.hostCode;$('share-link').value=game.invitation(location.href,session.hostCode);$('share-note').textContent=online?'El mismo enlace sirve para todas las rondas. Comparte este enlace público con tus invitados.':'Demo local: el enlace solo funciona en este navegador. Configura Supabase y publica el sitio para jugar desde otros teléfonos.';$('invite-dialog').showModal();};
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('share-link').value);notify('¡Enlace copiado!');}catch{$('share-link').select();notify('Selecciona y copia el enlace de la invitación.');}};
  document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>$(btn.dataset.close).close());
  $('sound').onclick=()=>{if(!('speechSynthesis' in window)){notify('Este navegador no dispone de voz.');return;}sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').querySelector('span').textContent=sound?'Sonido activado':'Sonido apagado';if(!sound)speechSynthesis.cancel();};
  $('fullscreen').onclick=enterPresentation;
  $('fullscreen').title='Proyectar solo el sorteo. Espacio: sacar bolilla. A: automático. Enter: siguiente premio. Esc: salir.';
  $('presentation-room').onclick=leavePresentation;
  $('presentation-last').onclick=draw;
  $('reveal-close').onclick=()=>{if(drawAnimation?.phase!=='reveal')return;cancelDrawAnimation();render();$('draw').focus();};
  document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement===document.documentElement&&presenting)nativePresentation=true;else if(nativePresentation)closePresentation();});
  document.addEventListener('keydown',event=>{
    if(!presenting||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='Escape'){event.preventDefault();leavePresentation();return;}
    if(event.code==='Space'){event.preventDefault();if(!busy&&!state?.winner&&state?.drawn.length<75)draw();}
    else if(event.key.toLowerCase()==='a'){event.preventDefault();if(!$('auto').disabled)$('auto').onclick();}
    else if(event.key==='Enter'&&state?.winner&&hasNext()){event.preventDefault();if(!busy)$('advance').onclick();}
  });
  $('connection').textContent=online?'● Supabase configurado':'● Modo demo · en este navegador';setView('entry');
  if(requestedCode){$('room-code').value=requestedCode;execute(()=>findRoom(requestedCode));}
  setInterval(refresh,2000);window.addEventListener('storage',event=>{
    if(online&&event.key===auth.storageKey&&auth.session()?.user?.id!==hostUser?.id){hostUser=null;hostRooms=[];stopAuto();if(view==='host')resetEntry();else render();}
    refresh();
  });document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
