(()=>{
 const colors=['#359ce4','#ed6581','#a278e5','#eeac39','#40b59a'];
 for(const ball of [document.getElementById('last-ball'),document.querySelector('.presentation-ball')]){
  if(!ball)continue;
  ball.classList.add('tombola-output');
  // app.js renders the same visibleBall() candidate used by the board.
  // Only derive its colour here; never generate a second random number.
  function sync(){
   const n=Number(ball.querySelector('strong').textContent);
   ball.style.setProperty('--ball-color',colors[Math.floor((n-1)/15)]||colors[0]);
  }
  new MutationObserver(sync).observe(ball.querySelector('strong'),{childList:true,subtree:true,characterData:true});sync();
 }
})();
