// Everything that paints the canvas. Loaded before game.js; the functions read game.js globals (ctx, S, clock, W, H, PANEL…) at call time.

// ---------- drawing helpers ----------
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
const lerp=(a,b,t)=>a+(b-a)*t;
const DISP='400 %spx Anton, Impact, sans-serif',BODY='600 %spx "Hind Siliguri", system-ui, sans-serif',BN='700 %spx "Hind Siliguri", "Noto Sans Bengali", sans-serif';
const font=(tpl,s)=>tpl.replace('%s',s);
const line=(pts,c,w)=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke()};
const ell=(x,y,rx,ry,c,r=0)=>{ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,rx,ry,r,0,Math.PI*2);ctx.fill()};

// Character colors. *Rim is the color a material takes where the scene's light grazes its edge.
const PAL={
  ink:'#1a1210',
  robber:{skin:'#a8714d',skinRim:'#f2b884',neck:'#93603f',shirt:'#2b3a67',shirtRim:'#9a96b8',pants:'#34456f',
    cap:'#c0302b',capRim:'#ffa07a',brim:'#8f1e1e',seam:'#7a1a17',hair:'#1f1612',hairRim:'#8a7064',gamcha:'#b8322c',check:'#2f7a45'},
  abuser:{skin:'#c98d63',skinRim:'#f6d6b8',neck:'#b97c55',cloth:'#ecebe3',clothRim:'#ffffff',seam:'#c9c6ba',
    beard:'#2e2724',beardRim:'#7a6f68',hair:'#2e2724',cane:'#6b4423',caneRim:'#c0946a',tupi:'#f7f5ee',tupiDot:'#d9d3c6'},
  rapist:{skin:'#c48a64',skinRim:'#ffd6ae',neck:'#b07a55',suit:'#1c1a22',suitRim:'#6c6680',lapel:'#2a2730',pants:'#17151c',
    hair:'#141218',hairRim:'#9a90a8',gold:'#e0b13a'}
};
// 2.5D lighting: every scene has one key light. light = unit vector toward it (screen space, +y is down); shade = rgb of the
// shadows (alpha is given per use); hi = the soft highlight on surfaces facing the light.
const SCENES={
  robber:{light:[.6,-.8],shade:'16,20,62',hi:'rgba(255,224,170,.3)'},     // street lamp, top right; night-blue shadows
  abuser:{light:[-.6,-.8],shade:'8,30,26',hi:'rgba(230,248,240,.3)'},     // daylight from a window, top left; chalkboard-green shadows
  rapist:{light:[0,-1],shade:'28,6,12',hi:'rgba(255,220,160,.35)'}        // one bare bulb straight overhead, line-up room style
};
let LIGHT,SHADE,HI;
const setScene=vk=>{({light:LIGHT,shade:SHADE,hi:HI}=SCENES[vk])};
setScene('robber');
// Volume shading, inside the shape's outline: a thin rim on the edge facing the light, the base tone, a soft core shadow
// growing toward the far side and a soft highlight toward the light; then the ink outline.
// box = [x,y,w,h] around the shape. path() must begin a fresh path every time it is called.
function vol(path,[x,y,w,h],base,rim,{rw=3,shade=.55,hi=HI,lw=3}={}){
  const [lx,ly]=LIGHT,cx=x+w/2,cy=y+h/2,R=Math.hypot(w,h)/2;
  ctx.save();path();ctx.clip();
  ctx.fillStyle=rim;ctx.fillRect(x-rw-2,y-rw-2,w+2*rw+4,h+2*rw+4);
  ctx.save();ctx.translate(-lx*rw,-ly*rw);path();ctx.fillStyle=base;ctx.fill();ctx.restore();   // what the shift uncovers is the rim
  let g=ctx.createLinearGradient(cx+lx*R,cy+ly*R,cx-lx*R,cy-ly*R);
  g.addColorStop(0,`rgba(${SHADE},0)`);g.addColorStop(.45,`rgba(${SHADE},0)`);g.addColorStop(1,`rgba(${SHADE},${shade})`);
  ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
  if(hi){const px=cx+lx*w*.22,py=cy+ly*h*.22;g=ctx.createRadialGradient(px,py,0,px,py,Math.min(w,h)*.5);
    g.addColorStop(0,hi);g.addColorStop(1,hi.replace(/[\d.]+\)$/,'0)'));ctx.fillStyle=g;ctx.fillRect(x,y,w,h)}
  ctx.restore();
  if(lw){path();ctx.strokeStyle=PAL.ink;ctx.lineWidth=lw;ctx.lineJoin='round';ctx.stroke()}
}
// contact shadow: a soft dark band inside a shape, fading from y0 to y1, where one part tucks under another
function contact(path,y0,y1,a=.6){
  ctx.save();path();ctx.clip();const g=ctx.createLinearGradient(0,y0,0,y1);
  g.addColorStop(0,`rgba(${SHADE},${a})`);g.addColorStop(1,`rgba(${SHADE},0)`);
  ctx.fillStyle=g;ctx.fillRect(-60,Math.min(y0,y1)-1,W+120,Math.abs(y1-y0)+2);ctx.restore();
}
// a shape's shadow cast on whatever is behind it, offset away from the light
function castShadow(path,d,a=.4){ctx.save();ctx.translate(-LIGHT[0]*d,-LIGHT[1]*d);path();ctx.fillStyle=`rgba(${SHADE},${a})`;ctx.fill();ctx.restore()}
const ellPath=(x,y,rx,ry,r=0)=>()=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,r,0,Math.PI*2)};
// a limb drawn as a thick line, with an ink edge
const inkLine=(pts,c,w)=>{line(pts,PAL.ink,w+5);line(pts,c,w)};
// the same with volume: a shaded underside and a thin lit edge on top
function limb(pts,c,rim,w){
  inkLine(pts,c,w);
  const [a,b]=pts,at=t=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)],off=d=>[at(.14),at(.86)].map(([x,y])=>[x+LIGHT[0]*d,y+LIGHT[1]*d]);
  line(off(-w*.22),`rgba(${SHADE},.45)`,w*.45);line(off(w*.3),rim,2);
}
// How far the head is turned, −1…1 (+ = face toward the viewer's right): a cheek slap swings it away from the hand, on the
// same spring as the sway in drawCharacter, plus a slow idle glance.
function headYaw(st,clk){
  let y=Math.sin(clk*.9)*.06;const a=st.anim,k=a?a.t-.12:0;
  if(a&&a.hit&&k>0&&(a.spot==='L'||a.spot==='R')){
    const s=(.3+.7*a.force)*(isPerfect(a)?1.2:1)*sstep(k/.03)*Math.exp(-k*5)*Math.cos(k*16);y+=a.spot==='L'?s:-s}
  return Math.max(-1,Math.min(1,y));
}

