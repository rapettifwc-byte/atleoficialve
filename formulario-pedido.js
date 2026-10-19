'use strict';
/* ATLE v12: formulario configurable, métodos de pago y envío, compatible con v11.
   La información del cliente se usa únicamente para preparar el mensaje de WhatsApp. */
(function(){
 const payDefaults=['Pago Móvil / Transferencia Bancaria','Binance (pago con criptomonedas)','Efectivo $','Zelle'];
 const shipDefaults=[
  {nombre:'Retirar en tienda',requiere_direccion:false},
  {nombre:'Delivery en Cabimas/Maracaibo',requiere_direccion:true},
  {nombre:'Envío a nivel nacional (MRW o Zoom)',requiere_direccion:true}
 ];
 const msgDefault='¡Hola, ATLE! 🏋️‍♀️✨ Este es el pedido que deseo completar:\n\n👤 *DATOS DEL CLIENTE*\n{datos_cliente}\n\n🛍️ *PRODUCTOS*\n{productos}\n\n💵 *SUBTOTAL (SIN ENVÍO): {subtotal}*\n💳 *Método de pago:* {pago}\n🚚 *Método de envío:* {envio}\n\nQuedo a la espera de la confirmación de disponibilidad, el costo de envío (si aplica) y los datos correspondientes para proceder con el pago y coordinar la entrega.\n¡Muchas gracias! ✨';
 const standard=[
  {id:'nombre',etiqueta:'Nombre y apellido',tipo:'text',placeholder:'Escribe tu nombre y apellido',requerido:true,activo:true,autocomplete:'name'},
  {id:'cedula',etiqueta:'Cédula de identidad',tipo:'text',placeholder:'Ej. V-12345678',requerido:true,activo:true,autocomplete:'off'},
  {id:'telefono',etiqueta:'Número de celular',tipo:'tel',placeholder:'Ej. 0412 123 4567',requerido:true,activo:true,autocomplete:'tel'},
  {id:'pago',etiqueta:'Método de pago',tipo:'payment',placeholder:'Selecciona cómo deseas pagar',requerido:true,activo:true,autocomplete:'off'},
  {id:'envio',etiqueta:'Método de envío o entrega',tipo:'shipping',placeholder:'Selecciona cómo recibirás tu pedido',requerido:true,activo:true,autocomplete:'off'},
  {id:'ciudad',etiqueta:'Ciudad / estado de entrega',tipo:'text',placeholder:'Ej. Cabimas, Zulia',requerido:true,activo:true,autocomplete:'address-level2',dependencia:'direccion'},
  {id:'direccion',etiqueta:'Dirección de entrega',tipo:'textarea',placeholder:'Sector, calle, edificio o casa y referencia',requerido:true,activo:true,autocomplete:'street-address',dependencia:'direccion'},
  {id:'nota',etiqueta:'Nota adicional (opcional)',tipo:'textarea',placeholder:'Indicaciones adicionales para tu pedido…',requerido:false,activo:true,autocomplete:'off'}
 ];
 const defaults={version:12,titulo:'Completar tu compra',introduccion:'Completa tus datos y elige cómo pagar y recibir tu pedido. Coordinaremos la disponibilidad, el envío y el pago contigo por WhatsApp.',boton:'Completar compra por WhatsApp',aviso:'No se realiza ningún cobro en esta web. WhatsApp abrirá tu pedido para que confirmes el envío del mensaje y coordines el pago directamente con ATLE.',campos:standard};
 const safeString=(v,max)=>String(v??'').slice(0,max);
 const allowed=new Set(['text','tel','email','textarea','select','payment','shipping']);
 const validId=id=>standard.some(x=>x.id===id)||/^extra_[a-z0-9_]{3,32}$/.test(id);
 function normalizeShipping(source){
  if(!Array.isArray(source)||!source.length)return structuredClone(shipDefaults);
  const seen=new Set(), result=[];
  for(const value of source.slice(0,25)){
   const nombre=safeString(typeof value==='string'?value:value?.nombre,90).trim();
   if(!nombre||seen.has(nombre.toLowerCase()))continue;
   const requires=typeof value==='object'&&value!==null?value.requiere_direccion!==false:!/(^retir|^recog|^buscar|en tienda)/i.test(nombre);
   result.push({nombre,requiere_direccion:requires});seen.add(nombre.toLowerCase());
  }
  return result.length?result:structuredClone(shipDefaults);
 }
 function normalize(source){
  const input=(source&&typeof source==='object'&&!Array.isArray(source))?source:{};
  const result={version:12,titulo:safeString(input.titulo??defaults.titulo,100),introduccion:safeString(input.introduccion??defaults.introduccion,900),boton:safeString(input.boton??defaults.boton,100),aviso:safeString(input.aviso??defaults.aviso,900),campos:[]};
  const rows=Array.isArray(input.campos)?input.campos:standard,seen=new Set();
  for(const raw of rows.slice(0,30)){
   if(!raw||typeof raw!=='object')continue;
   const id=safeString(raw.id,42);if(!validId(id)||seen.has(id))continue;
   const base=standard.find(x=>x.id===id);
   const requested=safeString(raw.tipo||base?.tipo||'text',20);
   const tipo=id==='pago'?'payment':id==='envio'?'shipping':(allowed.has(requested)&&!['payment','shipping'].includes(requested)?requested:base?.tipo||'text');
   const field={id,tipo,etiqueta:safeString(raw.etiqueta??base?.etiqueta??'Nueva pregunta',90),placeholder:safeString(raw.placeholder??base?.placeholder??'',160),requerido:raw.requerido===undefined?!!base?.requerido:raw.requerido===true,activo:raw.activo!==false,autocomplete:safeString(base?.autocomplete||'off',35),dependencia:raw.dependencia==='direccion'?'direccion':'siempre'};
   if(base?.dependencia && raw.dependencia===undefined)field.dependencia=base.dependencia;
   if(tipo==='select')field.opciones=Array.isArray(raw.opciones)?[...new Set(raw.opciones.map(x=>safeString(x,80).trim()).filter(Boolean))].slice(0,25):[];
   seen.add(id);result.campos.push(field);
  }
  if(!Array.isArray(input.campos))result.campos=standard.map(x=>({...x}));
  return result;
 }
 function migrateForm(source){
  if(source&&Number(source.version)>=12)return normalize(source);
  // La v11 tenía 6 preguntas fijas; transformamos esas preguntas al flujo v12,
  // sin perder preguntas personalizadas agregadas por la administradora.
  const result=normalize(defaults);
  const extras=Array.isArray(source?.campos)?source.campos.filter(x=>String(x?.id||'').startsWith('extra_')):[];
  const custom=normalize({...result,campos:[...result.campos,...extras]});
  if(source?.titulo && source.titulo!=='Finalizar pedido')custom.titulo=safeString(source.titulo,100);
  if(source?.aviso && !String(source.aviso).startsWith('La página no guarda tus datos'))custom.aviso=safeString(source.aviso,900);
  return custom;
 }
 function upgradeSettings(input){
  const s=structuredClone(input||{});
  const oldPayments=['Pago móvil (por coordinar)','Transferencia bancaria (por coordinar)','Zelle (por coordinar)','Efectivo (por coordinar)','Por acordar en WhatsApp'];
  const oldIsDefault=Array.isArray(s.metodos_pago)&&s.metodos_pago.length===oldPayments.length&&s.metodos_pago.every((x,i)=>x===oldPayments[i]);
  s.metodos_pago=oldIsDefault||!Array.isArray(s.metodos_pago)||!s.metodos_pago.length?[...payDefaults]:s.metodos_pago;
  s.metodos_envio=normalizeShipping(s.metodos_envio);
  const older=!s.formulario_compra||Number(s.formulario_compra.version)<12;
  s.formulario_compra=migrateForm(s.formulario_compra);
  if(!s.mensaje_whatsapp||older && (/Quisiera consultar este pedido|Quisiera pedir:/.test(s.mensaje_whatsapp)))s.mensaje_whatsapp=msgDefault;
  return s;
 }
 function validate(source){
  const cfg=normalize(source);
  if(!cfg.titulo.trim()||!cfg.boton.trim())throw Error('Escribe el título del formulario y el texto del botón.');
  if(cfg.campos.length>18)throw Error('Puedes añadir hasta 18 campos en total.');
  if(!cfg.campos.some(x=>x.activo))throw Error('Debe haber al menos un campo visible.');
  for(const f of cfg.campos){if(!f.etiqueta.trim())throw Error('Todos los campos necesitan un nombre.');if(f.activo&&f.tipo==='select'&&!(f.opciones||[]).length)throw Error('Agrega opciones al campo «'+f.etiqueta+'».');}
  return cfg;
 }
 function customerSummary(cfg,data){
  return normalize(cfg).campos.filter(f=>f.activo && !['pago','envio'].includes(f.id)).map(f=>{const value=safeString(data[f.id]||'',550).trim();return value?f.etiqueta+': '+value:null;}).filter(Boolean).join('\n');
 }
 window.ATLE_FORM={defaults:structuredClone(defaults),paymentDefaults:payDefaults,shippingDefaults:shipDefaults,messageDefault:msgDefault,normalize,normalizeShipping,migrateForm,upgradeSettings,validate,customerSummary};
})();
