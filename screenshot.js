const WebSocket = require('ws');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_TOKEN = process.env.CLIENT_TOKEN;
const WS_ID = 'cmpzhqhij00002tv9y2jaziqa';

const accessibleWorkspaces = [
  { id: 'cmpzhqhij00002tv9y2jaziqa', name: 'Clínica Estética Silva', slug: 'clinica-estetica-silva', segment: 'Estética', isAgency: false, role: 'admin' },
  { id: 'cmpzhqkdz00062tv92kvm7p6u', name: 'Advocacia Rodrigues & Filhos', slug: 'advocacia-rodrigues', segment: 'Jurídico', isAgency: false, role: 'admin' },
  { id: 'cmpzhqmda000c2tv9zrz6lmbn', name: 'Academia FitLife', slug: 'academia-fitlife', segment: 'Academia', isAgency: false, role: 'admin' },
  { id: 'cmpzhqoc9000i2tv9boprzrlc', name: 'Imobiliária Horizonte', slug: 'imobiliaria-horizonte', segment: 'Imobiliário', isAgency: false, role: 'admin' },
];

const authData = {
  state: {
    user: { id: 'u1', name: 'Fabiano Martins', email: 'admin@dashcapi.com' },
    token: CLIENT_TOKEN,
    workspaceId: WS_ID,
    currentWorkspace: { id: WS_ID, name: 'Clínica Estética Silva', slug: 'clinica-estetica-silva', segment: 'Estética' },
    accessibleWorkspaces: accessibleWorkspaces,
    isAuthenticated: true,
    _hydrated: true
  },
  version: 0
};

const ws = new WebSocket('  ');
let id=1; const p={};
ws.on('message', d => { const m=JSON.parse(d); if(m.id&&p[m.id]){p[m.id](m);delete p[m.id];} });
const send=(method,params={})=>new Promise(r=>{const i=id++;p[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

ws.on('open', async()=>{
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});

  // Login
  await send('Page.navigate',{url:'http://localhost:3000/login'});
  await sleep(4000);
  const s1=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/fix-login.png', Buffer.from(s1.result.data,'base64'));
  console.log('login OK');

  // Set auth
  const authStr = JSON.stringify(JSON.stringify(authData));
  await send('Runtime.evaluate',{expression:`localStorage.setItem('carrossel360-auth', ${authStr})`});

  // Dashboard
  await send('Page.navigate',{url:'http://localhost:3000/dashboard'});
  await sleep(5000);
  const s2=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/fix-dash.png', Buffer.from(s2.result.data,'base64'));
  console.log('dashboard OK');

  // Click client selector button
  await send('Runtime.evaluate',{expression:`
    (function() {
      var btns = Array.from(document.querySelectorAll('button'));
      var btn = btns.find(function(b) { return b.innerText && (b.innerText.includes('Clínica') || b.innerText.includes('Silva')); });
      if(btn) btn.click();
    })()
  `});
  await sleep(1500);
  const s3=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/fix-dropdown.png', Buffer.from(s3.result.data,'base64'));
  console.log('dropdown OK');

  ws.close(); process.exit(0);
});
