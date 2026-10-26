const $=id=>document.getElementById(id);
const W=360,H=560,PANEL=410;
const cv=$('c');let ctx=cv.getContext('2d');
const dpr=Math.min(2,window.devicePixelRatio||1);
cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage=$('stage'),frame=$('frame');
function fit(){const r=stage.getBoundingClientRect();const s=Math.max(.1,Math.min(r.width/W,r.height/H));
  frame.style.width=Math.floor(W*s)+'px';frame.style.height=Math.floor(H*s)+'px'}
new ResizeObserver(fit).observe(stage);fit();

// ---------- villains ----------
const VILLAINS={
  abuser:{name:'Child Abuser',short:'Abuser',unlock:2000,bn:'শিশু নির্যাতনকারী',
    base:170,board:'#1f3a33',chalk:['শিশু নির্যাতন অপরাধ','চুপ থাকবো না'],
    sName:'Back of head',sMult:1.6,sTight:.75,sPt:[180,156],sPath:'back',
    ouch:['Ouch!','Maaf koren!','Ami kichu kori nai!','Ar korbo na!'],
    perfBn:['ওরে বাবারে!','মাফ করে দাও!','আর করুম না!','উফফ, আমার দাঁত!'],missBn:['হিহিহি, লাগে নাই!','ধরতে পারবা না!','ভুল নিশানা!'],
    voice:{pitch:1.9,rate:1.15},
    help:[['1098','Child Helpline (toll-free)'],['999','National Emergency']],
    intro:'A fraud who abuses children while hiding behind religious dress. This game targets abusers, not faith.'},
  robber:{name:'Snatcher',short:'Snatcher',unlock:0,bn:'ছিনতাইকারী',
    base:190,board:'#1b2236',chalk:['ছিনতাই রুখে দাও','নিরাপদ রাস্তা চাই'],
    sName:'Snatching hand',sMult:1.6,sTight:.75,sPt:[284,300],sPath:'hand',
    ouch:['Bhai, phone ferot dichhi!','Ar chhintai korbo na!','Ouch!','Maaf koren!'],perfBn:['ভাই, ফোন ফেরত দিচ্ছি!','ওরে মা গো!','আর ছিনতাই করুম না!','আমার ক্যাপ!'],missBn:['ধরতে পারবা না, হা হা!','ধীরে ভাই, ধীরে!','দৌড়ে আয়!'],
    voice:{pitch:1.25,rate:1.35},
    help:[['999','National Emergency (police)']],
    intro:'The street snatcher who grabs phones and bags from rickshaws. Make him regret it.'},
  rapist:{name:'Rapist',short:'Rapist',unlock:5000,bn:'ধর্ষক',
    base:200,board:'#3a1d22',chalk:['ধর্ষকের সর্বোচ্চ শাস্তি চাই','বিচার চাই'],
    sName:'Top of head',sMult:1.6,sTight:.75,sPt:[180,112],sPath:'top',
    ouch:['Amar mama ke chenen?','Ami nirdosh!','Aaargh!','Maaf koren!'],perfBn:['আমার মামাকে চেনেন?','আমি নির্দোষ!','আমার চশমা!','আরে আরে, থামুন!'],missBn:['কিছুই হবে না আমার!','হা হা হা, লাগেনি!','আমার অনেক ক্ষমতা!'],
    voice:{pitch:.55,rate:.8},
    help:[['109','Helpline for violence against women & children (toll-free)'],['999','National Emergency']],
    intro:'The smug, "well-connected" criminal who thinks nothing will happen to him. Show him that something will happen.'}
};
const GRADES=[{n:'PERFECT',f:.3,m:1.5,c:'#f2b134'},{n:'GREAT',f:.65,m:1.2,c:'#f4efe4'},{n:'GOOD',f:1,m:1,c:'#9fd3c0'}];
// A session is STAGES successful hits against a clock. Keep the constants in this block in sync with backend/src/utils/game-rules.js.
const STAGES=12,TIME_LIMIT_MS=60000,TIME_BONUS_PER_SEC=20;
// Weapons are chosen before a game. Each unlocks at a TOTAL score and adds a small score multiplier.
const WEAPONS={
  hand:{n:'Bare hand',verb:'Slap',title:'Slap',mult:1,unlock:0,word:'SLAP!',sWord:'THWACK!',bn:false},
  sandal:{n:'Sandal',verb:'Shoe-beat',title:'Shoe',mult:1.05,unlock:1000,word:'জুতা পেটা!',sWord:'জুতা পেটা!',bn:true},
  broom:{n:'Broom',verb:'Broom-beat',title:'Broom',mult:1.1,unlock:3000,word:'ঝাড়ু পেটা!',sWord:'ঝাড়ু পেটা!',bn:true},
  bamboo:{n:'Bamboo stick',verb:'Whack',title:'Whack',mult:1.15,unlock:6000,word:'বাঁশ পেটা!',sWord:'বাঁশ পেটা!',bn:true},
  belan:{n:'Rolling pin',verb:'Bonk',title:'Bonk',mult:1.2,unlock:10000,word:'BONK!',sWord:'BONK!',bn:false},
  pan:{n:'Frying pan',verb:'Clang',title:'Clang',mult:1.25,unlock:15000,word:'CLANG!',sWord:'CLANG!',bn:false}
};
// The bottom area is hit with a kick (no weapon, so no weapon multiplier). It unlocks per villain.
const KICK={word:'লাথি!',sWord:'লাথি!',bn:true},KICK_UNLOCK=1500,SPOT_MULT={L:1,R:1,B:2};

// ---------- progress: what is unlocked ----------
// Total score unlocks villains and weapons; the score earned against one villain unlocks the bottom kick on that villain.
// Only LOGGED-IN players unlock anything: their progress comes from the server (verified, saved scores).
// A guest always has the starting set (Snatcher, bare hand, no kick) whatever they score.
const WEAPON_KEY='slap-weapon';
const blankProgress=()=>({total:0,per:{abuser:0,robber:0,rapist:0}});
let progress=blankProgress(),progressFromServer=false;
const villainOpen=(k,p=progress)=>p.total>=VILLAINS[k].unlock;
const weaponOpen=(w,p=progress)=>p.total>=WEAPONS[w].unlock;
const kickOpen=(k,p=progress)=>(p.per[k]||0)>=KICK_UNLOCK;
function unlockLabels(prev,next){
  const out=[];
  Object.entries(VILLAINS).forEach(([k,v])=>{if(!villainOpen(k,prev)&&villainOpen(k,next))out.push(`New villain: ${v.name}`)});
  Object.entries(WEAPONS).forEach(([k,w])=>{if(!weaponOpen(k,prev)&&weaponOpen(k,next))out.push(`New weapon: ${w.n}`)});
  Object.entries(VILLAINS).forEach(([k,v])=>{if(!kickOpen(k,prev)&&kickOpen(k,next))out.push(`Bottom kick unlocked on the ${v.short}`)});
  return out;
}
function nextUnlock(){
  const c=[];
  Object.values(VILLAINS).forEach(v=>{if(progress.total<v.unlock)c.push({at:v.unlock,label:v.name})});
  Object.values(WEAPONS).forEach(w=>{if(progress.total<w.unlock)c.push({at:w.unlock,label:w.n})});
  c.sort((a,b)=>a.at-b.at);return c[0]||null;
}
function chosenWeapon(){
  let w='hand';try{w=localStorage.getItem(WEAPON_KEY)||'hand'}catch(e){}
  return WEAPONS[w]&&weaponOpen(w)?w:'hand';
}
function setWeaponPref(w){try{localStorage.setItem(WEAPON_KEY,w)}catch(e){}}
const bestKey=k=>'slap-best-'+k;
function getBest(k){try{return +localStorage.getItem(bestKey(k))||0}catch(e){return 0}}
function setBest(k,v){try{localStorage.setItem(bestKey(k),v)}catch(e){}}

let S=null;
function newGame(vk,weapon='hand'){
  const keep=(S&&S.vk===vk&&S.spot)||'L';
  S={phase:'ready',vk,weapon:WEAPONS[weapon]&&weaponOpen(weapon)?weapon:'hand',score:0,combo:0,misses:0,level:0,spot:keep==='B'&&!kickOpen(vk)?'L':keep,power:0,chargeT:0,locked:0,
     log:[],timerOn:false,timeLeft:TIME_LIMIT_MS,cleared:false,finalLeft:0,bonus:0,needle:0,zone:0,dir:1,speed:0,wobble:false,travel:0,t:0,anim:null,red:{L:0,R:0,S:0,B:0},turn:0,turnB:0,ts:1,drop:null,stars:[],last:null,bubble:null,shake:0};
  const v=VILLAINS[vk];
  $('h1').innerHTML=`${WEAPONS[S.weapon].title} the <em>${v.short}</em>`;
  $('spotS').innerHTML=`${v.sName}<small>×${v.sMult.toFixed(1)} · key 3</small>`;
  $('best').textContent=getBest(vk);
  hud();ui();
}
const V=()=>VILLAINS[S.vk];
const spotMult=sp=>sp==='S'?V().sMult:SPOT_MULT[sp]||1;
const spotTight=sp=>sp==='S'?V().sTight:sp==='B'?.7:1;
const spotInfo=sp=>sp==='S'?{name:V().sName,mult:V().sMult}:sp==='B'?{name:'Bottom (kick)',mult:SPOT_MULT.B}:{name:sp==='L'?'Left cheek':'Right cheek',mult:1};
const weaponMult=(sp)=>sp==='B'?1:WEAPONS[S.weapon].mult;
const zoneHalf=()=>Math.max(10,38-S.level*2.8)*spotTight(S.spot);
// the PERFECT window shrinks every stage (11.4° -> 3°) while the needle gets faster, so late stages are brutal
const perfectHalf=()=>Math.max(3,11.4-S.level*.9)*spotTight(S.spot);
const angDiff=(a,b)=>{let d=Math.abs(a-b)%360;return d>180?360-d:d};
const sstep=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const easeOutBack=x=>1+2.70158*Math.pow(x-1,3)+1.70158*Math.pow(x-1,2);
const hitPoint=a=>a.spot==='L'?[148,196]:a.spot==='R'?[212,196]:a.spot==='B'?[180,370]:V().sPt;
const isPerfect=a=>!!(a&&a.hit&&a.g.n==='PERFECT');
// camera push-in envelope for a perfect hit: eases in during the wind-up, holds, then relaxes
const perfEnv=a=>isPerfect(a)&&!reduceMotion?sstep((a.t-.03)/.1)*(1-sstep((a.t-.5)/.45)):0;
// slow motion for a perfect hit: slow approach, hit-stop on contact, slow follow-through, ease back to real time
function timeScale(){
  const a=S.anim;if(!isPerfect(a)||reduceMotion)return 1;
  const t=a.t;
  if(t<.12)return .45;
  if(t<.16)return .1;
  if(t<.4)return .3;
  return .3+.7*sstep((t-.4)/.3);
}

