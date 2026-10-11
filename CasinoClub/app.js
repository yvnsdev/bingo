(() => {
 'use strict';
 const $=id=>document.getElementById(id),URL_BASE='https://xpxpjdnsbfdexwzovmpn.supabase.co';
 const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhweHBqZG5zYmZkZXh3em92bXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NDkwMDgsImV4cCI6MjEwNzIyNTAwOH0.hH_v0zyTeRYsAPNMrcjnOe2YWbcGCEhy1u3bcf4jFtQ';
 const games={blackjack:'Blackjack',roulette:'Ruleta americana',craps:'Craps'},phases={betting:'Apuestas abiertas',playing:'Ronda en juego',settled:'Esperando la siguiente ronda'},statuses={waiting:'Esperando',bet:'Apuesta lista',playing:'Jugando',stand:'Plantado',bust:'Se pasó de 21',blackjack:'Mano terminada',win:'Ganó',loss:'Perdió',push:'Empate',refunded:'Apuesta devuelta'};
 const choices={red:'Rojo',black:'Negro',even:'Par',odd:'Impar',low:'1–18',high:'19–36'};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=n=>Number(n||0).toLocaleString('es-CL'),auth=createBingoAuth({url:URL_BASE,key:KEY,onInvalid:()=>{if(view==='admin'){show('entry');message('Tu sesión terminó. Vuelve a ingresar.')}}});
 let view='entry',code='',room=null,busy=false,polling=false,timer=null,generation=0,lastSnapshot='',online=false,mutationVersion=0;
 const storageKey=c=>`casino-participant:${c}`;
 function identity(c=code){try{return JSON.parse(localStorage.getItem(storageKey(c)))||{}}catch{return {}}}
 function message(text){$('message').textContent=text}
 function connection(ok){online=ok;$('connection').textContent=ok?'● En línea':'● Sin conexión · reintentando';$('connection').classList.toggle('disconnected',!ok)}
 function show(next){view=next;generation++;clearTimeout(timer);document.body.classList.toggle('projecting',next==='board');for(const id of ['entry','admin','participant','board'])$(id).hidden=id!==next;message('')}
 function invitation(){const url=new URL('./',document.baseURI);url.searchParams.set('sala',code);return url.href}
 async function api(action,data={},admin=false){
   const jwt=admin?await auth.accessToken():null;if(admin&&!jwt)throw Error('Inicia sesión como administrador.');
   const payload={code,token:view==='participant'?identity().token:undefined,...data};
   const mutation=!['state','lookup','rooms'].includes(action);if(mutation)payload.request_id??=crypto.randomUUID();
   let lastError;
   for(let attempt=0;attempt<2;attempt++)try{
     const response=await fetch(`${URL_BASE}/rest/v1/rpc/casino_api`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${jwt||KEY}`,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:payload}),signal:AbortSignal.timeout(12000)});
     const result=await response.json();
     if(!response.ok){const err=Error(result.code==='PGRST202'?'Las salas de casino todavía no están activadas en la base de datos. Falta ejecutar CasinoClub/supabase.sql.':result.message||'No se pudo completar la operación.');err.server=true;throw err}
     connection(true);return result;
   }catch(error){lastError=error;if(error.server)throw error}
   connection(false);throw Error('No pudimos confirmar la operación. Espera a que la mesa vuelva a conectarse. '+(lastError?.name==='TimeoutError'?'El servidor tardó demasiado.':''));
 }
 function accept(value){if(!value?.code)return;if(room?.code!==value.code)$('game-choice').value=value.game;room=value;code=value.code;const snapshot=JSON.stringify(value);if(snapshot!==lastSnapshot){lastSnapshot=snapshot;render()}}
 function disable(){document.querySelectorAll('button,input,select').forEach(el=>el.disabled=busy);if(view==='admin'&&room){const betting=room.phase==='betting',playing=room.phase==='playing';$('open-bets').disabled=busy||room.phase!=='settled'||!online;$('game-choice').disabled=busy||room.phase!=='settled';$('start-round').disabled=busy||!betting||!room.players.some(p=>p.active&&p.stake>0)||!online;$('resolve-round').disabled=busy||!playing||!online||(room.game==='blackjack'&&room.players.some(p=>p.status==='playing'));$('cancel-round').disabled=busy||room.phase==='settled'||!online;document.querySelectorAll('[data-active]').forEach(el=>{const p=room.players.find(p=>p.id===el.dataset.active);el.disabled=busy||(room.phase!=='settled'&&p.stake>0)})}if(view==='participant'&&room){const me=room.me,canBet=me?.active&&room.phase==='betting'&&online;document.querySelectorAll('#bet-form button,#bet-form input,#bet-form select').forEach(el=>el.disabled=busy||!canBet);$('hit').disabled=$('stand').disabled=busy||!online||!me?.active||me.status!=='playing'||room.game!=='blackjack';$('withdraw-bet').disabled=busy||!canBet||!me?.stake}}
 async function run(fn){if(busy)return;busy=true;mutationVersion++;disable();message('');try{await fn()}catch(error){message(error.message)}finally{busy=false;disable();if(code&&view!=='entry')schedulePoll(0)}}
 function schedulePoll(delay=1400){clearTimeout(timer);const version=generation;timer=setTimeout(async()=>{if(version!==generation||!code||view==='entry')return;if(busy||polling){schedulePoll();return}const started=mutationVersion;polling=true;try{const data=await api('state',{},view==='admin');if(version===generation&&started===mutationVersion&&!busy&&data.code===code){accept(data);disable()}}catch(error){if(version===generation&&started===mutationVersion){connection(false);message(error.message);disable()}}finally{polling=false;if(version===generation)schedulePoll()}},delay)}
 async function command(action,data={}){const rolling=action==='resolve'&&room?.game==='craps';const request=()=>api(action,{round:room?.round,...data},view==='admin');const next=rolling?await CasinoCraps.animateRoll(request):await request();accept(next);if(rolling)CasinoCraps.settleDice()}
 function cards(hand){return (hand||[]).map(value=>{if(value===null)return '<div class="card back" aria-label="Carta de la banca oculta">♠</div>';const n=(value-1)%52,rank=n%13+1,suit=['♠','♥','♦','♣'][Math.floor(n/13)];return `<div class="card ${suit==='♥'||suit==='♦'?'red':''}"><span>${({1:'A',11:'J',12:'Q',13:'K'})[rank]||rank}</span><b>${suit}</b></div>`}).join('')}
 function paintTable(stage,playerList,game,phase,result,players){
   if(result.cancelled)stage.innerHTML='<h2>Ronda cancelada</h2><p>Todas las apuestas fueron devueltas.</p>';
   else if(game==='blackjack')stage.innerHTML=`<h2>BANCA ${phase==='settled'&&room.dealer.length?'· '+room.dealer_total:''}</h2><div class="hand">${cards(room.dealer)}</div><p>${phase==='betting'?'Haz tu apuesta desde el teléfono.':phase==='playing'?'Cada participante decide desde su teléfono. Las cartas de los jugadores son privadas.':'Blackjack paga 3:2 · La banca se planta en todos los 17.'}</p>`;
   else if(game==='roulette')CasinoRoulette.render(stage,phase,result,code+':'+room.round);
   else CasinoCraps.render(stage,phase,result,room.point);
   playerList.innerHTML=players.filter(p=>p.active||p.stake>0).map(p=>`<article class="player-seat"><h3>${esc(p.name)}</h3><strong>${fmt(p.stake)}</strong><p>apostadas${['roulette','craps'].includes(game)&&p.stake?' · '+esc(choices[p.choice]||'N.º '+p.choice):''}</p><p>Saldo ${fmt(p.balance)}</p><span class="seat-status">${statuses[p.status]}${(phase==='settled'||['win','loss','push'].includes(p.status))&&p.stake?' · Recibe '+fmt(p.payout):''}</span></article>`).join('')||'<p>Esperando participantes…</p>';
 }
 function renderAdminBoard(players,game,phase,result,total){
   const selected=phase==='settled'?$('game-choice').value:game;
   $('admin-board-game').textContent=games[selected];$('admin-board-code').textContent=code;
   $('admin-board-phase').textContent=`RONDA ${room.round} · ${phases[phase]}`;$('admin-board-pot').textContent=`${fmt(total)} FICHAS EN LA MESA`;
   paintTable($('admin-board-stage'),$('admin-board-players'),selected,phase,selected===game?result:{},players);
 }
 function render(){
   if(!room)return;const {players,game,phase,result}=room,total=players.reduce((s,p)=>s+Number(p.stake),0);
   if(view==='admin'){
     $('host-controls').hidden=false;$('admin-code').textContent=code;const link=new URL(invitation());link.searchParams.set('vista','pantalla');$('open-board').href=link.href;
     if(phase!=='settled')$('game-choice').value=game;
     $('host-help').textContent=`Ronda ${room.round} · ${phases[phase]} · ${fmt(total)} fichas apostadas. ${game==='blackjack'&&phase==='playing'?'Espera a que todos se planten; puedes plantar a un jugador desconectado.':game==='craps'&&phase==='playing'?'Lanza los dados para toda la mesa. La apuesta se mantiene hasta resolver el punto.':''}`;
     renderAdminBoard(players,game,phase,result,total);
     $('resolve-round').textContent=game==='craps'?'Lanzar dados':game==='roulette'?'Sortear número':'Resolver banca';$('toggle-room').textContent=room.accepting?'Cerrar acceso':'Abrir acceso';
     $('roster').innerHTML=players.length?players.map(p=>`<article class="roster-row"><div><strong>${esc(p.name)}</strong><span>${p.active?statuses[p.status]:'Suspendido'}</span></div><span>SALDO<b>${fmt(p.balance)}</b></span><span>APOSTADO<b>${fmt(p.stake)}</b>${['roulette','craps'].includes(game)&&p.stake?esc(choices[p.choice]||'N.º '+p.choice):''}</span><div class="roster-actions"><button data-grant="${p.id}" ${!p.active?'disabled':''}>Entregar fichas</button>${game==='blackjack'&&p.status==='playing'?`<button data-stand="${p.id}">Plantar</button>`:''}<button data-active="${p.id}">${p.active?'Suspender':'Reactivar'}</button></div></article>`).join(''):'<p>Comparte la invitación. Los participantes aparecerán aquí.</p>';
     $('ledger').innerHTML=(room.ledger||[]).map(l=>`<p>${esc(l.name)} · ${Number(l.amount)>0?'+':''}${fmt(l.amount)} · ${esc(l.reason)} · Ronda ${l.round}</p>`).join('')||'<p>Todavía no hay movimientos.</p>';
   }
   if(view==='participant'){
     const p=room.me;if(!p){show('entry');message('Vuelve a entrar a la sala desde este dispositivo.');return}
     $('craps-choices').hidden=game!=='craps';
     $('player-room').textContent=`SALA ${code} · ${room.title}`;$('player-name').textContent=p.name;$('player-balance').textContent=fmt(p.balance);$('player-game').textContent=games[game];$('player-phase').textContent=!p.active?'Tu lugar está suspendido':phases[phase];
     $('player-info').textContent=`Ronda ${room.round} · ${fmt(p.stake)} fichas apostadas${game==='blackjack'&&p.hand.length?` · Tu mano: ${p.total}`:''} · ${statuses[p.status]||''}`;
     $('personal-hand').innerHTML=game==='blackjack'?cards(p.hand):'';$('personal-hand').hidden=game!=='blackjack'||!p.hand.length;
     $('blackjack-actions').hidden=game!=='blackjack'||phase!=='playing'||p.status!=='playing';$('bet-form').hidden=phase!=='betting'||!p.active;$('roulette-choices').hidden=game!=='roulette';
     $('bet-rules').textContent=game==='blackjack'?'Blackjack paga 3:2. Banca plantada en todos los 17.':game==='roulette'?'Elige una casilla y confirma tus fichas. Pleno 35:1 · exteriores 1:1. El 0 y el 00 pierden en exteriores.':'Una zona por jugador y ronda. Come/Don’t Come esperan el punto. Place 6/8: múltiplos de 30. Field: 2 y 12 pagan doble.';
     $('personal-result').textContent=(phase==='settled'||['win','loss','push'].includes(p.status))&&p.stake?`${statuses[p.status]} · Recibes ${fmt(p.payout)} fichas`:game==='craps'&&phase==='playing'?`Punto: ${room.point||'salida'}${result.dice?' · Último tiro: '+result.dice.join(' + '):''}`:phase==='playing'&&game==='roulette'?'Tu apuesta está en la mesa. Espera el sorteo.':'';
   }
   if(view==='board'){
     $('board-game').textContent=games[game];$('board-code').textContent=code;$('board-link').textContent=invitation();$('board-phase').textContent=`RONDA ${room.round} · ${phases[phase]}`;$('board-pot').textContent=`${fmt(total)} FICHAS EN LA MESA`;
     if(result.cancelled)$('board-stage').innerHTML='<h2>Ronda cancelada</h2><p>Todas las apuestas fueron devueltas.</p>';
     else if(game==='blackjack')$('board-stage').innerHTML=`<h2>BANCA ${phase==='settled'&&room.dealer.length?'· '+room.dealer_total:''}</h2><div class="hand">${cards(room.dealer)}</div><p>${phase==='betting'?'Haz tu apuesta desde el teléfono.':phase==='playing'?'Cada participante decide desde su teléfono. Las cartas de los jugadores son privadas.':'Blackjack paga 3:2 · La banca se planta en todos los 17.'}</p>`;
     else if(game==='roulette')CasinoRoulette.render($('board-stage'),phase,result,code+':'+room.round);
     else CasinoCraps.render($('board-stage'),phase,result,room.point);
     $('board-players').innerHTML=players.filter(p=>p.active||p.stake>0).map(p=>`<article class="player-seat"><h3>${esc(p.name)}</h3><strong>${fmt(p.stake)}</strong><p>apostadas${['roulette','craps'].includes(game)&&p.stake?' · '+esc(choices[p.choice]||'N.º '+p.choice):''}</p><p>Saldo ${fmt(p.balance)}</p><span class="seat-status">${statuses[p.status]}${(phase==='settled'||['win','loss','push'].includes(p.status))&&p.stake?' · Recibe '+fmt(p.payout):''}</span></article>`).join('')||'<p>Esperando participantes…</p>';
   }disable();
 }
 async function loadRooms(){const list=await api('rooms',{},true);$('rooms').innerHTML='<option value="">Selecciona una sala</option>'+list.map(r=>`<option value="${r.code}">${esc(r.title)} · ${r.code}</option>`).join('');if(code&&list.some(r=>r.code===code))$('rooms').value=code}
 async function adminEntry(){if(!await auth.validate()){$('login-dialog').showModal();return}show('admin');code='';room=null;$('host-controls').hidden=true;await loadRooms()}
 $('admin-entry').onclick=()=>run(adminEntry);
 $('login-form').onsubmit=e=>{e.preventDefault();run(async()=>{try{await auth.signIn($('email').value.trim(),$('password').value);$('password').value='';$('login-dialog').close();await adminEntry()}catch(error){$('login-error').textContent=error.message}})};
 $('close-login').onclick=()=>$('login-dialog').close();$('logout').onclick=()=>run(async()=>{await auth.signOut();show('entry');room=null;code=''});
 $('create-form').onsubmit=e=>{e.preventDefault();run(async()=>{accept(await api('create',{title:$('room-name').value.trim(),initial_funds:Number($('initial-funds').value)},true));await loadRooms();message('Sala creada. Comparte la invitación y abre las apuestas.')})};
 $('rooms').onchange=()=>run(async()=>{generation++;code=$('rooms').value;room=null;lastSnapshot='';$('host-controls').hidden=!code;if(code)accept(await api('state',{},true))});
 $('game-choice').addEventListener('change',()=>{if(room&&room.phase==='settled')renderAdminBoard(room.players,room.game,room.phase,room.result,room.players.reduce((sum,p)=>sum+Number(p.stake),0))});
 $('join-form').onsubmit=e=>{e.preventDefault();run(async()=>{const nextCode=$('join-code').value.trim().toUpperCase(),saved=identity(nextCode),token=saved.token||crypto.randomUUID();localStorage.setItem(storageKey(nextCode),JSON.stringify({token,name:$('join-name').value.trim()}));code=nextCode;const next=await api('join',{token,name:$('join-name').value.trim()});show('participant');lastSnapshot='';accept(next);history.replaceState(null,'',`?sala=${code}`)})};
 $('home').onclick=()=>{show('entry');code='';room=null;history.replaceState(null,'',location.pathname)};
 $('open-bets').onclick=()=>run(()=>command('open',{game:$('game-choice').value}));$('start-round').onclick=()=>run(()=>command('start'));$('resolve-round').onclick=()=>run(()=>command('resolve'));
 $('cancel-round').onclick=()=>{if(confirm('¿Cancelar la ronda y devolver todas las apuestas?'))run(()=>command('cancel'))};
 $('toggle-room').onclick=()=>run(()=>command('access',{accepting:!room.accepting}));$('grant-all').onclick=()=>run(()=>command('grant',{amount:Number($('grant-amount').value)}));
 $('roster').onclick=e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.grant||b.dataset.active||b.dataset.stand;if(!id)return;run(()=>command(b.dataset.grant?'grant':b.dataset.stand?'force_stand':'active',b.dataset.grant?{player_id:id,amount:Number($('grant-amount').value)}:b.dataset.stand?{player_id:id}:{player_id:id,active:!room.players.find(p=>p.id===id).active}))};
 $('copy-invite').onclick=()=>run(async()=>{try{await navigator.clipboard.writeText(invitation());message('Invitación copiada.')}catch{message(invitation())}});
 CasinoRoulette.mountBetting();
 CasinoCraps.mount();
 Object.entries(CasinoCraps.modes).forEach(([key,value])=>choices[key]=key.startsWith('place')?'Place '+value[0]:value[0]);
 $('game-choice').querySelector('[value="craps"]').textContent='Craps';
 $('game-choice').querySelector('[value="roulette"]').textContent=games.roulette;
 $('bet-form').onsubmit=e=>{e.preventDefault();run(()=>command('bet',{amount:Number($('wager').value),choice:room.game==='craps'?CasinoCraps.getChoice():$('bet-choice').value==='number'?String(Number($('bet-number').value)):$('bet-choice').value}))};
 $('withdraw-bet').onclick=()=>run(()=>command('bet',{amount:0}));$('hit').onclick=()=>run(()=>command('hit'));$('stand').onclick=()=>run(()=>command('stand'));
 document.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>$('wager').value=b.dataset.chip);
 $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{message('Usa la opción de pantalla completa del navegador.')}};
 // Move the actual host controls so permissions, disabled states and handlers
 // remain identical in the panel and in the fullscreen table.
 const tablePreview=$('admin-board-preview'),hostActions=document.querySelector('.host-actions');
 const actionsAnchor=document.createComment('Host controls position');hostActions.before(actionsAnchor);
 const statusAnchor=document.createComment('Status message position');$('message').before(statusAnchor);
 document.addEventListener('fullscreenchange',()=>{
   const expanded=document.fullscreenElement===tablePreview;
   if(expanded){
     tablePreview.querySelector('.preview-heading').after(hostActions);
     hostActions.after($('message'));
   }else{
     actionsAnchor.after(hostActions);
     statusAnchor.after($('message'));
   }
   $('admin-fullscreen').textContent=expanded?'Volver al panel':'Pantalla completa';
   $('admin-fullscreen').setAttribute('aria-label',expanded?'Salir de pantalla completa y volver al panel':'Mostrar tablero en pantalla completa');
 });
 $('admin-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await tablePreview.requestFullscreen()}catch{message('Usa la opción de pantalla completa del navegador.')}};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&code)schedulePoll(0)});
 const params=new URLSearchParams(location.search),incoming=(params.get('sala')||'').toUpperCase();
 if(/^[A-Z0-9]{6}$/.test(incoming)){$('join-code').value=incoming;$('join-name').value=identity(incoming).name||'';if(params.get('vista')==='pantalla')run(async()=>{code=incoming;show('board');accept(await api('state'))});else if(identity(incoming).token)run(async()=>{code=incoming;const data=await api('state',{token:identity(incoming).token});if(data.me){show('participant');accept(data)}})}
})();
