/* Laboratório de Geometria — SVG puro, sem dependências.
   Invariante: 40 unidades SVG = 1 cm em grid, figuras, régua e correção.
   A régua tem pivô local (0,0) na marca ZERO; sua borda física começa em -12.
   Transformação local->global: translação(x,y) seguida de rotação(angle).
   As anotações usam coordenadas LOCAIS, por isso acompanham a figura. */
(()=>{'use strict';
const CM=40,NS='http://www.w3.org/2000/svg';
const stage=document.getElementById('stage'),layer=document.getElementById('objects'),rulerLayer=document.getElementById('ruler-layer'),input=document.getElementById('measureInput'),feedback=document.getElementById('feedback');
const shapeTypes=[['triangle','Triângulo'],['square','Quadrado'],['rectangle','Retângulo'],['parallelogram','Paralelogramo'],['rhombus','Losango'],['trapezoid','Trapézio'],['circle','Círculo'],['irregular','Figura irregular']];
const vertices={triangle:[[-80,65],[80,65],[0,-75]],square:[[-80,-80],[80,-80],[80,80],[-80,80]],rectangle:[[-120,-60],[120,-60],[120,60],[-120,-60+120]],parallelogram:[[-90,-65],[70,-65],[110,65],[-50,65]],rhombus:[[0,-100],[100,0],[0,100],[-100,0]],trapezoid:[[-65,-65],[65,-65],[115,65],[-115,65]],irregular:[[-100,-70],[10,-95],[100,-20],[60,75],[-35,100],[-110,20]]};
// Corrige explicitamente o quarto vértice do retângulo.
vertices.rectangle[3]=[-120,60];
let items=[],selected=null,gesture=null,nextId=1,nextVertexIndex=0,rulerVisible=true,mode='measure',editing=null,corrected=false,activeEdge=null;
// Revisão por medida: chave = ID da figura + lado. Não invalida outros acertos.
let reviews={};
// Bateria de exercícios persistida em arquivos .geolab e no histórico.
let exercise=null;
// O histórico guarda snapshots do MODELO, nunca nós SVG nem eventos de ponteiro.
const past=[],future=[];const HISTORY_LIMIT=100;
// Numeração sequencial: A...Z, A₂...Z₂, A₃... (subscrito exibido por SVG).
const subscripts={'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
function vertexName(index){const letter=String.fromCharCode(65+index%26),cycle=Math.floor(index/26)+1;return letter+(cycle===1?'':String(cycle).replace(/\d/g,d=>subscripts[d]));}
function vertexCount(type){return type==='circle'?2:(vertices[type]?.length||0);}
function ensureVertexNames(state){
 // Migra atividades antigas; nunca altera nomes já existentes.
 let cursor=0;
 for(const o of state.items){if(o.type==='ruler')continue;
  const count=vertexCount(o.type);
  if(!Array.isArray(o.vertexNames)||o.vertexNames.length!==count){o.vertexNames=Array.from({length:count},(_,i)=>vertexName(cursor+i));}
  cursor+=count;
 }
 // O contador salvo prevalece sobre o número de vértices existentes (figuras excluídas).
 state.nextVertexIndex=Number.isSafeInteger(state.nextVertexIndex)&&state.nextVertexIndex>=0?Math.max(state.nextVertexIndex,cursor):cursor;
}
// O nome de um segmento é independente do sentido em que os vértices foram desenhados.
// Ex.: DA é mostrado como AD. Os índices subscritos continuam associados à letra.
function alphabeticalPair(a,b){
 const letter=x=>x.charAt(0);
 const sub=x=>Number([...x.slice(1)].map(c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).join(''))||1;
 const cmp=letter(a).localeCompare(letter(b),'pt-BR')||(sub(a)-sub(b));
 return cmp<=0?`${a}${b}`:`${b}${a}`;
}
function sideName(o,side){
 const i=side.radius?0:Number(side.key);
 const a=o.vertexNames?.[i]||'?',b=o.vertexNames?.[side.radius?1:(i+1)%o.vertexNames.length]||'?';
 return alphabeticalPair(a,b);
}
function reviewMeasure(value){return value===undefined?'-':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:8});}
function reviewVerdict(status){return status==='correct'?'(correto)':status==='wrong'?'(incorreto)':status==='missing'?'(medir)':'(a conferir)';}
function vertexLabel(g,name,x,y){
 const t=el('text',{x,y,class:'vertex-name','text-anchor':'middle','dominant-baseline':'middle','pointer-events':'none'},g);
 const m=/^([A-Z])([₀-₉]+)?$/.exec(name);
 if(!m){t.textContent=name;return;}
 el('tspan',{},t).textContent=m[1];
 if(m[2])el('tspan',{'font-size':'10','baseline-shift':'sub'},t).textContent=m[2];
}

function snapshot(){return JSON.stringify({version:1,items,nextId,nextVertexIndex,rulerVisible,mode,corrected,reviews,exercise,selectedId:selected?.id??null,feedback:feedback.textContent,snap:document.getElementById('snap').checked});}
function updateHistoryButtons(){document.getElementById('undo').disabled=!past.length;document.getElementById('redo').disabled=!future.length;}
function record(before){const after=snapshot();if(before===after)return;past.push(before);if(past.length>HISTORY_LIMIT)past.shift();future.length=0;updateHistoryButtons();renderExercisePanel();renderReviewPanel();}
function restore(raw){const state=typeof raw==='string'?JSON.parse(raw):raw;items=structuredClone(state.items);ensureVertexNames(state);nextId=state.nextId;nextVertexIndex=state.nextVertexIndex;rulerVisible=state.rulerVisible;mode=state.mode;corrected=state.corrected;reviews=state.reviews&&typeof state.reviews==='object'?structuredClone(state.reviews):{};exercise=state.exercise&&Number.isSafeInteger(state.exercise.figureId)?structuredClone(state.exercise):null;if(state.corrected&&!state.reviews){for(const shape of items){if(shape.type==='ruler')continue;for(const side of sides(shape)){const val=shape.answers?.[side.key];if(val!==undefined)reviews[reviewKey(shape,side.key)]=grade(shape,side,val)?'correct':'wrong';}}}selected=items.find(o=>o.id===state.selectedId)||null;editing=null;gesture=null;activeEdge=null;input.hidden=true;document.getElementById('exercisePanel').hidden=true;feedback.textContent=state.feedback||'';document.getElementById('snap').checked=!!state.snap;
 document.getElementById('rulerBtn').textContent=`📐 Régua: ${rulerVisible?'visível':'oculta'}`;
 for(const [name,value] of [['measureMode','measure'],['annotateMode','annotate']]){const b=document.getElementById(name);b.classList.toggle('active',mode===value);b.setAttribute('aria-pressed',String(mode===value));}
 document.getElementById('hint').textContent=mode==='measure'?'Modo Medir: medidas visíveis. Arraste figuras, régua ou etiquetas para organizar o quadro.':'Modo Anotar: lados ficam laranja ao apontar; clique para editar. Arraste etiquetas para reposicioná-las.';draw();renderExercisePanel();renderReviewPanel();}
function undo(){closeEditor(true);if(!past.length)return;future.push(snapshot());restore(past.pop());updateHistoryButtons();}
function redo(){closeEditor(true);if(!future.length)return;past.push(snapshot());restore(future.pop());updateHistoryButtons();}

function el(tag,attrs={},parent){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(parent)parent.appendChild(n);return n;}
function coords(e){const p=stage.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const m=stage.getScreenCTM();return m?p.matrixTransform(m.inverse()):{x:0,y:0};}
function rotate(p,a){const r=a*Math.PI/180;return{x:p.x*Math.cos(r)-p.y*Math.sin(r),y:p.x*Math.sin(r)+p.y*Math.cos(r)};}
function world(o,p){const q=rotate(p,o.angle);return{x:o.x+q.x,y:o.y+q.y};}
function polygon(points,g){return el('polygon',{points:points.map(p=>p.join(',')).join(' '),class:'shape-body'},g);}
function make(type){closeEditor(true);const before=snapshot();exercise=null;const n=items.filter(o=>o.type!=='ruler').length;const o={id:nextId++,type,x:190+(n%4)*110,y:180+Math.floor(n/4)*90,angle:0,answers:{},labelOffsets:{},vertexNames:Array.from({length:vertexCount(type)},(_,i)=>vertexName(nextVertexIndex+i))};nextVertexIndex+=o.vertexNames.length;o.initial={x:o.x,y:o.y,angle:0};items.push(o);selected=o;draw();record(before);renderReviewPanel();return o;}
function shapeVertices(o){return vertices[o.type]?.map(p=>p.map(v=>v*(o.scale||1)));}
function sides(o){const factor=o.scale||1;if(o.type==='circle')return [{a:{x:0,y:0},b:{x:80*factor,y:0},key:'radius',radius:true}];const v=shapeVertices(o);return v.map((p,i)=>({a:{x:p[0],y:p[1]},b:{x:v[(i+1)%v.length][0],y:v[(i+1)%v.length][1]},key:String(i)}));}
function outwardPosition(o,side,offset=23){
 const dx=side.b.x-side.a.x,dy=side.b.y-side.a.y,len=Math.hypot(dx,dy)||1;
 const mid={x:(side.a.x+side.b.x)/2,y:(side.a.y+side.b.y)/2};
 // Polígonos com orientação horária em coordenadas SVG têm área assinada positiva.
 // A normal externa, nesse caso, é (dy,-dx); para sentido anti-horário, invertemos.
 if(side.radius)return {x:mid.x,y:mid.y-offset};
 const v=shapeVertices(o);let area2=0;
 for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];area2+=a[0]*b[1]-b[0]*a[1];}
 const sign=area2>=0?1:-1;
 return {x:mid.x+sign*dy/len*offset,y:mid.y-sign*dx/len*offset};
}
function draw(){layer.replaceChildren();rulerLayer.replaceChildren();for(const o of items){if(o.type==='ruler'&&!rulerVisible)continue;const g=el('g',{transform:`translate(${o.x} ${o.y}) rotate(${o.angle})`,'data-id':o.id,class:o===selected?'selected':''},o.type==='ruler'?rulerLayer:layer);if(o.type==='ruler')drawRuler(g);else drawShape(o,g);if(o===selected)drawHandle(o,g);}}
function drawShape(o,g){if(o.type==='circle'){el('circle',{cx:0,cy:0,r:80*(o.scale||1),class:'shape-body'},g);el('line',{x1:0,y1:0,x2:80*(o.scale||1),y2:0,stroke:'#1664a5','stroke-width':2,'stroke-dasharray':'5 3','pointer-events':'none'},g);el('circle',{r:3,fill:'#1559a2','pointer-events':'none'},g);el('text',{x:36*(o.scale||1),y:-9,'font-size':13,fill:'#124b7d','pointer-events':'none'},g).textContent='r';}else polygon(shapeVertices(o),g);
 drawVertexNames(o,g);
 for(const side of sides(o)){
  // Somente o modo Anotar permite selecionar segmentos para digitação.
  if(mode==='annotate')el('line',{x1:side.a.x,y1:side.a.y,x2:side.b.x,y2:side.b.y,class:'edge-target'+(activeEdge?.id===o.id&&activeEdge.key===side.key?' edge-active':''),'data-side':side.key},g);
  const ans=o.answers[side.key];if(ans===undefined)continue;
  const dx=side.b.x-side.a.x,dy=side.b.y-side.a.y,len=Math.hypot(dx,dy);
  const base=outwardPosition(o,side,25), shift=o.labelOffsets?.[side.key]||{x:0,y:0};
  const pos={x:base.x+shift.x,y:base.y+shift.y};
  let angle=Math.atan2(dy,dx)*180/Math.PI+o.angle;
  if(((angle%360)+360)%360>90&&((angle%360)+360)%360<270)angle+=180;
  const label=el('g',{transform:`translate(${pos.x} ${pos.y}) rotate(${angle-o.angle})`,class:'annotation','data-label':side.key},g);
  // A etiqueta neutra muda para verde/vermelho somente após a correção.
  // Fica no sistema de coordenadas da figura e acompanha movimento e rotação.
  const content=`${String(ans).replace('.',',')} cm`;
  const width=Math.max(52,content.length*9+20);
  el('rect',{x:-width/2,y:-13,width,height:26,rx:8,ry:8,class:'annotation-bg'},label);
  const txt=el('text',{class:'annotation-value'},label);
  txt.textContent=content;
  // Após corrigir, a classe define a COR DE FUNDO conforme o resultado.
  const verdict=reviews[reviewKey(o,side.key)];if(verdict==='correct')label.classList.add('annotation-correct');else if(verdict==='wrong')label.classList.add('annotation-wrong');
 }
}
function drawVertexNames(o,g){
 if(o.type==='circle'){
  vertexLabel(g,o.vertexNames[0],-12,13);
  vertexLabel(g,o.vertexNames[1],80*(o.scale||1)+12,12);
  return;
 }
 const v=shapeVertices(o),area=v.reduce((sum,p,i)=>{const q=v[(i+1)%v.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
 for(let i=0;i<v.length;i++){
  const curr=v[i],prev=v[(i-1+v.length)%v.length],next=v[(i+1)%v.length];
  const n1={x:curr[1]-prev[1],y:-(curr[0]-prev[0])},n2={x:next[1]-curr[1],y:-(next[0]-curr[0])};
  const sign=area>=0?1:-1,unit=t=>{const len=Math.hypot(t.x,t.y)||1;return{x:sign*t.x/len,y:sign*t.y/len};};
  const a=unit(n1),b=unit(n2),normal={x:a.x+b.x,y:a.y+b.y},l=Math.hypot(normal.x,normal.y)||1;
  vertexLabel(g,o.vertexNames[i],curr[0]+normal.x/l*17,curr[1]+normal.y/l*17);
 }
}
function drawRuler(g){const length=12*CM;el('rect',{x:-12,y:0,width:length+24,height:63,rx:3,class:'ruler-body'},g);for(let mm=0;mm<=120;mm++){const x=mm*CM/10,major=mm%10===0,mid=mm%5===0;el('line',{x1:x,y1:0,x2:x,y2:major?24:mid?16:9,class:'tick'},g);if(major)el('text',{x,y:39,class:'tick-label'},g).textContent=String(mm/10);}el('text',{x:length/2,y:54,'font-size':10,fill:'#745126','text-anchor':'middle','pointer-events':'none'},g).textContent='cm • 1 cm = 40 unidades';el('circle',{cx:0,cy:0,r:3,class:'zero-dot'},g);}
function drawHandle(o,g){const hy=o.type==='ruler'?-55:-125;el('line',{x1:0,y1:o.type==='ruler'?0:-92,x2:0,y2:hy,class:'handle-stem'},g);el('circle',{cx:0,cy:hy,r:12,class:'handle','data-handle':'rotate'},g);el('circle',{cx:0,cy:hy,r:3,class:'handle-dot'},g);}
function begin(e){if(editing){closeEditor(true);}const node=e.target.closest('[data-id]');if(!node){selected=null;activeEdge=null;draw();return;}const o=items.find(i=>i.id===Number(node.getAttribute('data-id')));if(!o)return;
 const labelNode=e.target.closest('[data-label]');if(labelNode&&o.type!=='ruler'){const key=labelNode.getAttribute('data-label'),p=coords(e);selected=o;gesture={id:e.pointerId,o,mode:'label',key,start:p,last:p,moved:false,initial:{...(o.labelOffsets?.[key]||{x:0,y:0})},before:snapshot()};stage.setPointerCapture(e.pointerId);return;}
 const sideNode=e.target.closest('[data-side]');if(mode==='annotate'&&o.type!=='ruler'&&sideNode){selected=o;activeEdge={id:o.id,key:sideNode.getAttribute('data-side')};draw();openEditor(o,sideNode.getAttribute('data-side'));e.preventDefault();return;}
 selected=o;const p=coords(e),turning=e.target.getAttribute('data-handle')==='rotate';gesture={id:e.pointerId,o,mode:turning?'rotate':'move',offset:{x:p.x-o.x,y:p.y-o.y},startPointer:p,originAngle:o.angle,startAngle:Math.atan2(p.y-o.y,p.x-o.x)*180/Math.PI,before:snapshot()};stage.setPointerCapture(e.pointerId);draw();}
function move(e){if(!gesture||gesture.id!==e.pointerId)return;const p=coords(e),{o}=gesture;if(gesture.mode==='label'){const start=gesture.start,delta={x:p.x-start.x,y:p.y-start.y},local=rotate(delta,-o.angle);if(Math.hypot(delta.x,delta.y)>4)gesture.moved=true;o.labelOffsets[gesture.key]={x:gesture.initial.x+local.x,y:gesture.initial.y+local.y};}else if(gesture.mode==='move'){o.x=p.x-gesture.offset.x;o.y=p.y-gesture.offset.y;}else{o.angle=gesture.originAngle+(Math.atan2(p.y-o.y,p.x-o.x)*180/Math.PI-gesture.startAngle);}draw();}
function angleDifference(a,b){return((a-b+540)%360)-180;}
function distanceToSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
// Snap fino: ZERO <= 8 SVG (2 mm), direção <= 3°, ponta <= 8 SVG.
function applySnap(o){if(o.type!=='ruler'||!document.getElementById('snap').checked)return;let best=null;for(const shape of items){if(shape.type==='ruler')continue;for(const s of sides(shape)){const a=world(shape,s.a),b=world(shape,s.b),dx=b.x-a.x,dy=b.y-a.y;const candidates=s.radius?[[a,b]]:[[a,b],[b,a]];for(const [start,end] of candidates){const theta=Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI,dist=Math.hypot(o.x-start.x,o.y-start.y),err=Math.abs(angleDifference(o.angle,theta)),probe=world(o,{x:Math.min(CM*2,Math.hypot(dx,dy)),y:0}),lineErr=distanceToSegment(probe,start,end);if(dist>8||err>3||lineErr>8)continue;const score=dist/8+err/3+lineErr/8;if(!best||score<best.score)best={score,x:start.x,y:start.y,angle:theta};}}}if(best)Object.assign(o,{x:best.x,y:best.y,angle:best.angle});}
// Nos exercícios, SOMENTE uma régua efetivamente movimentada e quase alinhada
// a um segmento faz surgir a anotação. Não ajusta a régua nem revela a medida.
function measuredExerciseSide(r){
 if(!exercise||r.type!=='ruler')return null;
 const shape=items.find(o=>o.id===exercise.figureId);
 if(!shape)return null;
 let found=null;
 for(const side of sides(shape)){
  const a=world(shape,side.a),b=world(shape,side.b);
  const candidates=side.radius?[[a,b]]:[[a,b],[b,a]];
  for(const [start,finish] of candidates){
   const len=Math.hypot(finish.x-start.x,finish.y-start.y);
   const direction=Math.atan2(finish.y-start.y,finish.x-start.x)*180/Math.PI;
   const zeroError=Math.hypot(r.x-start.x,r.y-start.y);
   const angleError=Math.abs(angleDifference(r.angle,direction));
   const probe=world(r,{x:Math.min(2*CM,len),y:0});
   const sideError=distanceToSegment(probe,start,finish);
   if(zeroError>10||angleError>5||sideError>10)continue;
   const score=zeroError+angleError+sideError;
   if(!found||score<found.score)found={shape,key:side.key,score};
  }
 }
 return found;
}
function end(e){
 if(!gesture||gesture.id!==e.pointerId)return;
 const g=gesture;gesture=null;
 if(g.mode==='label'){
  if(!g.moved&&mode==='annotate'){activeEdge={id:g.o.id,key:g.key};openEditor(g.o,g.key);}
 }else{
  // A aplicação do snapping fino é independente da abertura da anotação.
  applySnap(g.o);
  const moved=g.startPointer&&Math.hypot(coords(e).x-g.startPointer.x,coords(e).y-g.startPointer.y)>3;
  const angleMoved=Math.abs(angleDifference(g.o.angle,g.originAngle))>0.8;
  const candidate=(exercise&&g.o.type==='ruler'&&(moved||angleMoved))?measuredExerciseSide(g.o):null;
  draw();record(g.before);
  if(candidate){
   // Preserva a régua; apenas ativa Anotar e abre o editor com foco.
   setMode('annotate');selected=candidate.shape;
   activeEdge={id:candidate.shape.id,key:candidate.key};draw();
   openEditor(candidate.shape,candidate.key);
  }
  return;
 }
 draw();record(g.before);
}
function openEditor(o,key){const side=sides(o).find(s=>s.key===key);if(!side)return;editing={o,key};const base=outwardPosition(o,side,25),shift=o.labelOffsets?.[key]||{x:0,y:0};const p=world(o,{x:base.x+shift.x,y:base.y+shift.y}),screen=stage.createSVGPoint();screen.x=p.x;screen.y=p.y;const c=screen.matrixTransform(stage.getScreenCTM()),rect=document.getElementById('board').getBoundingClientRect();input.style.left=`${Math.max(6,Math.min(rect.width-100,c.x-rect.left-46))}px`;input.style.top=`${Math.max(6,Math.min(rect.height-48,c.y-rect.top-46))}px`;input.value=o.answers[key]??'';input.hidden=false;input.focus({preventScroll:true});input.select();requestAnimationFrame(()=>{if(editing?.o===o&&editing?.key===key&&!input.hidden){input.focus({preventScroll:true});input.select();}});}
function closeEditor(save){
 if(!editing)return;
 const {o,key}=editing;
 if(save){
  const raw=input.value.trim().replace(',','.');
  if(raw!==''&&(!Number.isFinite(Number(raw))||Number(raw)<=0)){feedback.textContent='Digite uma medida positiva, como 3 ou 3,5.';input.focus();return;}
  const previous=o.answers[key];const next=raw===''?undefined:Number(raw);
  if(previous!==next){
   const before=snapshot();
   if(next===undefined)delete o.answers[key];else o.answers[key]=next;
   // A nova resposta aguarda conferência; outros resultados não são apagados.
   delete reviews[reviewKey(o,key)];corrected=false;
   editing=null;input.hidden=true;draw();record(before);renderReviewPanel();return;
  }
 }
 editing=null;input.hidden=true;draw();
}
function setMode(next){closeEditor(true);if(editing)return;mode=next;activeEdge=null;document.getElementById('measureMode').classList.toggle('active',mode==='measure');document.getElementById('annotateMode').classList.toggle('active',mode==='annotate');document.getElementById('measureMode').setAttribute('aria-pressed',String(mode==='measure'));document.getElementById('annotateMode').setAttribute('aria-pressed',String(mode==='annotate'));document.getElementById('hint').textContent=mode==='measure'?'Modo Medir: medidas visíveis. Arraste figuras, régua ou etiquetas para organizar o quadro.':'Modo Anotar: lados ficam laranja ao apontar; clique para editar. Arraste etiquetas para reposicioná-las.';feedback.textContent='';draw();}
function reviewKey(o,key){return `${o.id}:${key}`;}
function grade(o,side,value){return Math.abs(Number(value)-Math.hypot(side.b.x-side.a.x,side.b.y-side.a.y)/CM)<=0.05+1e-9;}
function checkAnswers(){
 closeEditor(true);if(editing)return;
 const before=snapshot();setMode('annotate');corrected=true;
 let total=0,ok=0,missing=0;
 for(const o of items){if(o.type==='ruler')continue;for(const side of sides(o)){
  const val=o.answers[side.key],key=reviewKey(o,side.key);
  if(val===undefined){delete reviews[key];missing++;continue;}
  total++;const good=grade(o,side,val);reviews[key]=good?'correct':'wrong';if(good)ok++;
 }}
 feedback.textContent=total?`${ok} de ${total} respostas corretas; ${missing} lado(s) ainda não medido(s). Tolerância: ±0,05 cm.`:'Nenhuma medida registrada. Ative Anotar e clique em um lado.';
 if(exercise){const target=items.find(o=>o.id===exercise.figureId);if(target){const allMeasured=sides(target).every(side=>target.answers[side.key]!==undefined);const perimeter=parseMeasure(exercise.perimeterAnswer);// O aluno mede com precisão limitada e soma os valores escritos.
 // Comparar apenas ao perímetro geométrico pode rejeitar uma soma correta
 // quando cada lado foi arredondado (ex.: 4,5 + 4,5 + 4,5 = 13,5).
 const ss=sides(target);
 const allCorrect=ss.every(side=>reviews[reviewKey(target,side.key)]==='correct');
 const measuredSum=ss.reduce((sum,side)=>sum+Number(target.answers[side.key]||0),0);
 exercise.perimeterStatus=allMeasured&&perimeter!==null?
  (allCorrect&&Math.abs(perimeter-measuredSum)<=0.05+1e-9?'correct':'wrong'):null;}}
 draw();record(before);showReview(true);renderExercisePanel();renderReviewPanel();
}
const reviewPanel=document.getElementById('reviewPanel'),reviewSummary=document.getElementById('reviewSummary'),reviewEntries=document.getElementById('reviewEntries'),reviewBtn=document.getElementById('checkAnswers');
function showReview(open){reviewPanel.hidden=!open;reviewBtn.setAttribute('aria-expanded',String(open));if(open)renderReviewPanel();}
function renderReviewPanel(){
 if(reviewPanel.hidden)return;
 reviewSummary.replaceChildren();reviewEntries.replaceChildren();
 let right=0,wrong=0,pending=0,shapeCount=0;
 for(const o of items){if(o.type==='ruler')continue;shapeCount++;
  const title=document.createElement('div');title.className='review-figure';title.textContent=`${shapeTypes.find(([type])=>type===o.type)?.[1]||'Figura'} · ${o.id}`;reviewEntries.appendChild(title);
  for(const side of sides(o)){
   const key=reviewKey(o,side.key),answer=o.answers[side.key],status=answer===undefined?'missing':(reviews[key]||'pending');
   if(status==='correct')right++;else if(status==='wrong')wrong++;else pending++;
   const row=document.createElement('div');row.className='review-row';
   const desc=document.createElement('span');desc.className='review-desc';
   const prefix=side.radius?'Raio':'Lado';
   const measure=reviewMeasure(answer);
   desc.textContent=`${prefix} ${sideName(o,side)} mede ${measure} cm`;
   const flag=document.createElement('span');flag.className='review-status '+(status==='correct'?'good':status==='wrong'?'bad':'pending');flag.textContent=reviewVerdict(status);
   const button=document.createElement('button');button.type='button';button.textContent=answer===undefined?'Medir':'Editar';button.setAttribute('aria-label',`${button.textContent} ${prefix.toLowerCase()} ${sideName(o,side)} da figura ${o.id}`);
   button.addEventListener('click',()=>{showReview(false);setMode('annotate');selected=o;activeEdge={id:o.id,key:side.key};draw();openEditor(o,side.key);});
   row.append(desc,flag,button);reviewEntries.appendChild(row);
  }
 }
 const totals=[['Corretas',right,'good'],['Incorretas',wrong,'bad'],['Pendentes',pending,'']];
 const bar=document.createElement('div');bar.className='review-counts';for(const [name,count,css] of totals){const chip=document.createElement('span');chip.className='review-chip '+css;chip.textContent=`${name}: ${count}`;bar.appendChild(chip);}reviewSummary.appendChild(bar);
 if(!shapeCount){const p=document.createElement('p');p.textContent='Insira uma figura para começar.';reviewEntries.appendChild(p);}
}
// Uma bateria apresenta uma figura por vez e exige comprimentos e perímetro.
const exercisePanel=document.getElementById('exercisePanel'),perimeterInput=document.getElementById('perimeterInput');
const EXERCISE_TYPES=['triangle','rectangle','trapezoid','square','parallelogram','rhombus','irregular'];
function expectedPerimeter(o){return sides(o).reduce((sum,side)=>sum+Math.hypot(side.b.x-side.a.x,side.b.y-side.a.y)/CM,0);}
function parseMeasure(text){const raw=String(text).trim().replace(',','.');return raw!==''&&Number.isFinite(Number(raw))&&Number(raw)>0?Number(raw):null;}
function renderExercisePanel(){
 const session=document.getElementById('exerciseSession'),setup=document.getElementById('exerciseSetup');
 // Corrigir pertence ao painel enquanto uma bateria estiver ativa.
 document.getElementById('checkAnswers').hidden=!!exercise;
 setup.hidden=!!exercise;session.hidden=!exercise;if(!exercise)return;
 const o=items.find(x=>x.id===exercise.figureId);if(!o){exercise=null;setup.hidden=false;session.hidden=true;return;}
 const ss=sides(o),done=ss.filter(side=>o.answers[side.key]!==undefined).length,allDone=done===ss.length;
 document.getElementById('exerciseTitle').textContent=`Exercício ${exercise.index+1} de ${exercise.total} — ${shapeTypes.find(p=>p[0]===o.type)[1]}`;
 document.getElementById('exerciseInstructions').textContent='Alinhe a régua ao lado: a caixa de anotação abre automaticamente. Registre as medidas e some-as para calcular o perímetro.';
 document.getElementById('exerciseCounter').textContent=`Lados registrados: ${done}/${ss.length} · Acertos nas medidas: ${ss.filter(side=>reviews[reviewKey(o,side.key)]==='correct').length}`;
 perimeterInput.disabled=!allDone;perimeterInput.value=exercise.perimeterAnswer??'';
 document.getElementById('perimeterHint').textContent=allDone?'Digite o perímetro; depois você poderá corrigir as medidas ou avançar.':'Registre todos os lados para liberar a resposta do perímetro.';
 const verdict=document.getElementById('exercisePerimeterResult');verdict.className=exercise.perimeterStatus==='correct'?'exercise-result-good':exercise.perimeterStatus==='wrong'?'exercise-result-bad':'';
 verdict.textContent=exercise.perimeterStatus==='correct'?'Perímetro correto!':exercise.perimeterStatus==='wrong'?'Perímetro incorreto. Confira as medidas e a soma dos valores anotados.':'';
 // Não obrigamos a acertar para avançar: correção é uma etapa formativa opcional.
 // Somente liberamos o avanço após todos os lados registrados e perímetro válido.
 const ready=allDone&&parseMeasure(exercise.perimeterAnswer)!==null;
 document.getElementById('checkExerciseAnswers').hidden=!ready;
 document.getElementById('nextExercise').hidden=!ready;
 document.getElementById('nextExercise').textContent=exercise.index===exercise.total-1?'Concluir bateria ✓':'Próximo exercício →';
}
function createExerciseFigure(type,scale){
 const n=vertexCount(type),o={id:nextId++,type,x:520,y:260,angle:0,scale,answers:{},labelOffsets:{},vertexNames:Array.from({length:n},(_,i)=>vertexName(nextVertexIndex+i))};
 nextVertexIndex+=n;o.initial={x:o.x,y:o.y,angle:0};items.push(o);selected=o;return o;
}
function newExercise(index){
 const type=EXERCISE_TYPES[index%EXERCISE_TYPES.length];
 // Escala controlada: 0,75 a 1,25 para medidas diferentes sem alterar 40 SVG/cm.
 const scale=[0.75,0.875,1,1.125,1.25][Math.floor(Math.random()*5)];
 const r=items.find(o=>o.type==='ruler');items=[r];Object.assign(r,{x:140,y:450,angle:0});
 nextVertexIndex=0;reviews={};corrected=false;
 const o=createExerciseFigure(type,scale);exercise.index=index;exercise.figureId=o.id;exercise.perimeterAnswer='';exercise.perimeterStatus=null;
 mode='measure';rulerVisible=true;document.getElementById('rulerBtn').textContent='📐 Régua: visível';
 document.getElementById('measureMode').classList.add('active');document.getElementById('annotateMode').classList.remove('active');
 document.getElementById('measureMode').setAttribute('aria-pressed','true');document.getElementById('annotateMode').setAttribute('aria-pressed','false');
 feedback.textContent='Alinhe o zero e a graduação da régua com um lado para anotar; depois some os comprimentos.';draw();renderExercisePanel();
}
document.getElementById('exerciseBtn').addEventListener('click',()=>{exercisePanel.hidden=!exercisePanel.hidden;document.getElementById('exerciseBtn').setAttribute('aria-expanded',String(!exercisePanel.hidden));showReview(false);renderExercisePanel();});
document.getElementById('closeExercise').addEventListener('click',()=>{exercisePanel.hidden=true;document.getElementById('exerciseBtn').setAttribute('aria-expanded','false');});
document.getElementById('startExercises').addEventListener('click',()=>{const before=snapshot();exercise={index:0,total:Number(document.getElementById('exerciseQuantity').value),figureId:null,perimeterAnswer:'',perimeterStatus:null};newExercise(0);record(before);});
document.getElementById('stopExercises').addEventListener('click',()=>{const before=snapshot();exercise=null;renderExercisePanel();record(before);});
perimeterInput.addEventListener('input',()=>{if(!exercise)return;exercise.perimeterAnswer=perimeterInput.value;exercise.perimeterStatus=null;document.getElementById('exercisePerimeterResult').textContent='';
 // Atualizar apenas botões: re-renderizar o painel aqui apagaria o foco do campo.
 const shape=items.find(o=>o.id===exercise.figureId);
 const complete=!!shape&&sides(shape).every(side=>shape.answers[side.key]!==undefined);
 const ready=complete&&parseMeasure(exercise.perimeterAnswer)!==null;
 document.getElementById('checkExerciseAnswers').hidden=!ready;
 document.getElementById('nextExercise').hidden=!ready;
});
perimeterInput.addEventListener('change',()=>{if(exercise){const before=snapshot();exercise.perimeterAnswer=perimeterInput.value;record(before);}});
document.getElementById('checkExerciseAnswers').addEventListener('click',()=>{if(!exercise)return;checkAnswers();});
document.getElementById('nextExercise').addEventListener('click',()=>{if(!exercise)return;const shape=items.find(o=>o.id===exercise.figureId);if(!shape||!sides(shape).every(side=>shape.answers[side.key]!==undefined)||parseMeasure(exercise.perimeterAnswer)===null)return;showReview(false);const before=snapshot();if(exercise.index+1>=exercise.total){feedback.textContent='Parabéns! Bateria concluída.';exercise=null;renderExercisePanel();}else newExercise(exercise.index+1);record(before);});
document.getElementById('closeReview').addEventListener('click',()=>showReview(false));
stage.addEventListener('pointerover',e=>{if(mode!=='annotate'||gesture)return;const t=e.target.closest('.edge-target');if(t){t.classList.add('edge-hover');}});stage.addEventListener('pointerout',e=>{if(e.target.classList?.contains('edge-target'))e.target.classList.remove('edge-hover');});
stage.addEventListener('pointerdown',begin);stage.addEventListener('pointermove',move);stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
input.addEventListener('keydown',e=>{if(e.key==='Enter'){closeEditor(true);e.preventDefault();}if(e.key==='Escape'){closeEditor(false);e.preventDefault();}});
const menu=document.getElementById('shapes'),menuBtn=document.getElementById('shapesBtn');for(const [id,name] of shapeTypes){const b=document.createElement('button');b.textContent=name;b.addEventListener('click',()=>{make(id);menu.hidden=true;menuBtn.setAttribute('aria-expanded','false');});menu.appendChild(b);}menuBtn.addEventListener('click',()=>{menu.hidden=!menu.hidden;menuBtn.setAttribute('aria-expanded',String(!menu.hidden));});document.addEventListener('pointerdown',e=>{if(!e.target.closest('.dropdown')){menu.hidden=true;menuBtn.setAttribute('aria-expanded','false');}});
const ruler={id:nextId++,type:'ruler',x:140,y:420,angle:0,initial:{x:140,y:420,angle:0}};items.push(ruler);
document.getElementById('measureMode').addEventListener('click',()=>setMode('measure'));document.getElementById('annotateMode').addEventListener('click',()=>setMode('annotate'));document.getElementById('checkAnswers').addEventListener('click',checkAnswers);
document.getElementById('rulerBtn').addEventListener('click',e=>{const before=snapshot();rulerVisible=!rulerVisible;e.currentTarget.textContent=`📐 Régua: ${rulerVisible?'visível':'oculta'}`;if(!rulerVisible&&selected?.type==='ruler')selected=null;draw();record(before);});
document.getElementById('reset').addEventListener('click',()=>{closeEditor(false);if(!selected)return;const before=snapshot();Object.assign(selected,selected.initial);draw();record(before);});document.getElementById('clear').addEventListener('click',()=>{closeEditor(false);const before=snapshot();items=[items.find(o=>o.type==='ruler')];nextVertexIndex=0;Object.assign(items[0],items[0].initial);selected=null;corrected=false;feedback.textContent='';reviews={};exercise=null;draw();record(before);renderReviewPanel();});
document.addEventListener('keydown',e=>{if((e.key==='Delete'||e.key==='Backspace')&&selected&&selected!==ruler&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){const before=snapshot();items=items.filter(o=>o!==selected);if(exercise?.figureId===selected.id)exercise=null;selected=null;draw();record(before);renderReviewPanel();}});
make('square');selected=ruler;draw();past.length=0;future.length=0;updateHistoryButtons();
// Formato .geolab: JSON UTF-8 com assinatura própria; extensão exclusiva do laboratório.
// showSaveFilePicker permite escolher pasta e nome quando disponível em contexto seguro.
// Caso contrário, o navegador controla o destino do download.
const FILE_EXTENSION='.geolab';
let currentFileHandle=null;
function activityDocument(){return JSON.stringify({format:'laboratorio-geometria',...JSON.parse(snapshot())},null,2);}
function downloadActivity(contents){
 const blob=new Blob([contents],{type:'application/octet-stream'});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download='atividade-geometria'+FILE_EXTENSION;
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function saveActivity(){
 closeEditor(true);if(editing)return;
 const contents=activityDocument();
 try{
  if(typeof window.showSaveFilePicker==='function'){
   const handle=await window.showSaveFilePicker({suggestedName:currentFileHandle?.name||'atividade-geometria.geolab',types:[{description:'Atividade do Laboratório de Geometria',accept:{'application/octet-stream':['.geolab']}}]});
   const stream=await handle.createWritable();await stream.write(contents);await stream.close();
   currentFileHandle=handle;feedback.textContent='Atividade salva em '+handle.name+'.';
  }else{
   downloadActivity(contents);feedback.textContent='Arquivo .geolab preparado para download. O local depende das configurações do navegador.';
  }
 }catch(err){if(err.name!=='AbortError')feedback.textContent='Não foi possível salvar: '+err.message;}
}
document.getElementById('undo').addEventListener('click',undo);
document.getElementById('redo').addEventListener('click',redo);
document.getElementById('saveActivity').addEventListener('click',saveActivity);
const fileInput=document.getElementById('activityFile');
document.getElementById('loadActivity').addEventListener('click',()=>fileInput.click());
fileInput.addEventListener('change',async()=>{
 const file=fileInput.files?.[0];fileInput.value='';if(!file)return;
 try{
  if(file.size>2_000_000)throw Error('Arquivo muito grande.');
  if(!/\.(geolab|json)$/i.test(file.name))throw Error('Selecione uma atividade .geolab.');
  const state=JSON.parse(await file.text());
  if(state.format!=='laboratorio-geometria'||state.version!==1||!Array.isArray(state.items)||state.items.length>300||!state.items.some(o=>o.type==='ruler')||!Number.isSafeInteger(state.nextId)||state.nextId<1||!['measure','annotate'].includes(state.mode)||typeof state.rulerVisible!=='boolean'||typeof state.corrected!=='boolean')throw Error('Arquivo incompatível.');
  const ids=new Set();
  for(const o of state.items){
   if(!o||(!shapeTypes.some(([type])=>type===o.type)&&o.type!=='ruler')||!Number.isSafeInteger(o.id)||ids.has(o.id)||!['x','y','angle'].every(k=>Number.isFinite(o[k]))||Math.max(Math.abs(o.x),Math.abs(o.y),Math.abs(o.angle))>1e7)throw Error('Dados geométricos inválidos.');
   ids.add(o.id);
   if(o.scale!==undefined&&(!Number.isFinite(o.scale)||o.scale<0.3||o.scale>2))throw Error('Escala geométrica inválida.');
   if(o.type!=='ruler'){
    if(o.vertexNames!==undefined&&(!Array.isArray(o.vertexNames)||o.vertexNames.length!==vertexCount(o.type)||o.vertexNames.some(n=>typeof n!=='string'||!/^([A-Z])([₀-₉]+)?$/.test(n))))throw Error('Nomes dos vértices inválidos.');
    if(!o.answers||typeof o.answers!=='object'||!o.labelOffsets||typeof o.labelOffsets!=='object')throw Error('Medidas inválidas.');
    const validKeys=new Set(sides(o).map(s=>s.key));
    for(const [k,v] of Object.entries(o.answers))if(!validKeys.has(k)||typeof v!=='number'||!Number.isFinite(v)||v<=0)throw Error('Resposta inválida.');
    for(const [k,v] of Object.entries(o.labelOffsets))if(!validKeys.has(k)||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))throw Error('Etiqueta inválida.');
   }
  }
  if(state.nextVertexIndex!==undefined&&(!Number.isSafeInteger(state.nextVertexIndex)||state.nextVertexIndex<0||state.nextVertexIndex>100000))throw Error('Sequência de vértices inválida.');
  if(state.exercise!==undefined&&state.exercise!==null){if(!state.exercise||!Number.isSafeInteger(state.exercise.figureId)||!state.items.some(o=>o.id===state.exercise.figureId&&o.type!=='ruler')||!Number.isInteger(state.exercise.total)||state.exercise.total<1||state.exercise.total>20||!Number.isInteger(state.exercise.index)||state.exercise.index<0||state.exercise.index>=state.exercise.total||typeof state.exercise.perimeterAnswer!=='string'||state.exercise.perimeterAnswer.length>32||![null,'correct','wrong'].includes(state.exercise.perimeterStatus))throw Error('Exercício inválido.');}
  if(state.reviews!==undefined){if(!state.reviews||typeof state.reviews!=='object'||Array.isArray(state.reviews)||Object.keys(state.reviews).length>2400)throw Error('Resultados inválidos.');for(const [key,val] of Object.entries(state.reviews)){if(!/^[0-9]+:(radius|[0-9]+)$/.test(key)||!['correct','wrong'].includes(val))throw Error('Resultado inválido.');}}
  if(state.items.filter(o=>o.type==='ruler').length!==1||state.nextId<=Math.max(...ids))throw Error('Identificadores inválidos.');
  ensureVertexNames(state);
  closeEditor(false);const before=snapshot();restore(state);record(before);
  currentFileHandle=null;
  feedback.textContent='Atividade aberta: '+file.name+'. Continue de onde parou.';renderReviewPanel();
 }catch(err){feedback.textContent='Não foi possível abrir: '+err.message;}
});
document.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey||['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;const key=e.key.toLowerCase();if(key==='z'){e.preventDefault();e.shiftKey?redo():undo();}else if(key==='y'){e.preventDefault();redo();}});
})();