function hud(){
  $('score').textContent=S.score;$('combo').textContent='×'+S.combo;
  $('lives').textContent='●'.repeat(3-S.misses)+'○'.repeat(S.misses);
}
function ui(){
  const act=$('act'),lock=S.phase==='charge'||S.phase==='timing';
  const kickOk=kickOpen(S.vk);
  $('spotB').innerHTML=kickOk?`Bottom (kick)<small>×${SPOT_MULT.B.toFixed(1)} · key 4</small>`:`🔒 Bottom<small>${progressFromServer?`${KICK_UNLOCK.toLocaleString()} pts on ${V().short}`:'Nickname'}</small>`;
  document.querySelectorAll('.spot').forEach(b=>{
    const locked=b.dataset.spot==='B'&&!kickOk;
    b.classList.toggle('locked',locked);b.setAttribute('aria-pressed',b.dataset.spot===S.spot);b.disabled=lock||locked;
  });
  act.classList.toggle('go',S.phase==='timing');
  const verb=S.spot==='B'?'Kick':WEAPONS[S.weapon].verb;
  act.textContent=S.phase==='charge'?'RELEASE AT THE TOP':S.phase==='timing'?`TAP — ${verb.toUpperCase()}!`:S.phase==='anim'?'…':'HOLD TO CHARGE';
}

// ---------- actions ----------
function press(){
  if(S.phase==='ready'){ensureAudio();S.phase='charge';S.chargeT=0;S.power=0;ui()}
  else if(S.phase==='timing')resolve(angDiff(S.needle,S.zone));
}
function release(){
  if(S.phase!=='charge')return;
  S.locked=S.power;S.phase='timing';
  S.needle=Math.random()*360;S.zone=(S.needle+110+Math.random()*140)%360;
  S.speed=Math.min(560,V().base*(1+S.level*.216));S.dir=S.level>=4&&Math.random()<.5?-1:1;S.wobble=S.level>=8;S.travel=0;S.t=0;
  ui();
}
function resolve(d){
  const half=zoneHalf(),g=d<=perfectHalf()?GRADES[0]:d<=half*.65?GRADES[1]:d<=half?GRADES[2]:null;
  if(g){
    // rounded to 4 decimals so the server can replay the exact same score from the round log
    const force=Math.round(Math.max(.05,S.locked*(1-.35*d/half))*1e4)/1e4;
    // same operation order as the server (backend/src/utils/game-rules.js roundScore) so both round identically
    const pts=Math.round(100*force*g.m*spotInfo(S.spot).mult*weaponMult(S.spot)*(1+S.combo*.15));
    S.score+=pts;S.combo++;S.level++;S.log.push({spot:S.spot,grade:g.n,force});
    if(S.level>=STAGES){S.cleared=true;S.finalLeft=Math.max(0,Math.floor(S.timeLeft));S.timerOn=false} // clock stops on the winning hit
    S.last={txt:`${g.n} · ${Math.round(force*100)}% force · +${pts}`,c:g.c};
    S.anim={t:0,hit:true,spot:S.spot,force,g,pts,combo:S.combo,impacted:false};
  }else{
    S.combo=0;S.misses++;S.log.push({spot:S.spot,grade:'MISS'});
    S.last={txt:'MISS · combo lost',c:'#d6403a'};
    S.anim={t:0,hit:false,spot:S.spot,force:0,impacted:false};
  }
  S.phase='anim';hud();ui();
}
function impact(){
  const a=S.anim,v=V(),pt=hitPoint(a),perfect=isPerfect(a);
  if(a.hit){
    sfxHit(a.spot==='B'?'kick':S.weapon,a.force);
    S.shake=reduceMotion?0:perfect?.35:.12+.25*a.force;
    if(a.spot!=='S'||S.vk==='abuser')S.red[a.spot]=Math.min(1,S.red[a.spot]+.3+.35*a.force);
    for(let i=0;i<(perfect?14:7);i++){const an=Math.random()*Math.PI*2,sp=60+Math.random()*120;
      S.stars.push({k:'star',g:200,x:pt[0],y:pt[1],vx:Math.cos(an)*sp,vy:Math.sin(an)*sp-40,t:perfect?1.2:.7})}
    if(perfect&&!reduceMotion){
      for(let i=0;i<34;i++){const an=Math.random()*Math.PI*2,sp=180+Math.random()*320;
        S.stars.push({k:'spark',g:260,x:pt[0],y:pt[1],vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,t:.8+Math.random()*.5})}
      const cols=['#f2b134','#d6403a','#f4efe4','#9fd3c0','#4a8fd6'];
      for(let i=0;i<40;i++){const an=-Math.PI/2+(Math.random()-.5)*2.6,sp=200+Math.random()*380;
        S.stars.push({k:'conf',g:520,x:pt[0],y:pt[1],vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,t:1.5+Math.random()*.6,
          r:Math.random()*6,vr:(Math.random()-.5)*14,c:cols[i%cols.length]})}
    }
    const dir=a.spot==='R'?-1:1;
    if(S.vk==='robber'&&a.spot==='S')S.drop={kind:'phone',x:0,y:0,vx:120,vy:-240,r:0};
    else if(perfect&&a.spot!=='B'){
      if(S.vk==='abuser')S.drop={kind:'cap',x:0,y:0,vx:dir*140,vy:-280,r:0};
      else if(S.vk==='robber')S.drop={kind:'cap',x:0,y:0,vx:dir*140,vy:-280,r:0};
      else S.drop={kind:'glasses',x:0,y:0,vx:dir*160,vy:-250,r:0};
    }
    S.bubble=perfect?{txt:funny('perfect'),t:1.7}:{txt:v.ouch[Math.floor(Math.random()*v.ouch.length)],t:.9};
  }else{
    sfxWhoosh();
    S.bubble={txt:funny('miss'),t:1.2};
  }
}
// Social layer hooks: js/game-integration.js listens for these. The game itself never touches the network.
const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail}));
let screen=null; // which overlay screen is showing: 'select' | 'intro' | 'over' | null (playing)
function begin(vk,weapon){
  newGame(vk,weapon);S.timerOn=true;screen=null;ov.hidden=true;setWeaponPref(S.weapon);
  emit('game:start',{villain:vk,weapon:S.weapon});
}
function endAnim(){
  S.anim=null;S.drop=null;S.power=0;
  if(S.cleared){gameOver('cleared');return}
  if(S.misses>=3){gameOver('lives');return}
  if(S.timeLeft<=0){gameOver('timeout');return}
  S.phase='ready';ui();
}

// ---------- emergency helplines (shown prominently on the landing and game-over screens) ----------
const HELP_ALL=[['999','National Emergency','জাতীয় জরুরি সেবা'],['1098','Child helpline','শিশু হেল্পলাইন'],['109','Women & children','নারী ও শিশু হেল্পলাইন']];
const helpFor=v=>HELP_ALL.filter(([n])=>v.help.some(([m])=>m===n));
const helpBox=list=>`<aside class="helpbox" aria-label="Emergency helplines">
  <p class="hb-title"><span class="hb-ico" aria-hidden="true">☎</span> If you or a child you know is in danger, call now<span class="hb-bn">বিপদে পড়লে এখনই ফোন করুন</span></p>
  <ul>${list.map(([n,en,bn])=>`<li><a class="hb-num" href="tel:${n}" aria-label="Call ${n}, ${en}">${n}</a><span class="hb-lbl">${en}<small>${bn}</small></span></li>`).join('')}</ul>
</aside>`;

// ---------- overlay ----------
const ov=$('overlay'),ovTitle=$('ovTitle'),ovBody=$('ovBody'),ovFoot=$('ovFoot'); // ovFoot is pinned under the (scrollable) body: the helplines are never scrolled out of sight
const controlsEl=document.querySelector('.controls');
// While a menu screen (landing, intro, game over) is showing, it takes the whole area below the header and the
// hit-spot / charge controls give their space back. While playing, the canvas is fitted to the free area.
const syncControls=()=>{controlsEl.classList.toggle('is-off',!ov.hidden);document.body.classList.toggle('menu',!ov.hidden);fit()};
new MutationObserver(syncControls).observe(ov,{attributes:true,attributeFilter:['hidden']});
syncControls();
function showSelect(){
  if(S)S.phase='start';
  screen='select';
  const nx=nextUnlock();
  ovTitle.innerHTML='Who gets <em>punished</em>?';
  ovBody.innerHTML=`<p class="lead l-intro">A protest game. Pick a criminal, charge your force, and nail the timing. Clear ${STAGES} stages before the clock runs out. Every hit makes the next one harder.</p>
    <div class="cards" id="cards"></div>
    <p class="lead progress-line">${progressFromServer?`Total score <b>${progress.total.toLocaleString()}</b><br>${nx?`Next unlock: ${nx.label} at ${nx.at.toLocaleString()}`:'Everything unlocked'}`:'Choose a nickname to save your scores and unlock more villains, weapons and hit areas.'}</p>
    ${progressFromServer?'':'<button class="ovbtn small" id="loginHint" type="button">Choose a nickname</button>'}
    <p class="lead l-hint">Hold to charge · release at the top<br>Tap in the gold arc</p>
    `;
  ovFoot.innerHTML=helpBox(HELP_ALL);
  const cards=$('cards');
  const lh=$('loginHint');if(lh)lh.addEventListener('click',()=>emit('ui:login'));
  Object.entries(VILLAINS).forEach(([k,v])=>{
    const open=villainOpen(k);
    const b=document.createElement('button');b.type='button';b.className='card'+(open?'':' locked');b.disabled=!open;
    b.innerHTML=`<span class="nm">${v.name}</span><span class="bnm">${v.bn}</span><span class="wp">${open?`best ${getBest(k)}`:`🔒 ${progressFromServer?`${v.unlock.toLocaleString()} pts`:'Needs a nickname'}`}</span>`;
    b.prepend(makeThumb(k));
    if(open)b.addEventListener('click',()=>{ensureAudio();showIntro(k)});
    cards.appendChild(b);
  });
  ov.hidden=false;
  if(S)ui();
}
function showIntro(k,picked){
  screen='intro';ovFoot.innerHTML='';
  const v=VILLAINS[k],w=picked&&weaponOpen(picked)?picked:chosenWeapon();
  ovTitle.innerHTML=`${WEAPONS[w].title} the <em>${v.short}</em>`;
  const per=progress.per[k]||0;
  ovBody.innerHTML=`<p class="bn" style="font-size:1rem">${v.bn}</p><p>${v.intro}</p>
    <p class="lead">${STAGES} stages · ${TIME_LIMIT_MS/1000} seconds. Finish with time to spare for a bonus (+${TIME_BONUS_PER_SEC} per second left).</p>
    <p class="lead">Choose your weapon</p>
    <div class="weapons" id="weapons" role="group" aria-label="Weapon"></div>
    <p class="lead">Special target: ${v.sName} (×${v.sMult.toFixed(1)}, tighter timing). ${kickOpen(k)?`Bottom kick unlocked (×${SPOT_MULT.B.toFixed(1)}, tightest timing).`:(progressFromServer?`Bottom kick: 🔒 score ${KICK_UNLOCK.toLocaleString()} against the ${v.short} to unlock (${per.toLocaleString()}/${KICK_UNLOCK.toLocaleString()}).`:'Bottom kick: 🔒 needs a nickname.')}</p>
    <div class="btnrow"><button class="ovbtn" id="go" type="button">Start</button><button class="ovbtn ghost" id="back" type="button">Back</button></div>`;
  const grid=$('weapons');
  Object.entries(WEAPONS).forEach(([id,wp])=>{
    const open=weaponOpen(id),b=document.createElement('button');
    b.type='button';b.className='weapon'+(open?'':' locked');b.disabled=!open;b.setAttribute('aria-pressed',String(id===w));
    b.innerHTML=`<b>${wp.n}</b><small>${open?`×${wp.mult.toFixed(2)}`:`🔒 ${progressFromServer?`${wp.unlock.toLocaleString()} pts`:'Nickname'}`}</small>`;
    if(open)b.addEventListener('click',()=>{setWeaponPref(id);showIntro(k,id)});
    grid.appendChild(b);
  });
  $('go').addEventListener('click',()=>begin(k,w));
  $('back').addEventListener('click',showSelect);
  $('go').focus();
}
function gameOver(reason){
  S.phase='over';S.timerOn=false;ui();
  const v=V();
  const secsLeft=reason==='cleared'?Math.floor(S.finalLeft/1000):0;
  S.bonus=secsLeft*TIME_BONUS_PER_SEC;S.score+=S.bonus;hud();
  screen='over';
  let best=getBest(S.vk);
  if(S.score>best){best=S.score;setBest(S.vk,best);$('best').textContent=best}
  // Unlocks are reported by js/game-integration.js once a logged-in player's score has been verified and saved.
  const unlockHtml='';
  ovTitle.textContent=reason==='cleared'?`All ${STAGES} stages cleared!`:reason==='timeout'?'Time’s up!':'Game over';
  ovBody.innerHTML=`<p class="big">${S.score}</p><p class="lead">${v.name} · best ${best} · stage ${Math.min(S.level,STAGES)}/${STAGES}</p>
  ${reason==='cleared'?`<p class="lead">Time bonus +${S.bonus} (${secsLeft}s left)</p>`:''}
  ${unlockHtml}
  <p class="protest-line">A hit in a game is a protest. A phone call can stop a real crime.</p>
  `;
  ovFoot.innerHTML=helpBox(helpFor(v));
  ovBody.innerHTML+=`
  <div id="socialSlot" class="social-slot"></div>
  <div class="btnrow"><button class="ovbtn" id="again" type="button">Play again</button><button class="ovbtn ghost" id="pick" type="button">Change villain</button></div>`;
  $('again').addEventListener('click',()=>begin(S.vk,S.weapon));
  $('pick').addEventListener('click',showSelect);
  ov.hidden=false;$('again').focus();
  emit('game:over',{villain:S.vk,score:S.score,rounds:S.log.slice(),best,end:reason,timeLeftMs:reason==='cleared'?S.finalLeft:0});
}
$('change').addEventListener('click',()=>{if(S&&(S.phase==='charge'||S.phase==='timing'||S.phase==='anim'))return;showSelect()});

