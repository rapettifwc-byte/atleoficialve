'use strict';
/* ATLE Studio: conexión a Supabase REST y Auth, sin PHP ni librerías externas.
   Solo usa la clave PÚBLICA de Supabase; la seguridad de edición la impone RLS en la base de datos. */
(function(){
 const c=window.ATLE_CONFIG||{};
 const url=String(c.supabaseUrl||'').replace(/\/+$/,'');
 const key=String(c.supabaseKey||'');
 const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)&&key.length>25&&!key.includes('PEGA_AQUI');
 const tokenKey='atle-studio-auth-v10';
 let session=null;
 try{session=JSON.parse(localStorage.getItem(tokenKey)||'null')}catch(e){}
 const configurationError='Falta conectar Supabase. Abre configuracion.js y sigue la guía PASO_A_PASO.html.';
 function fail(err,defaultText){throw Error(err?.message||defaultText||'Ocurrió un error. Inténtalo nuevamente.');}
 async function request(path,{method='GET',body,auth=false,headers={}}={}){
  if(!configured)throw Error(configurationError);
  if(auth)await ensureSession();
  const h={'apikey':key,...headers};
  if(auth)h.Authorization='Bearer '+session.access_token;
  // Las claves sb_publishable_... no son JWT: para solicitudes públicas basta 'apikey'.
  if(body!==undefined && !(body instanceof Blob))h['Content-Type']='application/json';
  let r;
  try{r=await fetch(url+path,{method,headers:h,body:body===undefined?undefined:body instanceof Blob?body:JSON.stringify(body),cache:'no-store'})}
  catch(e){console.error('ATLE Supabase: fallo de red',e);throw Error('No se pudo conectar con Supabase. Revisa si el proyecto está Paused en Supabase Dashboard, comprueba tu conexión a Internet y la URL del proyecto. Si aparece Healthy, usa la página diagnostico.html para comprobar la API.')}
  if(r.status===204)return null;
  const text=await r.text();let result;try{result=text?JSON.parse(text):null}catch(e){result={message:text.slice(0,300)}}
  if(!r.ok)throw Error(result?.msg||result?.message||result?.error_description||result?.error||'Error de Supabase ('+r.status+').');
  return result;
 }
 function saveAuth(data){session=data;try{if(data)localStorage.setItem(tokenKey,JSON.stringify(data));else localStorage.removeItem(tokenKey)}catch(e){}}
 async function ensureSession(){
  if(!session?.access_token)throw Error('Inicia sesión para continuar.');
  if(Date.now()<((session.expires_at||0)-75)*1000)return;
  if(!session.refresh_token){saveAuth(null);throw Error('Tu sesión caducó. Ingresa nuevamente.')}
  try{
   const fresh=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});
   saveAuth({...fresh,expires_at:Math.floor(Date.now()/1000)+Number(fresh.expires_in||3600)});
  }catch(e){saveAuth(null);throw Error('Tu sesión terminó. Ingresa nuevamente.')}
 }
 async function authorized(){
  if(!session?.access_token)return false;
  try{
   await ensureSession();
   const user=await request('/auth/v1/user',{auth:true});
   const rows=await request('/rest/v1/atle_admins?select=user_id&user_id=eq.'+encodeURIComponent(user.id),{auth:true});
   if(!rows?.length){saveAuth(null);return false}
   session.user=user;saveAuth(session);return true;
  }catch(e){saveAuth(null);return false}
 }
 async function login(user,password){
  if(!configured)throw Error(configurationError);
  const email=String(user||'').trim().toLowerCase()==='admin'?String(c.adminEmail||'').trim():String(user||'').trim();
  if(!email.includes('@'))throw Error('Escribe admin o tu correo de administración.');
  const result=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  saveAuth({...result,expires_at:Math.floor(Date.now()/1000)+Number(result.expires_in||3600)});
  if(!await authorized()){saveAuth(null);throw Error('Este usuario no tiene permisos de administración. Revisa el paso 3 de la guía.')}
  return true;
 }
 async function logout(){
  try{if(session?.access_token)await request('/auth/v1/logout',{method:'POST',auth:true})}catch(e){}
  saveAuth(null);
 }
 async function getProducts(auth=false){
  const rows=await request('/rest/v1/atle_products?select=data&order=created_at.asc',{auth});
  return (rows||[]).map(x=>x.data);
 }
 async function getSettings(auth=false){
  const rows=await request('/rest/v1/atle_settings?select=data&id=eq.1',{auth});
  if(!rows?.length)throw Error('No hay configuración inicial. Ejecuta el archivo INSTALAR_SUPABASE.sql.');
  return rows[0].data;
 }
 async function store(){
  if(!configured)throw Error(configurationError);
  const [products,settings]=await Promise.all([getProducts(false),getSettings(false)]);
  return {products:products.filter(p=>p.activo!==false),settings};
 }
 function normalizeProduct(p){
  if(!p||typeof p!=='object')throw Error('Datos del producto inválidos.');
  const name=String(p.nombre||'').trim();if(!name||name.length>90)throw Error('Escribe un nombre válido (máximo 90 caracteres).');
  const price=Number(p.precio);if(!Number.isFinite(price)||price<0||price>999999)throw Error('Precio inválido.');
  if(!Array.isArray(p.tallas)||!p.tallas.length||!Array.isArray(p.colores)||!p.colores.length)throw Error('Agrega al menos una talla y un color.');
  return {...p,nombre:name,precio:price,activo:p.activo!==false};
 }
 async function upsertProduct(p,id){
  p=normalizeProduct(p);
  p.id=id||('ATLE-'+crypto.randomUUID().slice(0,8).toUpperCase());
  const result=await request('/rest/v1/atle_products?on_conflict=id',{method:'POST',auth:true,headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:{id:p.id,data:p}});
  return {product:result?.[0]?.data||p};
 }
 async function deleteProduct(id){
  await request('/rest/v1/atle_products?id=eq.'+encodeURIComponent(id),{method:'DELETE',auth:true,headers:{'Prefer':'return=minimal'}});
  return {ok:true};
 }
 async function updateSettings(data){
  if(!data||!/^\d{10,15}$/.test(String(data.whatsapp||'')))throw Error('WhatsApp: escribe código de país y número, sin + ni espacios.');
  if(!Array.isArray(data.metodos_pago)||!data.metodos_pago.length)throw Error('Agrega al menos un método de pago.');
  if(!Array.isArray(data.metodos_envio)||!data.metodos_envio.length)throw Error('Agrega al menos un método de envío.');
  const result=await request('/rest/v1/atle_settings?id=eq.1',{method:'PATCH',auth:true,headers:{'Prefer':'return=representation'},body:{data}});
  if(!result?.length)throw Error('No se guardaron los ajustes. Comprueba tus permisos.');
  return {settings:result[0].data};
 }
 async function uploadImage(file){
  if(!file)throw Error('Selecciona una fotografía.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Usa JPG, PNG o WEBP.');
  if(file.size>6*1024*1024)throw Error('Cada imagen debe pesar máximo 6 MB.');
  const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';
  const path='productos/'+crypto.randomUUID()+'.'+ext;
  await request('/storage/v1/object/atle-fotos/'+path,{method:'POST',auth:true,body:file,headers:{'Content-Type':file.type,'Cache-Control':'3600','x-upsert':'false'}});
  return {url:url+'/storage/v1/object/public/atle-fotos/'+path};
 }
 async function changePassword(actual,nueva){
  if(String(nueva).length<12)throw Error('La nueva contraseña debe tener al menos 12 caracteres.');
  await ensureSession();
  const email=session.user?.email||c.adminEmail;
  // Comprobar la contraseña anterior sin invalidar la sesión actual.
  await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password:actual}});
  await request('/auth/v1/user',{method:'PUT',auth:true,body:{password:nueva}});
  return {ok:true};
 }
 async function api(path,method='GET',payload){
  if(path==='/api/session')return {authenticated:await authorized(),username:session?.user?.email||'',setup_required:false};
  if(path==='/api/login'){await login(payload.usuario,payload.clave);return {ok:true}}
  if(path==='/api/logout'){await logout();return {ok:true}}
  if(path==='/api/admin/products'&&method==='GET')return {products:await getProducts(true)};
  if(path==='/api/admin/settings'&&method==='GET')return {settings:await getSettings(true)};
  if(path==='/api/admin/settings'&&method==='PUT')return updateSettings(payload);
  if(path==='/api/admin/products'&&method==='POST')return upsertProduct(payload);
  if(path.startsWith('/api/admin/products/')&&method==='PUT')return upsertProduct(payload,decodeURIComponent(path.split('/').pop()));
  if(path.startsWith('/api/admin/products/')&&method==='DELETE')return deleteProduct(decodeURIComponent(path.split('/').pop()));
  if(path==='/api/admin/password'&&method==='PUT')return changePassword(payload.actual,payload.nueva);
  throw Error('Función no disponible: '+path);
 }
 async function backup(){
  if(!await authorized())throw Error('Inicia sesión para hacer el respaldo.');
  const [products,settings]=await Promise.all([getProducts(true),getSettings(true)]);
  return {version:10,exportado:new Date().toISOString(),aviso:'Este respaldo JSON contiene productos, ajustes y enlaces de fotografías. Las fotografías originales deben respaldarse por separado desde Supabase Storage.',products,settings};
 }
 window.ATLE_DB={configured,store,api,uploadImage,backup,photoURL(path){if(!path)return '/imagenes/legging_oliva.webp';return /^https?:\/\//i.test(path)?path:'/'+path.replace(/^\//,'')},configurationError};
})();