// par: horizontal parallax of the far background (it moves against the villain's head turn)
function drawBoard(vk,par=0){
  const v=VILLAINS[vk];setScene(vk);
  ctx.fillStyle=v.board;ctx.fillRect(-20,-20,W+40,PANEL+20);
  if(vk==='robber'){
    const g=ctx.createRadialGradient(310,20,5,310,20,220);g.addColorStop(0,'rgba(255,200,110,.35)');g.addColorStop(1,'rgba(255,200,110,0)');
    ctx.fillStyle=g;ctx.fillRect(-20,-20,W+40,PANEL+20);
    ctx.fillStyle='#2a3150';for(let i=0;i<5;i++)ctx.fillRect(i*80-10+par,250-((i*37)%60),58,PANEL);
    ctx.fillStyle='rgba(255,214,120,.5)';for(let i=0;i<5;i++)for(let j=0;j<3;j++)if((i+j)%2)ctx.fillRect(i*80+j*16+par,262-((i*37)%60)+j*22,8,10);
  }else if(vk==='rapist'){
    // a police line-up wall with height marks, lit by one bare bulb that sways a little on its cord
    ctx.fillStyle='rgba(0,0,0,.18)';for(let i=0;i<9;i++)ctx.fillRect(0,i*48,W,2);
    ctx.fillStyle='rgba(244,239,228,.2)';ctx.font=font(DISP,13);
    ['7 FT','6 FT','5 FT','4 FT'].forEach((t,i)=>{const y=93+i*96;ctx.textAlign='left';ctx.fillText(t,10+par,y);ctx.textAlign='right';ctx.fillText(t,W-10+par,y)});
    const bx=180+Math.sin(clock*1.3)*2.5;
    let g=ctx.createLinearGradient(0,48,0,PANEL);g.addColorStop(0,'rgba(255,220,160,.16)');g.addColorStop(1,'rgba(255,220,160,.03)');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(bx-10,50);ctx.lineTo(bx+10,50);ctx.lineTo(330,PANEL);ctx.lineTo(30,PANEL);ctx.closePath();ctx.fill();
    g=ctx.createRadialGradient(bx,50,4,bx,50,130);g.addColorStop(0,'rgba(255,214,150,.4)');g.addColorStop(1,'rgba(255,214,150,0)');
    ctx.fillStyle=g;ctx.fillRect(-20,-20,W+40,PANEL+20);
    line([[180,-20],[bx,38]],'#0c0a0c',2);ctx.fillStyle='#2a2628';rr(bx-5,34,10,9,2);ctx.fill();
    ell(bx,52,12,13,'rgba(255,240,200,.35)');ell(bx,51,7,9,'#fff3d0');
  }else{
    // daylight from a window off the top left, falling across the chalkboard in a soft shaft
    const g=ctx.createRadialGradient(20,0,5,20,0,280);g.addColorStop(0,'rgba(225,245,235,.2)');g.addColorStop(1,'rgba(225,245,235,0)');
    ctx.fillStyle=g;ctx.fillRect(-20,-20,W+40,PANEL+20);
    ctx.fillStyle='rgba(225,245,235,.05)';ctx.beginPath();ctx.moveTo(-20,-20);ctx.lineTo(110,-20);ctx.lineTo(380,PANEL);ctx.lineTo(220,PANEL);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(244,239,228,.05)';
    for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(40+i*60+par,60+(i%3)*90,50,14,.3,0,7);ctx.fill()}
  }
  ctx.fillStyle='rgba(244,239,228,.2)';ctx.font=font(BN,15);ctx.textAlign='left';ctx.fillText(v.chalk[0],14,30);
  ctx.textAlign='right';ctx.fillText(v.chalk[1],W-14,30);
  if(vk==='abuser'){ctx.fillStyle='#5a4330';ctx.fillRect(-20,PANEL-10,W+40,10);
    ctx.fillStyle='#f4efe4';ctx.fillRect(40,PANEL-14,18,4);ctx.fillStyle='#f2b134';ctx.fillRect(300,PANEL-14,14,4)}
  else{ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(-20,PANEL-10,W+40,10)}
}