// ---------- input ----------
const act=$('act');
function down(e){if(e.button>0)return;e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}if(S&&ov.hidden)press()}
function up(){if(S)release()}
[act,cv].forEach(el=>{el.addEventListener('pointerdown',down);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  el.addEventListener('contextmenu',e=>e.preventDefault())});
document.querySelectorAll('.spot').forEach(b=>b.addEventListener('click',()=>{if(b.disabled||!S)return;S.spot=b.dataset.spot;ui()}));
addEventListener('keydown',e=>{
  if(!S||!ov.hidden||document.querySelector('dialog[open]'))return;
  if(e.code==='Space'){e.preventDefault();if(!e.repeat)press()}
  else if(['1','2','3','4'].includes(e.key)&&S.phase!=='charge'&&S.phase!=='timing'){
    const sp='LRSB'[+e.key-1];
    if(sp!=='B'||kickOpen(S.vk)){S.spot=sp;ui()}
  }
});
addEventListener('keyup',e=>{if(e.code==='Space'&&S&&!document.querySelector('dialog[open]'))release()});

// ---------- sound ----------
let ac=null,muted=false;
function ensureAudio(){if(!ac){try{ac=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(ac&&ac.state==='suspended')ac.resume()}
function noise(dur,freq,q,gain,curve){
  if(!ac||muted)return;const n=Math.floor(ac.sampleRate*dur),b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,curve);
  const s=ac.createBufferSource();s.buffer=b;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;f.Q.value=q;
  const g=ac.createGain();g.gain.value=gain;s.connect(f).connect(g).connect(ac.destination);s.start();
}
function thump(f0,gain){
  if(!ac||muted)return;const o=ac.createOscillator(),g=ac.createGain(),t=ac.currentTime;
  o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(45,t+.15);
  g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.2);
}
function sfxHit(w,force){
  if(w==='hand'){noise(.16,1700,.7,.5+.8*force,4);thump(160,.4*force)}
  else if(w==='sandal'){noise(.14,1000,.9,.6+.8*force,3);thump(120,.55*force)}
  else if(w==='bamboo'){noise(.09,2600,1.2,.7+.8*force,5);thump(260,.35*force)}        // sharp crack
  else if(w==='belan'){noise(.1,700,1,.5+.6*force,4);thump(95,.7*force)}               // dull knock
  else if(w==='pan'){tone('triangle',0,.5,880,820,.3+.3*force);tone('square',0,.3,1320,1250,.1);noise(.05,3000,1,.4,5);thump(150,.3*force)} // clang
  else if(w==='kick'){noise(.12,500,.8,.7+.8*force,3);thump(70,.9*force)}              // thud
  else{noise(.32,3200,.5,.45+.6*force,1.6);noise(.12,900,.8,.4*force,4)}               // broom swish
}
function sfxWhoosh(){noise(.35,700,.6,.35,1.5)}

// cartoon "voice": a pitched oscillator glide, optionally through a sweeping vowel filter (formant) and vibrato
function tone(type,t0,dur,f0,f1,gain,opt={}){
  if(!ac||muted)return;
  const t=ac.currentTime+t0,o=ac.createOscillator(),g=ac.createGain();o.type=type;
  o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  let out=o;
  if(opt.formant){const f=ac.createBiquadFilter();f.type='bandpass';f.Q.value=opt.q||3;
    f.frequency.setValueAtTime(opt.formant[0],t);f.frequency.linearRampToValueAtTime(opt.formant[1],t+dur);o.connect(f);out=f}
  if(opt.vib){const l=ac.createOscillator(),lg=ac.createGain();l.frequency.value=opt.vib[0];lg.gain.value=opt.vib[1];
    l.connect(lg).connect(o.frequency);l.start(t);l.stop(t+dur+.05)}
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+Math.min(.03,dur/3));g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  out.connect(g).connect(ac.destination);o.start(t);o.stop(t+dur+.05);
}
const laugh=(n,gap,f,fm,type,gain,drift)=>{for(let i=0;i<n;i++){const fi=f*(1+i*drift);tone(type,i*gap,gap*.75,fi,fi*1.22,gain,{formant:fm})}};
// each villain has his own comic yelp (perfect hit) and cackle (miss)
const VOICE={
  abuser:{ // squeaky, panicky
    perfect(){tone('sawtooth',0,.5,700,1700,.9,{formant:[1100,2600],vib:[16,50]});tone('sawtooth',.5,.5,1700,230,.9,{formant:[2400,600],vib:[11,40]})},
    miss(){laugh(5,.14,820,[2300,2700],'sawtooth',.9,-.05)}},
  robber:{ // slide-whistle fall, then a boing; nasal giggle
    perfect(){tone('sine',0,.75,2100,260,.35,{vib:[9,90]});tone('triangle',.8,.4,420,140,.5,{vib:[28,70]})},
    miss(){laugh(6,.12,430,[900,1500],'square',.6,.04)}},
  rapist:{ // sad trombone "wah wah waaah"; deep pompous laugh
    perfect(){tone('sawtooth',0,.24,233,220,.9,{formant:[500,1000]});tone('sawtooth',.27,.24,220,208,.9,{formant:[500,1000]});
      tone('sawtooth',.54,.8,196,150,.9,{formant:[450,900],vib:[6,5]})},
    miss(){laugh(4,.26,140,[650,1100],'sawtooth',1,-.08)}}
};
// spoken Bengali line, only when the browser ships a Bengali voice; the synthesized sounds above always play
let bnVoice=null;
function pickVoice(){if(window.speechSynthesis)bnVoice=speechSynthesis.getVoices().find(v=>/^bn/i.test(v.lang))||null}
if(window.speechSynthesis){pickVoice();speechSynthesis.addEventListener('voiceschanged',pickVoice)}
function speak(txt,p){
  if(muted||!bnVoice)return;
  const u=new SpeechSynthesisUtterance(txt);u.voice=bnVoice;u.lang=bnVoice.lang;u.pitch=p.pitch;u.rate=p.rate;
  speechSynthesis.cancel();speechSynthesis.speak(u);
}
function funny(kind){
  const v=V(),lines=kind==='perfect'?v.perfBn:v.missBn,txt=lines[Math.floor(Math.random()*lines.length)];
  VOICE[S.vk][kind]();
  setTimeout(()=>speak(txt,v.voice),kind==='perfect'?260:420);
  return txt;
}
$('mute').addEventListener('click',()=>{muted=!muted;$('mute').textContent=muted?'Sound off':'Sound on';if(muted&&window.speechSynthesis)speechSynthesis.cancel()});

// ---------- drawing helpers ----------
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
const lerp=(a,b,t)=>a+(b-a)*t;
const DISP='400 %spx Anton, Impact, sans-serif',BODY='600 %spx "Hind Siliguri", system-ui, sans-serif',BN='700 %spx "Hind Siliguri", "Noto Sans Bengali", sans-serif';
const font=(tpl,s)=>tpl.replace('%s',s);
const line=(pts,c,w)=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke()};
const ell=(x,y,rx,ry,c,r=0)=>{ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,rx,ry,r,0,Math.PI*2);ctx.fill()};

