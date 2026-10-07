window.coverReady=(async()=>{
  const portrait=document.createElement('img');
  portrait.className='cover-portrait';portrait.src='assets/inserted-image.png';portrait.alt='插入 Markdown 文档的图片';
  document.querySelector('#cover-document').append(portrait);
  await document.fonts.ready;
  await Promise.all([...document.images].map(i=>i.decode()));
  for(const id of ['headline','subheadline','smallprint']) {
    const element=document.getElementById(id);
    const range=document.createRange();range.selectNodeContents(element);
    const bounds=range.getBoundingClientRect();
    element.style.left=(parseFloat(getComputedStyle(element).left)+1280-(bounds.left+bounds.right)/2)+'px';
  }
  document.body.dataset.coverReady='true';
})();
