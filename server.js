// Presentis – serveur local (aucune dépendance, juste Node.js)
// Les élèves entrent le MOT DE PASSE créé par le professeur ; leur fiche arrive toute seule dans l'app du professeur.
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const PORT=+process.env.PORT||3000,DIR=__dirname,DB=path.join(DIR,'fiches.json'),RM=path.join(DIR,'salles.json');
let db=[],rooms={};
try{db=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){}
try{rooms=JSON.parse(fs.readFileSync(RM,'utf8'))}catch(e){}
const save=()=>{try{fs.writeFileSync(DB,JSON.stringify(db,null,1));fs.writeFileSync(RM,JSON.stringify(rooms,null,1))}catch(e){console.log('Sauvegarde impossible:',e.message)}};
const H=pw=>crypto.createHash('sha256').update('presentis:'+String(pw||'').trim()).digest('hex');
const isLocal=r=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(r.socket.remoteAddress||'');
function lan(){const o=[];Object.values(os.networkInterfaces()).forEach(l=>(l||[]).forEach(i=>{if(i.family==='IPv4'&&!i.internal)o.push('http://'+i.address+':'+PORT+'/eleve')}));return o}
const hits={},tries={};
function limited(ip){const n=Date.now(),a=(hits[ip]||[]).filter(t=>n-t<60000);a.push(n);hits[ip]=a;return a.length>40}
function tooMany(ip){const n=Date.now(),a=(tries[ip]||[]).filter(t=>n-t<60000);a.push(n);tries[ip]=a;return a.length>12}
function send(res,code,body,type,extra){res.writeHead(code,Object.assign({'Content-Type':type||'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},extra||{}));res.end(body)}
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
function file(res,names){for(const n of names){const p=path.join(DIR,n);if(fs.existsSync(p))return send(res,200,fs.readFileSync(p),'text/html; charset=utf-8')}send(res,404,'Fichier introuvable : '+names[0],'text/plain; charset=utf-8')}
function body(req,cb){let s='';req.on('data',c=>{s+=c;if(s.length>6000){req.destroy()}});req.on('end',()=>{try{cb(JSON.parse(s))}catch(e){cb(null)}})}
function valid(o){if(!o||typeof o!=='object')return null;const n=String(o.n||'').trim().replace(/\s+/g,' ').slice(0,60),m=String(o.m||'').trim().toUpperCase(),a=+o.a,p=+o.p,t=+o.t;
if(n.length<3||!/^[\p{L}][\p{L}\s'’.\-]*$/u.test(n)||!/^[A-Z]\d{9}$/.test(m)||!(a>=5&&a<=30)||!(p>=10&&p<=200)||!(t>=80&&t<=230))return null;
const r={n,m,a,p,t,d:new Date().toISOString().slice(0,10)};
 if(o.s!==undefined&&o.s!==''){if(o.s!=='M'&&o.s!=='F')return null;r.s=o.s}
 if(o.b!==undefined&&o.b!==''){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(o.b))||isNaN(Date.parse(o.b)))return null;r.b=String(o.b)}
 if(o.g!==undefined&&o.g!==''){const g=String(o.g).trim();if(!/^[+0-9\s.\-()]{8,20}$/.test(g)||g.replace(/\D/g,'').length<8||g.replace(/\D/g,'').length>15)return null;r.g=g}
 return r}
http.createServer((req,res)=>{
 const url=req.url.split('?')[0],local=isLocal(req)&&!req.headers['x-forwarded-for'],ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim();
 const TK=b=>crypto.createHash('sha256').update('tk:'+String((b&&b.tk)||'')).digest('hex'),okT=(r,b)=>!!r&&(r.tk?r.tk===TK(b):local);
 if(req.method==='OPTIONS')return send(res,204,'','text/plain',cors);
 if(req.method==='GET'&&url==='/'){return local?file(res,['index.html','presentis.html']):(res.writeHead(302,{Location:'/eleve'}),res.end())}
 if(req.method==='GET'&&(url==='/app'||url==='/prof'))return file(res,['presentis.html']);
 if(req.method==='GET'&&url==='/manifest.json')return fs.existsSync(path.join(DIR,'manifest.json'))?send(res,200,fs.readFileSync(path.join(DIR,'manifest.json')),'application/manifest+json',{'Cache-Control':'public,max-age=3600'}):send(res,404,'');
 if(req.method==='GET'&&url==='/sw.js')return fs.existsSync(path.join(DIR,'sw.js'))?send(res,200,fs.readFileSync(path.join(DIR,'sw.js')),'text/javascript; charset=utf-8',{'Service-Worker-Allowed':'/'}):send(res,404,'');
 if(req.method==='GET'&&/^\/icon-(192|512|maskable)\.png$/.test(url)){const p=path.join(DIR,url.slice(1));return fs.existsSync(p)?send(res,200,fs.readFileSync(p),'image/png',{'Cache-Control':'public,max-age=86400'}):send(res,404,'')}
 if(req.method==='GET'&&url==='/healthz')return send(res,200,'ok','text/plain');
 if(req.method==='GET'&&url==='/eleve')return file(res,['fiche-eleve.html']);
 if(req.method==='GET'&&url==='/api/info'){{const h=req.headers['x-forwarded-host']||req.headers.host,pr=req.headers['x-forwarded-proto']||'http';return send(res,200,JSON.stringify({ok:true,urls:local?lan():[pr+'://'+h+'/eleve']}),null,cors)}}
 // le professeur déclare (ou retire) le mot de passe de sa classe
 if(req.method==='POST'&&url==='/api/room'){if(limited(ip))return send(res,429,'{}',null,cors);return body(req,b=>{if(!b||String(b.pw||'').trim().length<5||String(b.tk||'').length<12)return send(res,400,'{"ok":false}',null,cors);
  const h=H(b.pw),r=rooms[h];
  if(r&&r.tk&&r.tk!==TK(b))return send(res,403,'{"ok":false,"err":"used"}',null,cors);
  if(b.off){delete rooms[h];db=db.filter(x=>x.room!==h)}else if(!r)rooms[h]={ts:Date.now(),tk:TK(b)};else if(!r.tk)r.tk=TK(b);save();send(res,200,'{"ok":true}',null,cors)})}
 // l'élève vérifie le mot de passe
 if(req.method==='POST'&&url==='/api/login'){if(tooMany(ip))return send(res,429,'{"ok":false}',null,cors);
  return body(req,b=>send(res,200,JSON.stringify({ok:!!(b&&rooms[H(b.pw)])}),null,cors))}
 // l'élève envoie sa fiche (avec le mot de passe)
 if(req.method==='POST'&&url==='/api/fiche'){
  if(limited(ip))return send(res,429,'{"ok":false}',null,cors);
  return body(req,b=>{const h=H(b&&b.pw);if(!rooms[h]){if(tooMany(ip))return send(res,429,'{"ok":false}',null,cors);return send(res,403,'{"ok":false,"err":"pw"}',null,cors)}
   const f=valid(b);if(!f)return send(res,400,'{"ok":false}',null,cors);
   const i=db.findIndex(x=>x.m===f.m&&x.room===h);f.room=h;f.pending=true;f.ts=Date.now();if(i>-1)db[i]=f;else db.push(f);save();
   console.log('Nouvelle fiche :',f.n);send(res,200,'{"ok":true}',null,cors)})}
 // le professeur récupère les fiches de sa classe
 if(req.method==='POST'&&url==='/api/pull'){return body(req,b=>{const h=H(b&&b.pw);if(!okT(rooms[h],b))return send(res,403,'{}',null,cors);
  send(res,200,JSON.stringify(db.filter(x=>x.room===h&&x.pending).map(x=>({n:x.n,m:x.m,s:x.s,b:x.b,a:x.a,p:x.p,t:x.t,g:x.g,d:x.d}))),null,cors)})}
 if(req.method==='POST'&&url==='/api/ack'){return body(req,b=>{const h=H(b&&b.pw),ids=(b&&b.ids)||[];if(!okT(rooms[h],b))return send(res,403,'{}',null,cors);db.forEach(x=>{if(x.room===h&&ids.includes(x.m))x.pending=false});save();send(res,200,'{"ok":true}',null,cors)})}
 send(res,404,'Page introuvable','text/plain; charset=utf-8')
}).listen(PORT,'0.0.0.0',()=>{
 console.log('\n  Presentis – serveur lancé\n');
 console.log('  Pour toi (professeur) :  http://localhost:'+PORT);
 const l=lan();console.log(l.length?'  Pour tes élèves (même Wi-Fi) :  '+l.join('   ou   '):'  Aucun réseau détecté : connecte-toi au Wi-Fi pour que les élèves puissent ouvrir le lien.');
 console.log('  Les élèves entrent le mot de passe que tu as créé dans Appel > Presentis élève.');
 console.log('\n  Laisse cette fenêtre ouverte. Ferme-la pour arrêter le serveur.\n')});