function drawBoard(vk){
  const v=VILLAINS[vk];
  ctx.fillStyle=v.board;ctx.fillRect(-20,-20,W+40,PANEL+20);
  if(vk==='robber'){
    const g=ctx.createRadialGradient(310,20,5,310,20,220);g.addColorStop(0,'rgba(255,200,110,.35)');g.addColorStop(1,'rgba(255,200,110,0)');
    ctx.fillStyle=g;ctx.fillRect(-20,-20,W+40,PANEL+20);
    ctx.fillStyle='#2a3150';for(let i=0;i<5;i++)ctx.fillRect(i*80-10,250-((i*37)%60),58,PANEL);
    ctx.fillStyle='rgba(255,214,120,.5)';for(let i=0;i<5;i++)for(let j=0;j<3;j++)if((i+j)%2)ctx.fillRect(i*80+j*16,262-((i*37)%60)+j*22,8,10);
  }else if(vk==='rapist'){
    ctx.fillStyle='rgba(0,0,0,.18)';for(let i=0;i<9;i++)ctx.fillRect(0,i*48,W,2);
  }else{
    ctx.fillStyle='rgba(244,239,228,.05)';
    for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(40+i*60,60+(i%3)*90,50,14,.3,0,7);ctx.fill()}
  }
  ctx.fillStyle='rgba(244,239,228,.2)';ctx.font=font(BN,15);ctx.textAlign='left';ctx.fillText(v.chalk[0],14,30);
  ctx.textAlign='right';ctx.fillText(v.chalk[1],W-14,30);
  if(vk==='abuser'){ctx.fillStyle='#5a4330';ctx.fillRect(-20,PANEL-10,W+40,10);
    ctx.fillStyle='#f4efe4';ctx.fillRect(40,PANEL-14,18,4);ctx.fillStyle='#f2b134';ctx.fillRect(300,PANEL-14,14,4)}
  else{ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(-20,PANEL-10,W+40,10)}
}

function drawTupi(x,y,rot){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  ctx.beginPath();ctx.moveTo(-45,22);ctx.quadraticCurveTo(-43,-22,0,-24);ctx.quadraticCurveTo(43,-22,45,22);ctx.quadraticCurveTo(0,14,-45,22);ctx.closePath();
  ctx.fillStyle='#f7f5ee';ctx.fill();ctx.strokeStyle='#cbc5b8';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#d9d3c6';
  for(let r=0;r<3;r++)for(let c=-4;c<=4;c++){const px=c*9+(r%2)*4.5,py=-12+r*10;if(Math.abs(px)<38-r*2)ctx.fillRect(px-1.5,py-1.5,3,3)}
  ctx.restore();
}
function drawBallCap(x,y,rot){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  ctx.fillStyle='#8f1e1e';ctx.beginPath();ctx.ellipse(30,-8,26,7,-.5,0,7);ctx.fill();
  ctx.beginPath();ctx.moveTo(-42,22);ctx.quadraticCurveTo(-40,-24,0,-26);ctx.quadraticCurveTo(40,-24,42,22);ctx.quadraticCurveTo(0,16,-42,22);ctx.closePath();
  ctx.fillStyle='#c0302b';ctx.fill();ctx.strokeStyle='#7a1a17';ctx.lineWidth=2;ctx.stroke();
  line([[0,-26],[0,18]],'#7a1a17',1.5);line([[-24,-18],[-14,18]],'#7a1a17',1.5);line([[24,-18],[14,18]],'#7a1a17',1.5);
  ell(0,-25,4,3,'#7a1a17');
  ctx.fillStyle='#1b1512';rr(-10,12,20,8,3);ctx.fill();
  ctx.restore();
}
function drawGlasses(x,y,rot,cracked){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  ctx.fillStyle='#111';rr(-34,-10,30,20,7);ctx.fill();rr(4,-10,30,20,7);ctx.fill();
  ctx.strokeStyle='#d4a72c';ctx.lineWidth=2;rr(-34,-10,30,20,7);ctx.stroke();rr(4,-10,30,20,7);ctx.stroke();
  line([[-4,-4],[4,-4]],'#d4a72c',2);
  ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(-28,-6,8,3);ctx.fillRect(10,-6,8,3);
  if(cracked){line([[-26,-8],[-18,0],[-22,8]],'#ddd',1.2);line([[22,-9],[16,1],[26,8]],'#ddd',1.2)}
  ctx.restore();
}
function drawPhone(x,y,rot){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  ctx.fillStyle='#222';rr(-10,-18,20,36,4);ctx.fill();ctx.fillStyle='#4a8fd6';rr(-8,-15,16,28,2);ctx.fill();
  ctx.restore();
}

function mark(x,y,a,flip,weapon){
  if(a<=0)return;ctx.save();ctx.translate(x,y);ctx.scale(flip?-1:1,1);ctx.globalAlpha=Math.min(.75,a*.75);
  if(weapon==='hand'){
    ctx.fillStyle='#d8363c';ctx.beginPath();ctx.ellipse(0,4,10,9,0,0,7);ctx.fill();
    [[-8,-10,-.35],[-2,-13,-.1],[4,-12,.15],[10,-8,.4]].forEach(([fx,fy,r])=>{ctx.beginPath();ctx.ellipse(fx,fy,3,7,r,0,7);ctx.fill()});
    ctx.beginPath();ctx.ellipse(-12,6,3,6,-1.1,0,7);ctx.fill();
  }else if(weapon==='sandal'){
    ctx.rotate(.35);ctx.fillStyle='#6b3a2a';ctx.beginPath();ctx.ellipse(0,0,9,18,0,0,7);ctx.fill();
    ctx.strokeStyle='rgba(30,15,10,.8)';ctx.lineWidth=1.5;for(let i=-12;i<=12;i+=5){ctx.beginPath();ctx.moveTo(-7,i);ctx.lineTo(7,i);ctx.stroke()}
  }else if(weapon==='bamboo'){
    // two parallel welts
    ctx.lineCap='round';[-7,7].forEach(dx=>{ctx.strokeStyle='rgba(120,20,26,.85)';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(dx-10,-18);ctx.lineTo(dx+10,18);ctx.stroke();
      ctx.strokeStyle='rgba(224,70,76,.9)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(dx-10,-18);ctx.lineTo(dx+10,18);ctx.stroke()});
  }else if(weapon==='belan'){
    ctx.rotate(.5);ctx.fillStyle='rgba(200,60,66,.85)';rr(-6,-20,12,40,6);ctx.fill();ctx.strokeStyle='rgba(110,20,26,.8)';ctx.lineWidth=1.5;ctx.stroke();
  }else if(weapon==='pan'){
    ctx.strokeStyle='rgba(215,60,66,.85)';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,13,0,7);ctx.stroke();
    ctx.fillStyle='rgba(215,60,66,.3)';ctx.beginPath();ctx.arc(0,0,10,0,7);ctx.fill();
  }else if(weapon==='kick'){
    // dusty shoe print: sole, heel and tread
    ctx.rotate(-.2);ctx.fillStyle='rgba(235,226,200,.85)';ctx.beginPath();ctx.ellipse(0,-8,15,22,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(0,22,10,9,0,0,7);ctx.fill();
    ctx.strokeStyle='rgba(60,50,40,.55)';ctx.lineWidth=2;for(let i=-22;i<=8;i+=7){ctx.beginPath();ctx.moveTo(-11,i);ctx.lineTo(11,i);ctx.stroke()}
  }else{
    ctx.strokeStyle='#c42b33';ctx.lineWidth=1.6;ctx.lineCap='round';
    for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(-14+i*5,-14);ctx.lineTo(-6+i*5,14);ctx.stroke()}
  }
  ctx.restore();
}

function motionLines(x,y,vx){
  ctx.strokeStyle='rgba(244,239,228,.7)';ctx.lineWidth=3;ctx.lineCap='round';const s=Math.sign(vx)||1;
  [-14,2,18].forEach((dy,i)=>{ctx.beginPath();ctx.moveTo(x-s*(40+i*6),y+dy);ctx.lineTo(x-s*(70+i*10),y+dy);ctx.stroke()});
}
function drawWeapon(weapon,x,y,flip,rot,alpha,vx){
  ctx.save();ctx.globalAlpha=alpha;motionLines(x,y,vx);
  ctx.translate(x,y);ctx.rotate(rot);ctx.scale(flip?-1:1,1);
  ctx.strokeStyle='#8a5a3c';ctx.lineWidth=2.5;ctx.fillStyle='#e7b28a';
  if(weapon==='hand'){
    [[-21,-44],[-9,-50],[3,-48],[15,-40]].forEach(([fx,fy])=>{rr(fx,fy,11,36,5.5);ctx.fill();ctx.stroke()});
    ctx.save();ctx.translate(-22,8);ctx.rotate(-.9);rr(-6,-22,12,30,6);ctx.fill();ctx.stroke();ctx.restore();
    rr(-24,-16,50,46,16);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#c48c66';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-12,6);ctx.quadraticCurveTo(2,14,16,4);ctx.stroke();
  }else if(weapon==='sandal'){
    // hawai chappal held at the heel
    ctx.fillStyle='#1f4f9c';rr(-17,-82,34,90,16);ctx.fill();
    ctx.fillStyle='#f1efe8';rr(-14,-79,28,84,14);ctx.fill();
    line([[-12,-40],[0,-62],[12,-40]],'#1f4f9c',6);ell(0,-62,4,4,'#1f4f9c');
    ctx.fillStyle='#e7b28a';ctx.strokeStyle='#8a5a3c';ctx.beginPath();ctx.arc(0,10,16,0,7);ctx.fill();ctx.stroke();
    line([[-10,4],[10,4]],'#c48c66',1.5);
  }else if(weapon==='bamboo'){
    // long bamboo stick with nodes
    ctx.fillStyle='#b8a04a';ctx.strokeStyle='#6b5a1e';ctx.lineWidth=2.5;rr(-6,-170,12,190,5);ctx.fill();ctx.stroke();
    ctx.lineWidth=3;[-125,-75,-25].forEach(y=>{ctx.beginPath();ctx.moveTo(-7,y);ctx.lineTo(7,y);ctx.stroke()});
    ctx.fillStyle='#dccb73';ctx.fillRect(-3,-166,3,180);
    ctx.fillStyle='#e7b28a';ctx.strokeStyle='#8a5a3c';ctx.beginPath();ctx.arc(0,6,15,0,7);ctx.fill();ctx.stroke();
  }else if(weapon==='belan'){
    // rolling pin: barrel with two handles
    ctx.fillStyle='#c98a4b';ctx.strokeStyle='#7a4a22';ctx.lineWidth=2.5;
    rr(-5,-124,10,36,4);ctx.fill();ctx.stroke();rr(-16,-92,32,76,13);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#a56a30';ctx.lineWidth=1.5;[-76,-56,-36].forEach(y=>{ctx.beginPath();ctx.moveTo(-14,y);ctx.lineTo(14,y);ctx.stroke()});
    ctx.fillStyle='#c98a4b';ctx.strokeStyle='#7a4a22';ctx.lineWidth=2.5;rr(-5,-20,10,30,4);ctx.fill();ctx.stroke();
    ctx.fillStyle='#e7b28a';ctx.strokeStyle='#8a5a3c';ctx.beginPath();ctx.arc(0,8,15,0,7);ctx.fill();ctx.stroke();
  }else if(weapon==='pan'){
    // frying pan: dark handle, round pan
    ctx.fillStyle='#3a3f46';ctx.strokeStyle='#22252a';ctx.lineWidth=2.5;rr(-6,-34,12,52,5);ctx.fill();ctx.stroke();
    ctx.fillStyle='#6c727c';ctx.strokeStyle='#3d4148';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-74,42,0,7);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#8b919b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-74,31,0,7);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.ellipse(-12,-88,12,7,-.6,0,7);ctx.fill();
    ctx.fillStyle='#e7b28a';ctx.strokeStyle='#8a5a3c';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,8,15,0,7);ctx.fill();ctx.stroke();
  }else{
    // shola jharu: bundle of thin sticks, tied near the grip
    for(let i=0;i<22;i++){const sx=-26+i*2.5;ctx.strokeStyle=i%3?'#c9a45a':'#a8853f';ctx.lineWidth=1.6;
      ctx.beginPath();ctx.moveTo(sx*.18,-6);ctx.quadraticCurveTo(sx*.6,-50,sx,-105+Math.abs(sx)*.4);ctx.stroke()}
    ctx.fillStyle='#7a2e28';ctx.fillRect(-7,-16,14,5);ctx.fillRect(-6,-8,12,4);
    ctx.fillStyle='#e7b28a';ctx.strokeStyle='#8a5a3c';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,6,15,0,7);ctx.fill();ctx.stroke();
  }
  ctx.restore();
}

