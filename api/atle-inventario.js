'use strict';
// ATLE: función privada para consultar ÚNICAMENTE stock y precio BCV.
// Los secretos deben estar en Vercel > Project Settings > Environment Variables.
const crypto = require('node:crypto');

const COOKIE = 'atle_stock_view';
const TTL = 8 * 60 * 60; // 8 horas
const MAX_PAGE = 500;
const MAX_ROWS = 20000;
const noStore = { 'Cache-Control': 'private, no-store, no-cache, max-age=0', 'Pragma':'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag':'noindex, nofollow' };

function response(res, code, payload, headers={}) {
  for (const [key,value] of Object.entries({...noStore,...headers})) res.setHeader(key,value);
  res.status(code).json(payload);
}
function getSecrets() {
  const url = String(process.env.ATLE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.ATLE_SUPABASE_SECRET_KEY || '');
  const pin = String(process.env.ATLE_INVENTORY_PIN || '');
  const signing = String(process.env.ATLE_INVENTORY_SESSION_SECRET || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || key.length < 20 || !/^\d{6}$/.test(pin) || signing.length < 40) throw Error('Falta configurar variables privadas en Vercel');
  return {url, key, pin, signing};
}
function secureEqual(a,b) {
  const aa = crypto.createHash('sha256').update(String(a)).digest();
  const bb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(aa,bb);
}
function makeHmac(data, signing) {return crypto.createHmac('sha256', signing).update(data).digest('base64url');}
function sessionToken(signing) {
  const data = Buffer.from(JSON.stringify({v:1,iat:Date.now(),exp:Date.now()+TTL*1000}), 'utf8').toString('base64url');
  return data+'.'+makeHmac(data,signing);
}
function isAuthorized(req, signing) {
  const cookies = String(req.headers.cookie||'').split(';').map(x=>x.trim());
  const token = cookies.find(c=>c.startsWith(COOKIE+'='))?.slice((COOKIE+'=').length)||'';
  if (!/^[\w-]+\.[\w-]+$/.test(token) || token.length>350) return false;
  const ix = token.lastIndexOf('.');
  const body = token.slice(0,ix), sig = token.slice(ix+1);
  if (!secureEqual(sig,makeHmac(body,signing))) return false;
  try {
    const data=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    return data.v===1 && Number.isFinite(data.exp) && Date.now()<data.exp && data.exp-Date.now()<=TTL*1000;
  } catch {return false;}
}
function setCookie(res,token) {
  res.setHeader('Set-Cookie', COOKIE+'='+token+'; Path=/api/atle-inventario; HttpOnly; Secure; SameSite=Strict; Max-Age='+TTL);
}
function clearCookie(res) {
  res.setHeader('Set-Cookie',COOKIE+'=; Path=/api/atle-inventario; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
}
function validateOrigin(req) {
  const origin = String(req.headers.origin||'');
  if (!origin) return false;
  try {
    const requestHost = String(req.headers.host||'').toLowerCase();
    return new URL(origin).protocol==='https:' && new URL(origin).host.toLowerCase()===requestHost;
  } catch {return false;}
}
async function fetchSupabase(env,path,{method='GET',body}={}) {
  const h={ 'apikey':env.key, 'Accept':'application/json', 'User-Agent':'atle-inventory-server/1.0'};
  // Las claves sb_secret_xxx NO son JWT; solo llevan apikey.
  if (env.key.split('.').length===3) h.Authorization='Bearer '+env.key;
  if (body !== undefined) h['Content-Type']='application/json';
  const r=await fetch(env.url+'/rest/v1/'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!r.ok) {console.error('ATLE lectura Supabase: HTTP',r.status,'en',path.split('?')[0]);throw Error('No fue posible obtener la información privada');}
  const result=await r.json();
  if(!Array.isArray(result) && !path.startsWith('rpc/')) throw Error('Respuesta de inventario inesperada');
  return result;
}
async function allRows(env,table,cols,extra='') {
  const acc=[];
  for(let offset=0;offset<MAX_ROWS;offset+=MAX_PAGE){
    const params=new URLSearchParams({select:cols,limit:String(MAX_PAGE),offset:String(offset)});
    const rows=await fetchSupabase(env,table+'?'+params.toString()+(extra?'&'+extra:''));
    if(!Array.isArray(rows))throw Error('Formato no válido');
    acc.push(...rows);
    if(rows.length<MAX_PAGE)return acc;
  }
  throw Error('Inventario demasiado grande para esta consulta');
}
function imageUrl(path,env) {
  if(typeof path!=='string'||path.length>1600) return '';
  if(path.startsWith('/'))return path.startsWith('//')?'':path;
  if(/^https:\/\//i.test(path)) {
    try {const url=new URL(path);if(url.username||url.password)return ''; return url.toString();}catch{return '';}
  }
  if(/^[a-z\d][a-z\d_./-]*\.(?:jpg|jpeg|png|webp|avif)$/i.test(path) && !path.includes('..'))return '/'+path;
  return '';
}
async function inventoryView(env) {
  const [records,variants,products]=await Promise.all([
    allRows(env,'atle_inventory_products','product_id,sku,price_bcv,reference_image,use_cover_image,stock_enabled','stock_enabled=eq.true'),
    allRows(env,'atle_inventory_stock','product_id,color,size,quantity'),
    allRows(env,'atle_products','id,data')
  ]);
  const byProduct=new Map(products.map(p=>[p.id,p.data||{}]));
  const byVariant=new Map();
  for(const v of variants) {
    if(!byVariant.has(v.product_id))byVariant.set(v.product_id,[]);
    byVariant.get(v.product_id).push({color:String(v.color||''),size:String(v.size||''),quantity:Math.max(0,Number(v.quantity)||0)});
  }
  // Lista blanca. No devolver objetos Supabase en bruto: nunca enviar costos, notas, ventas ni claves.
  const items=records.map(rec=>{
    const p=byProduct.get(rec.product_id)||{};
    const image = rec.use_cover_image!==false && p.imagen ? p.imagen : (rec.reference_image||p.imagen||p.colores?.[0]?.imagen||'');
    const stock=byVariant.get(rec.product_id)||[];
    return {
      sku:String(rec.sku||''),
      name:String(p.nombre||rec.sku||'Producto'),
      photo:imageUrl(image,env),
      price_bcv:Math.max(0,Number(rec.price_bcv)||0),
      variants:stock,
      total:stock.reduce((sum,v)=>sum+v.quantity,0)
    };
  }).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  return {updated_at:new Date().toISOString(),products:items};
}
function ipFingerprint(req,signing) {
  const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim().slice(0,150);
  return crypto.createHmac('sha256',signing).update('rate:'+ip).digest('hex');
}
async function verifyAttempt(env,req,correct) {
  const result=await fetchSupabase(env,'rpc/atle_inventory_pin_check',{method:'POST',body:{p_fingerprint:ipFingerprint(req,env.signing),p_matches:correct}});
  return result===true;
}
async function main(req,res) {
  if(req.method!=='GET'&&req.method!=='POST')return response(res,405,{error:'Método no permitido'},{Allow:'GET, POST'});
  let env;
  try{env=getSecrets();}catch(e){console.error(e.message);return response(res,503,{error:'La consulta privada todavía no está configurada.'});}
  if(req.method==='POST') {
    if(!validateOrigin(req))return response(res,403,{error:'Solicitud no permitida.'});
    const raw=req.body||{};
    const data=typeof raw==='string'?JSON.parse(raw||'{}'):raw;
    if(data.action==='logout'){clearCookie(res);return response(res,200,{ok:true});}
    if(data.action!=='login')return response(res,400,{error:'Solicitud no válida.'});
    const pin=String(data.pin||'');
    if(pin.length>16)return response(res,400,{error:'PIN inválido.'});
    const correct=secureEqual(pin,env.pin);
    try{
      const allowed=await verifyAttempt(env,req,correct);
      if(!allowed)return response(res,401,{error:'PIN incorrecto o acceso temporalmente bloqueado. Intenta más tarde.'});
    }catch(e){console.error('ATLE protección PIN:',e.message);return response(res,503,{error:'La verificación de acceso no está disponible. Revisa la instalación SQL.'});}
    setCookie(res,sessionToken(env.signing));
    return response(res,200,{ok:true});
  }
  if(!isAuthorized(req,env.signing))return response(res,401,{error:'Introduce tu PIN para consultar el inventario.'});
  try{return response(res,200,await inventoryView(env));}
  catch(e){console.error('ATLE consulta privada:',e.message);return response(res,503,{error:'No se pudo leer el inventario. Comprueba la conexión con Supabase.'});}
}
module.exports=async function(req,res) {
  try {await main(req,res);} catch(e) {console.error('ATLE API:',e.message);response(res,500,{error:'No fue posible completar la solicitud.'});}
};
module.exports._test={inventoryView,isAuthorized,sessionToken,imageUrl,secureEqual,validateOrigin};
