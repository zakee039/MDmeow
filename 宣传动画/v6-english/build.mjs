import {build} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url));
await build({configFile:false,root:path.resolve(dir,'../..'),base:'./',publicDir:false,define:{'process.env.NODE_ENV':'"production"'},build:{outDir:path.join(dir,'assets/renderer'),emptyOutDir:true,lib:{entry:path.join(dir,'renderer.ts'),name:'MDmeowEnglish',formats:['iife'],fileName:()=> 'renderer.js'},cssCodeSplit:false,assetsInlineLimit:1000000,chunkSizeWarningLimit:5000}});