// yaw: head turn (see headYaw); the knitted pattern wraps round the cap as it turns
function drawTupi(x,y,rot,yaw=0){
  const p=PAL.abuser,shape=()=>{ctx.beginPath();ctx.moveTo(-45,22);ctx.quadraticCurveTo(-43,-22,0,-24);ctx.quadraticCurveTo(43,-22,45,22);ctx.quadraticCurveTo(0,14,-45,22);ctx.closePath()};
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  vol(shape,[-45,-24,90,46],p.tupi,'#ffffff',{shade:.4,lw:2.5});
  ctx.save();shape();ctx.clip();ctx.fillStyle=p.tupiDot;
  for(let r=0;r<3;r++)for(let c=-5;c<=5;c++){const px=c*9+(r%2)*4.5+yaw*4,py=-12+r*10;if(Math.abs(px)<40-r*2)ctx.fillRect(px-1.5,py-1.5,3,3)}
  ctx.restore();ctx.restore();
}
// yaw: head turn (see headYaw). The front of the cap swings further than its crown, like the face does.
function drawBallCap(x,y,rot,yaw=0){
  const p=PAL.robber,f=yaw*8,b=yaw*6;
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  vol(ellPath(30+b,-8,26,7,-.5),[4+b,-22,52,28],p.brim,p.capRim,{rw:2,lw:2.5,hi:null});
  vol(()=>{ctx.beginPath();ctx.moveTo(-42,22);ctx.quadraticCurveTo(-40,-24,0,-26);ctx.quadraticCurveTo(40,-24,42,22);ctx.quadraticCurveTo(0,16,-42,22);ctx.closePath()},[-42,-26,84,48],p.cap,p.capRim);
  line([[yaw*2,-26],[f,18]],p.seam,1.5);line([[-24+yaw*3,-18],[-14+f,18]],p.seam,1.5);line([[24+yaw*3,-18],[14+f,18]],p.seam,1.5);
  ell(16+yaw*4,-14,8,4,'rgba(255,236,200,.4)',.5);   // specular glint from the lamp
  ell(yaw*2,-25,4,3,PAL.ink);
  ctx.fillStyle='#1b1512';rr(-10+f,12,20,8,3);ctx.fill();
  ctx.restore();
}
function drawGlasses(x,y,rot,cracked){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  [-34,4].forEach(lx=>{
    const g=ctx.createLinearGradient(0,-10,0,10);g.addColorStop(0,'#2e2c36');g.addColorStop(1,'#08080a');
    ctx.fillStyle=g;rr(lx,-10,30,20,7);ctx.fill();ctx.strokeStyle=PAL.ink;ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#d4a72c';ctx.lineWidth=2;ctx.stroke();
    ell(lx+15+LIGHT[0]*7,-3+LIGHT[1]*3,6,2,'rgba(255,240,210,.6)');   // the light reflected in the lens
  });
  line([[-4,-4],[4,-4]],PAL.ink,4);line([[-4,-4],[4,-4]],'#d4a72c',2);
  if(cracked){line([[-26,-8],[-18,0],[-22,8]],'#ddd',1.2);line([[22,-9],[16,1],[26,8]],'#ddd',1.2)}
  ctx.restore();
}
function drawPhone(x,y,rot){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  ctx.fillStyle='#222';rr(-10,-18,20,36,4);ctx.fill();ctx.strokeStyle=PAL.ink;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#4a8fd6';rr(-8,-15,16,28,2);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.moveTo(-8,-15);ctx.lineTo(1,-15);ctx.lineTo(-8,-2);ctx.closePath();ctx.fill();   // screen glare
  ctx.restore();
}
function drawPhoneBack(x,y,rot){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  ctx.fillStyle='#3a3f48';rr(-10,-18,20,36,4);ctx.fill();ctx.strokeStyle=PAL.ink;ctx.lineWidth=2;ctx.stroke();
  ell(-4,-11,3,3,'#111');ell(-4,-3,3,3,'#111');ell(3,-11,1.5,1.5,'#f2e6b0');   // camera lenses and flash
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

// ---------- body parts shared by the villains (2.5D look) ----------
// a dark halo on the wall behind the villain, thrown away from the light, lifts him off the background
function halo(){
  const x=180-LIGHT[0]*33,y=300-LIGHT[1]*12,g=ctx.createRadialGradient(x,y,40,x,y,175);
  g.addColorStop(0,`rgba(${SHADE},.55)`);g.addColorStop(1,`rgba(${SHADE},0)`);ctx.fillStyle=g;ctx.fillRect(-20,100,W+40,PANEL-100);
}
// the body leans from the feet with the head turn, so a slap rocks him in depth rather than sliding him
const lean=yaw=>{ctx.translate(180,PANEL);ctx.transform(1,0,-yaw*.05,1,0,0);ctx.translate(-180,-PANEL)};
// the neck, darkest just under the head
const neck=(x,y,w,h,base,rim)=>{const p=()=>{ctx.beginPath();ctx.rect(x,y,w,h)};vol(p,[x,y,w,h],base,rim,{rw:2});contact(p,y,y+24,.7)};
const fist=(x,y,r,p)=>vol(ellPath(x,y,r,r),[x-r,y-r,2*r,2*r],p.skin,p.skinRim,{rw:2,lw:2.5});
const placardShadow=()=>castShadow(()=>{ctx.save();ctx.translate(180,352);ctx.rotate(-.05);rr(-76,-32,152,66,4);ctx.restore()},8,.4);
const ears=(lx,rx,y,w,h,p)=>[lx,rx].forEach(x=>vol(ellPath(x,y,w,h),[x-w,y-h,2*w,2*h],p.skin,p.skinRim,{rw:2,lw:2.5}));
// a checked gamcha piece: fill, plaid clipped to it, ink edge
function gamcha(path,p){
  ctx.save();path();ctx.fillStyle=p.gamcha;ctx.fill();ctx.clip();ctx.strokeStyle=p.check;ctx.lineWidth=2;
  for(let i=100;i<270;i+=8){ctx.beginPath();ctx.moveTo(i,230);ctx.lineTo(i,340);ctx.stroke()}
  for(let i=230;i<340;i+=9){ctx.beginPath();ctx.moveTo(100,i);ctx.lineTo(270,i);ctx.stroke()}
  ctx.restore();path();ctx.strokeStyle=PAL.ink;ctx.lineWidth=2.5;ctx.stroke();
}
// a walking cane with a crook; the crook curls round a centre at cx on the cane's top
function cane(x0,x1,cx,a0,a1,p){
  limb([[x0,PANEL],[x1,262]],p.cane,p.caneRim,7);
  ctx.lineCap='round';ctx.beginPath();ctx.arc(cx,262,12,a0*Math.PI,a1*Math.PI);
  ctx.strokeStyle=PAL.ink;ctx.lineWidth=12;ctx.stroke();ctx.strokeStyle=p.cane;ctx.lineWidth=7;ctx.stroke();
}
// the seat seen from behind: two rounded cheeks under the cloth (a soft highlight on each toward the light and a shadowed
// fold beneath), and the centre seam
function seat(path,seam,hiA=.12){
  ctx.save();path();ctx.clip();
  [152,208].forEach(cx=>{
    const px=cx+LIGHT[0]*10,py=362+LIGHT[1]*10,g=ctx.createRadialGradient(px,py,0,px,py,30);
    g.addColorStop(0,`rgba(255,255,255,${hiA})`);g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(cx-40,320,80,100);
    ctx.strokeStyle=`rgba(${SHADE},.5)`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,368,34,.12*Math.PI,.88*Math.PI);ctx.stroke();
  });
  line([[180,336],[180,PANEL]],`rgba(${SHADE},.35)`,7);line([[180,336],[180,PANEL]],seam,2.5);
  ctx.restore();
}
const trousersP=()=>{ctx.beginPath();ctx.moveTo(108,326);ctx.lineTo(252,326);ctx.lineTo(268,PANEL);ctx.lineTo(92,PANEL);ctx.closePath()};
const panjabiP=()=>{ctx.beginPath();ctx.moveTo(118,264);ctx.quadraticCurveTo(180,248,242,264);ctx.lineTo(272,304);ctx.lineTo(282,PANEL);ctx.lineTo(78,PANEL);ctx.lineTo(88,304);ctx.closePath()};

