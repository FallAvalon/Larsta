import { spawn } from 'node:child_process';
const suites=['ui-smoke','ui-language','ui-personas','ui-interactions','ui-editor','ui-thinking-regenerate','ui-reading-layout','ui-chat-design','ui-chat-tools','ui-redesign','ui-providers'];
for(const suite of suites){
  const child=spawn(process.execPath,['tests/'+suite+'.mjs'],{stdio:'inherit',env:process.env});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(code!==0){process.exitCode=1;break;}
}