// ---------- characters ----------
function eyesAndMouth(eyes,mouth,mouthY,eyeY,skinDark){
  ctx.lineWidth=3;
  if(eyes==='dazed'){[[163,eyeY],[197,eyeY]].forEach(([x,y])=>line([[x-6,y-6],[x+6,y+6]],'#2e2724',3)||line([[x+6,y-6],[x-6,y+6]],'#2e2724',3))}
  else if(eyes==='laugh'){ctx.strokeStyle='#2e2724';[[163,eyeY+2],[197,eyeY+2]].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,7,Math.PI*1.15,Math.PI*1.85);ctx.stroke()})}
  else if(eyes!=='hidden'){
    const look=eyes==='nervous'?Math.sin(clock*9)*4:4;
    [[163,eyeY],[197,eyeY]].forEach(([x,y])=>{
      ctx.fillStyle='#f4efe4';ctx.beginPath();ctx.ellipse(x,y,10,7,0,0,Math.PI);ctx.fill();
      ell(x+look,y+2.5,3.2,3.2,'#1b1512');line([[x-11,y],[x+11,y]],skinDark,3);
    });
  }
  ctx.strokeStyle='#7a2e28';ctx.fillStyle='#5a1f1b';ctx.lineWidth=3;ctx.lineCap='round';const my=mouthY;
  if(mouth==='smirk'){ctx.beginPath();ctx.moveTo(166,my);ctx.quadraticCurveTo(184,my+8,197,my-5);ctx.stroke()}
  else if(mouth==='ouch')ell(181,my+3,8,11,'#5a1f1b');
  else{ctx.beginPath();ctx.moveTo(164,my-3);ctx.quadraticCurveTo(181,my+19,198,my-3);ctx.closePath();ctx.fill();ctx.fillStyle='#f4efe4';ctx.fillRect(170,my-3,22,4)}
}
function placard(en,bn){
  ctx.strokeStyle='#5a4330';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(156,262);ctx.lineTo(128,320);ctx.moveTo(204,262);ctx.lineTo(232,320);ctx.stroke();
  ctx.save();ctx.translate(180,352);ctx.rotate(-.05);
  ctx.fillStyle='#d1ad70';rr(-76,-32,152,66,4);ctx.fill();ctx.strokeStyle='#9c7a45';ctx.lineWidth=2;ctx.stroke();
  ctx.textAlign='center';ctx.fillStyle='#b52a24';ctx.font=font(DISP,24);ctx.fillText(en,0,-2);
  ctx.fillStyle='#3a2a1a';ctx.font=font(BN,15);ctx.fillText(bn,0,22);
  ctx.restore();
}

// ---------- rear view (the villain turns his back when the bottom is the target) ----------
const REAR={
  abuser:{skin:'#c98d63',skinDk:'#a8714d',hair:'#2e2724'},
  robber:{skin:'#a8714d',skinDk:'#7a4e33',hair:'#1f1612'},
  rapist:{skin:'#c48a64',skinDk:'#a46f4c',hair:'#141218'}
};
function drawCapBack(x,y){
  ctx.save();ctx.translate(x,y);
  ctx.beginPath();ctx.moveTo(-42,28);ctx.quadraticCurveTo(-44,-24,0,-27);ctx.quadraticCurveTo(44,-24,42,28);ctx.quadraticCurveTo(0,22,-42,28);ctx.closePath();
  ctx.fillStyle='#c0302b';ctx.fill();ctx.strokeStyle='#7a1a17';ctx.lineWidth=2;ctx.stroke();
  line([[0,-27],[0,24]],'#7a1a17',1.5);line([[-26,-20],[-18,25]],'#7a1a17',1.5);line([[26,-20],[18,25]],'#7a1a17',1.5);
  ell(0,-26,4,3,'#7a1a17');
  ctx.fillStyle='#7a1a17';rr(-18,19,36,7,2);ctx.fill();ctx.fillStyle='#d9a441';rr(-5,19,10,7,2);ctx.fill();   // adjustable strap
  ctx.restore();
}
function drawRear(st,vk,hx,hy,rot){
  const c=REAR[vk],pd=vk==='robber'?'#26335a':'#0e0d12';
  // body seen from behind
  ctx.save();ctx.translate(180+hx,240+hy);ctx.rotate(rot*.5);ctx.translate(-180,-240);
  ctx.fillStyle=c.skinDk;ctx.fillRect(166,222,28,44);
  if(vk==='abuser'){
    // long panjabi: back seam, side slits, folds over the seat
    ctx.beginPath();ctx.moveTo(118,264);ctx.quadraticCurveTo(180,248,242,264);ctx.lineTo(272,304);ctx.lineTo(282,PANEL);ctx.lineTo(78,PANEL);ctx.lineTo(88,304);ctx.closePath();
    ctx.fillStyle='#ecebe3';ctx.fill();ctx.strokeStyle='#c9c6ba';ctx.lineWidth=2;ctx.stroke();
    line([[180,262],[180,PANEL]],'#c9c6ba',2);line([[110,330],[104,PANEL]],'#c9c6ba',2);line([[250,330],[256,PANEL]],'#c9c6ba',2);
    ctx.strokeStyle='rgba(120,112,96,.4)';ctx.lineWidth=2.5;
    [158,202].forEach(cx=>{ctx.beginPath();ctx.arc(cx,368,32,.15*Math.PI,.85*Math.PI);ctx.stroke()});
  }else{
    const robber=vk==='robber',shirt=robber?'#2b3a67':'#1c1a22',pants=robber?'#34456f':'#17151c';
    ctx.beginPath();ctx.moveTo(robber?122:112,266);ctx.quadraticCurveTo(180,252,robber?238:248,266);
    ctx.lineTo(robber?262:276,304);ctx.lineTo(robber?256:266,332);ctx.lineTo(robber?104:94,332);ctx.lineTo(robber?98:84,304);ctx.closePath();
    ctx.fillStyle=shirt;ctx.fill();
    if(robber){ctx.fillStyle='rgba(242,200,90,.28)';ctx.font=font(DISP,16);ctx.textAlign='center';ctx.fillText('BOSS',180,300)}
    else line([[180,264],[180,334]],'#2a2730',2);   // jacket vent
    ctx.beginPath();ctx.moveTo(110,326);ctx.lineTo(250,326);ctx.lineTo(268,PANEL);ctx.lineTo(92,PANEL);ctx.closePath();ctx.fillStyle=pants;ctx.fill();
    ctx.fillStyle=pd;ctx.fillRect(110,326,140,8);
    line([[180,334],[180,PANEL]],pd,3);
    ctx.strokeStyle=pd;ctx.lineWidth=2.5;[152,208].forEach(cx=>{ctx.beginPath();ctx.arc(cx,368,34,.1*Math.PI,.9*Math.PI);ctx.stroke()});
    if(robber){ctx.strokeStyle='#8fa0c8';ctx.lineWidth=1.5;rr(126,344,34,30,5);ctx.stroke();rr(200,344,34,30,5);ctx.stroke()}   // jeans back pockets
  }
  mark(180,372,st.red.B||0,false,'kick');
  ctx.restore();
  // head seen from behind
  ctx.save();ctx.translate(180+hx,240+hy);ctx.rotate(rot);ctx.translate(-180,-240);
  const wide=vk==='rapist';
  ell(wide?128:133,wide?184:186,9,14,c.skin);ell(wide?232:227,wide?184:186,9,14,c.skin);ell(180,wide?182:180,wide?52:vk==='robber'?43:47,wide?56:vk==='robber'?55:57,c.skin);
  if(vk==='abuser'){
    ell(180,170,45,47,c.hair);
    [[160,134,156,160],[172,130,170,166],[188,130,190,166],[200,134,204,160],[150,170,148,196],[210,170,212,196]].forEach(([a1,b1,a2,b2])=>line([[a1,b1],[a2,b2]],'#4a403b',1.5));
    ell(137,206,4,12,c.hair);ell(223,206,4,12,c.hair);
    drawTupi(180,118,0);
  }else if(vk==='robber'){
    ell(180,178,41,46,c.hair);drawCapBack(180,118);
  }else{
    ell(180,170,50,52,c.hair);
    line([[150,134],[168,146]],'rgba(255,255,255,.3)',2.5);line([[192,132],[214,142]],'rgba(255,255,255,.2)',2);
  }
  line([[166,229],[194,229]],c.skinDk,2);line([[170,235],[190,235]],c.skinDk,1.5);   // neck creases
  ctx.restore();
}
// a leg and sneaker coming in from the viewer's side
function drawKick(x,y,sc,alpha,vx){
  ctx.save();ctx.globalAlpha=alpha;motionLines(x,y,vx);
  ctx.translate(x,y);ctx.rotate(-.3);ctx.scale(sc,sc);
  ctx.fillStyle='#2d3d63';ctx.strokeStyle='#1c2744';ctx.lineWidth=2.5;rr(8,-17,130,38,16);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f4efe4';ctx.strokeStyle='#8c867a';rr(-40,-21,62,42,16);ctx.fill();ctx.stroke();
  ctx.fillStyle='#d6403a';rr(-40,-21,34,31,14);ctx.fill();
  ctx.fillStyle='#1b1512';ctx.fillRect(-32,13,54,6);
  ctx.strokeStyle='#8c867a';ctx.lineWidth=1.5;[-2,6,14].forEach(dx=>{ctx.beginPath();ctx.moveTo(dx,-14);ctx.lineTo(dx+8,-6);ctx.stroke()});
  ctx.restore();
}

