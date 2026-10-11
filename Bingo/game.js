/* Reglas compartidas por la interfaz, la demo y las pruebas. */
(() => {
  'use strict';
  const patterns = {
    line: { name: 'Binguito · una línea', button: '¡BINGUITO!', description: 'Completa una fila, una columna o una diagonal.' },
    corners: { name: 'Cuatro esquinas', button: '¡CUATRO ESQUINAS!', description: 'Marca las cuatro esquinas de tu cartón.' },
    x: { name: 'La X', button: '¡TENGO LA X!', description: 'Completa las dos diagonales de tu cartón.' },
    full: { name: 'Cartón completo', button: '¡BINGO COMPLETO!', description: 'Completa los 24 números de tu cartón. El centro es libre.' }
  };
  const presets = {
    full: ['full'],
    line_full: ['line', 'full'],
    corners_full: ['corners', 'full'],
    x_full: ['x', 'full']
  };
  for(const letter of 'BINGO'){
    patterns['line_'+letter]={name:'Binguito · letra '+letter,button:'¡BINGUITO!',description:'Completa la columna '+letter+' de tu cartón.'};
    presets['line_'+letter+'_full']=['line_'+letter,'full'];
  }
  const validStages = stages => Array.isArray(stages) && Object.values(presets).some(value => JSON.stringify(value) === JSON.stringify(stages));
  function matches(card, drawn, pattern) {
    if (!Array.isArray(card) || card.length !== 25 || !patterns[pattern]) return false;
    const marked = i => card[i] === 0 || drawn.includes(card[i]);
    const complete = indices => indices.every(marked);
    const diagonal = [0, 6, 12, 18, 24], reverse = [4, 8, 12, 16, 20];
    if(pattern.startsWith('line_')){const col='BINGO'.indexOf(pattern.slice(5));return col>=0&&complete([col,col+5,col+10,col+15,col+20]);}
    if (pattern === 'full') return card.every((_, i) => marked(i));
    if (pattern === 'corners') return complete([0, 4, 20, 24]);
    if (pattern === 'x') return complete(diagonal) && complete(reverse);
    return Array.from({ length: 5 }, (_, i) => i).some(i =>
      complete(Array.from({ length: 5 }, (_, j) => i * 5 + j)) ||
      complete(Array.from({ length: 5 }, (_, j) => j * 5 + i))
    ) || complete(diagonal) || complete(reverse);
  }
  function normalize(room) {
    room.round ??= 1;
    room.stages ??= ['full'];
    room.stage ??= 0;
    room.awards ??= [];
    return room;
  }
  function assertCurrent(room, payload) {
    if (payload.round !== room.round || payload.stage !== room.stage) {
      throw new Error('La ronda o el premio cambió. Actualiza la sala y vuelve a intentarlo.');
    }
  }
  function mutate(room, action, payload, makeCard, pickIndex) {
    normalize(room);
    if (['draw', 'claim', 'approve_claim', 'reject_claim', 'advance', 'restart', 'configure'].includes(action)) assertCurrent(room, payload);
    if (['draw', 'approve_claim', 'reject_claim', 'advance', 'restart', 'configure'].includes(action) && room.host !== payload.token) {
      throw new Error('Solo el organizador puede cambiar el sorteo.');
    }
    if (action === 'join' && !room.players.some(p => p.token === payload.token)) {
      if (room.drawn.length) throw new Error('El sorteo ya empezó. Podrás entrar cuando reinicien la ronda.');
      if (room.players.length >= 200) throw new Error('La sala está llena (200 jugadores).');
      if (!payload.name?.trim() || payload.name.trim().length > 30) throw new Error('Escribe un nombre de hasta 30 caracteres.');
      room.players.push({ name: payload.name.trim(), token: payload.token, card: makeCard() });
    }
    if (action === 'configure' || action === 'restart') {
      if (!validStages(payload.stages)) throw new Error('Selecciona un estilo de juego válido.');
      if (action === 'configure' && (room.drawn.length || room.awards.length || room.winner)) throw new Error('Cambia el estilo al reiniciar la ronda.');
      if (action === 'restart') room.round++;
      room.stages = [...payload.stages]; room.stage = 0; room.drawn = []; room.winner = null; room.awards = []; room.claim_alert=null;room.claim_token=null;
    }
    if (action === 'draw') {
      if(room.claim_token)throw new Error('Revisa el reclamo antes de sortear.');
      if (room.winner) throw new Error('Este premio ya tiene ganador. Continúa al siguiente o reinicia la ronda.');
      const pool = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !room.drawn.includes(n));
      if (!pool.length) throw new Error('Ya salieron todos los números.');
      room.drawn.push(pool[pickIndex(pool.length)]);
    }
    if (action === 'claim') {
      if (room.winner) throw new Error('Este premio ya tiene un ganador.');
      const player = room.players.find(p => p.token === payload.token);
      if (!player) throw new Error('Primero debes unirte a la sala.');
      const pattern = room.stages[room.stage];
      if(room.claim_token)throw new Error('Hay un reclamo en revision.');
      room.claim_token=payload.token;
      room.claim_alert={id:globalThis.crypto.randomUUID(),name:player.name,status:'pending',pattern,round:room.round,stage:room.stage};
    }
    if(['approve_claim','reject_claim'].includes(action)){
      if(!room.claim_token||payload.claim_id!==room.claim_alert?.id)throw new Error('El reclamo ya fue revisado.');
      if(action==='approve_claim'){
        room.winner=room.claim_token;
        room.awards.push({name:room.claim_alert.name,pattern:room.stages[room.stage],round:room.round,stage:room.stage});
      }
      room.claim_alert.status=action==='approve_claim'?'approved':'rejected';room.claim_token=null;
    }
    if (action === 'advance') {
      if (!room.winner || room.stage >= room.stages.length - 1) throw new Error('No hay un siguiente premio disponible.');
      room.stage++; room.winner = null; room.claim_alert=null;room.claim_token=null;
    }
    if (room.host !== payload.token && !room.players.some(p => p.token === payload.token)) throw new Error('Debes unirte a la sala para ver la partida.');
    return room;
  }
  function routeCode(href) {
    const url = new URL(href), path = url.pathname.match(/^\/([a-z0-9]{6})\/?$/i);
    const code = path?.[1] ?? url.searchParams.get('sala');
    return code && /^[a-z0-9]{6}$/i.test(code) ? code.toUpperCase() : null;
  }
  function invitation(href, code) {
    const url = new URL(href);
    url.search = ''; url.hash = '';
    if (url.protocol === 'file:') url.searchParams.set('sala', code);
    else url.pathname = `/${code.toLowerCase()}`;
    return url.href;
  }
  globalThis.BingoGame = { patterns, presets, validStages, matches, normalize, mutate, routeCode, invitation };
})();