// ---------- front views ----------
function frontAbuser(st,yaw){
  const p=PAL.abuser;
  halo();ctx.save();lean(yaw);
  neck(166,222,28,44,p.neck,p.skinRim);
  cane(300,284,296,1,1.9,p);
  vol(panjabiP,[78,248,204,PANEL-248],p.cloth,p.clothRim,{shade:.4});
  contact(panjabiP,250,292,.3);   // in the shadow of the beard
  line([[110,300],[118,PANEL]],p.seam,2);line([[250,300],[242,PANEL]],p.seam,2);line([[180,256],[180,318]],p.seam,2);
  [270,288,306].forEach(y=>{ell(184,y,2.5,2.5,'#b9b4a6');ell(183.2,y-.8,1,1,'#fff')});
  fist(282,318,13,p);
  placardShadow();placard('CHILD ABUSER',VILLAINS.abuser.bn);
  ctx.restore();
}
function frontRobber(st,yaw,armY){
  const p=PAL.robber;
  halo();ctx.save();lean(yaw);
  neck(167,222,26,44,p.neck,p.skinRim);
  vol(()=>{ctx.beginPath();ctx.moveTo(122,266);ctx.quadraticCurveTo(180,252,238,266);ctx.lineTo(262,300);ctx.lineTo(268,PANEL);ctx.lineTo(92,PANEL);ctx.lineTo(98,300);ctx.closePath()},
    [92,252,176,PANEL-252],p.shirt,p.shirtRim);
  line([[112,312],[122,PANEL]],`rgba(${SHADE},.5)`,3);line([[200,330],[206,PANEL]],`rgba(${SHADE},.4)`,2.5);   // folds
  ctx.fillStyle='rgba(242,200,90,.5)';ctx.font=font(DISP,20);ctx.textAlign='center';ctx.fillText('BOSS',180,300);
  // gamcha round the neck, one end hanging down the front
  const band=()=>{ctx.beginPath();ctx.moveTo(146,256);ctx.quadraticCurveTo(180,276,214,256);ctx.lineTo(214,268);ctx.quadraticCurveTo(180,288,146,268);ctx.closePath()};
  const end=()=>{ctx.beginPath();ctx.save();ctx.translate(150,266);ctx.rotate(.15);ctx.rect(-7,0,14,46);ctx.restore()};
  castShadow(band,6,.45);castShadow(end,6,.45);
  gamcha(band,p);contact(band,288,262,.45);gamcha(end,p);
  // raised snatching arm with phone; the arm throws a soft shadow on the shirt
  const up=[[236,272],[270,305+armY]];
  line(up.map(([x,y])=>[x-LIGHT[0]*8,y-LIGHT[1]*8]),`rgba(${SHADE},.35)`,18);
  limb(up,p.shirt,p.shirtRim,18);limb([[262,298+armY],[284,300+armY]],p.neck,p.skinRim,12);
  if(!(st.drop&&st.drop.kind==='phone'))drawPhone(286,276+armY,.1);
  fist(284,300+armY,13,p);
  placardShadow();placard('SNATCHER',VILLAINS.robber.bn);
  ctx.restore();
}
function frontRapist(st,yaw){
  const p=PAL.rapist;
  halo();ctx.save();lean(yaw);
  neck(164,224,32,42,p.neck,p.skinRim);
  vol(()=>{ctx.beginPath();ctx.moveTo(112,266);ctx.quadraticCurveTo(180,250,248,266);ctx.lineTo(276,304);ctx.lineTo(286,PANEL);ctx.lineTo(74,PANEL);ctx.lineTo(84,304);ctx.closePath()},
    [74,250,212,PANEL-250],p.suit,p.suitRim,{shade:.6,hi:'rgba(255,220,160,.12)'});
  ctx.fillStyle='rgba(255,255,255,.07)';ctx.beginPath();ctx.moveTo(120,280);ctx.lineTo(140,PANEL);ctx.lineTo(130,PANEL);ctx.lineTo(112,284);ctx.fill();   // satin sheen
  // open shirt collar showing the chest, a gold chain on it
  const vee=()=>{ctx.beginPath();ctx.moveTo(160,258);ctx.lineTo(180,300);ctx.lineTo(200,258);ctx.closePath()};
  vol(vee,[160,258,40,42],p.neck,p.skinRim,{rw:1.5,lw:2});contact(vee,258,280,.5);
  [[[154,256],[170,286]],[[206,256],[190,286]]].forEach(l=>{line(l,PAL.ink,9);line(l,p.lapel,6)});   // lapels
  ctx.lineCap='round';ctx.beginPath();ctx.arc(180,262,22,.35,Math.PI-.35);ctx.strokeStyle=PAL.ink;ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle=p.gold;ctx.lineWidth=3;ctx.stroke();
  [[.7,'#fff6d0'],[1.3,'#fff6d0']].forEach(([a,c])=>ell(180+Math.cos(a)*22,262+Math.sin(a)*22,1.5,1.5,c));   // glints
  fist(284,318,14,p);
  [[276,308,8,5],[270,332,26,6]].forEach(([x,y,w,h])=>{ctx.fillStyle=p.gold;ctx.fillRect(x,y,w,h);ctx.strokeStyle=PAL.ink;ctx.lineWidth=1.5;ctx.strokeRect(x,y,w,h)});   // ring and bracelet
  placardShadow();placard('RAPIST',VILLAINS.rapist.bn);
  ctx.restore();
}

