import { Editor } from '../src/editor';
import { installMikuCreamRendering } from '../src/miku-cream';
import { setLang } from '../src/i18n';
import '../src/styles.css';
import markdown from './Markdown_综合渲染测试文档.md?raw';

setLang('zh-CN');
installMikuCreamRendering();
const editor = new Editor(document.querySelector('#editor')!);
editor.init(markdown).then(() => {
  document.querySelector('#render-status')!.textContent = 'Miku Cream · 实时渲染';
  document.querySelector('#editor .ProseMirror')?.setAttribute('contenteditable','false');
  const headings = [...document.querySelectorAll('#editor h2')];
  let jumpTimers: ReturnType<typeof setTimeout>[] = [];
  (window as any).jumpDocument = (section: string) => {
    jumpTimers.forEach(clearTimeout);
    const target = headings.find(h => h.textContent?.startsWith(section + '.')) as HTMLElement;
    const scroller = document.querySelector('#document-scroll')!;
    const align = () => {
      const scale = parseFloat(document.documentElement.style.getPropertyValue('--scale')) || 1;
      if (target) scroller.scrollTo({top:(target.getBoundingClientRect().top-scroller.getBoundingClientRect().top)/scale+scroller.scrollTop-24,behavior:'smooth'});
    };
    align();
    jumpTimers = [setTimeout(align,400),setTimeout(align,1400),setTimeout(align,2600)];
  };
  (window as any).rendererReady = true;
}).catch(error => {
  document.querySelector('#render-status')!.textContent = '渲染加载失败，请使用启动预览脚本';
  console.error(error);
});
