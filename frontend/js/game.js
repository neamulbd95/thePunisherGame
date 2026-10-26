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
  abuser:{name:'Child Abuser',short:'Abuser',unlock:1500,bn:'শিশু নির্যাতনকারী',
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
  rapist:{name:'Rapist',short:'Rapist',unlock:3500,bn:'ধর্ষক',
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
     log:[],timerOn:false,timeLeft:TIME_LIMIT_MS,cleared:false,finalLeft:0,bonus:0,needle:0,zone:0,dir:1,speed:0,wobble:false,travel:0,t:0,anim:null,red:{L:0,R:0,S:0,B:0},turn:0,turnB:0,ts:1,drop:null,stars:[],last:null,bubble:null,shake:0,shakeMax:0,shakeDir:[0,0]};
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
  else if(S.phase==='timing')resolve(angDiff(S.needle,S.zone)); // judged exactly where the needle is drawn
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
    S.shake=S.shakeMax=reduceMotion?0:perfect?.35:.12+.25*a.force;
    // the shake kicks along the direction of the blow: sideways for a cheek, down for the top of the head, forward for a kick
    S.shakeDir=a.spot==='L'?[1,0]:a.spot==='R'?[-1,0]:a.spot==='B'?[0,-1]:S.vk==='robber'?[.5,.85]:[0,1];
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
// The menu body scrolls without a scroll bar. While there is more below, fade its bottom edge (class .more) so cut-off content reads as scrollable.
const updateMore=()=>ovBody.classList.toggle('more',ovBody.scrollHeight-ovBody.scrollTop-ovBody.clientHeight>4);
ovBody.addEventListener('scroll',updateMore,{passive:true});
addEventListener('resize',updateMore);
new MutationObserver(updateMore).observe(ovBody,{childList:true,subtree:true});
new ResizeObserver(updateMore).observe(ovBody);
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