// ---------- heads, front. Head turn by parallax: the face sits in front of the turning axis, so it slides further (fx)
// than the outline (ox), and the ears (behind the axis) slide the other way. Features are clipped to the head so they
// wrap round its edge. ----------
function headAbuser(st,yaw,eyes,mouth,wk){
  // when "Back of head" is selected he turns his head away: squash the head horizontally, then show the back view
  const e=sstep(st.turn||0),sx=Math.max(.04,Math.abs(Math.cos(e*Math.PI)));
  ctx.translate(180,0);ctx.scale(sx,1);ctx.translate(-180,0);
  if(e>.5){headBackAbuser();mark(180,176,st.red.S||0,false,wk);if(!st.drop)drawTupi(180,118,0);return}
  const p=PAL.abuser,ox=yaw*4,fx=yaw*12,headP=ellPath(180+ox,180,47,57);
  ears(133-ox*.75,227-ox*.75,186,9,14,p);
  vol(headP,[133+ox,123,94,114],p.skin,p.skinRim,{rw:3.5});
  contact(headP,140,166,.45);   // the tupi's shadow on the forehead
  // the long beard hangs in front of the face plane, so it swings with the features
  const beardP=()=>{ctx.beginPath();ctx.moveTo(134,184);ctx.quadraticCurveTo(136,234,158,262);ctx.lineTo(168,292);ctx.lineTo(177,274);ctx.lineTo(185,298);ctx.lineTo(194,274);ctx.lineTo(204,286);
    ctx.quadraticCurveTo(224,240,226,184);ctx.quadraticCurveTo(220,214,198,218);ctx.quadraticCurveTo(180,213,162,218);ctx.quadraticCurveTo(140,214,134,184);ctx.closePath()};
  ctx.save();ctx.translate(fx,0);
  castShadow(beardP,5,.3);
  vol(beardP,[134,184,92,114],p.beard,p.beardRim,{rw:2.5,lw:2.5,hi:'rgba(200,190,180,.15)'});
  [[160,236,166,262],[176,240,178,270],[192,238,190,266],[148,222,154,244],[208,224,203,248]].forEach(([a1,b1,a2,b2])=>line([[a1,b1],[a2,b2]],'#7a716a',1.5));
  ctx.restore();
  ctx.save();headP();ctx.clip();ctx.translate(fx,0);
  ell(186,205,7,2.5,`rgba(${SHADE},.2)`,.2);   // the nose's shadow, away from the window
  line([[181,180],[173,204],[186,205]],'#9a6544',2.5);
  eyesAndMouth(eyes,mouth,229,170,'#7e5034');
  line([[151,157],[173,162]],'#2e2724',4);line([[187,160],[209,152]],'#2e2724',4);
  ctx.restore();
  ctx.save();ctx.translate(yaw*8,0);mark(150,196,st.red.L,false,wk);mark(210,196,st.red.R,true,wk);ctx.restore();
  if(!st.drop)drawTupi(180+ox,118,0,yaw);
}
function headRobber(st,yaw,eyes,mouth,wk){
  const p=PAL.robber,ox=yaw*4,fx=yaw*12,headP=ellPath(180+ox,182,43,55);
  ears(137-ox*.75,223-ox*.75,186,8,13,p);
  vol(headP,[137+ox,127,86,110],p.skin,p.skinRim,{rw:3.5,lw:0});
  contact(headP,146,172,.55);   // the cap's shadow on the forehead
  ctx.save();headP();ctx.clip();ctx.translate(fx,0);
  ctx.fillStyle='rgba(40,25,20,.45)';
  for(let i=0;i<60;i++){const an=Math.PI*(.15+.7*((i*37)%60)/60),rr2=30+((i*13)%14);ctx.fillRect(180+Math.cos(an)*rr2,190+Math.sin(an)*rr2*1.1,1.6,1.6)}
  ell(176,205,7,2.5,`rgba(${SHADE},.18)`,-.2);   // the nose's shadow, away from the lamp
  line([[166,214],[180,211],[194,214]],'#2a1d18',3);
  line([[181,182],[174,202],[186,203]],'#7a4e33',2.5);
  eyesAndMouth(eyes,mouth,226,170,'#6e4a32');
  line([[152,159],[173,163]],'#1f1612',4);line([[187,163],[208,159]],'#1f1612',4);
  line([[148,150],[156,168]],'#e2b8a0',2);line([[147,156],[155,155]],'#e2b8a0',1.2);line([[150,162],[157,161]],'#e2b8a0',1.2);
  ctx.restore();
  ctx.save();ctx.translate(yaw*8,0);mark(152,196,st.red.L,false,wk);mark(208,196,st.red.R,true,wk);ctx.restore();
  headP();ctx.strokeStyle=PAL.ink;ctx.lineWidth=3;ctx.stroke();
  ctx.save();ctx.translate(ox,0);
  ctx.fillStyle=p.hair;ctx.beginPath();ctx.moveTo(138,150);ctx.lineTo(132,136);ctx.lineTo(146,142);ctx.lineTo(214,142);ctx.lineTo(228,136);ctx.lineTo(222,150);ctx.closePath();ctx.fill();
  ctx.restore();
  if(!st.drop||st.drop.kind!=='cap')drawBallCap(180+ox,118,0,yaw);
}
function headRapist(st,yaw,eyes,mouth,wk){
  const p=PAL.rapist,ox=yaw*4,fx=yaw*12,headP=ellPath(180+ox,182,52,56);
  ears(128-ox*.75,232-ox*.75,184,9,13,p);
  vol(headP,[128+ox,126,104,112],p.skin,p.skinRim,{rw:3.5,lw:0});
  contact(headP,130,160,.5);   // the hair's shadow on the forehead
  ctx.save();headP();ctx.clip();ctx.translate(fx,0);
  ctx.strokeStyle='#a46f4c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(180,226,26,.3,Math.PI-.3);ctx.stroke();   // double chin
  ell(180,207,8,2.5,`rgba(${SHADE},.25)`);   // the nose's shadow, straight down from the bulb
  line([[181,180],[172,202],[188,203]],'#93603f',2.5);
  eyesAndMouth(st.drop?eyes:'hidden',mouth,228,172,'#93603f');
  ctx.fillStyle='#141218';ctx.beginPath();ctx.moveTo(156,214);ctx.quadraticCurveTo(180,202,204,214);ctx.quadraticCurveTo(206,222,196,220);ctx.quadraticCurveTo(180,212,164,220);ctx.quadraticCurveTo(154,222,156,214);ctx.fill();
  line([[150,155],[172,152]],'#141218',5);line([[188,152],[210,155]],'#141218',5);
  ctx.restore();
  ctx.save();ctx.translate(yaw*8,0);mark(146,200,st.red.L,false,wk);mark(214,200,st.red.R,true,wk);ctx.restore();
  headP();ctx.strokeStyle=PAL.ink;ctx.lineWidth=3;ctx.stroke();
  // gelled hair, with a hard shine where the bulb catches it
  ctx.save();ctx.translate(ox,0);
  vol(()=>{ctx.beginPath();ctx.moveTo(128,170);ctx.quadraticCurveTo(122,118,170,116);ctx.quadraticCurveTo(222,110,234,168);
    ctx.quadraticCurveTo(222,136,196,134);ctx.lineTo(160,134);ctx.quadraticCurveTo(136,140,128,170);ctx.closePath()},[122,110,112,60],p.hair,p.hairRim,{rw:3,lw:2.5,hi:'rgba(255,240,220,.3)'});
  line([[150,122],[168,134]],'rgba(255,255,255,.35)',2.5);line([[190,120],[214,128]],'rgba(255,255,255,.25)',2);
  ctx.restore();
  if(!st.drop)drawGlasses(180+fx,172,0,eyes==='dazed');
}