function drawCharacter(st,vk,clk){
  const a=st.anim;let hx=0,hy=Math.sin(clk*2)*1.5,rot=0,armY=0,eyes='shifty',mouth='smirk';
  if(st.phase==='charge'||st.phase==='timing')eyes='nervous';
  if(a){
    const k=a.t-.12;
    if(a.hit){
      if(k>0){const amp=(10+32*a.force)*(isPerfect(a)?1.3:1),disp=amp*sstep(k/.03)*Math.exp(-k*5)*Math.cos(k*16);
        if(a.spot==='L'){hx+=disp;rot=disp*.007}else if(a.spot==='R'){hx-=disp;rot=-disp*.007}
        else if(a.spot==='B'){hy-=Math.abs(disp)*.9;hx+=disp*.15;rot=disp*.002}   // lurches forward from the kick
        else if(vk==='robber'){armY=Math.abs(disp)*1.2;hx+=disp*.2}
        else{hy+=Math.abs(disp)*.7;rot=disp*.003}
        if(k<(isPerfect(a)?.9:.7)){eyes='dazed';mouth='ouch'}}
    }else{
      const s=Math.sin(Math.min(a.t/.5,1)*Math.PI);
      if(a.spot==='S'&&vk!=='robber')hx+=26*s;else if(a.spot==='S')armY-=20*s;else hy+=24*s;
      eyes='laugh';mouth='laugh';
    }
  }
  const v=VILLAINS[vk],wk=st.weapon||'hand';

  // When the bottom is the target the whole villain turns his back: squash horizontally, then show the rear view.
  const eB=sstep(st.turnB||0);
  ctx.save();
  if(eB>0){ctx.translate(180,0);ctx.scale(Math.max(.04,Math.abs(Math.cos(eB*Math.PI))),1);ctx.translate(-180,0)}
  if(eB>.5){drawRear(st,vk,hx,hy,rot)}else{
  if(vk==='abuser'){
    line([[300,PANEL],[284,262]],'#6b4423',7);ctx.beginPath();ctx.arc(296,262,12,Math.PI,Math.PI*1.9);ctx.stroke();
    ctx.fillStyle='#b97c55';ctx.fillRect(166,222,28,44);
    ctx.beginPath();ctx.moveTo(118,264);ctx.quadraticCurveTo(180,248,242,264);ctx.lineTo(272,304);ctx.lineTo(282,PANEL);ctx.lineTo(78,PANEL);ctx.lineTo(88,304);ctx.closePath();
    ctx.fillStyle='#ecebe3';ctx.fill();ctx.strokeStyle='#c9c6ba';ctx.lineWidth=2;ctx.stroke();
    line([[110,300],[118,PANEL]],'#c9c6ba',2);line([[250,300],[242,PANEL]],'#c9c6ba',2);line([[180,256],[180,318]],'#c9c6ba',2);
    [270,288,306].forEach(y=>ell(184,y,2.5,2.5,'#b9b4a6'));
    ctx.fillStyle='#c98d63';ctx.beginPath();ctx.arc(282,318,13,0,7);ctx.fill();ctx.strokeStyle='#8a5a3c';ctx.lineWidth=2;ctx.stroke();
    placard('CHILD ABUSER',v.bn);
  }else if(vk==='robber'){
    ctx.fillStyle='#93603f';ctx.fillRect(167,222,26,44);
    ctx.beginPath();ctx.moveTo(122,266);ctx.quadraticCurveTo(180,252,238,266);ctx.lineTo(262,300);ctx.lineTo(268,PANEL);ctx.lineTo(92,PANEL);ctx.lineTo(98,300);ctx.closePath();
    ctx.fillStyle='#2b3a67';ctx.fill();
    ctx.fillStyle='rgba(242,200,90,.5)';ctx.font=font(DISP,20);ctx.textAlign='center';ctx.fillText('BOSS',180,300);
    // gamcha around the neck
    ctx.save();ctx.beginPath();ctx.moveTo(146,256);ctx.quadraticCurveTo(180,276,214,256);ctx.lineTo(214,268);ctx.quadraticCurveTo(180,288,146,268);ctx.closePath();
    ctx.fillStyle='#b8322c';ctx.fill();ctx.clip();ctx.strokeStyle='#2f7a45';ctx.lineWidth=2;
    for(let i=140;i<220;i+=8){ctx.beginPath();ctx.moveTo(i,250);ctx.lineTo(i,290);ctx.stroke()}ctx.restore();
    ctx.fillStyle='#b8322c';ctx.save();ctx.translate(150,266);ctx.rotate(.15);ctx.fillRect(-7,0,14,46);
    ctx.strokeStyle='#2f7a45';ctx.lineWidth=2;for(let i=6;i<46;i+=9){ctx.beginPath();ctx.moveTo(-7,i);ctx.lineTo(7,i);ctx.stroke()}ctx.restore();
    // raised snatching arm with phone
    line([[236,272],[270,305+armY]],'#2b3a67',18);line([[262,298+armY],[284,300+armY]],'#93603f',12);
    if(!(st.drop&&st.drop.kind==='phone'))drawPhone(286,276+armY,.1);
    ctx.fillStyle='#a8714d';ctx.beginPath();ctx.arc(284,300+armY,13,0,7);ctx.fill();ctx.strokeStyle='#6e4a32';ctx.lineWidth=2;ctx.stroke();
    placard('SNATCHER',v.bn);
  }else{
    ctx.fillStyle='#b07a55';ctx.fillRect(164,224,32,42);
    ctx.beginPath();ctx.moveTo(112,266);ctx.quadraticCurveTo(180,250,248,266);ctx.lineTo(276,304);ctx.lineTo(286,PANEL);ctx.lineTo(74,PANEL);ctx.lineTo(84,304);ctx.closePath();
    ctx.fillStyle='#1c1a22';ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.moveTo(120,280);ctx.lineTo(140,PANEL);ctx.lineTo(130,PANEL);ctx.lineTo(112,284);ctx.fill();
    ctx.beginPath();ctx.moveTo(160,258);ctx.lineTo(180,300);ctx.lineTo(200,258);ctx.closePath();ctx.fillStyle='#b07a55';ctx.fill();
    line([[154,256],[170,286]],'#2a2730',6);line([[206,256],[190,286]],'#2a2730',6);
    ctx.strokeStyle='#e0b13a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(180,262,22,.35,Math.PI-.35);ctx.stroke();
    ctx.fillStyle='#c48a64';ctx.beginPath();ctx.arc(284,318,14,0,7);ctx.fill();ctx.strokeStyle='#8a5a3c';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#e0b13a';ctx.fillRect(276,308,8,5);ctx.fillRect(270,332,26,6);
    placard('RAPIST',v.bn);
  }

  ctx.save();ctx.translate(180+hx,240+hy);ctx.rotate(rot);ctx.translate(-180,-240);
  if(vk==='abuser'){
    // when "Back of head" is selected he turns his head away: squash the head horizontally, then show the back view
    const e=sstep(st.turn||0),sx=Math.max(.04,Math.abs(Math.cos(e*Math.PI)));
    ctx.translate(180,0);ctx.scale(sx,1);ctx.translate(-180,0);
    ell(133,186,9,14,'#c98d63');ell(227,186,9,14,'#c98d63');ell(180,180,47,57,'#c98d63');
    if(e>.5){
      ell(180,170,45,47,'#2e2724');
      [[160,134,156,160],[172,130,170,166],[188,130,190,166],[200,134,204,160],[150,170,148,196],[210,170,212,196]].forEach(([a1,b1,a2,b2])=>line([[a1,b1],[a2,b2]],'#4a403b',1.5));
      ell(137,206,4,12,'#2e2724');ell(223,206,4,12,'#2e2724');
      line([[130,184],[134,192]],'#a8714d',2);line([[230,184],[226,192]],'#a8714d',2);
      line([[166,228],[194,228]],'#a8714d',2);line([[170,234],[190,234]],'#a8714d',1.5);
      mark(180,176,st.red.S||0,false,wk);
    }else{
      ctx.beginPath();ctx.moveTo(134,184);ctx.quadraticCurveTo(136,234,158,262);ctx.lineTo(168,292);ctx.lineTo(177,274);ctx.lineTo(185,298);ctx.lineTo(194,274);ctx.lineTo(204,286);
      ctx.quadraticCurveTo(224,240,226,184);ctx.quadraticCurveTo(220,214,198,218);ctx.quadraticCurveTo(180,213,162,218);ctx.quadraticCurveTo(140,214,134,184);ctx.closePath();
      ctx.fillStyle='#2e2724';ctx.fill();
      [[160,236,166,262],[176,240,178,270],[192,238,190,266],[148,222,154,244],[208,224,203,248]].forEach(([a1,b1,a2,b2])=>line([[a1,b1],[a2,b2]],'#7a716a',1.5));
      line([[181,180],[173,204],[186,205]],'#9a6544',2.5);
      eyesAndMouth(eyes,mouth,229,170,'#7e5034');
      line([[151,157],[173,162]],'#2e2724',4);line([[187,160],[209,152]],'#2e2724',4);
      mark(150,196,st.red.L,false,wk);mark(210,196,st.red.R,true,wk);
    }
    if(!st.drop)drawTupi(180,118,0);
  }else if(vk==='robber'){
    ell(137,186,8,13,'#a8714d');ell(223,186,8,13,'#a8714d');ell(180,182,43,55,'#a8714d');
    ctx.fillStyle='rgba(40,25,20,.45)';
    for(let i=0;i<60;i++){const an=Math.PI*(.15+.7*((i*37)%60)/60),rr2=30+((i*13)%14);ctx.fillRect(180+Math.cos(an)*rr2,190+Math.sin(an)*rr2*1.1,1.6,1.6)}
    line([[166,214],[180,211],[194,214]],'#2a1d18',3);
    line([[181,182],[174,202],[186,203]],'#7a4e33',2.5);
    eyesAndMouth(eyes,mouth,226,170,'#6e4a32');
    line([[152,159],[173,163]],'#1f1612',4);line([[187,163],[208,159]],'#1f1612',4);
    line([[148,150],[156,168]],'#e2b8a0',2);line([[147,156],[155,155]],'#e2b8a0',1.2);line([[150,162],[157,161]],'#e2b8a0',1.2);
    mark(152,196,st.red.L,false,wk);mark(208,196,st.red.R,true,wk);
    ctx.fillStyle='#1f1612';ctx.beginPath();ctx.moveTo(138,150);ctx.lineTo(132,136);ctx.lineTo(146,142);ctx.lineTo(214,142);ctx.lineTo(228,136);ctx.lineTo(222,150);ctx.closePath();ctx.fill();
    if(!st.drop||st.drop.kind!=='cap')drawBallCap(180,118,0);
  }else{
    ell(128,184,9,13,'#c48a64');ell(232,184,9,13,'#c48a64');ell(180,182,52,56,'#c48a64');
    ctx.strokeStyle='#a46f4c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(180,226,26,.3,Math.PI-.3);ctx.stroke();
    ctx.fillStyle='#141218';ctx.beginPath();ctx.moveTo(128,170);ctx.quadraticCurveTo(122,118,170,116);ctx.quadraticCurveTo(222,110,234,168);
    ctx.quadraticCurveTo(222,136,196,134);ctx.lineTo(160,134);ctx.quadraticCurveTo(136,140,128,170);ctx.closePath();ctx.fill();
    line([[150,122],[168,134]],'rgba(255,255,255,.35)',2.5);line([[190,120],[214,128]],'rgba(255,255,255,.25)',2);
    line([[181,180],[172,202],[188,203]],'#93603f',2.5);
    eyesAndMouth(st.drop?eyes:'hidden',mouth,228,172,'#93603f');
    ctx.fillStyle='#141218';ctx.beginPath();ctx.moveTo(156,214);ctx.quadraticCurveTo(180,202,204,214);ctx.quadraticCurveTo(206,222,196,220);ctx.quadraticCurveTo(180,212,164,220);ctx.quadraticCurveTo(154,222,156,214);ctx.fill();
    line([[150,155],[172,152]],'#141218',5);line([[188,152],[210,155]],'#141218',5);
    mark(146,200,st.red.L,false,wk);mark(214,200,st.red.R,true,wk);
    if(!st.drop)drawGlasses(180,172,0,eyes==='dazed');
  }
  if((st.phase==='timing'||st.phase==='charge')){
    const sy=146+((clk*30)%20);ctx.fillStyle='rgba(170,215,240,.85)';
    ctx.beginPath();ctx.moveTo(230,sy-8);ctx.quadraticCurveTo(238,sy+4,230,sy+6);ctx.quadraticCurveTo(222,sy+4,230,sy-8);ctx.fill();
  }
  ctx.restore();
  }
  ctx.restore();

  if(st.drop){
    const d=st.drop;
    if(d.kind==='cap'){vk==='abuser'?drawTupi(180+hx+d.x,118+hy+d.y,d.r):drawBallCap(180+hx+d.x,118+hy+d.y,d.r)}
    else if(d.kind==='glasses')drawGlasses(180+hx+d.x,172+hy+d.y,d.r,true);
    else drawPhone(286+d.x,276+d.y,d.r);
  }
}

