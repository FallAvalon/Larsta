import { createApp } from '../server/app.js';
const {app,store}=createApp({dataDir:process.env.LARSTA_DATA_DIR!});
const server=app.listen(0,'0.0.0.0',()=>{const address=server.address();if(address&&typeof address!=='string')console.log(JSON.stringify({port:address.port}));});
process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