// ---------- rear views (the villain turns his back when the bottom is the target). His right hand is on the viewer's left now. ----------
function rearAbuser(){
  const p=PAL.abuser;
  neck(166,222,28,44,p.neck,p.skinRim);
  // long panjabi: yoke and centre seams, side slits, the cloth pulled over the seat
  vol(panjabiP,[78,248,204,PANEL-248],p.cloth,p.clothRim,{shade:.4});
  seat(panjabiP,p.seam,0);
  line([[120,286],[180,294],[240,286]],p.seam,2);line([[180,262],[180,336]],p.seam,2);
  line([[110,330],[104,PANEL]],p.seam,2);line([[250,330],[256,PANEL]],p.seam,2);
  vol(()=>{ctx.beginPath();ctx.moveTo(154,258);ctx.quadraticCurveTo(180,250,206,258);ctx.lineTo(204,268);ctx.quadraticCurveTo(180,261,156,268);ctx.closePath()},
    [154,250,52,18],p.cloth,p.clothRim,{rw:1.5,lw:2.5,shade:.4});   // stand-up collar
  cane(60,76,64,1.1,2,p);fist(78,318,13,p);
}
function rearRobber(armY){
  const p=PAL.robber;
  neck(166,222,28,44,p.neck,p.skinRim);
  vol(trousersP,[92,326,176,PANEL-326],p.pants,p.shirtRim);
  seat(trousersP,'#26335a');
  // back pockets with double stitching; a stolen phone pokes out of one
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,349);ctx.clip();drawPhoneBack(141,342,-.12);ctx.restore();
  [126,200].forEach(x=>{ctx.strokeStyle='#8fa0c8';ctx.lineWidth=1.5;rr(x,346,34,30,5);ctx.stroke();
    ctx.setLineDash([2.5,2.5]);rr(x+3,349,28,24,4);ctx.stroke();ctx.setLineDash([]);
    line([[x+7,359],[x+17,366],[x+27,359]],'#c9a24a',1.5)});
  // belt with loops, showing under the short T-shirt
  ctx.fillStyle='#26335a';ctx.fillRect(108,326,144,9);ctx.strokeStyle=PAL.ink;ctx.lineWidth=2;ctx.strokeRect(108,326,144,9);
  [124,156,204,236].forEach(x=>{ctx.fillStyle=p.pants;ctx.fillRect(x-3,323,6,15);ctx.strokeRect(x-3,323,6,15)});
  const shirtP=()=>{ctx.beginPath();ctx.moveTo(122,266);ctx.quadraticCurveTo(180,252,238,266);ctx.lineTo(262,304);ctx.lineTo(256,322);ctx.lineTo(104,322);ctx.lineTo(98,304);ctx.closePath()};
  castShadow(shirtP,5,.45);
  vol(shirtP,[98,258,164,64],p.shirt,p.shirtRim);
  ctx.strokeStyle=`rgba(${SHADE},.45)`;ctx.lineWidth=2.5;   // creases over the shoulder blades
  [[150,1.15,1.55],[210,1.45,1.85]].forEach(([x,a0,a1])=>{ctx.beginPath();ctx.arc(x,300,24,a0*Math.PI,a1*Math.PI);ctx.stroke()});
  ctx.fillStyle='rgba(242,200,90,.55)';ctx.font=font(DISP,20);ctx.textAlign='center';ctx.fillText('BOSS',180,316);
  // the gamcha, knotted at the back of the neck, its two ends hanging down his back
  const band=()=>{ctx.beginPath();ctx.moveTo(146,262);ctx.quadraticCurveTo(180,250,214,262);ctx.lineTo(214,272);ctx.quadraticCurveTo(180,262,146,272);ctx.closePath()};
  const end=(x,r)=>()=>{ctx.beginPath();ctx.save();ctx.translate(x,266);ctx.rotate(r);ctx.rect(-6,0,12,30);ctx.restore()};
  const parts=[end(176,.2),end(186,-.15),band];
  parts.forEach(s=>castShadow(s,5,.45));parts.forEach(s=>gamcha(s,p));
  vol(ellPath(181,266,8,6),[173,260,16,12],p.gamcha,'#e86a5a',{rw:1.5,lw:2.5,hi:null});   // knot
  // his raised right arm, still clutching the phone
  const up=[[124,272],[90,305+armY]];
  line(up.map(([x,y])=>[x-LIGHT[0]*8,y-LIGHT[1]*8]),`rgba(${SHADE},.35)`,18);
  limb(up,p.shirt,p.shirtRim,18);limb([[98,298+armY],[76,300+armY]],p.neck,p.skinRim,12);
  drawPhoneBack(74,276+armY,-.1);fist(76,300+armY,13,p);
}
function rearRapist(){
  const p=PAL.rapist;
  neck(164,224,32,42,p.neck,p.skinRim);
  line([[164,250],[180,255],[196,250]],PAL.ink,4.5);line([[164,250],[180,255],[196,250]],p.gold,2.5);ell(180,255,2.5,2,'#fff3c4');   // gold chain, clasp at the nape
  vol(trousersP,[92,326,176,PANEL-326],p.pants,p.suitRim,{shade:.6});
  seat(trousersP,'#0e0d12',.07);
  // a fat wallet in his back pocket, stuffed with notes: the "well-connected" man
  [[204,344,.12],[211,341,-.08],[218,345,.05]].forEach(([x,y,r])=>{ctx.save();ctx.translate(x,y);ctx.rotate(r);
    ctx.fillStyle='#6f9a5a';ctx.fillRect(0,0,16,16);ctx.strokeStyle='#3e5a32';ctx.lineWidth=1;ctx.strokeRect(0,0,16,16);ctx.restore()});
  ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=1.5;rr(202,360,32,22,4);ctx.stroke();ell(218,362,13,2,'rgba(255,255,255,.1)');
  [128,200].forEach(x=>{line([[x,356],[x+34,356]],PAL.ink,2.5);ell(x+17,362,2,2,'#3a3640')});
  // suit jacket: shadow on the trousers, centre seam into a vent, shoulder seams, collar
  const jacketP=()=>{ctx.beginPath();ctx.moveTo(112,266);ctx.quadraticCurveTo(180,252,248,266);ctx.lineTo(276,304);ctx.lineTo(266,336);ctx.lineTo(94,336);ctx.lineTo(84,304);ctx.closePath()};
  castShadow(jacketP,5,.5);
  vol(jacketP,[84,252,192,84],p.suit,p.suitRim,{shade:.6,hi:'rgba(255,220,160,.12)'});
  line([[180,262],[180,312]],p.lapel,2);ctx.fillStyle=`rgba(${SHADE},.7)`;ctx.fillRect(178,312,5,24);line([[183,312],[183,336]],PAL.ink,1.5);
  line([[124,268],[110,300]],p.lapel,2);line([[236,268],[250,300]],p.lapel,2);
  vol(()=>{ctx.beginPath();ctx.moveTo(150,260);ctx.quadraticCurveTo(180,250,210,260);ctx.lineTo(206,270);ctx.quadraticCurveTo(180,262,154,270);ctx.closePath()},
    [150,250,60,20],p.lapel,p.suitRim,{rw:1.5,lw:2.5});
  fist(76,318,14,p);
  [[76,308,8,5],[64,332,26,6]].forEach(([x,y,w,h])=>{ctx.fillStyle=p.gold;ctx.fillRect(x,y,w,h);ctx.strokeStyle=PAL.ink;ctx.lineWidth=1.5;ctx.strokeRect(x,y,w,h)});
}
// heads, from behind
function headBackAbuser(){
  const p=PAL.abuser,headP=ellPath(180,180,47,57);
  // the long beard shows past the jaw on both sides; it hangs in front of the neck, so the neck hides its middle
  ctx.save();ctx.beginPath();ctx.rect(100,150,160,130);ctx.rect(166,222,28,60);ctx.clip('evenodd');
  vol(ellPath(180,222,52,34),[128,188,104,68],p.beard,p.beardRim,{rw:2,lw:2.5,hi:null});
  ctx.restore();
  ears(133,227,186,9,14,p);
  vol(headP,[133,123,94,114],p.skin,p.skinRim,{rw:3.5});
  vol(ellPath(180,170,45,47),[135,123,90,94],p.hair,p.beardRim,{rw:2,lw:0,hi:'rgba(220,210,200,.25)'});
  [[160,134,156,160],[172,130,170,166],[188,130,190,166],[200,134,204,160],[150,170,148,196],[210,170,212,196]].forEach(([a1,b1,a2,b2])=>line([[a1,b1],[a2,b2]],'#4a403b',1.5));
  contact(headP,216,238,.3);
  line([[130,184],[134,192]],'#a8714d',2);line([[230,184],[226,192]],'#a8714d',2);
  line([[166,228],[194,228]],'#a8714d',2);line([[170,234],[190,234]],'#a8714d',1.5);
}
function headBackRobber(){
  const p=PAL.robber,headP=ellPath(180,180,43,55);
  ears(133,227,186,9,14,p);
  vol(headP,[137,125,86,110],p.skin,p.skinRim,{rw:3.5});
  vol(ellPath(180,178,41,46),[139,132,82,92],p.hair,p.hairRim,{rw:2.5,lw:0,hi:'rgba(170,150,140,.4)'});
  [[160,150,154,196],[172,148,170,204],[188,148,190,204],[200,150,206,196]].forEach(([a1,b1,a2,b2])=>line([[a1,b1],[a2,b2]],'rgba(120,100,92,.45)',1.5));   // strands
  contact(headP,222,236,.5);   // the nape, in the shadow of the hair
  line([[166,229],[194,229]],'#7a4e33',2);line([[170,235],[190,235]],'#7a4e33',1.5);
  drawCapBack(180,118);
}
function headBackRapist(){
  const p=PAL.rapist,headP=ellPath(180,182,52,56),hairP=ellPath(180,172,50,52);
  ears(128,232,184,9,13,p);
  vol(headP,[128,126,104,112],p.skin,p.skinRim,{rw:3.5});
  // gelled hair combed straight back: a hard shine from the bulb, comb lines following the skull
  vol(hairP,[130,120,100,104],p.hair,p.hairRim,{rw:3,lw:0,hi:'rgba(255,240,220,.3)'});
  ctx.save();hairP();ctx.clip();ctx.strokeStyle='rgba(170,160,190,.16)';ctx.lineWidth=1.2;
  for(let i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(180+i*8,120);ctx.quadraticCurveTo(180+i*13,168,180+i*10,226);ctx.stroke()}
  ctx.restore();
  contact(headP,218,238,.5);
  line([[166,231],[194,231]],'#a46f4c',2);line([[170,237],[190,237]],'#a46f4c',1.5);
}
function drawCapBack(x,y){
  const p=PAL.robber;
  ctx.save();ctx.translate(x,y);
  vol(()=>{ctx.beginPath();ctx.moveTo(-42,28);ctx.quadraticCurveTo(-44,-24,0,-27);ctx.quadraticCurveTo(44,-24,42,28);ctx.quadraticCurveTo(0,22,-42,28);ctx.closePath()},
    [-44,-27,88,55],p.cap,p.capRim);
  line([[0,-27],[0,24]],p.seam,1.5);line([[-26,-20],[-18,25]],p.seam,1.5);line([[26,-20],[18,25]],p.seam,1.5);
  ell(0,-26,4,3,PAL.ink);
  ctx.fillStyle=p.seam;rr(-18,19,36,7,2);ctx.fill();ctx.fillStyle='#d9a441';rr(-5,19,10,7,2);ctx.fill();   // adjustable strap
  ctx.restore();
}
function drawRear(st,vk,hx,hy,rot,armY){
  halo();
  ctx.save();ctx.translate(180+hx,240+hy);ctx.rotate(rot*.5);ctx.translate(-180,-240);
  if(vk==='abuser')rearAbuser();else if(vk==='robber')rearRobber(armY);else rearRapist();
  mark(180,372,st.red.B||0,false,'kick');
  ctx.restore();
  ctx.save();ctx.translate(180+hx,240+hy);ctx.rotate(rot);ctx.translate(-180,-240);
  if(vk==='abuser'){headBackAbuser();drawTupi(180,118,0)}else if(vk==='robber')headBackRobber();else headBackRapist();
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
  setScene(vk);
  const a=st.anim;let hx=0,hy=Math.sin(clk*2)*1.5,rot=0,armY=0,sqx=1,sqy=1,eyes='shifty',mouth='smirk';
  if(st.phase==='charge'||st.phase==='timing')eyes='nervous';
  if(a){
    const k=a.t-.12;
    if(a.hit){
      if(k>0){const amp=(10+32*a.force)*(isPerfect(a)?1.3:1),disp=amp*sstep(k/.03)*Math.exp(-k*5)*Math.cos(k*16);
        // squash and stretch: the head flattens along the blow, bulges across it, then jiggles back (faster than the sway)
        const jig=(isPerfect(a)?.22:.08+.12*a.force)*sstep(k/.02)*Math.exp(-k*9)*Math.cos(k*28);
        if(a.spot==='L'){hx+=disp;rot=disp*.007;sqx=1-jig;sqy=1+jig*.6}else if(a.spot==='R'){hx-=disp;rot=-disp*.007;sqx=1-jig;sqy=1+jig*.6}
        else if(a.spot==='B'){hy-=Math.abs(disp)*.9;hx+=disp*.15;rot=disp*.002}   // lurches forward from the kick
        else if(vk==='robber'){armY=Math.abs(disp)*1.2;hx+=disp*.2}
        else{hy+=Math.abs(disp)*.7;rot=disp*.003;sqy=1-jig;sqx=1+jig*.6}
        if(k<(isPerfect(a)?.9:.7)){eyes='dazed';mouth='ouch'}}
    }else{
      const s=Math.sin(Math.min(a.t/.5,1)*Math.PI);
      if(a.spot==='S'&&vk!=='robber')hx+=26*s;else if(a.spot==='S')armY-=20*s;else hy+=24*s;
      eyes='laugh';mouth='laugh';
    }
  }
  const wk=st.weapon||'hand',yaw=headYaw(st,clk);

  // When the bottom is the target the whole villain turns his back: squash horizontally, then show the rear view.
  const eB=sstep(st.turnB||0);
  ctx.save();
  if(eB>0){ctx.translate(180,0);ctx.scale(Math.max(.04,Math.abs(Math.cos(eB*Math.PI))),1);ctx.translate(-180,0)}
  if(eB>.5){drawRear(st,vk,hx,hy,rot,armY)}else{
  if(vk==='abuser')frontAbuser(st,yaw);else if(vk==='robber')frontRobber(st,yaw,armY);else frontRapist(st,yaw);
  ctx.save();ctx.translate(180+hx,240+hy);ctx.rotate(rot);ctx.translate(-180,-240);
  if(sqx!==1||sqy!==1){ctx.translate(180,232);ctx.scale(sqx,sqy);ctx.translate(-180,-232)}   // pivot at the neck so the head stays on it
  if(vk==='abuser')headAbuser(st,yaw,eyes,mouth,wk);else if(vk==='robber')headRobber(st,yaw,eyes,mouth,wk);else headRapist(st,yaw,eyes,mouth,wk);
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
  // flat line ends: with the default round caps (left over from other drawing) each arc looked ~5-6 degrees wider than the range that counts
  ctx.lineCap='butt';
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

// thin countdown bar along the top edge of the screen; turns red and pulses in the last 10 seconds
function drawTimer(){
  if(!S.timerOn&&S.phase!=='over'&&!S.cleared)return;
  const f=Math.max(0,Math.min(1,(S.cleared?S.finalLeft:S.timeLeft)/TIME_LIMIT_MS)),low=f<=1/6;
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,0,W,6);
  ctx.fillStyle=low?(Math.floor(clock*4)%2?'#ff6b63':'#d6403a'):f<=1/3?'#f2b134':'#9fd3c0';
  ctx.fillRect(0,0,W*f,6);
}
// The villain flashes white for a few frames when a hit lands. He is drawn to an offscreen canvas first so only he is tinted, not the board.
let flashCv=null;
function drawVillain(){
  const a=S.anim,k=a&&a.hit&&a.impacted?a.t-.12:-1,fl=k>=0&&k<.07&&!reduceMotion?1-k/.07:0;
  if(fl<=0){drawCharacter(S,S.vk,clock);return}
  if(!flashCv)flashCv=document.createElement('canvas');
  if(flashCv.width!==cv.width||flashCv.height!==cv.height){flashCv.width=cv.width;flashCv.height=cv.height}
  const main=ctx,m=main.getTransform();
  ctx=flashCv.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,flashCv.width,flashCv.height);ctx.setTransform(m);
  drawCharacter(S,S.vk,clock);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=.85*fl;ctx.fillStyle='#fff';ctx.fillRect(0,0,flashCv.width,flashCv.height);
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx=main;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(flashCv,0,0);ctx.restore();
}
function draw(){
  ctx.clearRect(0,0,W,H);
  if(!S)return;
  ctx.save();
  // shake along the blow, as a damped spring (not random jitter), with a little cross-wobble
  if(S.shake>0){const e=S.shake/S.shakeMax,el=S.shakeMax-S.shake,amp=S.shakeMax*24*e*e,[dx,dy]=S.shakeDir,
    along=amp*Math.cos(el*55),across=amp*.25*Math.sin(el*37);ctx.translate(dx*along-dy*across,dy*along+dx*across)}
  ctx.save();ctx.beginPath();ctx.rect(-20,-20,W+40,PANEL+20);ctx.clip();
  const a=S.anim,env=perfEnv(a);
  ctx.save();
  if(env>0){const p=hitPoint(a),z=1+.18*env;ctx.translate(p[0],p[1]);ctx.scale(z,z);ctx.translate(-p[0],-p[1])}
  drawBoard(S.vk,-headYaw(S,clock)*6);drawVillain();drawSlapHand();drawFx();
  ctx.restore();
  if(isPerfect(a))drawPerfectOverlay(a);
  drawTimer();
  ctx.restore();ctx.restore();
  drawPanel();
}
