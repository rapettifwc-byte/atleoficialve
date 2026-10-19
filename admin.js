'use strict';
/* ATLE STUDIO — interfaz visual del administrador. Las credenciales nunca se guardan aquí. */
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const escapeHTML = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={csrf:null,username:'',settings:{},products:[],editing:null,view:'resumen',saving:false,formEditing:null};
let toastTimeout=null;
function toast(message,error=false){const el=$('#atle-toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),3700);}
function showError(el,msg){el.textContent=msg;el.hidden=!msg;}
function numMoney(n){try{return new Intl.NumberFormat('es-VE',{style:'currency',currency:state.settings.moneda||'USD'}).format(n)}catch(e){return '$'+Number(n).toFixed(2)}}
async function api(url,method='GET',payload){return window.ATLE_DB.api(url,method,payload)}
async function refreshSession(){
 const session=await api('/api/session');
 $('#app-loading').hidden=true;
 state.csrf=null;
 if(session.authenticated){
  state.username=session.username;$('#admin-username').textContent=state.username;
  $('#admin-avatar').textContent=state.username.slice(0,1).toUpperCase();
  $('#screen-app').hidden=false;$('#screen-auth').hidden=true;
  await loadAdmin();
 }else{
  $('#screen-app').hidden=true;$('#screen-auth').hidden=false;
  $('#auth-error').hidden=true;
  const setup=session.setup_required;
  $('#login-form').hidden=setup;$('#setup-form').hidden=!setup;
  $('#auth-title').textContent=setup?'Crea tu acceso.':'Bienvenida.';
  $('#auth-intro').textContent=window.ATLE_DB.configured?'Ingresa con admin (o tu correo) y la contraseña creada en Supabase.':'Primero conecta Supabase en configuracion.js siguiendo la guía incluida.';
 }
}
async function loadAdmin(){
 try{
  const [p,c]=await Promise.all([api('/api/admin/products'),api('/api/admin/settings')]);
  state.products=p.products;state.settings=window.ATLE_FORM.upgradeSettings(c.settings);
  renderDashboard();renderProductList();fillHome();fillOrders();fillCheckoutEditor();navigate(state.view);
 }catch(err){toast(err.message,true)}
}
function navigate(view){
 state.view=view;
 $$('.admin-view').forEach(v=>v.hidden=(v.id!=='view-'+view));
 $$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const labels={resumen:'Resumen',productos:'Productos',inicio:'Página de inicio',pedidos:'Pagos y WhatsApp',formulario:'Formulario de compra',seguridad:'Cuenta y respaldo'};
 $('#breadcrumb').textContent=labels[view]||'';
 $('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'instant'});
}
function renderDashboard(){
 $('#stat-active').textContent=state.products.filter(p=>p.activo!==false).length;
 $('#stat-draft').textContent=state.products.filter(p=>p.activo===false).length;
 $('#stat-payments').textContent=(state.settings.metodos_pago||[]).length;
}
function renderProductList(){
 const text=$('#admin-product-search').value.trim().toLowerCase();
 const items=state.products.filter(p=>(p.nombre+' '+p.categoria).toLowerCase().includes(text));
 $('#product-table-body').innerHTML=items.length?items.map(p=>`
  <tr data-product-id="${escapeHTML(p.id)}">
   <td><div class="product-row-info"><img src="${escapeHTML(photoURL(p.imagen||(p.colores[0]&&p.colores[0].imagen)||'imagenes/legging_oliva.webp'))}" alt=""><div><strong>${escapeHTML(p.nombre)}</strong><small>${escapeHTML(p.id)}</small></div></div></td>
   <td><strong>${escapeHTML(numMoney(p.precio))}</strong></td><td>${escapeHTML(p.categoria)}</td>
   <td><span class="pills${p.activo===false?' off':''}">${p.activo===false?'Oculto':'Publicado'}</span></td>
   <td><div class="actions-inline"><button class="btn tiny secondary" data-edit="${escapeHTML(p.id)}">Editar</button><button class="btn tiny outline" data-toggle="${escapeHTML(p.id)}">${p.activo===false?'Publicar':'Ocultar'}</button><button class="btn tiny warn" data-delete="${escapeHTML(p.id)}">Eliminar</button></div></td>
  </tr>`).join(''):'<tr><td colspan="5"><div class="empty">Todavía no hay productos aquí. Pulsa «Agregar producto» para empezar.</div></td></tr>';
}
async function reloadProducts(){const data=await api('/api/admin/products');state.products=data.products;renderProductList();renderDashboard()}
function photoURL(path){return window.ATLE_DB.photoURL(path)}
function editorDefaults(){return {id:null,nombre:'',categoria:'Leggings',precio:0,imagen:'',imagenes:[],descripcion:'',colores:[{nombre:'Negro',hex:'#292929',imagen:'',imagenes:[],tallas:[]}],tallas:['S','M','L'],etiqueta:'',activo:true,destacado:false}}
function openEditor(p){
 state.editing=structuredClone(p||editorDefaults());
 $('#editor-title').textContent=p?'Editar producto':'Crear nuevo producto';
 $('#product-name').value=state.editing.nombre;
 $('#product-category').value=state.editing.categoria;
 $('#product-price').value=state.editing.precio;
 $('#product-tag').value=state.editing.etiqueta;
 $('#product-description').value=state.editing.descripcion;
 $('#product-sizes').value=state.editing.tallas.join(', ');
 $('#product-active').checked=state.editing.activo!==false;$('#product-featured').checked=state.editing.destacado===true;
 $('#product-cover-preview').src=photoURL(state.editing.imagen);
 $('#product-cover-file').value='';$('#product-gallery-file').value='';
 $('#cover-status').textContent='';$('#gallery-status').textContent='';
 drawEditorGallery();renderColors();$('#product-dialog').showModal();
}
function drawEditorGallery(){
 $('#product-cover-preview').src=photoURL(state.editing.imagen);
 $('#product-gallery').innerHTML=(state.editing.imagenes||[]).map((path,i)=>`<div class="thumb"><img src="${escapeHTML(photoURL(path))}" alt="Foto ${i+1}"><button type="button" data-remove-gallery="${i}" aria-label="Quitar fotografía">×</button></div>`).join('');
}
function colorMarkup(c,i){return `<article class="color-card" data-color-index="${i}">
  <div class="color-card-title"><strong style="font-size:13px;color:#495642">Color ${i+1}</strong><button class="btn tiny warn" type="button" data-remove-color="${i}">Eliminar color ×</button></div>
  <div class="color-fields"><div class="field"><label>Nombre del color *</label><input class="form-control small" data-color-prop="nombre" value="${escapeHTML(c.nombre)}" maxlength="50" placeholder="Ej. Negro"></div>
  <div class="field"><label>Tono</label><input type="color" class="form-control small" data-color-prop="hex" value="${escapeHTML(c.hex)}" aria-label="Elegir tono"></div>
  <div class="field"><label>Tallas de este color <span class="hint">Opcional, separadas por comas</span></label><input class="form-control small" data-color-prop="tallas" value="${escapeHTML((c.tallas||[]).join(', '))}" placeholder="S, M (o vacío: todas)"></div></div>
  <div class="two-col"><div class="upload-zone"><p class="upload-head">Fotografía destacada de este color</p><img src="${escapeHTML(photoURL(c.imagen||state.editing.imagen))}" alt="Foto de color"><input class="file-input" type="file" accept="image/png,image/jpeg,image/webp" data-color-cover="${i}"><div class="upload-status">${c.imagen?'Foto personalizada cargada':'Usa la foto principal hasta que subas una'}</div></div>
  <div class="upload-zone"><p class="upload-head">Galería de este color (opcional)</p><div class="thumbs">${(c.imagenes||[]).map((u,j)=>`<div class="thumb"><img src="${escapeHTML(photoURL(u))}" alt=""><button type="button" data-color-gallery-remove="${i}:${j}" aria-label="Eliminar fotografía">×</button></div>`).join('')}</div><input class="file-input" type="file" accept="image/png,image/jpeg,image/webp" data-color-gallery="${i}" multiple></div></div>
  </article>`}
function renderColors(){
 $('#editor-colors').innerHTML=state.editing.colores.map(colorMarkup).join('');
}
function collectEditor(){
 const p=state.editing;
 p.nombre=$('#product-name').value.trim();p.categoria=$('#product-category').value.trim();
 p.precio=Number($('#product-price').value);p.descripcion=$('#product-description').value.trim();
 p.etiqueta=$('#product-tag').value.trim();p.tallas=parseCSV($('#product-sizes').value);
 p.activo=$('#product-active').checked;p.destacado=$('#product-featured').checked;
 return p;
}
function parseCSV(v){return [...new Set(String(v).split(',').map(x=>x.trim()).filter(Boolean))]}
async function uploadFile(file,status){
 if(!file)throw Error('Selecciona una fotografía primero.');
 if(status)status.textContent='Subiendo fotografía…';
 const result=await window.ATLE_DB.uploadImage(file);
 if(status)status.textContent='Fotografía subida correctamente ✓';
 return result.url;
}
async function uploadMultiple(files,onDone,status){
 const arr=[...files];if(!arr.length)return;
 try{for(let i=0;i<arr.length;i++){if(status)status.textContent=`Subiendo fotografía ${i+1} de ${arr.length}…`;const url=await uploadFile(arr[i]);onDone(url)}if(status)status.textContent='Todas las fotografías se subieron ✓';toast('Fotos cargadas correctamente. Guarda el producto para publicar los cambios.');}
 catch(err){if(status)status.textContent=err.message;toast(err.message,true)}
}
function fillHome(){
 $$('[data-skey]', $('#homepage-form')).forEach(el=>{const value=state.settings[el.dataset.skey];if(el.type==='checkbox')el.checked=!!value;else el.value=value??'';});
 $$('[data-preview-key]').forEach(img=>{img.src=photoURL(state.settings[img.dataset.previewKey])});
}
function fillOrders(){
 $$('[data-skey]', $('#orders-form')).forEach(el=>{const v=state.settings[el.dataset.skey];if(el.type==='checkbox')el.checked=!!v;else el.value=v??'';});
 $('#wa-template').value=state.settings.mensaje_whatsapp||'';
 renderPayments();renderShipping();renderTokens();
}
function collectSettings(form){
 const next=structuredClone(state.settings);
 $$('[data-skey]',form).forEach(el=>{next[el.dataset.skey]=el.type==='checkbox'?el.checked:el.value});
 return next;
}
async function saveSettings(next){
 try{const result=await api('/api/admin/settings','PUT',next);state.settings=window.ATLE_FORM.upgradeSettings(result.settings);renderDashboard();toast('Cambios guardados. Tu tienda ya está actualizada.');return true}
 catch(e){toast(e.message,true);return false}
}
function renderPayments(){
 $('#payments-list').innerHTML=(state.settings.metodos_pago||[]).map((m,i)=>`<div class="item-row" data-payment-index="${i}"><span class="tag-slim">${i+1}.</span><input class="form-control small" value="${escapeHTML(m)}" maxlength="90" aria-label="Método de pago ${i+1}"><button type="button" class="icon-remove" data-remove-payment="${i}" aria-label="Quitar método">×</button></div>`).join('');
}
function renderShipping(){
 $('#shipping-list').innerHTML=(state.settings.metodos_envio||[]).map((m,i)=>`<div class="item-row" data-shipping-index="${i}" style="flex-wrap:wrap;gap:10px"><span class="tag-slim">${i+1}.</span><input class="form-control small" style="flex:1;min-width:190px" value="${escapeHTML(m.nombre)}" maxlength="90" aria-label="Método de envío ${i+1}"><label class="checkline" style="font-size:11px;white-space:nowrap"><input type="checkbox" data-ship-needs-address ${m.requiere_direccion?'checked':''}> Solicitar dirección</label><button type="button" class="icon-remove" data-remove-shipping="${i}" aria-label="Quitar método">×</button></div>`).join('');
}
const TOKENS=['datos_cliente','productos','subtotal','nombre','cedula','telefono','pago','envio','ciudad','direccion','nota','moneda','nota_envio'];
function renderTokens(){$('#message-tokens').innerHTML=TOKENS.map(t=>`<button type="button" class="btn tiny secondary" data-token="${t}" title="Insertar {${t}}">{${t}}</button>`).join('')}
function previewWhatsApp(){
 const template=$('#wa-template').value;
 const demo={productos:'1. Legging Esencial · Verde oliva · M · 1 × $28.00 = $28.00',subtotal:'$28.00',nombre:'María Pérez',cedula:'V-12345678',telefono:'0412 000 0000',ciudad:'Cabimas, Zulia',direccion:'Sector Centro, calle 4',pago:'Pago Móvil / Transferencia Bancaria',nota:'Consultar disponibilidad',moneda:'USD',envio:'Delivery en Cabimas/Maracaibo',nota_envio:state.settings.nota_envio||''};
 const cfg=window.ATLE_FORM.migrateForm(state.settings.formulario_compra);
 demo.datos_cliente=window.ATLE_FORM.customerSummary(cfg,demo);
 const text=template.replace(/\{([a-z_][a-z0-9_]*)\}/gi,(token,k)=>Object.hasOwn(demo,k)?demo[k]:token);
 $('#wa-message-example').textContent=text;$('#wa-message-preview').hidden=false;
}
/* Editor de checkout integrado en Supabase sin cambiar las tablas existentes. */
function fillCheckoutEditor(){
 state.formEditing=window.ATLE_FORM.migrateForm(state.settings.formulario_compra);
 const f=state.formEditing;
 $('#form-title').value=f.titulo;$('#form-intro').value=f.introduccion;
 $('#form-button-text').value=f.boton;$('#form-notice').value=f.aviso;
 renderCheckoutEditor();previewCheckoutEditor();
}
function formEditorCollectText(){
 const f=state.formEditing;
 f.titulo=$('#form-title').value;f.introduccion=$('#form-intro').value;
 f.boton=$('#form-button-text').value;f.aviso=$('#form-notice').value;
 return f;
}
function renderCheckoutEditor(){
 $('#checkout-editor-fields').innerHTML=state.formEditing.campos.map((field,i)=>{
  const opts=field.tipo==='select';
  const isPayment=field.id==='pago';const isShipping=field.id==='envio';const isReserved=isPayment||isShipping;
  return `<div class="checkout-field-card" data-field-index="${i}">
   <div class="checkout-field-top"><div><strong>${escapeHTML(field.etiqueta||'Pregunta nueva')}</strong> <span class="tag-slim">${i+1} / ${state.formEditing.campos.length}${isPayment?' · Métodos de pago':isShipping?' · Métodos de envío':''}</span></div>
   <div class="checkout-field-controls"><button type="button" data-field-action="up" ${i===0?'disabled':''} aria-label="Subir campo">↑</button><button type="button" data-field-action="down" ${i===state.formEditing.campos.length-1?'disabled':''} aria-label="Bajar campo">↓</button>${field.id.startsWith('extra_')?'<button type="button" data-field-action="delete" aria-label="Eliminar pregunta">Quitar ×</button>':''}</div></div>
   <div class="two-col">
    <div class="field"><label>Nombre de la pregunta</label><input class="form-control small" data-field-prop="etiqueta" maxlength="90" value="${escapeHTML(field.etiqueta)}" required></div>
    <div class="field"><label>Tipo de respuesta</label><select class="form-control small" data-field-prop="tipo" ${isReserved?'disabled':''}>
     ${[['text','Texto corto'],['tel','Teléfono'],['email','Correo electrónico'],['textarea','Texto largo'],['select','Lista de opciones'],['payment','Métodos de pago'],['shipping','Métodos de envío']].filter(a=>!['payment','shipping'].includes(a[0])||a[0]==='payment'&&isPayment||a[0]==='shipping'&&isShipping).map(([key,title])=>`<option value="${key}" ${field.tipo===key?'selected':''}>${title}</option>`).join('')}</select></div>
    <div class="field wide"><label>Texto de ejemplo o instrucción</label><input class="form-control small" data-field-prop="placeholder" maxlength="160" value="${escapeHTML(field.placeholder)}" placeholder="Ej. Escribe aquí..."></div>
   </div>
   <div class="field"><label>Mostrar pregunta</label><select class="form-control small" data-field-prop="dependencia"><option value="siempre" ${field.dependencia!=='direccion'?'selected':''}>Siempre</option><option value="direccion" ${field.dependencia==='direccion'?'selected':''}>Solo si el envío requiere dirección</option></select></div>
   ${opts?`<div class="field checkout-options"><label>Opciones para elegir <span class="hint">Una opción por línea</span></label><textarea class="form-control" data-field-prop="opciones" rows="3" placeholder="Opción 1&#10;Opción 2">${escapeHTML((field.opciones||[]).join('\n'))}</textarea></div>`:''}
   <div class="checkout-flags"><label><input type="checkbox" data-field-prop="activo" ${field.activo?'checked':''}> Mostrar esta pregunta</label><label><input type="checkbox" data-field-prop="requerido" ${field.requerido?'checked':''}> Respuesta obligatoria</label></div>
  </div>`;
 }).join('');
}
function previewCheckoutEditor(){
 const cfg=window.ATLE_FORM.normalize(formEditorCollectText());
 const wrap=$('#form-preview');wrap.replaceChildren();
 const title=document.createElement('h3');title.textContent=cfg.titulo;wrap.append(title);
 const intro=document.createElement('p');intro.textContent=cfg.introduccion;wrap.append(intro);
 for(const f of cfg.campos.filter(x=>x.activo)){
  const area=document.createElement('div');area.className='preview-field';
  const label=document.createElement('label');label.textContent=f.etiqueta+(f.requerido?' *':'');area.append(label);
  let input;
  if(f.tipo==='textarea'){input=document.createElement('textarea')}
  else if(['payment','shipping','select'].includes(f.tipo)){
   input=document.createElement('select');input.add(new Option(f.placeholder||'Selecciona',''));
   (f.tipo==='payment'?state.settings.metodos_pago:f.tipo==='shipping'?state.settings.metodos_envio.map(x=>x.nombre):f.opciones||[]).forEach(v=>input.add(new Option(v,v)));
  }else{input=document.createElement('input');input.type=f.tipo}
  if(!['payment','shipping','select'].includes(f.tipo))input.placeholder=f.placeholder;
  input.disabled=true;area.append(input);wrap.append(area);
 }
 const notice=document.createElement('p');notice.textContent='Botón: '+cfg.boton;wrap.append(notice);
 const footer=document.createElement('p');footer.textContent=cfg.aviso;wrap.append(footer);
}
function logoutView(){
 $('#app-loading').hidden=true;$('#screen-app').hidden=true;$('#screen-auth').hidden=false;
}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();showError($('#auth-error'),'');try{await api('/api/login','POST',{usuario:$('#login-user').value,clave:$('#login-pass').value});$('#login-pass').value='';await refreshSession()}catch(err){showError($('#auth-error'),err.message)}});
$('#setup-form').addEventListener('submit',async e=>{e.preventDefault();showError($('#auth-error'),'');const clave=$('#setup-pass').value;if(clave!==$('#setup-pass2').value)return showError($('#auth-error'),'Las contraseñas no coinciden.');try{await api('/api/setup','POST',{codigo:$('#setup-code').value,usuario:$('#setup-user').value,clave});$('#setup-code').value='';$('#setup-pass').value='';$('#setup-pass2').value='';await refreshSession();toast('Cuenta creada. Inicia sesión con tus nuevos datos.')}catch(err){showError($('#auth-error'),err.message)}});
$('#logout-button').addEventListener('click',async()=>{try{await api('/api/logout','POST');state.csrf=null;await refreshSession();toast('Cerraste sesión correctamente.')}catch(e){toast(e.message,true)}});
$('#mobile-nav-button').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$$('[data-view]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
$$('[data-go]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.go)));
$('#admin-product-search').addEventListener('input',renderProductList);
$('#new-product').addEventListener('click',()=>openEditor(null));
$('#refresh-products').addEventListener('click',async()=>{try{await reloadProducts();toast('Productos actualizados.')}catch(e){toast(e.message,true)}});
$('#close-product').addEventListener('click',()=>$('#product-dialog').close());
$('#cancel-product').addEventListener('click',()=>$('#product-dialog').close());
$('#product-table-body').addEventListener('click',async e=>{
 const b=e.target.closest('[data-edit],[data-toggle],[data-delete]');if(!b)return;
 const id=b.dataset.edit||b.dataset.toggle||b.dataset.delete;
 const p=state.products.find(x=>x.id===id);if(!p)return;
 if(b.dataset.edit){openEditor(p);return}
 if(b.dataset.delete && !confirm(`¿Eliminar definitivamente "${p.nombre}"? La prenda desaparece del catálogo. Si prefieres conservarla, usa «Ocultar».`))return;
 try{
  b.disabled=true;
  if(b.dataset.delete){await api('/api/admin/products/'+encodeURIComponent(id),'DELETE');toast('Producto eliminado.');}
  else{await api('/api/admin/products/'+encodeURIComponent(id),'PUT',{...p,activo:p.activo===false});toast('Visibilidad actualizada.');}
  await reloadProducts();
 }catch(err){toast(err.message,true);b.disabled=false}
});
$('#add-color').addEventListener('click',()=>{if(state.editing.colores.length>=30)return toast('Puedes tener hasta 30 colores.',true);state.editing.colores.push({nombre:'',hex:'#7B8B68',imagen:'',imagenes:[],tallas:[]});renderColors();const last=$$('#editor-colors [data-color-prop="nombre"]').at(-1);last?.focus()});
$('#editor-colors').addEventListener('input',e=>{
 const input=e.target.closest('[data-color-prop]');if(!input)return;
 const index=Number(input.closest('[data-color-index]').dataset.colorIndex);
 const prop=input.dataset.colorProp;
 state.editing.colores[index][prop]=prop==='tallas'?parseCSV(input.value):input.value;
});
$('#editor-colors').addEventListener('click',e=>{
 const remove=e.target.closest('[data-remove-color]');
 const gallery=e.target.closest('[data-color-gallery-remove]');
 if(remove){if(state.editing.colores.length<=1)return toast('Debes conservar al menos un color.',true);state.editing.colores.splice(Number(remove.dataset.removeColor),1);renderColors()}
 if(gallery){const [c,i]=gallery.dataset.colorGalleryRemove.split(':').map(Number);state.editing.colores[c].imagenes.splice(i,1);renderColors()}
});
$('#editor-colors').addEventListener('change',async e=>{
 const input=e.target;
 if(input.matches('[data-color-cover]')){
  const i=Number(input.dataset.colorCover),status=input.closest('.upload-zone').querySelector('.upload-status');
  try{input.disabled=true;state.editing.colores[i].imagen=await uploadFile(input.files[0],status);renderColors();toast('Foto de color lista. Guarda el producto.')}
  catch(err){status.textContent=err.message;toast(err.message,true)}finally{input.disabled=false}
 }
 if(input.matches('[data-color-gallery]')){
  const i=Number(input.dataset.colorGallery),files=input.files;
  const zone=input.closest('.upload-zone'),status=zone.querySelector('.upload-status');
  if((state.editing.colores[i].imagenes.length+files.length)>12)return toast('Máximo 12 fotografías por color.',true);
  await uploadMultiple(files,url=>state.editing.colores[i].imagenes.push(url),status);renderColors();
 }
});
$('#product-gallery').addEventListener('click',e=>{const b=e.target.closest('[data-remove-gallery]');if(!b)return;state.editing.imagenes.splice(Number(b.dataset.removeGallery),1);drawEditorGallery()});
$('#product-cover-file').addEventListener('change',async e=>{const input=e.target;try{input.disabled=true;state.editing.imagen=await uploadFile(input.files[0],$('#cover-status'));drawEditorGallery();toast('Foto principal lista. Guarda el producto.')}catch(err){toast(err.message,true);$('#cover-status').textContent=err.message}finally{input.disabled=false}});
$('#product-gallery-file').addEventListener('change',async e=>{const files=[...e.target.files];if((files.length+state.editing.imagenes.length)>12)return toast('Máximo 12 fotografías generales.',true);await uploadMultiple(files,url=>state.editing.imagenes.push(url),$('#gallery-status'));drawEditorGallery();e.target.value=''});
$('#product-form').addEventListener('submit',async e=>{
 e.preventDefault();const b=$('#save-product');if(b.disabled)return;
 const p=collectEditor();
 if(!p.tallas.length)return toast('Agrega al menos una talla, por ejemplo S, M, L.',true);
 if(!p.colores.length || p.colores.some(c=>!c.nombre.trim()))return toast('Cada color necesita un nombre.',true);
 try{b.disabled=true;b.textContent='Guardando...';
  if(p.id)await api('/api/admin/products/'+encodeURIComponent(p.id),'PUT',p);
  else await api('/api/admin/products','POST',p);
  $('#product-dialog').close();await reloadProducts();toast('Producto guardado correctamente. Ya puedes verlo en tu tienda.');
 }catch(err){toast(err.message,true)}finally{b.disabled=false;b.textContent='Guardar producto ✓'}
});
$$('[data-setting-upload]').forEach(inp=>inp.addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;const key=e.target.dataset.settingUpload,el=e.target;
 const box=el.closest('.upload-zone');const status=box.querySelector('.upload-status');
 try{el.disabled=true;const path=await uploadFile(file,status);state.settings[key]=path;const preview=$(`[data-preview-key="${key}"]`);if(preview)preview.src=photoURL(path);toast('Foto lista. Pulsa «Guardar cambios» para publicarla.')}catch(err){status.textContent=err.message;toast(err.message,true)}finally{el.disabled=false}
}));
$('#homepage-form').addEventListener('submit',async e=>{e.preventDefault();const settings=collectSettings(e.target);if(await saveSettings(settings))fillHome()});
$('#payments-list').addEventListener('input',e=>{const row=e.target.closest('[data-payment-index]');if(row)state.settings.metodos_pago[Number(row.dataset.paymentIndex)]=e.target.value});
$('#payments-list').addEventListener('click',e=>{const b=e.target.closest('[data-remove-payment]');if(!b)return;if(state.settings.metodos_pago.length<=1)return toast('Agrega otra forma de pago antes de borrar esta.',true);state.settings.metodos_pago.splice(Number(b.dataset.removePayment),1);renderPayments()});
$('#add-payment').addEventListener('click',()=>{state.settings.metodos_pago.push('Nuevo método');renderPayments();$$('#payments-list input').at(-1).focus();$$('#payments-list input').at(-1).select()});
$('#shipping-list').addEventListener('input',e=>{const row=e.target.closest('[data-shipping-index]');if(!row)return;const i=Number(row.dataset.shippingIndex);if(e.target.matches('input[type=checkbox]'))state.settings.metodos_envio[i].requiere_direccion=e.target.checked;else state.settings.metodos_envio[i].nombre=e.target.value;});
$('#shipping-list').addEventListener('click',e=>{const btn=e.target.closest('[data-remove-shipping]');if(!btn)return;if(state.settings.metodos_envio.length<=1)return toast('Debe existir al menos una forma de envío.',true);state.settings.metodos_envio.splice(Number(btn.dataset.removeShipping),1);renderShipping();});
$('#add-shipping').addEventListener('click',()=>{state.settings.metodos_envio.push({nombre:'Nueva opción de envío',requiere_direccion:true});renderShipping();const input=$$('#shipping-list input[type=text],#shipping-list input:not([type])').at(-1);if(input){input.focus();input.select();}});
$('#orders-form').addEventListener('submit',async e=>{e.preventDefault();const next=collectSettings(e.target);next.metodos_pago=[...new Set(state.settings.metodos_pago.map(x=>x.trim()).filter(Boolean))];next.metodos_envio=window.ATLE_FORM.normalizeShipping(state.settings.metodos_envio);next.mensaje_whatsapp=$('#wa-template').value;if(await saveSettings(next))fillOrders()});
$('#apply-atle-payments').addEventListener('click',()=>{if(!confirm('¿Usar las cuatro formas de pago sugeridas por ATLE? Podrás volver a editarlas. Recuerda guardar.'))return;state.settings.metodos_pago=[...window.ATLE_FORM.paymentDefaults];renderPayments();toast('Opciones propuestas. Pulsa «Guardar cambios».');});
$('#apply-atle-shipping').addEventListener('click',()=>{if(!confirm('¿Usar los tres métodos de entrega propuestos? Recuerda guardar.'))return;state.settings.metodos_envio=structuredClone(window.ATLE_FORM.shippingDefaults);renderShipping();toast('Métodos propuestos. Pulsa «Guardar cambios».');});
$('#apply-atle-message').addEventListener('click',()=>{if(!confirm('¿Usar el mensaje recomendado de ATLE? Se reemplazará el texto del editor, pero no se guardará hasta que pulses «Guardar cambios».'))return;$('#wa-template').value=window.ATLE_FORM.messageDefault;previewWhatsApp();});
$('#message-tokens').addEventListener('click',e=>{
 const btn=e.target.closest('[data-token]');if(!btn)return;const ta=$('#wa-template');const token='{'+btn.dataset.token+'}';
 const start=ta.selectionStart,end=ta.selectionEnd;ta.setRangeText(token,start,end,'end');ta.focus();
});
$('#preview-message').addEventListener('click',previewWhatsApp);
$('#password-form').addEventListener('submit',async e=>{
 e.preventDefault();const actual=$('#password-current').value,nueva=$('#password-new').value;
 if(nueva!==$('#password-repeat').value)return toast('Las contraseñas no coinciden.',true);
 try{await api('/api/admin/password','PUT',{actual,nueva});e.target.reset();toast('Contraseña actualizada.')}catch(err){toast(err.message,true)}
});
$('#backup-button').addEventListener('click',async()=>{
 try{
  const result=await window.ATLE_DB.backup();
  const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='ATLE_respaldo_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Respaldo JSON descargado. Guarda las fotos originales también desde Supabase Storage.');
 }catch(err){toast(err.message,true)}
});
$('#checkout-editor-fields').addEventListener('input',e=>{
 const row=e.target.closest('[data-field-index]');if(!row)return;
 const field=state.formEditing.campos[Number(row.dataset.fieldIndex)];if(!field)return;
 const prop=e.target.dataset.fieldProp;if(!prop)return;
 if(prop==='activo'||prop==='requerido')field[prop]=e.target.checked;
 else if(prop==='opciones')field.opciones=[...new Set(e.target.value.split('\n').map(v=>v.trim()).filter(Boolean))];
 else field[prop]=e.target.value;
 if(prop==='etiqueta')row.querySelector('.checkout-field-top strong').textContent=field.etiqueta||'Pregunta nueva';
});
$('#checkout-editor-fields').addEventListener('change',e=>{
 if(e.target.dataset.fieldProp==='tipo'){
  const row=e.target.closest('[data-field-index]');const field=state.formEditing.campos[Number(row.dataset.fieldIndex)];
  field.tipo=e.target.value;if(field.tipo==='select'&&!Array.isArray(field.opciones))field.opciones=[];
  renderCheckoutEditor();
 }
});
$('#checkout-editor-fields').addEventListener('click',e=>{
 const btn=e.target.closest('[data-field-action]');if(!btn)return;
 const row=btn.closest('[data-field-index]');const index=Number(row.dataset.fieldIndex);
 const arr=state.formEditing.campos;
 if(btn.dataset.fieldAction==='delete'){
  if(!confirm('¿Quitar esta pregunta del formulario? Se eliminará al guardar.'))return;
  arr.splice(index,1);
 }else{
  const dest=index+(btn.dataset.fieldAction==='up'?-1:1);
  if(dest<0||dest>=arr.length)return;
  [arr[index],arr[dest]]=[arr[dest],arr[index]];
 }
 renderCheckoutEditor();
});
$('#form-add-field').addEventListener('click',()=>{
 if(state.formEditing.campos.length>=18)return toast('Puedes configurar hasta 18 preguntas.',true);
 const id='extra_'+Array.from(crypto.getRandomValues(new Uint8Array(7)),x=>x.toString(16).padStart(2,'0')).join('');
 state.formEditing.campos.push({id,etiqueta:'Nueva pregunta',tipo:'text',placeholder:'',requerido:false,activo:true,autocomplete:'off'});
 renderCheckoutEditor();
 const inp=$$('#checkout-editor-fields [data-field-prop="etiqueta"]').at(-1);inp.focus();inp.select();
});
$('#form-reset-fields').addEventListener('click',()=>{
 if(!confirm('¿Restaurar las 8 preguntas recomendadas de ATLE v12? Se descartarán los cambios NO guardados en las preguntas.'))return;
 state.formEditing.campos=window.ATLE_FORM.normalize().campos;
 renderCheckoutEditor();previewCheckoutEditor();
});
$('#form-show-preview').addEventListener('click',previewCheckoutEditor);
$('#checkout-editor-form').addEventListener('submit',async e=>{
 e.preventDefault();
 try{
  const updated=window.ATLE_FORM.validate(formEditorCollectText());
  const next=structuredClone(state.settings);next.formulario_compra=updated;
  if(await saveSettings(next)){fillCheckoutEditor();toast('Formulario publicado. Los nuevos campos ya aparecen en tu tienda.');}
 }catch(err){toast(err.message,true)}
});
refreshSession().catch(e=>{
 const area=$('#app-loading');
 area.textContent='';
 const content=document.createElement('div');
 content.style.cssText='text-align:center;max-width:430px;margin:auto;padding:24px;line-height:1.8';
 const heading=document.createElement('h2');heading.textContent='No pudimos conectar con ATLE Studio';
 const body=document.createElement('p');body.textContent=String(e?.message||'Comprueba si tu proyecto de Supabase está pausado, su conexión y tu red.');
 const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Reintentar conexión ↻';
 retry.addEventListener('click',()=>location.reload());
 const help=document.createElement('p');help.style.cssText='font-size:12px;color:#776c70;margin-top:16px';
 help.textContent='Si usas Supabase gratuito, revisa que el proyecto figure como Healthy y no como Paused.';
 content.append(heading,body,retry,help);area.append(content);
 console.error('ATLE Studio conexión:',e);
});