function drawSlapHand(){
  const a=S.anim;if(!a)return;const v=V();
  const t=a.t;let p0,p1,p2,flip=false,rot=.25;
  if(a.spot==='L'){p0=[-90,200];p1=[146,200];p2=[290,214]}
  else if(a.spot==='R'){p0=[450,200];p1=[214,200];p2=[70,214];flip=true;rot=-.25}
  else if(a.spot==='B'){p0=[330,540];p1=[188,384];p2=[166,344]}
  else if(v.sPath==='hand'){p0=[60,-60];p1=[274,288];p2=[340,360];rot=1.3}
  else if(v.sPath==='back'){p0=[40,-70];p1=[180,152];p2=[246,216];rot=1.1}
  else{p0=[30,-80];p1=[178,104];p2=[250,170];rot=1.1}
  if(!a.hit){const off=a.spot==='S'?[-40,10]:a.spot==='B'?[-80,30]:[0,-40];p1=[p1[0]+off[0],p1[1]+off[1]];p2=[p2[0]+off[0],p2[1]+off[1]]}
  let x,y,alpha=1,sc=1;
  // accelerate into the target, then decelerate through the follow-through
  if(t<.12){const k=t/.12,e=k*k;x=lerp(p0[0],p1[0],e);y=lerp(p0[1],p1[1],e);sc=lerp(1.5,1,e)}
  else{const k=Math.min(1,(t-.12)/.22),e=1-Math.pow(1-k,3);x=lerp(p1[0],p2[0],e);y=lerp(p1[1],p2[1],e);alpha=Math.max(0,1-(t-.2)/.2);sc=lerp(1,.85,e)}
  if(alpha<=0)return;
  if(a.spot==='B')drawKick(x,y,sc,alpha,p2[0]-p0[0]);
  else drawWeapon(S.weapon,x,y,flip,rot,alpha,p2[0]-p0[0]);
}

