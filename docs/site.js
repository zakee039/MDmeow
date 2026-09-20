const scenes=[...document.querySelectorAll(".scene")];
const showcase=[
  {topic:"01 / 表格渲染",title:"表格漂亮，<br>信息也清楚。",description:"复杂信息排得整整齐齐，<br>阅读不需要额外费力。",caption:"漂亮表格渲染",src:"assets/screenshots/table.png",alt:"MDmeow 表格渲染截图"},
  {topic:"02 / 代码高亮",title:"代码好看，<br>也更好读。",description:"语法高亮、代码块与行号，<br>该清楚的地方都清楚。",caption:"优雅代码显示",src:"assets/screenshots/code.png",alt:"MDmeow 代码高亮截图"},
  {topic:"03 / 数学公式",title:"公式复杂，<br>表达依然轻松。",description:"从行内公式到完整推导，<br>直接看见最终排版。",caption:"公式也轻松拿下",src:"assets/screenshots/formula.png",alt:"MDmeow 数学公式渲染截图"},
  {topic:"04 / 图片操作",title:"图片放进去，<br>马上就能调整。",description:"对齐、缩放与可视化操作，<br>图文排版不用绕路。",caption:"图片可视化操作",src:"assets/screenshots/image.png",alt:"MDmeow 图片可视化操作截图"}
];
const cuts=[
  {scene:0},{scene:1},{scene:2},
  {scene:3,demo:0},{scene:3,demo:1},{scene:3,demo:2},{scene:3,demo:3},
  {scene:4}
];
let current=0;
const title=document.querySelector("#showcase-title");
const description=document.querySelector("#showcase-description");
const topic=document.querySelector("#showcase-topic");
const caption=document.querySelector("#showcase-caption");
const image=document.querySelector("#showcase-image");
const showcaseWindow=document.querySelector(".showcase-window");
const hint=document.querySelector("#page-hint");
const progress=document.querySelector("#progress");
const egg=document.querySelector("#easter-egg");

function applyShowcase(index){
  const item=showcase[index];
  title.innerHTML=item.title;
  description.innerHTML=item.description;
  topic.textContent=item.topic;
  caption.textContent=item.caption;
  image.src=item.src;
  image.alt=item.alt;
  showcaseWindow.classList.toggle("tilt-left",index%2===0);
  showcaseWindow.classList.toggle("tilt-right",index%2===1);
}
function go(next,updateHash=true){
  current=Math.max(0,Math.min(cuts.length-1,next));
  const cut=cuts[current];
  scenes.forEach((scene,index)=>{
    const active=index===cut.scene;
    scene.classList.toggle("active",active);
    scene.setAttribute("aria-hidden",String(!active));
  });
  if(cut.scene===3)applyShowcase(cut.demo);
  hint.textContent=current===cuts.length-1?"所见即所得，打开即工作。":"点击任意位置，继续了解 →";
  progress.style.width=((current+1)/cuts.length*100)+"%";
  if(updateHash)history.replaceState(null,"","#"+(current+1));
  window.scrollTo({top:0,behavior:"instant"});
}


let secretCount=0,secretTime=0;
function secretClick(){
  const now=Date.now();
  secretCount=now-secretTime>1400?1:secretCount+1;
  secretTime=now;
  if(secretCount===5){secretCount=0;egg.showModal()}
}
let pointerStart=null,dragged=false;
addEventListener("pointerdown",event=>{pointerStart={x:event.clientX,y:event.clientY};dragged=false},{passive:true});
addEventListener("pointermove",event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>8)dragged=true},{passive:true});
addEventListener("pointercancel",()=>{dragged=true;pointerStart=null});
addEventListener("click",event=>{
  if(egg.open){
    event.stopPropagation();
    if(event.target===egg||event.target.closest(".easter-close"))egg.close();
    return;
  }
  if(event.target.closest(".logo-secret")){event.preventDefault();event.stopPropagation();secretClick();return}
  secretCount=0;
  if(event.target.closest(".download-link"))return;
  if(dragged||window.getSelection()?.toString())return;
  event.preventDefault();
  event.stopPropagation();
  go(current+1);
},true);
addEventListener("keydown",event=>{
  if(egg.open||event.target.closest?.(".download-link,.logo-secret"))return;
  if(["ArrowRight","ArrowLeft"," "].includes(event.key)){
    event.preventDefault();
    go(current+(event.key==="ArrowLeft"?-1:1));
  }
});
addEventListener("hashchange",()=>go((parseInt(location.hash.slice(1),10)||1)-1,false));
history.replaceState(null,"","#1");
go(0,false);
