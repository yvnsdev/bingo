(() => {
  const modes={pass:['PASS LINE','7 u 11 gana en la salida; 2, 3 o 12 pierde. Con punto, repítelo antes del 7.'],dont_pass:["DON’T PASS BAR",'En la salida gana 2 o 3, pierde 7 u 11 y empata 12. Con punto, gana el 7 antes del punto.'],come:['COME','Se coloca con punto activo. Su primera tirada funciona como Pass Line y luego conserva su propio punto.'],dont_come:["DON’T COME BAR",'Se coloca con punto activo. Funciona como Don’t Pass, con punto propio y empate en 12.'],field:['FIELD','Una tirada: gana 2, 3, 4, 9, 10, 11 o 12. El 2 y el 12 pagan doble.'],big6:['BIG 6','Gana si sale 6 antes que 7. Paga 1:1.'],big8:['BIG 8','Gana si sale 8 antes que 7. Paga 1:1.']};
  for(const n of [4,5,6,8,9,10])modes['place'+n]=[String(n),`Place ${n}: gana antes del 7. Paga ${[4,10].includes(n)?'9:5':[5,9].includes(n)?'7:5':'7:6'}. Inactiva en la salida.`];
  function layout(point){
    const zone=(key,cls,label)=>`<button type="button" class="craps-zone ${cls}" data-craps-zone="${key}" aria-label="${modes[key][0]}" aria-pressed="false">${label||modes[key][0]}</button>`;
    return `<div class="craps-felt"><div class="craps-place-caption">PLACE BETS</div><div class="craps-place-row">${[4,5,6,8,9,10].map(n=>zone('place'+n,'craps-number'+(n===point?' point-on':''),`${n===point?'<small class="craps-puck">ON</small>':''}${n===6?'SIX':n===9?'NINE':n}`)).join('')}</div>${zone('dont_come','craps-dont-come','Don’t<br>Come<br><small>BAR 12</small>')}${zone('come','craps-come')}${zone('field','craps-field','<span>② · 3 · 4 · 9 · 10 · 11 · ⑫</span><b>FIELD</b><small>2 Y 12 PAGAN DOBLE</small>')}${zone('dont_pass','craps-dont-pass','Don’t Pass Bar <small>12</small>')}${zone('pass','craps-pass') }<div class="craps-big">${zone('big6','','<small>BIG</small> 6')}${zone('big8','','<small>BIG</small> 8')}</div></div>`;
  }
  const die=n=>`<div class="craps-die" role="img" aria-label="Dado ${n}">${Array.from({length:9},(_,i)=>`<i class="${({1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}[n]||[]).includes(i)?'pip':''}"></i>`).join('')}</div>`;
  async function animateRoll(request){
    const trays=Array.from(document.querySelectorAll('.craps-dice'));
    const saved=trays.map(tray=>({tray,html:tray.innerHTML,label:tray.parentElement.querySelector('strong'),text:tray.parentElement.querySelector('strong')?.textContent}));
    saved.forEach(({tray,label})=>{tray.classList.add('is-rolling');tray.setAttribute('aria-busy','true');if(label)label.textContent='Lanzando dados…'});
    let frame=0;
    // These faces are only a visual shuffle, never the game result.
    const timer=setInterval(()=>{frame++;trays.forEach(tray=>{const faces=[1+frame%6,1+(frame*5+2)%6];tray.querySelectorAll('.craps-die').forEach((node,i)=>{const content=document.createElement('div');content.innerHTML=die(faces[i]);node.innerHTML=content.firstChild.innerHTML;node.setAttribute('aria-label','Dado rodando')})})},110);
    try{
      const [result]=await Promise.all([request(),new Promise(resolve=>setTimeout(resolve,1700))]);
      return result;
    }finally{
      clearInterval(timer);
      saved.forEach(({tray,html,label,text})=>{tray.classList.remove('is-rolling');tray.removeAttribute('aria-busy');tray.innerHTML=html;if(label)label.textContent=text});
    }
  }
  function settleDice(){document.querySelectorAll('.craps-dice').forEach(tray=>{tray.classList.remove('is-landing');void tray.offsetWidth;tray.classList.add('is-landing')})}
  function render(stage,phase,result,point){
    const stamp=JSON.stringify([phase,result,point]);if(stage.dataset.crapsStamp===stamp&&stage.querySelector('.craps-scene'))return;stage.dataset.crapsStamp=stamp;
    stage.innerHTML=`<div class="craps-scene"><div class="craps-table-scroll">${layout(point)}</div><div class="craps-throw"><div class="craps-point">${point?'PUNTO '+point:'SALIDA · OFF'}</div><div class="craps-dice">${(result.dice||[1,1]).map(die).join('')}</div><strong>${result.total?'Última tirada: '+result.total:'Esperando lanzamiento'}</strong><p>${phase==='betting'?'Apuestas abiertas':phase==='playing'?'El administrador lanza los dados':'Ronda terminada'}</p></div><p class="craps-zone-help" role="status">Toca una zona para conocer su apuesta.</p></div>`;
    stage.querySelector('.craps-felt').onclick=e=>{const b=e.target.closest('[data-craps-zone]');if(!b)return;stage.querySelectorAll('[data-craps-zone]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));stage.querySelector('.craps-zone-help').textContent=modes[b.dataset.crapsZone][1]};
  }
  let choice='pass';
  function mount(){
    const section=document.createElement('section');section.id='craps-choices';section.hidden=true;
    section.innerHTML='<div class="craps-table-scroll">'+layout(0)+'</div><p class="craps-zone-help" role="status"></p>';
    document.getElementById('bet-rules').before(section);
    function select(key){choice=key;section.querySelectorAll('[data-craps-zone]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crapsZone===key)));section.querySelector('.craps-zone-help').textContent=modes[key][0]+': '+modes[key][1];const input=document.getElementById('wager');input.step=['place6','place8'].includes(key)?'30':'10';if(Number(input.value)%Number(input.step))input.value=Math.ceil(Number(input.value)/Number(input.step))*Number(input.step)}
    section.onclick=e=>{const b=e.target.closest('[data-craps-zone]');if(b&&!b.disabled)select(b.dataset.crapsZone)};select('pass');
  }
  window.CasinoCraps={render,layout,modes,mount,animateRoll,settleDice,getChoice:()=>choice};
})();