// impact shockwave rings; a perfect hit adds a rotating sunburst and a white flash
function drawBurst(a){
  const pt=hitPoint(a),k=a.t-.12,perfect=isPerfect(a);
  if(k<0)return;
  for(let i=0;i<(perfect?3:1);i++){
    const q=(k-i*.07)/(perfect?.55:.3);if(q<=0||q>=1)continue;
    const e=1-Math.pow(1-q,3);
    ctx.save();ctx.globalAlpha=(1-q)*.9;ctx.strokeStyle=perfect?(i%2?'#fff4c2':'#f2b134'):'#f4efe4';ctx.lineWidth=(perfect?10:5)*(1-q)+1;
    ctx.beginPath();ctx.arc(pt[0],pt[1],(perfect?240:70)*e,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  if(!perfect||reduceMotion)return;
  const sb=sstep(k/.08)*(1-sstep((k-.35)/.5));
  if(sb>0){
    ctx.save();ctx.translate(pt[0],pt[1]);ctx.rotate(k*.9);ctx.globalAlpha=sb*.55;
    const g=ctx.createRadialGradient(0,0,0,0,0,230);g.addColorStop(0,'rgba(255,244,194,1)');g.addColorStop(1,'rgba(242,177,52,0)');
    ctx.fillStyle=g;ctx.beginPath();
    for(let i=0;i<24;i++){const an=i*Math.PI/12;ctx.moveTo(0,0);ctx.arc(0,0,230,an,an+Math.PI/24);ctx.closePath()}
    ctx.fill();ctx.restore();
  }
  const fl=Math.max(0,1-k/.14)*.85;
  if(fl>0){ctx.save();ctx.globalAlpha=fl;ctx.fillStyle='#fff';ctx.fillRect(-100,-100,W+200,PANEL+200);ctx.restore()}
}

// screen-space layer for a perfect hit: vignette, speed lines and the PERFECT! banner
function drawPerfectOverlay(a){
  const t=a.t,env=perfEnv(a),pt=hitPoint(a);
  if(env>0){
    const g=ctx.createRadialGradient(pt[0],pt[1],60,pt[0],pt[1],360);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(10,0,0,${.6*env})`);
    ctx.fillStyle=g;ctx.fillRect(-20,-20,W+40,PANEL+20);
    ctx.save();ctx.strokeStyle=`rgba(255,244,194,${.55*env})`;ctx.lineWidth=2;ctx.lineCap='round';
    for(let i=0;i<28;i++){
      const an=i/28*Math.PI*2+(i%2)*.05,r0=120+((t*260+i*37)%80),r1=r0+60+(i*29%70);
      ctx.beginPath();ctx.moveTo(pt[0]+Math.cos(an)*r0,pt[1]+Math.sin(an)*r0);ctx.lineTo(pt[0]+Math.cos(an)*r1,pt[1]+Math.sin(an)*r1);ctx.stroke();
    }
    ctx.restore();
  }
  const word='PERFECT!',size=58,fade=1-sstep((t-.82)/.16);
  if(fade<=0)return;
  ctx.save();ctx.globalAlpha=fade;ctx.translate(180,368);ctx.rotate(-.06);
  ctx.font=font(DISP,size);
  const ws=[...word].map(c=>ctx.measureText(c).width+3),tot=ws.reduce((p,q)=>p+q,0);
  const grad=ctx.createLinearGradient(0,-size/2,0,size/2);grad.addColorStop(0,'#fff4c2');grad.addColorStop(.5,'#f2b134');grad.addColorStop(1,'#e07a1f');
  let x=-tot/2;
  [...word].forEach((c,i)=>{
    const q=(t-.14-i*.03)/.18;
    if(q>0){
      const s=q>=1?1:easeOutBack(q),by=-Math.sin(Math.min(1,q)*Math.PI)*10;
      ctx.save();ctx.translate(x+ws[i]/2,by);ctx.scale(s,s);ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineJoin='round';ctx.lineWidth=9;ctx.strokeStyle='#7a1a17';ctx.strokeText(c,0,0);ctx.fillStyle=grad;ctx.fillText(c,0,0);ctx.restore();
    }
    x+=ws[i];
  });
  const q2=sstep((t-.4)/.15);
  if(q2>0){ctx.globalAlpha=fade*q2;ctx.font=font(BN,20);ctx.textAlign='center';ctx.lineWidth=5;ctx.lineJoin='round';
    ctx.strokeStyle='#7a1a17';ctx.strokeText('নিখুঁত আঘাত!',0,44);ctx.fillStyle='#f4efe4';ctx.fillText('নিখুঁত আঘাত!',0,44)}
  ctx.restore();
}

function drawFx(){
  if(S.anim&&S.anim.impacted)drawBurst(S.anim);
  for(const s of S.stars){
    ctx.save();
    if(s.k==='spark'){ctx.globalAlpha=Math.min(1,s.t*2.5);line([[s.x,s.y],[s.x-s.vx*.04,s.y-s.vy*.04]],'#ffe08a',3)}
    else if(s.k==='conf'){ctx.globalAlpha=Math.min(1,s.t*2);ctx.translate(s.x,s.y);ctx.rotate(s.r);ctx.scale(1,Math.cos(s.t*9+s.r));ctx.fillStyle=s.c;ctx.fillRect(-4,-2.5,8,5)}
    else{ctx.fillStyle='#f2b134';ctx.globalAlpha=Math.min(1,s.t*2);ctx.translate(s.x,s.y);ctx.rotate(s.t*6);ctx.beginPath();
      for(let i=0;i<10;i++){const r=i%2?3.5:8,an=i*Math.PI/5;ctx.lineTo(Math.cos(an)*r,Math.sin(an)*r)}ctx.closePath();ctx.fill()}
    ctx.restore();
  }
  if(S.bubble){
    const b=S.bubble;ctx.save();ctx.globalAlpha=Math.min(1,b.t*3);ctx.font=font(BODY,14);
    const w=ctx.measureText(b.txt).width+22,x=Math.max(8,Math.min(W-w-8,230)),y=64;
    ctx.fillStyle='#f4efe4';rr(x,y,w,30,12);ctx.fill();
    ctx.beginPath();ctx.moveTo(x+14,y+28);ctx.lineTo(x+4,y+44);ctx.lineTo(x+28,y+28);ctx.fill();
    ctx.fillStyle='#12221e';ctx.textAlign='left';ctx.fillText(b.txt,x+11,y+20);ctx.restore();
  }
  const a=S.anim;
  if(a&&a.impacted){
    const v=V(),k=a.t-.12,alpha=a.t<.85?1:Math.max(0,1-(a.t-.85)/.15),pop=1+.45*Math.max(0,1-k/.1);
    const top=(a.spot==='S'&&v.sPath!=='hand')||a.spot==='B',px=top?180:a.spot==='R'?96:a.spot==='L'?262:96,py=top?300:a.spot==='S'?130:118;
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(a.hit?px:180,a.hit?py:118);ctx.rotate(-.12);ctx.scale(pop,pop);ctx.textAlign='center';
    if(a.hit){
      const w=a.spot==='B'?KICK:WEAPONS[S.weapon],word=a.spot==='S'?w.sWord:w.word,size=Math.round((w.bn?24:30)+(w.bn?18:26)*a.force);
      ctx.font=w.bn?font(BN,size):font(DISP,size);ctx.lineWidth=6;ctx.strokeStyle='#b52a24';ctx.lineJoin='round';
      ctx.strokeText(word,0,0);ctx.fillStyle='#f2b134';ctx.fillText(word,0,0);
      ctx.font=font(DISP,17);ctx.fillStyle=a.g.c;ctx.fillText(`${a.g.n}  +${a.pts}`,0,26);
      if(a.combo>1){ctx.font=font(BODY,13);ctx.fillStyle='#f4efe4';ctx.fillText(`combo ×${a.combo}`,0,44)}
    }else{ctx.font=font(DISP,40);ctx.fillStyle='rgba(244,239,228,.9)';ctx.fillText('MISS!',0,0)}
    ctx.restore();
  }
}

function drawPanel(){
  const v=V();
  ctx.fillStyle='#12221e';ctx.fillRect(0,PANEL,W,H-PANEL);
  ctx.strokeStyle='rgba(244,239,228,.15)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,PANEL+.5);ctx.lineTo(W,PANEL+.5);ctx.stroke();
  const mx=22,my=428,mw=26,mh=108;
  const pw=S.phase==='charge'?S.power:(S.phase==='timing'||S.phase==='anim')?S.locked:0;
  ctx.fillStyle='rgba(244,239,228,.1)';rr(mx,my,mw,mh,6);ctx.fill();
  const g=ctx.createLinearGradient(0,my+mh,0,my);g.addColorStop(0,'#9fd3c0');g.addColorStop(.6,'#f2b134');g.addColorStop(1,'#d6403a');
  ctx.save();rr(mx,my,mw,mh,6);ctx.clip();ctx.fillStyle=g;ctx.fillRect(mx,my+mh*(1-pw),mw,mh*pw);ctx.restore();
  ctx.strokeStyle='rgba(244,239,228,.35)';for(let i=1;i<4;i++){const y=my+mh*i/4;ctx.beginPath();ctx.moveTo(mx,y);ctx.lineTo(mx+6,y);ctx.stroke()}
  ctx.fillStyle='#a9bfb6';ctx.font=font(BODY,10);ctx.textAlign='center';ctx.fillText('FORCE',mx+mw/2,my+mh+16);
  ctx.fillStyle='#f4efe4';ctx.font=font(DISP,13);ctx.fillText(Math.round(pw*100)+'%',mx+mw/2,my-4);

  const tx=64,si=spotInfo(S.spot);ctx.textAlign='left';
  ctx.fillStyle='#f4efe4';ctx.font=font(DISP,20);ctx.fillText(`STAGE ${Math.min(S.level+1,STAGES)}/${STAGES}`,tx,446);
  ctx.font=font(BODY,11);ctx.fillStyle='#a9bfb6';
  ctx.fillText(`${S.spot==='B'?'Kick':WEAPONS[S.weapon].n} → ${si.name} ×${+(si.mult*weaponMult(S.spot)).toFixed(2)}`,tx,466);
  const tl=Math.max(0,S.timeLeft),secs=Math.ceil(tl/1000);
  ctx.fillStyle=tl<=10000?(Math.floor(clock*4)%2?'#ff6b63':'#d6403a'):tl<=20000?'#f2b134':'#a9bfb6';
  ctx.fillText(`Time left ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`,tx,482);
  const hint={ready:'Hold to charge force',charge:'Release at the top',timing:'Tap in the gold arc'}[S.phase]||'';
  ctx.fillStyle='#f2b134';ctx.font=font(BODY,13);ctx.fillText(hint,tx,506);
  if(S.last){ctx.fillStyle=S.last.c;ctx.font=font(BODY,11);ctx.fillText(S.last.txt,tx,528)}

  const cx=284,cy=484,r=54,rad=d=>(d-90)*Math.PI/180;
  ctx.lineWidth=12;ctx.strokeStyle='rgba(244,239,228,.13)';ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.stroke();
  const live=S.phase==='timing'||S.phase==='anim',zc=live?S.zone:0,half=zoneHalf();
  ctx.globalAlpha=live?1:.45;
  ctx.strokeStyle='#f2b134';ctx.beginPath();ctx.arc(cx,cy,r,rad(zc-half),rad(zc+half));ctx.stroke();
  ctx.strokeStyle='#d6403a';ctx.beginPath();ctx.arc(cx,cy,r,rad(zc-perfectHalf()),rad(zc+perfectHalf()));ctx.stroke();
  ctx.globalAlpha=1;ctx.strokeStyle='rgba(244,239,228,.4)';ctx.lineWidth=2;
  for(let d=0;d<360;d+=30){ctx.beginPath();ctx.moveTo(cx+Math.cos(rad(d))*(r-12),cy+Math.sin(rad(d))*(r-12));ctx.lineTo(cx+Math.cos(rad(d))*(r-7),cy+Math.sin(rad(d))*(r-7));ctx.stroke()}
  const na=rad(live?S.needle:0);
  line([[cx,cy],[cx+Math.cos(na)*(r+6),cy+Math.sin(na)*(r+6)]],'#f4efe4',3.5);ell(cx,cy,6,6,'#f4efe4');
  ctx.fillStyle='#a9bfb6';ctx.font=font(BODY,10);ctx.textAlign='center';ctx.fillText('TIMING',cx,H-8);
}

function makeThumb(vk){
  const c=document.createElement('canvas');c.width=180*dpr;c.height=190*dpr;
  const prev=ctx;ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.translate(-90,-88);
  drawBoard(vk);drawCharacter({phase:'ready',anim:null,red:{L:0,R:0},drop:null},vk,0);
  ctx=prev;return c;
}

// ---------- loop ----------
let lastT=performance.now(),clock=0;
function update(dt,wall=dt){
  clock+=dt;
  if(!S)return;
  // sdt is slowed during the slow-motion of a perfect hit; input timing and the shake use real time
  const ts=timeScale(),sdt=dt*ts;
  // The clock follows the wall clock (a hidden tab cannot pause it). During a hit animation it advances in
  // game time, so the slow-motion of a PERFECT costs no more time than a normal hit.
  if(S.timerOn&&S.phase!=='start'&&S.phase!=='over'){
    S.timeLeft-=((S.phase==='anim'&&wall<=.1)?sdt:wall)*1000;
    if(S.timeLeft<=0){S.timeLeft=0;if(S.phase!=='anim'){gameOver('timeout');return}}
  }
  S.turn+=Math.max(-dt*4,Math.min(dt*4,(S.vk==='abuser'&&S.spot==='S'?1:0)-S.turn));
  S.turnB+=Math.max(-dt*3.5,Math.min(dt*3.5,(S.spot==='B'?1:0)-S.turnB));
  if(S.phase==='charge'){S.chargeT+=dt;S.power=(1-Math.cos(S.chargeT*(3+S.level*.57)))/2}
  else if(S.phase==='timing'){
    S.t+=dt;const sp=S.speed*(S.wobble?1+.5*Math.sin(S.t*4.3):1),d=S.dir*sp*dt;
    S.needle=(S.needle+d+360)%360;S.travel+=Math.abs(d);
    if(S.travel>1080)resolve(999);
  }else if(S.phase==='anim'){
    const a=S.anim;a.t+=sdt;
    if(!a.impacted&&a.t>=.12){a.impacted=true;impact()}
    if(a.t>=1)endAnim();
  }
  if(S.drop){const d=S.drop;d.vy+=900*sdt;d.x+=d.vx*sdt;d.y+=d.vy*sdt;d.r+=sdt*7*Math.sign(d.vx||1)}
  S.stars.forEach(s=>{s.t-=sdt;s.x+=s.vx*sdt;s.y+=s.vy*sdt;s.vy+=s.g*sdt;
    if(s.k==='conf'){s.r+=s.vr*sdt;s.vx*=1-Math.min(1,1.5*sdt)}});S.stars=S.stars.filter(s=>s.t>0);
  if(S.bubble){S.bubble.t-=sdt;if(S.bubble.t<=0)S.bubble=null}
  S.shake=Math.max(0,S.shake-dt);
}
// thin countdown bar along the top edge of the screen; turns red and pulses in the last 10 seconds
function drawTimer(){
  if(!S.timerOn&&S.phase!=='over'&&!S.cleared)return;
  const f=Math.max(0,Math.min(1,(S.cleared?S.finalLeft:S.timeLeft)/TIME_LIMIT_MS)),low=f<=1/6;
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,0,W,6);
  ctx.fillStyle=low?(Math.floor(clock*4)%2?'#ff6b63':'#d6403a'):f<=1/3?'#f2b134':'#9fd3c0';
  ctx.fillRect(0,0,W*f,6);
}
function draw(){
  ctx.clearRect(0,0,W,H);
  if(!S)return;
  ctx.save();
  if(S.shake>0){const m=S.shake*40;ctx.translate((Math.random()-.5)*m,(Math.random()-.5)*m)}
  ctx.save();ctx.beginPath();ctx.rect(-20,-20,W+40,PANEL+20);ctx.clip();
  const a=S.anim,env=perfEnv(a);
  ctx.save();
  if(env>0){const p=hitPoint(a),z=1+.18*env;ctx.translate(p[0],p[1]);ctx.scale(z,z);ctx.translate(-p[0],-p[1])}
  drawBoard(S.vk);drawCharacter(S,S.vk,clock);drawSlapHand();drawFx();
  ctx.restore();
  if(isPerfect(a))drawPerfectOverlay(a);
  drawTimer();
  ctx.restore();ctx.restore();
  drawPanel();
}
function loop(now){const wall=(now-lastT)/1000,dt=Math.min(.05,wall);lastT=now;update(dt,wall);draw();requestAnimationFrame(loop)}

// read by js/game-integration.js so a dialog is never opened in the middle of a swing
function refreshProgressUi(){
  if(screen==='select')showSelect();else if(S)ui();
}
window.PunisherGame={
  isBusy:()=>!!S&&(S.phase==='charge'||S.phase==='timing'||S.phase==='anim'),
  // Logged-in players: the server's verified totals replace the local ones. Returns labels of anything newly unlocked.
  applyServerProgress(p){
    const prev=progress;
    progress={total:p.totalScore,per:{...blankProgress().per,...p.villainScores}};progressFromServer=true;
    refreshProgressUi();
    return unlockLabels(prev,progress);
  },
  useLocalProgress(){progress=blankProgress();progressFromServer=false;refreshProgressUi()},
  getProgress:()=>progress
};
newGame('robber');showSelect();
if(document.fonts)document.fonts.ready.then(()=>{fit();if(!ov.hidden&&$('cards'))showSelect()});
requestAnimationFrame(loop);
