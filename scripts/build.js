import fs from 'node:fs';
import path from 'node:path';
const required=['frontend/index.html','frontend/app.js','frontend/styles.css','frontend/favicon.svg','backend/server.js','backend/db.js','backend/domain.js','database/001_init.sql'];
for(const file of required)if(!fs.existsSync(file))throw Error('Missing '+file);
fs.mkdirSync('dist',{recursive:true});
for(const file of required.filter(x=>x.startsWith('frontend/')))fs.copyFileSync(file,path.join('dist',path.basename(file)));
console.log('Frontend ready in dist/; server serves frontend/ directly.');
