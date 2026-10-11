/* Usa el mismo proyecto Supabase y las mismas cuentas de administrador que Bingo. */
const SUPABASE_URL='https://xpxpjdnsbfdexwzovmpn.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhweHBqZG5zYmZkZXh3em92bXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NDkwMDgsImV4cCI6MjEwNzIyNTAwOH0.hH_v0zyTeRYsAPNMrcjnOe2YWbcGCEhy1u3bcf4jFtQ';

(() => {
  'use strict';
  const API_KEY=SUPABASE_ANON_KEY;
  const $=id=>document.getElementById(id);
  const online=Boolean(SUPABASE_URL&&API_KEY);
  const letters=['A','B','C','D'];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const randomToken=()=>crypto.randomUUID?.()??'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  const routeCode=()=>{const path=location.pathname.split('/').filter(Boolean).at(-1);const query=new URL(location.href).searchParams.get('sala');return (/^[a-z0-9]{6}$/i.test(path??'')?path:query??'').toUpperCase();};
  const sessionKey='millionaire-session';
  let session=read(sessionKey,{players:{}}); session.players??={};
  let state=null,selectedRoom=null,view='entry',busy=false,polling=false,presenting=false,demoAdmin=false,adminUser=null,questions=[];
  const auth=online?createBingoAuth({url:SUPABASE_URL,key:API_KEY,onInvalid:()=>{adminUser=null;if(view==='admin')showView('entry');}}):null;
  const music=$('music'),volume=$('volume');
  const tracks={main:'assets/main-theme.mp3',opening:'assets/opening.mp3',lets:'assets/lets-play.mp3',questions:'assets/questions-100-1000.mp3',win:'assets/1000000-win.mp3',correct:'assets/who-was-correct.mp3'};
  let musicLock=null;
  const seenLifelines=new Set();
  const dismissedLifelines=new Set(read('millionaire-dismissed-lifelines',[]));
  let activeLifelineKey=null,activeLifelineQuestion=null;
  const lifelineLabels={fifty:'50:50',call:'☎ Llamada a Monserrat',audience:'👥 Voz del público',expert:'⚛ Albert Einstein'};
  function closeLifeline(){
    if(activeLifelineKey){dismissedLifelines.add(activeLifelineKey);save('millionaire-dismissed-lifelines',[...dismissedLifelines]);}
    activeLifelineKey=null;
    $('lifeline-dialog').close();
    syncLifelineDialog();
  }
  $('lifeline-close').onclick=closeLifeline;
  $('lifeline-continue').onclick=closeLifeline;
  $('lifeline-dialog').addEventListener('cancel',event=>{event.preventDefault();closeLifeline();});
  function syncLifelineDialog(){
    const dialog=$('lifeline-dialog'),questionKey=state?state.code+':'+state.index:null;
    if(view!=='player'||state?.status!=='question'||!Array.isArray(state?.question?.options)){
      activeLifelineKey=null;activeLifelineQuestion=null;dialog.close();return;
    }
    if(activeLifelineQuestion!==questionKey){activeLifelineKey=null;dialog.close();activeLifelineQuestion=questionKey;}
    // Polling must not recreate an open modal or restart its animation.
    if(dialog.open)return;
    for(const kind of Object.keys(lifelineLabels)){
      if(state.lifeline_at?.[kind]!==state.index)continue;
      if(kind==='audience'&&!Array.isArray(state.distribution))continue;
      if(kind==='expert'&&state.expert_answer==null)continue;
      if(kind==='call'&&state.call_answer==null)continue;
      const key=questionKey+':'+playerToken(state.code)+':'+kind;
      if(dismissedLifelines.has(key))continue;
      activeLifelineKey=key;
      $('lifeline-title').textContent=lifelineLabels[kind];
      const single={...state,lifeline_at:kind==='audience'?{audience:state.index}:{},expert_answer:kind==='expert'?state.expert_answer:null,call_answer:kind==='call'?state.call_answer:null};
      $('lifeline-body').innerHTML=kind==='fifty'?'<div class="fifty-modal-icon" aria-hidden="true">50:50</div><p>Se eliminaron dos alternativas incorrectas. Elige entre las dos que quedan.</p>':lifelineMarkup(single,'modal');
      dialog.showModal();
      break;
    }
  }
  let soundVolume=Math.min(1,Math.max(0,Number(localStorage.getItem('millionaire-volume')??22)/100));
  const applyVolume=()=>{music.volume=soundVolume;volume.value=String(Math.round(soundVolume*100));volume.style.setProperty('--volume',`${volume.value}%`);$('volume-value').textContent=`${volume.value}%`;};
  const playMusic=()=>{if(soundVolume&&music.paused)music.play().catch(()=>{});};
  function setTrack(id,source,loop=true,onended=null){
    if(music.dataset.track===id)return;
    music.dataset.track=id;music.src=source;music.loop=loop;music.onended=onended;music.load();playMusic();
  }
  function syncMusic(){
    if(state?.status==='finished'&&view!=='entry'){musicLock=null;setTrack('win',tracks.win,false);return;}
    if(musicLock)return;
    if(!state||view==='entry'||state.status==='lobby'||state.status==='finished')setTrack('main',tracks.main,true);
    else if(state.status==='rules')setTrack('opening',tracks.opening,true);
    else if(state.status==='question')setTrack(`questions-${state.index}`,tracks.questions,true);
    else if(state.status==='reveal')setTrack(`correct-${state.index}`,tracks.correct,false);
  }
  applyVolume();setTrack('main',tracks.main,true);document.addEventListener('click',playMusic);
  volume.oninput=()=>{soundVolume=Number(volume.value)/100;localStorage.setItem('millionaire-volume',volume.value);applyVolume();if(soundVolume)playMusic();else music.pause();};

  const seedQuestions=[
    {id:'demo-1',text:'¿Cuál es el planeta más grande del sistema solar?',options:['Marte','Júpiter','Saturno','Venus'],correct_index:1,expert_hint:'Su gran mancha roja es una tormenta más grande que la Tierra.',difficulty:1,active:true},
    {id:'demo-2',text:'¿En qué país se encuentra la ciudad de Machu Picchu?',options:['Chile','México','Perú','Bolivia'],correct_index:2,expert_hint:'Fue una ciudadela del Imperio inca en los Andes.',difficulty:1,active:true},
    {id:'demo-3',text:'¿Quién escribió “Cien años de soledad”?',options:['Pablo Neruda','Gabriel García Márquez','Jorge Luis Borges','Mario Benedetti'],correct_index:1,expert_hint:'El autor colombiano recibió el Nobel de Literatura en 1982.',difficulty:2,active:true},
    {id:'demo-4',text:'¿Qué elemento químico tiene el símbolo Au?',options:['Plata','Cobre','Oro','Aluminio'],correct_index:2,expert_hint:'Su nombre latino es aurum.',difficulty:2,active:true},
    {id:'demo-5',text:'¿Cuál es la capital de Australia?',options:['Sídney','Melbourne','Canberra','Perth'],correct_index:2,expert_hint:'Fue elegida como solución intermedia entre Sídney y Melbourne.',difficulty:3,active:true},
    {id:'demo-6',text:'¿En qué año llegó el ser humano a la Luna?',options:['1965','1969','1972','1975'],correct_index:1,expert_hint:'La misión fue Apolo 11.',difficulty:3,active:true}
  ];
  if(!localStorage.getItem('millionaire-demo-questions'))save('millionaire-demo-questions',seedQuestions);

  function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,4000);}
  function showView(next){view=next;$('entry-view').hidden=next!=='entry';$('admin-view').hidden=next!=='admin';$('player-view').hidden=next!=='player';document.body.classList.toggle('playing',next!=='entry');render();}
  function playerToken(code){return session.players[code]??null;}
  function saveSession(){save(sessionKey,session);}
  let serverOffset=0;
  function secondsLeft(){return state?.answer_deadline?Math.max(0,Math.ceil((Date.parse(state.answer_deadline)-Date.now()-serverOffset)/1000)):0;}
  function updateQuestionClock(){
    const remaining=secondsLeft();
    document.querySelectorAll('[data-question-clock]').forEach(el=>{el.textContent=remaining?remaining+' s':'Tiempo terminado';el.classList.toggle('expired',remaining===0);});
    if(state?.status==='question'&&remaining===0)document.querySelectorAll('#player-content [data-answer]').forEach(el=>el.disabled=true);
  }
  async function api(action,payload={}){
    if(online){
      const hostActions=['rooms','create','show_rules','start','reveal','next','lifeline','questions','question_save','question_delete'].includes(action)||payload.as_host;
      const headers={'Content-Type':'application/json',apikey:API_KEY};
      if(hostActions){const jwt=await auth.accessToken();if(!jwt)throw new Error('Inicia sesión como administrador.');headers.Authorization=`Bearer ${jwt}`;}
      else headers.Authorization=`Bearer ${API_KEY}`;
      const response=await fetch(`${SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/millionaire_api`,{method:'POST',headers,body:JSON.stringify({p_action:action,p_data:payload}),signal:AbortSignal.timeout(12000)});
      const data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo conectar con la partida.');if(data?.server_time)serverOffset=Date.parse(data.server_time)-Date.now();return data;
    }
    return demoApi(action,payload);
  }
  function demoState(room,token,asHost=false){
    const q=room.questions[room.index]??null,answers=room.answers[room.index]??{},me=room.players.find(p=>p.token===token),dist=[0,0,0,0];Object.values(answers).forEach(a=>dist[a.option]++);
    const showResults=room.status==='reveal'||room.lifelineAt.audience===room.index;
    const audienceDist=q?[11,14,16,9].map((value,i)=>i===q.correct_index?61:value):null;
    const correctVoters=room.status==='reveal'&&q?room.players.filter(p=>answers[p.token]?.option===q.correct_index).map(p=>p.name):[];
    return {code:room.code,title:room.title,status:room.status,answer_deadline:room.answer_deadline,index:room.index,total:room.questions.length,question:q&& !['lobby','rules','finished'].includes(room.status)?{id:q.id,text:q.text,options:q.options,correct_index:room.status==='reveal'?q.correct_index:null,expert_hint:room.status==='reveal'||room.lifelineAt.expert===room.index?q.expert_hint:null,difficulty:q.difficulty}:null,players:room.players.map(p=>({name:p.name,score:p.score})).sort((a,b)=>b.score-a.score),answer_count:Object.keys(answers).length,my_answer:answers[token]?.option??null,distribution:showResults?(room.status==='reveal'?dist:audienceDist):null,expert_answer:q&&room.lifelineAt.expert===room.index?q.correct_index:null,call_answer:q&&room.lifelineAt.call===room.index?q.correct_index:null,correct_voters:correctVoters,lifelines:room.lifelines,lifeline_at:room.lifelineAt,hidden:room.hidden,name:me?.name??null,as_host:asHost};
  }
  function demoApi(action,payload){
    const rooms=read('millionaire-demo-rooms',{}),bank=read('millionaire-demo-questions',seedQuestions);
    if(action==='questions')return bank;
    if(action==='question_save'){const q={...payload,id:payload.id||randomToken(),correct_index:Number(payload.correct_index),difficulty:Number(payload.difficulty),active:Boolean(payload.active)};const at=bank.findIndex(x=>x.id===q.id);at<0?bank.push(q):bank.splice(at,1,q);save('millionaire-demo-questions',bank);return q;}
    if(action==='question_delete'){save('millionaire-demo-questions',bank.filter(q=>q.id!==payload.id));return {ok:true};}
    if(action==='rooms')return Object.values(rooms).map(r=>({code:r.code,title:r.title,status:r.status}));
    if(action==='create'){const active=bank.filter(q=>q.active);if(!active.length)throw new Error('Agrega al menos una pregunta activa.');let code;const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';do{code=Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}while(rooms[code]);rooms[code]={code,title:payload.title,status:'lobby',index:0,questions:[...active].sort(()=>Math.random()-.5).slice(0,Number(payload.count)),players:[],answers:{},lifelines:{fifty:false,call:false,audience:false,expert:false},lifelineAt:{},hidden:[]};save('millionaire-demo-rooms',rooms);return demoState(rooms[code],null,true);}
    const room=rooms[payload.code];if(!room)throw new Error('No encontramos esa sala. Revisa el código.');
    if(action==='lookup')return {code:room.code,title:room.title,status:room.status,open:room.status!=='finished'};
    if(action==='join'){let p=room.players.find(p=>p.token===payload.token);if(!p){if(room.status==='finished')throw new Error('La partida ya terminó.');p={token:payload.token,name:payload.name,score:0};room.players.push(p);}save('millionaire-demo-rooms',rooms);return demoState(room,payload.token);}
    if(action==='show_rules'){if(room.status!=='lobby')throw new Error('Las reglas ya fueron presentadas.');room.status='rules';}
    if(action==='start'){if(room.status!=='rules')throw new Error('Primero presenta las reglas.');if(!room.questions.length)throw new Error('La sala no tiene preguntas.');room.status='question';room.answer_deadline=new Date(Date.now()+20000).toISOString();room.index=0;}
    if(action==='answer'){if(!room.answer_deadline||Date.now()>=Date.parse(room.answer_deadline))throw new Error('Se termino el tiempo para responder.');if(room.status!=='question')throw new Error('La votación está cerrada.');if(room.hidden.includes(Number(payload.option)))throw new Error('Esa alternativa fue eliminada.');room.answers[room.index]??={};room.answers[room.index][payload.token]={option:Number(payload.option)};}
    if(action==='reveal'){if(room.status!=='question')throw new Error('La pregunta ya fue revelada.');room.status='reveal';const q=room.questions[room.index],answers=room.answers[room.index]??{};room.players.forEach(p=>{if(answers[p.token]?.option===q.correct_index)p.score+=1000;});}
    if(action==='next'){if(room.status!=='reveal')throw new Error('Primero revela la respuesta.');if(room.index>=room.questions.length-1)room.status='finished';else{room.index++;room.status='question';room.answer_deadline=new Date(Date.now()+20000).toISOString();room.hidden=[];}}
    if(action==='lifeline'){const kind=payload.kind;if(room.lifelines[kind])throw new Error('Ese comodín ya fue utilizado.');room.lifelines[kind]=true;room.lifelineAt[kind]=room.index;if(kind==='fifty'){const wrong=[0,1,2,3].filter(i=>i!==room.questions[room.index].correct_index);room.hidden=wrong.sort(()=>Math.random()-.5).slice(0,2);}}
    save('millionaire-demo-rooms',rooms);return demoState(room,payload.token,Boolean(payload.as_host));
  }
  async function run(fn){if(busy)return;busy=true;render();try{await fn();}catch(error){notify(error.message||'Ocurrió un error.');}finally{busy=false;render();}}

  function answersMarkup(s,interactive=false){if(!s.question||!Array.isArray(s.question.options))return'<div class="expert-note">No se pudo cargar esta pregunta. El presentador debe volver a la sala y seleccionar otra partida.</div>';const showDistribution=s.status==='reveal'&&Array.isArray(s.distribution),total=(showDistribution?s.distribution:[]).reduce((n,v)=>n+Number(v||0),0);return `<div class="answers">${s.question.options.map((option,i)=>{const eliminated=s.hidden?.includes(i),selected=s.my_answer===i,correct=s.question.correct_index===i,wrong=s.status==='reveal'&&!correct,pct=showDistribution?Math.round((s.distribution[i]||0)*100/Math.max(1,total)):0;return `<button class="answer${eliminated?' eliminated':''}${selected?' selected':''}${correct?' correct':''}${wrong?' wrong':''}" data-answer="${i}" ${!interactive||s.status!=='question'||eliminated?'disabled':''}><span>${letters[i]}</span>${esc(option)}${showDistribution?`<small>${pct}%</small><i class="answer-bar" style="width:${pct}%"></i>`:''}</button>`;}).join('')}</div>`;}
  function lifelineMarkup(s,scope='view'){if(!s.question)return'';const isFresh=kind=>{const key=`${scope}:${s.code}:${s.index}:${kind}`;if(seenLifelines.has(key))return false;seenLifelines.add(key);return true};let html='';if(s.lifeline_at?.audience===s.index&&s.distribution){const fresh=isFresh('audience'),total=s.distribution.reduce((n,v)=>n+Number(v||0),0);html+=`<section class="audience-card${fresh?' lifeline-reveal':''}"><span class="eyebrow">LA VOZ DEL PÚBLICO</span><h4>El público cree que la respuesta es…</h4><div class="audience-chart">${s.distribution.map((v,i)=>{const pct=Math.round(Number(v||0)*100/Math.max(1,total));return `<div><strong>${pct}%</strong><i style="height:${pct}%"></i><b>${letters[i]}</b></div>`}).join('')}</div></section>`}if(s.expert_answer!==null&&s.expert_answer!==undefined){const fresh=isFresh('expert'),i=Number(s.expert_answer);html+=`<section class="expert-card${fresh?' lifeline-reveal':''}"><div class="expert-photo"><img src="assets/albert-einstein-experto.png" alt="Albert Einstein"></div><div><span class="eyebrow">EL EXPERTO</span><h4>Albert Einstein</h4><p>“Estoy seguro: la respuesta correcta es <strong>${letters[i]} · ${esc(s.question.options[i])}</strong>.”</p>${s.question.expert_hint?`<small>${esc(s.question.expert_hint)}</small>`:''}</div></section>`}if(s.call_answer!==null&&s.call_answer!==undefined){const fresh=isFresh('call'),i=Number(s.call_answer);html+=`<section class="monserrat-call${fresh?' lifeline-reveal':''}"><div class="phone-ringing">☎</div><div><span class="eyebrow">LLAMADA A MONSERRAT</span><h4>Monserrat está en línea…</h4><p class="${fresh?'call-reveal':'call-answer'}">“Yo elegiría la <strong>${letters[i]} · ${esc(s.question.options[i])}</strong>.”</p></div><span class="call-status">● CONECTADA</span></section>`}return html}
  function scoreboardMarkup(s,me=''){const players=Array.isArray(s.players)?s.players:[];return `<div class="scoreboard">${players.map((p,i)=>`<div class="rank${p.name===me?' me':''}"><b>${i+1}</b><span>${esc(p.name)}</span><strong>${p.score} pts</strong></div>`).join('')}</div>`;}
  function rulesMarkup(){return `${emblemMarkup()}<div class="rules-screen"><span class="eyebrow">ANTES DE COMENZAR</span><h3 class="question-text">Reglas del juego</h3><div class="rules-grid"><article><b>01</b><strong>Responde desde tu celular</strong><p>Elige A, B, C o D mientras la votación esté abierta.</p></article><article><b>02</b><strong>Todos juegan</strong><p>Cada respuesta correcta suma 1.000 puntos a tu clasificación.</p></article><article><b>03</b><strong>Puedes cambiar tu voto</strong><p>Tu última elección queda registrada al revelar la respuesta.</p></article><article><b>04</b><strong>Cuatro comodines compartidos</strong><p>50:50 elimina dos alternativas; el público muestra su gráfico; Einstein y Monserrat indican su respuesta.</p></article></div></div>`;}
  const emblemMarkup=()=>'<img class="show-emblem game-emblem" src="assets/emblema-monserrat.png" alt="">';
  function questionMarkup(s,interactive=false,scope='view'){if(!s.question||!Array.isArray(s.question.options))return `${emblemMarkup()}<div class="expert-note"><h3>No se pudo cargar la pregunta</h3><p>La sala contiene una pregunta que ya no está disponible. Crea una sala nueva desde el panel.</p></div>`;const players=Array.isArray(s.players)?s.players:[],winners=s.status==='reveal'?`<div class="correct-voters"><span class="eyebrow">RESPONDIERON CORRECTAMENTE</span><strong>${s.correct_voters?.length?s.correct_voters.map(esc).join(' · '):'Nadie esta vez'}</strong></div>`:'';return `${emblemMarkup()}<div class="question-meta"><span>Pregunta ${s.index+1} de ${s.total}</span><span>${s.answer_count} de ${players.length} respuestas</span>${s.status==='question'?'<strong class="question-clock" data-question-clock></strong>':''}</div><h3 class="question-text">${esc(s.question.text)}</h3>${answersMarkup(s,interactive)}${winners}`;}
  function render(){
    if(view==='entry'){syncLifelineDialog();return;}
    if(view==='admin')renderAdmin();else renderPlayer();
    if(presenting)renderPresentation();
    syncMusic();
    syncLifelineDialog();
    updateQuestionClock();
  }
  function renderAdmin(){
    $('admin-email').textContent=adminUser?.email??'Modo demostración';$('fullscreen').disabled=!state;
    if(!state){$('host-room-title').textContent='Crea o selecciona una sala';$('host-status').textContent='PANEL DEL CONDUCTOR';$('host-content').innerHTML='<p class="empty">Aquí dirigirás la partida, los comodines y cada revelación.</p>';$('host-actions').replaceChildren();$('host-players').innerHTML='<p class="empty">Aún no entra nadie.</p>';$('player-count').textContent='0';return;}
    $('host-room-title').textContent=`${state.title} · ${state.code}`;$('host-status').textContent=({lobby:'SALA DE ESPERA',rules:'REGLAS DEL JUEGO',question:'VOTACIÓN ABIERTA',reveal:'RESPUESTA REVELADA',finished:'PARTIDA FINALIZADA'})[state.status];$('player-count').textContent=state.players.length;$('host-players').innerHTML=state.players.length?state.players.map((p,i)=>`<div class="player-row"><span>${i+1}. ${esc(p.name)}</span><b>${p.score}</b></div>`).join(''):'<p class="empty">Aún no entra nadie.</p>';
    if(state.status==='lobby')$('host-content').innerHTML=`<div class="lobby-code"><span class="eyebrow">CÓDIGO PARA ENTRAR</span><strong>${state.code}</strong><p>${state.players.length} participante${state.players.length===1?'':'s'} conectado${state.players.length===1?'':'s'}</p></div>`;
    else if(state.status==='rules')$('host-content').innerHTML=rulesMarkup();
    else if(state.status==='finished')$('host-content').innerHTML=`<span class="eyebrow">CLASIFICACIÓN FINAL</span><h3 class="question-text">¡Tenemos ganadores!</h3>${scoreboardMarkup(state)}`;
    else $('host-content').innerHTML=questionMarkup(state,false,'admin');
    const actions=[];
    if(state.status==='lobby')actions.push(`<button class="primary" data-action="show-rules" ${!state.players.length||busy?'disabled':''}>Mostrar reglas ▶</button>`,`<button class="secondary" data-action="invite">Invitar jugadores</button>`);
    if(state.status==='rules')actions.push(`<button class="primary" data-action="start" ${busy?'disabled':''}>Aceptar reglas · ¡A jugar! ▶</button>`);
    if(state.status==='question'){actions.push(`<button class="primary" data-action="reveal" ${busy?'disabled':''}>Revelar respuesta ✓</button>`);for(const [kind,label] of Object.entries({fifty:'50:50',call:'☎ Llamada a Monserrat',audience:'👥 Voz del público',expert:'🧠 Einstein'}))actions.push(`<button class="lifeline${state.lifelines[kind]?' used':''}" data-lifeline="${kind}" ${state.lifelines[kind]||busy?'disabled':''}>${label}</button>`);}
    if(state.status==='reveal')actions.push(`<button class="primary" data-action="next" ${busy?'disabled':''}>${state.index+1>=state.total?'Ver clasificación final':'Siguiente pregunta →'}</button>`);
    $('host-actions').innerHTML=actions.join('');
    $('host-actions').querySelector('[data-action="show-rules"]')?.addEventListener('click',()=>hostAction('show_rules'));
    $('host-actions').querySelector('[data-action="start"]')?.addEventListener('click',()=>hostAction('start'));
    $('host-actions').querySelector('[data-action="reveal"]')?.addEventListener('click',()=>hostAction('reveal'));
    $('host-actions').querySelector('[data-action="next"]')?.addEventListener('click',()=>hostAction('next'));
    $('host-actions').querySelector('[data-action="invite"]')?.addEventListener('click',openInvite);
    $('host-actions').querySelectorAll('[data-lifeline]').forEach(b=>b.onclick=()=>hostAction('lifeline',{kind:b.dataset.lifeline}));
  }
  function renderPlayer(){
    if(!state)return;$('player-room').textContent=`SALA ${state.code}`;$('player-name-title').textContent=state.name||'Participante';
    if(state.status==='lobby')$('player-content').innerHTML='<div class="waiting"><div class="pulse">✦</div><h2>Ya estás dentro</h2><p>Mira la pantalla principal. El juego comenzará cuando el conductor esté listo.</p></div>';
    else if(state.status==='rules')$('player-content').innerHTML=rulesMarkup();
    else if(state.status==='finished')$('player-content').innerHTML=`<div class="waiting"><h2>Clasificación final</h2><p>¡Gracias por jugar!</p></div>${scoreboardMarkup(state,state.name)}`;
    else{$('player-content').innerHTML=questionMarkup(state,true,'player')+(state.status==='reveal'?`<h3>Clasificación</h3>${scoreboardMarkup(state,state.name)}`:state.my_answer!==null?'<p class="expert-note">Respuesta enviada. Puedes cambiarla mientras la votación siga abierta.</p>':'<p class="hint">Toca una alternativa para votar.</p>');$('player-content').querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>submitAnswer(Number(button.dataset.answer)));}
  }
  function renderPresentation(){
    $('presentation-code').textContent=state?.code??'------';
    const controls=$('presentation-controls');
    if(!state){controls.replaceChildren();return;}
    if(state.status==='lobby')$('presentation-content').innerHTML=`<div class="lobby-code"><span class="eyebrow">ENTRA DESDE TU TELÉFONO</span><strong>${state.code}</strong><h2>${esc(state.title)}</h2><p>${state.players.length} participantes conectados</p></div>`;
    else if(state.status==='rules')$('presentation-content').innerHTML=rulesMarkup();
    else if(state.status==='finished')$('presentation-content').innerHTML=`<span class="eyebrow">CLASIFICACIÓN FINAL</span><h2 class="question-text">¡Felicidades!</h2>${scoreboardMarkup(state)}`;
    else $('presentation-content').innerHTML=questionMarkup(state,false,'presentation');
    const actions=[];
    if(state.status==='lobby')actions.push(`<button class="primary" data-presentation-action="show_rules" ${!state.players.length||busy?'disabled':''}>Mostrar reglas ▶</button>`);
    if(state.status==='rules')actions.push(`<button class="primary" data-presentation-action="start" ${busy?'disabled':''}>Aceptar reglas · ¡A jugar! ▶</button>`);
    if(state.status==='question'){
      actions.push(`<button class="primary" data-presentation-action="reveal" ${busy?'disabled':''}>Revelar respuesta ✓</button>`);
      for(const [kind,label] of Object.entries({fifty:'50:50',call:'☎ Monserrat',audience:'👥 Público',expert:'🧠 Einstein'}))actions.push(`<button class="lifeline${state.lifelines[kind]?' used':''}" data-presentation-lifeline="${kind}" ${state.lifelines[kind]||busy?'disabled':''}>${label}</button>`);
    }
    if(state.status==='reveal')actions.push(`<button class="primary" data-presentation-action="next" ${busy?'disabled':''}>${state.index+1>=state.total?'Ver clasificación final':'Siguiente pregunta →'}</button>`);
    controls.innerHTML=actions.join('');
    controls.querySelectorAll('[data-presentation-action]').forEach(button=>button.onclick=()=>hostAction(button.dataset.presentationAction));
    controls.querySelectorAll('[data-presentation-lifeline]').forEach(button=>button.onclick=()=>hostAction('lifeline',{kind:button.dataset.presentationLifeline}));
  }

  async function loadRooms(){const list=await api('rooms');$('host-rooms').innerHTML='<option value="">Selecciona una sala</option>'+list.map(r=>`<option value="${r.code}">${esc(r.title)} · ${r.code}</option>`).join('');if(session.hostCode)$('host-rooms').value=session.hostCode;}
  async function refresh(){if(polling||busy)return;const code=view==='admin'?session.hostCode:session.playerCode;if(!code)return;polling=true;try{state=await api('state',{code,token:view==='player'?playerToken(code):null,as_host:view==='admin'});render();}catch{}finally{polling=false;}}
  async function hostAction(action,extra={}){await run(async()=>{state=await api(action,{code:state.code,as_host:true,...extra});if(action==='start'){musicLock='lets';setTrack('lets',tracks.lets,false,()=>{musicLock=null;syncMusic();});}render();});}
  async function submitAnswer(option){await run(async()=>{state=await api('answer',{code:state.code,token:playerToken(state.code),option});render();});}
  function openInvite(){$('invite-code').textContent=state.code;$('invite-link').value=location.protocol==='file:'?`${location.href.split(/[?#]/)[0]}?sala=${state.code}`:`${location.origin}/${state.code.toLowerCase()}`;$('invite-dialog').showModal();}

  $('code-form').onsubmit=e=>{e.preventDefault();run(async()=>{const code=$('room-code').value.trim().toUpperCase(),token=playerToken(code);selectedRoom=await api('lookup',{code});if(token){state=await api('join',{code,token,name:''});session.playerCode=code;saveSession();showView('player');return;}$('code-form').hidden=true;$('join-form').hidden=false;$('found-room').textContent=`${selectedRoom.title} · ${selectedRoom.code}`;$('entry-message').textContent=selectedRoom.status==='finished'?'La partida ya terminó.':selectedRoom.status==='lobby'?'Sala encontrada. Escribe tu nombre para entrar.':'La partida está en curso. Escribe tu nombre para volver a entrar.';const submit=$('join-form').querySelector('button[type="submit"]');if(submit)submit.disabled=selectedRoom.status==='finished';});};
  $('join-form').onsubmit=e=>{e.preventDefault();run(async()=>{const code=selectedRoom.code,token=randomToken();session.players[code]=token;session.playerCode=code;saveSession();state=await api('join',{code,token,name:$('player-name').value.trim()});showView('player');});};
  $('change-code').onclick=()=>{$('code-form').hidden=false;$('join-form').hidden=true;$('entry-message').textContent='';};
  $('leave-room').onclick=()=>{session.playerCode=null;saveSession();state=null;showView('entry');};
  $('admin-login').onclick=async()=>{if(auth?.session()){await enterAdmin();}else $('login-dialog').showModal();};
  $('login-form').onsubmit=e=>{e.preventDefault();run(async()=>{await auth.signIn($('login-email').value.trim(),$('login-password').value);$('login-dialog').close();await enterAdmin();});};
  $('demo-admin').hidden=online;$('demo-admin').onclick=()=>{demoAdmin=true;$('login-dialog').close();enterAdmin();};
  async function enterAdmin(){if(online){adminUser=await auth.validate();if(!adminUser)throw new Error('Inicia sesión como administrador.');}else if(!demoAdmin){$('login-dialog').showModal();return;}showView('admin');await loadRooms();if(session.hostCode){state=await api('state',{code:session.hostCode,as_host:true});render();}}
  $('logout').onclick=()=>run(async()=>{if(online)await auth.signOut();adminUser=null;demoAdmin=false;session.hostCode=null;saveSession();state=null;showView('entry');});
  $('create-room-button').onclick=()=>$('create-room-dialog').showModal();
  $('create-room-form').onsubmit=e=>{e.preventDefault();run(async()=>{state=await api('create',{title:$('room-title').value.trim(),count:Number($('question-count').value)});session.hostCode=state.code;saveSession();$('create-room-dialog').close();await loadRooms();render();});};
  $('host-rooms').onchange=()=>run(async()=>{session.hostCode=$('host-rooms').value||null;saveSession();state=session.hostCode?await api('state',{code:session.hostCode,as_host:true}):null;render();});

  async function loadQuestions(){questions=await api('questions');$('questions-list').innerHTML=questions.length?questions.map(q=>`<article class="question-item" data-id="${q.id}"><div><strong>${esc(q.text)}</strong><p>Correcta: ${letters[q.correct_index]} · ${esc(q.options[q.correct_index])}</p></div><span class="badge">Dificultad ${q.difficulty}</span><span class="badge">${q.active?'Activa':'Oculta'}</span><div class="question-actions"><button class="secondary edit-question" type="button">Editar</button><button class="danger delete-question-row" type="button">Eliminar</button></div></article>`).join(''):'<p class="empty">Todavía no hay preguntas. Agrega la primera.</p>';$('questions-list').querySelectorAll('.question-item').forEach(row=>{const q=questions.find(item=>item.id===row.dataset.id);row.querySelector('.edit-question').onclick=()=>openQuestion(q);row.querySelector('.delete-question-row').onclick=()=>deleteQuestion(q);});}
  $('questions-button').onclick=()=>run(async()=>{await loadQuestions();$('questions-dialog').showModal();});
  $('new-question').onclick=()=>openQuestion();
  function openQuestion(q=null){$('question-form').reset();$('question-id').value=q?.id??'';$('question-dialog-title').textContent=q?'Editar pregunta':'Nueva pregunta';$('question-text').value=q?.text??'';for(let i=0;i<4;i++)$(`option-${i}`).value=q?.options[i]??'';$('correct-index').value=String(q?.correct_index??0);$('expert-hint').value=q?.expert_hint??'';$('difficulty').value=String(q?.difficulty??1);$('question-active').checked=q?.active??true;$('delete-question').hidden=!q;$('question-dialog').showModal();}
  $('question-form').onsubmit=e=>{e.preventDefault();run(async()=>{await api('question_save',{id:$('question-id').value||null,text:$('question-text').value.trim(),options:[0,1,2,3].map(i=>$(`option-${i}`).value.trim()),correct_index:Number($('correct-index').value),expert_hint:$('expert-hint').value.trim(),difficulty:Number($('difficulty').value),active:$('question-active').checked});$('question-dialog').close();await loadQuestions();notify('Pregunta guardada.');});};
  async function deleteQuestion(q){if(!q||!confirm(`¿Eliminar esta pregunta?\n\n${q.text}`))return;await run(async()=>{await api('question_delete',{id:q.id});if($('question-dialog').open)$('question-dialog').close();await loadQuestions();notify('Pregunta eliminada.');});}
  $('delete-question').onclick=()=>deleteQuestion(questions.find(q=>q.id===$('question-id').value));
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=() => $(button.dataset.close).close());
  $('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);notify('Invitación copiada.');}catch{ $('invite-link').select();notify('Selecciona y copia el enlace.');}};
  $('fullscreen').onclick=async()=>{if(!state)return;presenting=true;$('presentation').hidden=false;renderPresentation();try{await document.documentElement.requestFullscreen?.();}catch{}$('presentation').focus();};
  const closePresentation=async()=>{presenting=false;$('presentation').hidden=true;if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}};
  $('presentation-room').onclick=closePresentation;document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&presenting)closePresentation();});
  document.addEventListener('keydown',e=>{if(presenting&&e.key==='Escape')closePresentation();playMusic();});
  const requested=routeCode();
  async function restorePlayer(){
    const code=requested||session.playerCode,token=code&&playerToken(code);
    if(code)$('room-code').value=code;
    if(token){
      try{state=await api('join',{code,token,name:''});session.playerCode=code;saveSession();showView('player');return;}catch{}
    }
    if(requested)$('code-form').requestSubmit();
  }
  restorePlayer();
  setInterval(updateQuestionClock,200);
  setInterval(refresh,1500);
})();
