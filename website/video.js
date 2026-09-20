const scenes=[...document.querySelectorAll('.scene')];
const cuts=[{scene:0},{scene:1},{scene:2},{scene:3,section:'10'},{scene:3,section:'12'},{scene:3,section:'20'},{scene:3,section:'9'},{scene:4}];
let current=0,jumpTimer=null;
function jump(section){clearTimeout(jumpTimer);if(window.jumpDocument)window.jumpDocument(section);else jumpTimer=setTimeout(()=>jump(section),200);document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('selected',b.dataset.section===section));const copy={'10':['写下的，<br>都好看。','从标题到表格，<br>给文字清楚的层次。'],'12':['让代码，<br>也有颜色。','语法高亮与行号，<br>读起来，一目了然。'],'20':['复杂公式，<br>清楚表达。','矩阵、积分与推导，<br>让每个符号各就其位。'],'9':['文字之外，<br>也有风景。','图片与文字相遇，<br>把喜欢的画面写进来。'],'1':['写下的，<br>都好看。','完整测试文档，<br>在这里，自由翻阅。']}[section];if(copy){document.querySelector('#render-title').innerHTML=copy[0];document.querySelector('#render-description').innerHTML=copy[1]}}

function go(n,updateHash=true){
 current=Math.max(0,Math.min(cuts.length-1,n));
 const cut=cuts[current];
 scenes.forEach((scene,i)=>{scene.classList.toggle('active',i===cut.scene);scene.setAttribute('aria-hidden',String(i!==cut.scene));});
 document.querySelector('#page-hint').textContent=current===7?'所见即所得，打开即工作。':'点击任意位置，继续了解 →';
 document.querySelector('#progress').style.width=((current+1)/cuts.length*100)+'%';
 if(updateHash)history.replaceState(null,'','#'+(current+1));
 clearTimeout(jumpTimer);
 if(cut.section){jump(cut.section);document.querySelector('#render-topic').textContent=({'10':'01 / 表格与排版','12':'02 / 代码高亮','20':'03 / 数学公式','9':'04 / 图文混排'})[cut.section];}
 window.scrollTo({top:0,behavior:'instant'});
}
const egg=document.querySelector('#easter-egg');
let secretCount=0,secretTime=0;
function secretClick(){
 const now=Date.now();secretCount=now-secretTime>1400?1:secretCount+1;secretTime=now;
 if(secretCount===5){secretCount=0;egg.showModal();}
}
let pointerStart=null,dragged=false;
addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};dragged=false;},{passive:true});
addEventListener('pointermove',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>8)dragged=true;},{passive:true});
addEventListener('pointercancel',()=>{dragged=true;pointerStart=null;});
addEventListener('click',e=>{
 if(egg.open){
  e.stopPropagation();
  if(e.target===egg||e.target.closest('.easter-close'))egg.close();
  return;
 }
 if(e.target.closest('.logo-secret')){e.preventDefault();e.stopPropagation();secretClick();return;}
 secretCount=0;
 if(e.target.closest('.download-link'))return;
 if(dragged||window.getSelection()?.toString())return;
 e.preventDefault();e.stopPropagation();go(current+1);
},true);
addEventListener('keydown',e=>{
 if(egg.open||e.target.closest('.download-link,.logo-secret'))return;
 if(['ArrowRight','ArrowLeft',' '].includes(e.key)){e.preventDefault();go(current+(e.key==='ArrowLeft'?-1:1));}
});
addEventListener('hashchange',()=>go((parseInt(location.hash.slice(1))||1)-1,false));
go(0);
