import fs from 'node:fs';
import path from 'node:path';
import { audit,inventory } from './publication.mjs';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
try{
  const root=process.cwd(),output=option('--out');if(!output)throw new Error('Use --out with a new directory outside this installation.');
  const target=path.resolve(output),relative=path.relative(root,target);
  if(!relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw new Error('The output directory must be outside this installation.');
  if(fs.existsSync(target))throw new Error('The output directory already exists. Refusing to overwrite it.');
  const privateDir=option('--private-dir'),before=audit(root,{privateDir,workspace:true});
  if(before.violations.length){console.error(JSON.stringify({violations:before.violations},null,2));throw new Error('Source privacy audit failed. Nothing was copied.');}
  fs.mkdirSync(target,{recursive:true});
  for(const file of inventory(root,true)){const destination=path.join(target,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(root,file),destination);}
  const after=audit(target,{privateDir});if(after.violations.length)throw new Error('Copied release failed its privacy audit. Do not publish it.');
  console.log(JSON.stringify({output:target,files:after.files,privateRecordsCompared:after.privateRecordsCompared,violations:after.violations},null,2));
}catch(error){console.error(error instanceof Error?error.message:'Public preparation failed.');process.exitCode=1;}
