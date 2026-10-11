(() => {
  const order=['0','28','9','26','30','11','7','20','32','17','5','22','34','15','3','24','36','13','1','00','27','10','25','29','12','8','19','31','18','6','21','33','16','4','23','35','14','2'];
  const reds=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const color=n=>n==='0'||n==='00'?'green':reds.has(Number(n))?'red':'black';
  const point=(r,a)=>[250+r*Math.sin(a*Math.PI/180),250-r*Math.cos(a*Math.PI/180)];
  const wheel=()=>`<svg class="roulette-disc" viewBox="0 0 500 500" role="img" aria-label="Ruleta americana: 38 casillas, cero y doble cero"><circle cx="250" cy="250" r="243" fill="#342119" stroke="#d4b373" stroke-width="7"/><circle cx="250" cy="250" r="230" fill="#a58245"/>${order.map((n,i)=>{const angle=i*360/38,from=point(223,angle-180/38),to=point(223,angle+180/38),label=point(202,angle);return `<path d="M250 250 L${from} A223 223 0 0 1 ${to} Z" fill="${{green:'#087d50',red:'#b82839',black:'#151a1c'}[color(n)]}" stroke="#d7bb7c" stroke-width="1"/><text x="${label[0]}" y="${label[1]}" transform="rotate(${angle},${label})" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="16" font-family="Arial,sans-serif" font-weight="700">${n}</text>`}).join('')}<circle cx="250" cy="250" r="171" fill="#63442b" stroke="#d4b373" stroke-width="5"/><circle cx="250" cy="250" r="148" fill="#152d25" stroke="#947746" stroke-width="2"/><circle cx="250" cy="250" r="72" fill="#b69555" stroke="#edcf8e" stroke-width="4"/><path d="M190 250h120m-60-60v120" stroke="#f5dea3" stroke-width="10" stroke-linecap="round"/><circle cx="250" cy="250" r="19" fill="#77572e"/></svg>`;
  function render(stage,phase,result={},round=''){
    const number=result.number===37?'00':String(result.number??'');
    const valid=order.includes(number),stamp=JSON.stringify([phase,result,round]);
    if(stage.dataset.rouletteStamp===stamp&&stage.querySelector('.roulette-scene'))return;
    stage.dataset.rouletteStamp=stamp;
    const angle=valid?order.indexOf(number)*360/38:0;
    stage.innerHTML=`<div class="roulette-scene ${phase==='playing'?'rolling':valid?'landed':''}"><div class="roulette-machine">${wheel()}<div class="roulette-ball-orbit" style="--landing:${angle+1440}deg"><i></i></div></div><div class="roulette-readout"><span>RULETA AMERICANA</span><strong class="roulette-result ${valid?color(number):''}">${valid?number:'—'}</strong><h2>${valid?'Número ganador':phase==='playing'?'Apuestas cerradas':'Haz tu apuesta'}</h2><p>${valid?'La bolita señala el resultado de esta ronda.':phase==='playing'?'El administrador realiza el sorteo.':'0 y 00 verdes · 1 al 36 rojos y negros'}</p></div></div>`;
  }
  function mountBetting(){
    const container=document.getElementById('roulette-choices'),select=document.getElementById('bet-choice'),input=document.getElementById('bet-number');
    const double=document.createElement('option');double.value='00';double.textContent='Doble cero · 00';select.append(double);
    const board=document.createElement('div');board.className='roulette-bet-layout';board.setAttribute('aria-label','Tablero de apuestas de ruleta');
    const cell=(value,label,kind)=>`<button type="button" data-roulette-bet="${value}" class="bet-square ${kind}" aria-pressed="false">${label}</button>`;
    board.innerHTML=`<div class="bet-zeros">${cell('0','0','green')}${cell('00','00','green')}</div><div class="bet-numbers">${Array.from({length:36},(_,i)=>cell(String(i+1),i+1,color(String(i+1)))).join('')}</div><div class="bet-outside">${[['low','1–18'],['even','PAR'],['red','ROJO'],['black','NEGRO'],['odd','IMPAR'],['high','19–36']].map(([v,l])=>cell(v,l,v==='red'||v==='black'?v:'outside')).join('')}</div><p class="bet-selection" role="status"></p>`;
    // Traditional horizontal layout: 3/6/... above 2/5/... and 1/4/....
    board.querySelectorAll('.bet-numbers button').forEach(button=>{const n=Number(button.dataset.rouletteBet);button.style.gridColumn=String(Math.ceil(n/3));button.style.gridRow=String(3-(n-1)%3)});
    container.prepend(board);select.closest('label').hidden=true;input.closest('label').hidden=true;
    function sync(){const value=select.value==='number'?input.value:select.value;board.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rouletteBet===value)));board.querySelector('.bet-selection').textContent='Apuesta seleccionada: '+(select.value==='number'?input.value:select.selectedOptions[0].textContent)}
    board.onclick=e=>{const b=e.target.closest('button[data-roulette-bet]');if(!b||b.disabled)return;const value=b.dataset.rouletteBet;if(/^\d+$/.test(value)&&value!=='00'){select.value='number';input.value=value}else select.value=value;sync()};
    select.addEventListener('change',sync);sync();
  }
  window.CasinoRoulette={render,mountBetting,order,color};
})();
