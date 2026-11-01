'use strict';
/* ATLE Studio · Inventario privado con variantes libres, costos y ventas manuales. */
(function(){
 const el=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const N=v=>Number(v);
 const money=v=>Number(v||0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2});
 const DB=()=>window.ATLE_DB;
 const stockState={rows:[],stock:[],sales:[],saleItems:[],currentProduct:'',editingRows:[],referenceImage:'',useCover:true,lines:[],busy:false,initialized:false,invoiceKey:null};
 const product=id=>state.products.find(p=>p.id===id);
 const info=id=>stockState.rows.find(r=>r.product_id===id);
 const bySku=sku=>stockState.rows.find(r=>r.sku.toUpperCase()===String(sku||'').trim().toUpperCase());
 function error(err){toast(err?.message||String(err),true)}
 function notice(text,isError=false){const e=el('inv-notice');e.textContent=text;e.hidden=false;e.className='panel-note'+(isError?' alert':'')}
 function variantsFromCatalog(p){const rows=[];for(const c of p?.colores||[]){for(const size of (c.tallas?.length?c.tallas:p.tallas||[])){if(!rows.some(v=>v.color===c.nombre&&v.size===size))rows.push({color:c.nombre,size,quantity:0});}}return rows;}
 function variants(id){return stockState.stock.filter(r=>r.product_id===id)}
 function totalCost(){return Math.round(((N(el('inv-cost').value)||0)+(N(el('inv-logistics').value)||0))*100)/100}
 function privatePrice(){return Math.round(totalCost()*(1+(N(el('inv-markup').value)||0)/100)*100)/100}
 function referencePhoto(p){return stockState.useCover&&p?.imagen?p.imagen:stockState.referenceImage||p?.imagen||''}
 function suggestSku(){const used=new Set(stockState.rows.map(x=>x.sku));let i=1;while(used.has('ATLE-'+String(i).padStart(3,'0')))i++;return 'ATLE-'+String(i).padStart(3,'0')}
 async function load(){
  const [r,s]=await Promise.all([DB().inventoryLoad(),DB().inventorySales()]);
  stockState.rows=r.products;stockState.stock=r.stock;stockState.sales=s.sales;stockState.saleItems=s.items;stockState.initialized=true;
  el('inv-notice').hidden=true;drawProducts();renderSelect();renderSales();
  if(stockState.currentProduct&&product(stockState.currentProduct))openProduct(stockState.currentProduct);
  else el('inv-product-form').hidden=true;
  drawLines();
 }
 async function init(){try{await load()}catch(e){stockState.initialized=false;notice('El inventario requiere ejecutar INSTALAR_O_ACTUALIZAR_ATLE.sql en Supabase → SQL Editor. '+e.message,true)}}
 function drawProducts(){
  const q=(el('inv-search').value||'').trim().toLowerCase();
  const products=state.products.filter(p=>(p.nombre+' '+(info(p.id)?.sku||'')).toLowerCase().includes(q));
  el('inv-table').innerHTML=products.map(p=>{
   const r=info(p.id),count=variants(p.id).reduce((a,b)=>a+Number(b.quantity),0),full=!!r?.stock_enabled,photo=referencePhotoForList(p,r);
   return `<tr><td><div class="product-row-info">${photo?`<img src="${safe(DB().photoURL(photo))}" alt="">`:`<span class="inv-photo-empty">Sin foto</span>`}<div><strong>${safe(p.nombre)}</strong><small>${safe(r?.sku||'Sin SKU · Configurar')}</small></div></div></td><td>${full?count:'Sin configurar'}</td><td>${full?'$'+money(Number(r.cost_usd)+Number(r.logistics_usd||0)):'—'}</td><td>${full?'$'+money(r.price_usd):'—'}</td><td>$${money(r?.price_bcv??p.precio)}</td><td><button type="button" class="btn tiny secondary" data-inv-product="${safe(p.id)}">${full?'Administrar':'Configurar'}</button></td></tr>`;
  }).join('')||'<tr><td colspan="6">No se encontraron modelos.</td></tr>';
  el('inv-count').textContent=stockState.rows.filter(x=>x.stock_enabled).length+' modelos configurados · '+stockState.stock.reduce((s,x)=>s+Number(x.quantity),0)+' unidades';
 }
 function referencePhotoForList(p,r){return (r?.use_cover_image!==false&&p.imagen)?p.imagen:r?.reference_image||p.imagen||p.colores?.[0]?.imagen||''}
 function renderSelect(){const sel=el('inv-product-choice');sel.innerHTML='<option value="">Selecciona un modelo…</option>'+state.products.map(p=>`<option value="${safe(p.id)}">${safe(p.nombre)}${info(p.id)?' · '+safe(info(p.id).sku):''}</option>`).join('');sel.value=product(stockState.currentProduct)?stockState.currentProduct:''}
 function openProduct(id){
  const p=product(id);if(!p)return;stockState.currentProduct=id;
  renderSelect();el('inv-product-choice').value=id;el('inv-product-form').hidden=false;
  const r=info(id);el('inv-title').textContent=p.nombre;
  el('inv-sku').value=r?.sku||suggestSku();el('inv-cost').value=r?.cost_usd??0;
  el('inv-logistics').value=r?.logistics_usd??0;el('inv-markup').value=r?.markup_pct??40;
  el('inv-bcv').value=r?.price_bcv??p.precio;
  stockState.referenceImage=r?.reference_image||'';stockState.useCover=r?.use_cover_image!==false;
  el('inv-use-cover').checked=stockState.useCover;
  stockState.editingRows=r?.stock_enabled?variants(id).map(v=>({color:v.color,size:v.size,quantity:v.quantity})):variantsFromCatalog(p);
  el('inv-sync-note').textContent=r?.stock_enabled?'Los colores y tallas que guardes aquí serán las variantes del catálogo. Las fotos públicas se administran en Productos.':'Configura el SKU, el costo y las combinaciones reales. No se publicarán prendas nuevas sin pasar por Productos.';
  drawVariants();drawValuation();drawReference();
 }
 function collectQuantities(){
  const fields=el('inv-stock-grid').querySelectorAll('[data-inv-qty]');
  for(const field of fields){const i=Number(field.dataset.invQty);if(stockState.editingRows[i])stockState.editingRows[i].quantity=field.value}
 }
 function drawVariants(){
  el('inv-stock-grid').innerHTML=stockState.editingRows.map((v,i)=>`<div class="inv-stock-row"><span title="Color">${safe(v.color)}</span><span title="Talla">${safe(v.size)}</span><input type="number" class="form-control small" inputmode="numeric" min="0" max="999999" step="1" data-inv-qty="${i}" value="${safe(v.quantity)}" aria-label="Unidades de ${safe(v.color)}, talla ${safe(v.size)}"><button type="button" class="btn tiny outline" data-inv-remove-variant="${i}" aria-label="Quitar combinación">×</button></div>`).join('')||'<p class="help">Añade libremente los colores y tallas que recibiste. Puedes escribir cualquier nombre de color.</p>';
  drawValuation();
 }
 function drawReference(){
  const p=product(stockState.currentProduct);const path=referencePhoto(p);
  const img=el('inv-reference-preview');img.hidden=!path;if(path)img.src=DB().photoURL(path);img.alt='Referencia privada del modelo';el('inv-reference-empty').hidden=!!path;
  el('inv-reference-hint').textContent=stockState.useCover&&p?.imagen?'Se utiliza la misma imagen de portada del catálogo.':'Esta foto solo sirve para reconocer el modelo en Inventario; no se publicará automáticamente.';
 }
 function drawValuation(){
  const cost=totalCost(),margin=N(el('inv-markup').value)||0,usd=privatePrice();
  el('inv-total-cost').textContent='$'+money(cost);
  el('inv-usd').value=usd.toFixed(2);
  const qty=[...el('inv-stock-grid').querySelectorAll('[data-inv-qty]')].reduce((s,x)=>s+Math.max(0,N(x.value)||0),0);
  el('inv-product-total').textContent=String(qty);
  el('inv-product-value').textContent='$'+money(qty*cost);
  el('inv-estimated').textContent='Ganancia estimada sobre el costo: $'+money(usd-cost)+' por pieza ('+money(margin)+' %). El precio BCV se escribe manualmente.';
 }
 async function createModel(){
  const name=el('inv-new-name').value.trim(),sku=el('inv-new-sku').value.trim().toUpperCase(),category=el('inv-new-category').value.trim()||'Otros';
  if(!name||name.length>90)throw Error('Escribe el nombre del nuevo modelo.');
  if(!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(sku))throw Error('El SKU debe tener entre 2 y 40 letras, números, guiones o guiones bajos.');
  if(bySku(sku))throw Error('Ya existe ese SKU. Selecciona su modelo en Inventario.');
  const p={nombre:name,categoria:category,precio:0,imagen:'',imagenes:[],descripcion:'',colores:[{nombre:'Sin definir',hex:'#777777',imagen:'',imagenes:[],tallas:['Única']}],tallas:['Única'],etiqueta:'',activo:false,destacado:false};
  const result=await DB().api('/api/admin/products','POST',p);
  await reloadProducts();
  stockState.currentProduct=result.product.id;openProduct(result.product.id);el('inv-sku').value=sku;
  stockState.editingRows=[];drawVariants();
  el('inv-new-model').hidden=true;el('inv-new-name').value='';el('inv-new-sku').value='';
  toast('Modelo privado creado. Añade colores y tallas y guarda el inventario antes de publicarlo.');
 }
 function addVariant(){
  collectQuantities();const color=el('inv-new-color').value.trim(),size=el('inv-new-size').value.trim(),q=el('inv-new-qty').value.trim();
  if(!color||color.length>50||!size||size.length>30)throw Error('Escribe un color (hasta 50 caracteres) y una talla (hasta 30).');
  if(q===''||!/^\d{1,6}$/.test(q))throw Error('La cantidad debe ser un número entero de 0 a 999999.');
  if(stockState.editingRows.length>=300)throw Error('Máximo 300 combinaciones por modelo.');
  if(stockState.editingRows.some(v=>v.color.toLocaleLowerCase()===color.toLocaleLowerCase()&&v.size.toLocaleLowerCase()===size.toLocaleLowerCase()))throw Error('Esa combinación ya existe. Ajusta su cantidad en la tabla.');
  stockState.editingRows.push({color,size,quantity:Number(q)});drawVariants();
  el('inv-new-color').value='';el('inv-new-size').value='';el('inv-new-qty').value='0';el('inv-new-color').focus();
 }
 function firstSaleVariant(id){return stockState.stock.find(v=>v.product_id===id&&Number(v.quantity)>0)}
 function addLine(){const p=state.products.find(x=>info(x.id)?.stock_enabled&&firstSaleVariant(x.id));if(!p)throw Error('No hay prendas con existencias disponibles.');const v=firstSaleVariant(p.id);stockState.lines.push({key:crypto.randomUUID(),product_id:p.id,color:v.color,size:v.size,qty:1,price:null});drawLines()}
 function saleOptions(id){return state.products.filter(p=>info(p.id)?.stock_enabled&&variants(p.id).some(v=>Number(v.quantity)>0)).map(p=>`<option value="${safe(p.id)}"${p.id===id?' selected':''}>${safe(p.nombre)} (${safe(info(p.id).sku)})</option>`).join('')}
 function optionVariant(l,kind){const vs=stockState.stock.filter(x=>x.product_id===l.product_id&&(kind!=='size'||x.color===l.color));return [...new Set(vs.map(v=>v[kind]))].map(x=>`<option value="${safe(x)}"${x===l[kind]?' selected':''}>${safe(x)}</option>`).join('')}
 function priceFor(line){const rec=info(line.product_id);return el('inv-sale-currency').value==='USD'?Number(rec?.price_usd||0):0}
 function drawLines(){
  el('inv-lines').innerHTML=stockState.lines.map((l,i)=>{
   const current=stockState.stock.find(s=>s.product_id===l.product_id&&s.color===l.color&&s.size===l.size);
   return `<div class="inv-line" data-inv-line="${i}"><div class="inv-line-head"><strong>Prenda ${i+1}</strong><button class="btn tiny outline" type="button" data-inv-remove="${i}">Quitar ×</button></div><div class="inv-line-fields"><label>Producto<select class="form-control small" data-inv-field="product_id">${saleOptions(l.product_id)}</select></label><label>Color<select class="form-control small" data-inv-field="color">${optionVariant(l,'color')}</select></label><label>Talla<select class="form-control small" data-inv-field="size">${optionVariant(l,'size')}</select></label><label>Cantidad<input class="form-control small" type="number" min="1" max="999999" step="1" data-inv-field="qty" value="${l.qty}"></label><label>Precio unitario (${el('inv-sale-currency').value==='USD'?'USD':'Bs'})<input class="form-control small" type="number" min="0" step="0.01" data-inv-field="price" value="${l.price===null?priceFor(l).toFixed(2):l.price}"></label></div><small class="inv-stock-hint">Disponibles: ${current?.quantity??0} · ${el('inv-sale-currency').value==='VES'?'Introduce el precio cobrado en bolívares; no se aplica ninguna conversión automática.':'Precio sugerido desde el inventario.'}</small></div>`;
  }).join('')||'<p class="help">Agrega una prenda para comenzar.</p>';updateTotal();
 }
 function updateTotal(){const total=stockState.lines.reduce((sum,l)=>sum+Number(l.qty)*(l.price===null?priceFor(l):Number(l.price)),0);el('inv-sale-total').textContent=(el('inv-sale-currency').value==='USD'?'$':'Bs ')+money(total);el('inv-sale-count').textContent=stockState.lines.reduce((sum,l)=>sum+Number(l.qty),0)+' unidad(es)'}
 function onLineChange(e){const root=e.target.closest('[data-inv-line]');if(!root)return;const l=stockState.lines[Number(root.dataset.invLine)],field=e.target.dataset.invField;if(!l||!field)return;
  if(field==='product_id'){l.product_id=e.target.value;const v=firstSaleVariant(l.product_id);l.color=v?.color||'';l.size=v?.size||'';l.price=null}
  else if(field==='color'){l.color=e.target.value;const v=stockState.stock.find(x=>x.product_id===l.product_id&&x.color===l.color);l.size=v?.size||''}
  else if(field==='size')l.size=e.target.value;
  else if(field==='qty')l.qty=Number(e.target.value);
  else if(field==='price')l.price=Number(e.target.value);
  if(field==='product_id'||field==='color')drawLines();else updateTotal();
 }
 function resetSale(){stockState.lines=[];stockState.invoiceKey=crypto.randomUUID();el('inv-sale-notes').value='';drawLines()}
 function renderSales(){
  el('inv-sale-table').innerHTML=stockState.sales.map(s=>{
   const items=stockState.saleItems.filter(x=>x.sale_id===s.id);
   const summary=items.map(x=>`${x.quantity}× ${x.product_name} (${x.color}/${x.size})`).join(' · ');
   return `<tr><td>${safe(new Date(s.created_at).toLocaleString('es-VE'))}</td><td><strong>${s.currency==='USD'?'$':'Bs '}${money(s.total)}</strong><small style="display:block">${s.status==='void'?'ANULADA':'Confirmada'}</small></td><td>${safe(summary)}</td><td title="${safe(s.notes)}">${safe(s.notes||'—')}</td><td>${s.status==='confirmed'?`<button type="button" class="btn tiny outline" data-void-sale="${safe(s.id)}">Anular</button>`:'—'}</td></tr>`;
  }).join('')||'<tr><td colspan="5">Aún no has registrado ventas.</td></tr>';
 }
 function csvCell(val){let t=String(val??'');if(/^[=+\-@\t\r]/.test(t.trimStart()))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'}
 function downloadCSV(name,rows){const body='\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),blob=new Blob([body],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
 async function exportInventory(){await load();const rows=[['SKU','Modelo','Categoría','Color','Talla','Unidades','Costo prenda USD','Logística USD','Costo total USD','Ganancia %','Precio divisas USD','Precio BCV referencia USD','Valor inventario USD','Publicado']];
  for(const p of state.products){const r=info(p.id);if(!r)continue;for(const v of variants(p.id))rows.push([r.sku,p.nombre,p.categoria,v.color,v.size,v.quantity,r.cost_usd,r.logistics_usd||0,Number(r.cost_usd)+Number(r.logistics_usd||0),r.markup_pct,r.price_usd,r.price_bcv,Number(v.quantity)*(Number(r.cost_usd)+Number(r.logistics_usd||0)),p.activo?'Sí':'No']);}
  downloadCSV('ATLE_Inventario_'+new Date().toISOString().slice(0,10)+'.csv',rows);toast('Inventario exportado para Excel.');
 }
 async function exportSales(){const s=await DB().inventorySales();stockState.sales=s.sales;stockState.saleItems=s.items;renderSales();const rows=[['Fecha','ID venta','Estado','SKU','Producto','Color','Talla','Cantidad','Moneda','Precio unitario cobrado','Subtotal cobrado','Total de venta','Costo unitario USD (con logística)','Notas']];
  for(const sale of s.sales)for(const v of s.items.filter(i=>i.sale_id===sale.id))rows.push([sale.created_at,sale.id,sale.status,v.sku,v.product_name,v.color,v.size,v.quantity,sale.currency,v.unit_price,v.line_total,sale.total,v.unit_cost_usd,sale.notes]);
  downloadCSV('ATLE_Ventas_'+new Date().toISOString().slice(0,10)+'.csv',rows);toast('Ventas exportadas para Excel.');
 }
 document.addEventListener('DOMContentLoaded',()=>{
  el('inv-search').addEventListener('input',drawProducts);
  el('inv-table').addEventListener('click',e=>{const b=e.target.closest('[data-inv-product]');if(b){openProduct(b.dataset.invProduct);el('inv-product-form').scrollIntoView({behavior:'smooth',block:'start'})}});
  el('inv-product-choice').addEventListener('change',e=>{if(e.target.value)openProduct(e.target.value);else{stockState.currentProduct='';el('inv-product-form').hidden=true}});
  el('inv-show-new').addEventListener('click',()=>{el('inv-new-model').hidden=!el('inv-new-model').hidden;el('inv-new-sku').value=suggestSku()});
  el('inv-create-model').addEventListener('click',async e=>{try{e.target.disabled=true;await createModel()}catch(err){error(err)}finally{e.target.disabled=false}});
  el('inv-new-category').value='Leggings';
  el('inv-add-variant').addEventListener('click',()=>{try{addVariant()}catch(err){error(err)}});
  el('inv-stock-grid').addEventListener('input',drawValuation);
  el('inv-stock-grid').addEventListener('click',e=>{const b=e.target.closest('[data-inv-remove-variant]');if(!b)return;collectQuantities();const v=stockState.editingRows[Number(b.dataset.invRemoveVariant)];if(v&&Number(v.quantity)>0){toast('Primero cambia sus unidades a 0, guarda y después podrás retirar la combinación.',true);return;}stockState.editingRows.splice(Number(b.dataset.invRemoveVariant),1);drawVariants()});
  ['inv-cost','inv-logistics','inv-markup','inv-bcv'].forEach(id=>el(id).addEventListener('input',drawValuation));
  el('inv-use-cover').addEventListener('change',e=>{stockState.useCover=e.target.checked;drawReference()});
  el('inv-reference-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{e.target.disabled=true;el('inv-reference-status').textContent='Subiendo referencia…';const up=await DB().uploadImage(file);stockState.referenceImage=up.url;stockState.useCover=false;el('inv-use-cover').checked=false;drawReference();el('inv-reference-status').textContent='Referencia cargada. Pulsa Guardar inventario para conservarla.'}catch(err){error(err);el('inv-reference-status').textContent=err.message}finally{e.target.disabled=false}});
  el('inv-product-form').addEventListener('submit',async e=>{
   e.preventDefault();const id=stockState.currentProduct,b=el('inv-save-product');if(!id||b.disabled)return;
   try{b.disabled=true;collectQuantities();
    const vs=stockState.editingRows.map(v=>({...v,quantity:Number(v.quantity)}));
    if(!vs.length||vs.length>300||vs.some(v=>!v.color.trim()||!v.size.trim()||!Number.isInteger(v.quantity)||v.quantity<0||v.quantity>999999))throw Error('Añade entre 1 y 300 combinaciones con cantidades enteras válidas.');
    if(new Set(vs.map(v=>v.color.toLocaleLowerCase()+'\u001f'+v.size.toLocaleLowerCase())).size!==vs.length)throw Error('Hay colores y tallas repetidos.');
    if(product(id)?.activo&&vs.every(v=>v.quantity===0)&&!confirm('TODAS las variantes tienen 0 unidades. Este producto dejará de aparecer en tu catálogo público mientras esté agotado. ¿Guardar igualmente?'))return;
    const cost=N(el('inv-cost').value),logistics=N(el('inv-logistics').value),markup=N(el('inv-markup').value),bcv=N(el('inv-bcv').value),usd=privatePrice();
    if([cost,logistics,markup,bcv].some(x=>!Number.isFinite(x)||x<0)||markup>10000)throw Error('Comprueba costos, porcentaje y precio BCV. Todos deben ser válidos.');
    await DB().inventorySaveProduct({product_id:id,sku:el('inv-sku').value.trim().toUpperCase(),cost,logistics,usd,bcv,markup,reference:stockState.referenceImage,useCover:stockState.useCover,variants:vs});
    await reloadProducts();await load();stockState.currentProduct=id;openProduct(id);toast('SKU, colores, tallas, costos y existencias guardados.');
   }catch(err){error(err)}finally{b.disabled=false}
  });
  el('inv-add-line').addEventListener('click',()=>{try{addLine()}catch(err){error(err)}});
  el('inv-lines').addEventListener('change',onLineChange);
  el('inv-lines').addEventListener('input',e=>{if(['qty','price'].includes(e.target.dataset.invField))onLineChange(e)});
  el('inv-lines').addEventListener('click',e=>{const b=e.target.closest('[data-inv-remove]');if(b){stockState.lines.splice(Number(b.dataset.invRemove),1);drawLines()}});
  el('inv-sale-currency').addEventListener('change',()=>{stockState.lines.forEach(l=>l.price=null);drawLines()});
  el('inv-sale-form').addEventListener('submit',async e=>{
   e.preventDefault();if(stockState.busy)return;
   try{if(!stockState.lines.length)throw Error('Añade al menos una prenda.');
    const items=stockState.lines.map(l=>({product_id:l.product_id,color:l.color,size:l.size,quantity:l.qty,unit_price:Math.round((l.price===null?priceFor(l):l.price)*100)/100}));
    if(items.some(i=>!i.product_id||!i.color||!i.size||!Number.isInteger(i.quantity)||i.quantity<1||!Number.isFinite(i.unit_price)||i.unit_price<=0))throw Error('Comprueba cantidades y precios cobrados (mayores que cero).');
    if(!confirm('¿Confirmar esta venta completa y descontar las existencias?'))return;
    stockState.busy=true;el('inv-confirm-sale').disabled=true;
    await DB().inventoryRecordSale({request_id:stockState.invoiceKey,currency:el('inv-sale-currency').value,notes:el('inv-sale-notes').value,items});
    resetSale();await load();toast('Venta registrada y stock descontado.');
   }catch(err){error(err)}finally{stockState.busy=false;el('inv-confirm-sale').disabled=false}
  });
  el('inv-sale-table').addEventListener('click',async e=>{const b=e.target.closest('[data-void-sale]');if(!b)return;if(!confirm('¿Anular la venta y devolver sus prendas al inventario?'))return;try{b.disabled=true;await DB().inventoryVoidSale(b.dataset.voidSale);await load();toast('Venta anulada; stock repuesto.')}catch(err){error(err)}finally{b.disabled=false}});
  el('inv-export-inventory').addEventListener('click',()=>exportInventory().catch(error));
  el('inv-export-sales').addEventListener('click',()=>exportSales().catch(error));
  el('inv-reload').addEventListener('click',()=>load().catch(error));
  resetSale();
 });
 window.ATLE_INVENTORY={init,refresh:async()=>{if(stockState.initialized)await load()},state:stockState,bySku,getInfo:info,variants};
})();
