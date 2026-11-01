'use strict';
/* ATLE Studio · Inventario privado y ventas manuales. No modifica el checkout público. */
(function(){
 const el=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(n,d=2)=>Number(n||0).toLocaleString('es-VE',{minimumFractionDigits:d,maximumFractionDigits:d});
 const whole=v=>Math.max(0,Math.floor(Number(v)||0));
 const N=v=>Number(v)||0;
 const stockState={rows:[],stock:[],rates:{bcv:890,replacement:1000,rounding:.5},sales:[],saleItems:[],currentProduct:'',editingRows:[],lines:[],busy:false,initialized:false,invoiceKey:null};
 const DB=()=>window.ATLE_DB;
 const product=id=>state.products.find(p=>p.id===id);
 function notice(text,isError=false){let e=el('inv-notice');e.textContent=text;e.hidden=false;e.className='panel-note'+(isError?' alert':'')}
 function error(e){toast(e?.message||String(e),true)}
 const parse=(v)=>String(v||'').split(',').map(s=>s.trim()).filter(Boolean);
 function activeVariants(p){
  if(!p)return[];
  const out=[];
  for(const c of p.colores||[]){const sizes=(c.tallas&&c.tallas.length)?c.tallas:(p.tallas||[]);for(const s of sizes)if(!out.some(x=>x.color===c.nombre&&x.size===s))out.push({color:c.nombre,size:s});}
  return out;
 }
 function pricing(r=stockState.rates){return {bcv:N(r.bcv)||890,replacement:N(r.replacement)||1000,rounding:N(r.rounding)}}
 function calcPrices(cost,pct,round){
  const r=pricing();const base=N(cost)*(1+N(pct)/100);const reference=base*r.replacement/r.bcv;
  const upper=x=>round>0?Math.ceil((x-1e-10)/round)*round:Math.ceil((x-1e-10)*100)/100;
  return {usd:upper(base),bcv:upper(reference)};
 }
 function getInfo(pid){return stockState.rows.find(r=>r.product_id===pid)}
 function suggestSku(pid){const r=getInfo(pid);if(r)return r.sku;const used=new Set(stockState.rows.map(x=>x.sku));let i=1;while(used.has('ATLE-'+String(i).padStart(3,'0')))i++;return 'ATLE-'+String(i).padStart(3,'0');}
 async function load(){
  const r=await DB().inventoryLoad();stockState.rows=r.products;stockState.stock=r.stock;stockState.rates=r.rates||stockState.rates;
  stockState.initialized=true;el('inv-rates-bcv').value=r.rates?.bcv||890;el('inv-rates-replacement').value=r.rates?.replacement||1000;el('inv-rounding').value=String(r.rates?.rounding??.5);
  el('inv-notice').hidden=true;drawProducts();if(stockState.currentProduct&&product(stockState.currentProduct))openProduct(stockState.currentProduct);else renderSelect();
  await loadSales();
 }
 async function init(){
  try{await load()}catch(e){stockState.initialized=false;notice('Para activar el inventario, primero ejecuta INSTALAR_INVENTARIO_ATLE.sql en Supabase > SQL Editor. Detalle: '+e.message,true)}
 }
 function drawProducts(){
  const q=(el('inv-search').value||'').toLowerCase().trim();const body=el('inv-table');
  const products=state.products.filter(p=>(p.nombre+' '+(getInfo(p.id)?.sku||'')).toLowerCase().includes(q));
  body.innerHTML=products.map(p=>{
   const rec=getInfo(p.id),items=stockState.stock.filter(x=>x.product_id===p.id),count=items.reduce((a,x)=>a+N(x.quantity),0);
   const full=rec?.stock_enabled===true;
   return `<tr><td><div class="product-row-info"><img src="${safe(window.ATLE_DB.photoURL(p.imagen||p.colores?.[0]?.imagen||''))}" alt=""><div><strong>${safe(p.nombre)}</strong><small>${safe(rec?.sku||'Sin SKU asignado')}</small></div></div></td><td>${full?count:'Sin configurar'}</td><td>${full?'$'+money(rec.cost_usd):'—'}</td><td>${full?'$'+money(rec.price_usd):'—'}</td><td>$${money(p.precio)}</td><td><button type="button" class="btn tiny secondary" data-inv-product="${safe(p.id)}">${full?'Administrar':'Configurar'}</button></td></tr>`;
  }).join('')||'<tr><td colspan="6">No se encontraron productos.</td></tr>';
  el('inv-count').textContent=stockState.rows.filter(x=>x.stock_enabled).length+' modelos con inventario · '+stockState.stock.reduce((s,x)=>s+N(x.quantity),0)+' unidades';
 }
 function renderSelect(){
  const select=el('inv-product-choice');const prev=stockState.currentProduct;
  select.innerHTML='<option value="">Selecciona un modelo…</option>'+state.products.map(p=>`<option value="${safe(p.id)}">${safe(p.nombre)}</option>`).join('');
  select.value=prev&&product(prev)?prev:'';
  el('inv-product-form').hidden=!select.value;
 }
 function openProduct(pid){
  stockState.currentProduct=pid;const p=product(pid);if(!p)return;
  renderSelect();el('inv-product-choice').value=pid;el('inv-product-form').hidden=false;
  const rec=getInfo(pid);el('inv-title').textContent=p.nombre;
  el('inv-sku').value=suggestSku(pid);el('inv-cost').value=rec?.cost_usd??0;
  el('inv-markup').value=rec?.markup_pct??40;
  el('inv-usd').value=rec?.stock_enabled?rec.price_usd:0;
  el('inv-bcv').value=rec?.stock_enabled?rec.price_bcv:p.precio;
  el('inv-sync-note').textContent=rec?.stock_enabled?'El precio BCV que guardes se actualizará también en el catálogo público.':'Configura primero las cantidades reales. Hasta guardar, la tienda sigue mostrando sus tallas y colores habituales.';
  stockState.editingRows=activeVariants(p).map(v=>({color:v.color,size:v.size,quantity:stockState.stock.find(s=>s.product_id===pid&&s.color===v.color&&s.size===v.size)?.quantity??0}));
  el('inv-stock-grid').innerHTML=stockState.editingRows.map((r,i)=>`<div class="inv-stock-row"><span>${safe(r.color)}</span><span>${safe(r.size)}</span><input type="number" inputmode="numeric" class="form-control small" min="0" max="999999" step="1" data-inv-qty="${i}" value="${r.quantity}" aria-label="Existencias ${safe(r.color)} talla ${safe(r.size)}"></div>`).join('');
  drawValuation();
 }
 function drawValuation(){
  const qty=[...el('inv-stock-grid').querySelectorAll('[data-inv-qty]')].reduce((a,x)=>a+whole(x.value),0);
  el('inv-product-total').textContent=String(qty);
  el('inv-product-value').textContent='$'+money(qty*N(el('inv-cost').value));
  const m=el('inv-estimated');if(m)m.textContent='Referencia: $'+money(N(el('inv-bcv').value))+' BCV / $'+money(N(el('inv-usd').value))+' divisas';
 }
 function addLine(defaultPid){
  const p=product(defaultPid)||state.products.find(x=>getInfo(x.id)?.stock_enabled);
  if(!p)return toast('Configura primero las existencias de un producto.',true);
  const variant=stockState.stock.find(x=>x.product_id===p.id&&x.quantity>0);
  if(!variant)return toast('No hay variantes con unidades disponibles.',true);
  stockState.lines.push({key:crypto.randomUUID(),product_id:p.id,color:variant.color,size:variant.size,qty:1,price:null});drawLines();
 }
 function optionsProduct(selected){return state.products.filter(p=>getInfo(p.id)?.stock_enabled).map(p=>`<option value="${safe(p.id)}"${p.id===selected?' selected':''}>${safe(p.nombre)} (${safe(getInfo(p.id).sku)})</option>`).join('')}
 function optionsVariant(line,type){
  const rows=stockState.stock.filter(x=>x.product_id===line.product_id&&(type!=='size'||x.color===line.color));
  const values=[...new Set(rows.map(x=>x[type]))];return values.map(v=>`<option value="${safe(v)}"${v===line[type]?' selected':''}>${safe(v)}</option>`).join('');
 }
 function priceFor(line){const rec=getInfo(line.product_id),currency=el('inv-sale-currency').value;
  return currency==='USD'?N(rec?.price_usd):N(rec?.price_bcv)*N(stockState.rates.bcv);
 }
 function drawLines(){
  const area=el('inv-lines');area.innerHTML=stockState.lines.map((l,i)=>{
   const st=stockState.stock.find(x=>x.product_id===l.product_id&&x.color===l.color&&x.size===l.size);
   return `<div class="inv-line" data-inv-line="${i}"><div class="inv-line-head"><strong>Prenda ${i+1}</strong><button class="btn tiny outline" type="button" data-inv-remove="${i}">Quitar ×</button></div><div class="inv-line-fields"><label>Producto<select class="form-control small" data-inv-field="product_id">${optionsProduct(l.product_id)}</select></label><label>Color<select class="form-control small" data-inv-field="color">${optionsVariant(l,'color')}</select></label><label>Talla<select class="form-control small" data-inv-field="size">${optionsVariant(l,'size')}</select></label><label>Cantidad<input class="form-control small" type="number" min="1" max="999999" step="1" data-inv-field="qty" value="${l.qty}"></label><label>Precio unitario (${el('inv-sale-currency').value})<input class="form-control small" type="number" min="0" step="0.01" data-inv-field="price" value="${l.price===null?priceFor(l).toFixed(2):l.price}"></label></div><small class="inv-stock-hint">Disponibles: ${st?.quantity??0} unidad(es)</small></div>`;
  }).join('')||'<p class="help">Agrega una prenda para comenzar.</p>';
  updateTotal();
 }
 function updateTotal(){
  const total=stockState.lines.reduce((s,l)=>s+N(l.qty)*(l.price===null?priceFor(l):N(l.price)),0);
  el('inv-sale-total').textContent=(el('inv-sale-currency').value==='USD'?'$':'Bs ')+money(total);
  el('inv-sale-count').textContent=stockState.lines.reduce((a,l)=>a+whole(l.qty),0)+' unidad(es)';
 }
 function resetSale(){stockState.lines=[];el('inv-sale-notes').value='';stockState.invoiceKey=crypto.randomUUID();drawLines()}
 function onLineChange(e){const root=e.target.closest('[data-inv-line]');if(!root)return;
  const i=Number(root.dataset.invLine),l=stockState.lines[i];if(!l)return;
  const field=e.target.dataset.invField;if(!field)return;
  if(field==='product_id'){
   l.product_id=e.target.value;const v=stockState.stock.find(x=>x.product_id===l.product_id&&x.quantity>0)||stockState.stock.find(x=>x.product_id===l.product_id);
   l.color=v?.color||'';l.size=v?.size||'';l.price=null;
  }else if(field==='color'){
   l.color=e.target.value;const v=stockState.stock.find(x=>x.product_id===l.product_id&&x.color===l.color);
   l.size=v?.size||'';
  }else if(field==='size')l.size=e.target.value;
  else if(field==='qty')l.qty=Math.max(0,Math.floor(N(e.target.value)));
  else if(field==='price')l.price=N(e.target.value);
  if(['product_id','color'].includes(field))drawLines();else updateTotal();
 }
 async function loadSales(){
  const data=await DB().inventorySales();stockState.sales=data.sales;stockState.saleItems=data.items;renderSales();
 }
 function renderSales(){
  el('inv-sale-table').innerHTML=stockState.sales.map(s=>{
   const items=stockState.saleItems.filter(x=>x.sale_id===s.id),summary=items.map(x=>x.quantity+'× '+x.product_name+' ('+x.color+'/'+x.size+')').join(' · ');
   return `<tr><td>${safe(new Date(s.created_at).toLocaleString('es-VE'))}</td><td><strong>${safe(s.currency==='USD'?'$':'Bs ')}${money(s.total)}</strong><small style="display:block">${s.status==='void'?'ANULADA':'Confirmada'}</small></td><td>${safe(summary)}</td><td title="${safe(s.notes)}">${safe(s.notes||'—')}</td><td>${s.status==='confirmed'?`<button type="button" class="btn tiny outline" data-void-sale="${safe(s.id)}">Anular</button>`:'—'}</td></tr>`;
  }).join('')||'<tr><td colspan="5">Aún no has registrado ventas.</td></tr>';
 }
 function protectCSV(val){let str=String(val??'');if(/^[=+\-@\t\r]/.test(str.trimStart()))str="'"+str;return '"'+str.replace(/"/g,'""')+'"'}
 function downloadCSV(filename,rows){
  const csv='\ufeff'+rows.map(r=>r.map(protectCSV).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
 }
 async function downloadInventory(){await load();const header=['SKU','Producto','Categoría','Color','Talla','Unidades','Costo USD','Precio USD','Precio referencia BCV USD','Precio público actual USD','Costo total USD'];
  const rows=[header];for(const p of state.products){const rec=getInfo(p.id);if(!rec)continue;
   const vs=stockState.stock.filter(s=>s.product_id===p.id);for(const v of vs)rows.push([rec.sku,p.nombre,p.categoria,v.color,v.size,v.quantity,rec.cost_usd,rec.price_usd,rec.price_bcv,p.precio,N(v.quantity)*N(rec.cost_usd)]);
  }downloadCSV('ATLE_Inventario_'+new Date().toISOString().slice(0,10)+'.csv',rows);toast('Inventario descargado para Excel.');}
 async function downloadSales(){await loadSales();const rows=[['Fecha','ID de venta','Estado','SKU','Producto','Color','Talla','Cantidad','Moneda','Precio unitario','Subtotal','Total de venta','Tasa BCV','Tasa reposición','Notas']];
  for(const s of stockState.sales){const list=stockState.saleItems.filter(x=>x.sale_id===s.id);for(const v of list)rows.push([s.created_at,s.id,s.status,v.sku,v.product_name,v.color,v.size,v.quantity,s.currency,v.unit_price,v.line_total,s.total,s.exchange_bcv,s.exchange_replacement,s.notes]);}
  downloadCSV('ATLE_Ventas_'+new Date().toISOString().slice(0,10)+'.csv',rows);toast('Historial descargado para Excel.');}
 // Eventos y navegación privados. La tienda pública no utiliza este módulo.
 document.addEventListener('DOMContentLoaded',()=>{
  el('inv-search').addEventListener('input',drawProducts);
  el('inv-table').addEventListener('click',e=>{const b=e.target.closest('[data-inv-product]');if(b){openProduct(b.dataset.invProduct);el('inv-product-form').scrollIntoView({behavior:'smooth',block:'start'});}});
  el('inv-product-choice').addEventListener('change',e=>{if(e.target.value)openProduct(e.target.value);else {stockState.currentProduct='';el('inv-product-form').hidden=true}});
  el('inv-stock-grid').addEventListener('input',drawValuation);
  ['inv-cost','inv-usd','inv-bcv','inv-markup'].forEach(id=>el(id).addEventListener('input',drawValuation));
  el('inv-calculate').addEventListener('click',()=>{const p=calcPrices(el('inv-cost').value,el('inv-markup').value,pricing().rounding);el('inv-usd').value=p.usd.toFixed(2);el('inv-bcv').value=p.bcv.toFixed(2);drawValuation()});
  el('inv-rates-save').addEventListener('click',async()=>{try{const r={bcv:N(el('inv-rates-bcv').value),replacement:N(el('inv-rates-replacement').value),rounding:N(el('inv-rounding').value)};if(r.bcv<=0||r.replacement<=0||![0,.5,1].includes(r.rounding))throw Error('Verifica tasas y redondeo.');await DB().inventorySaveRates(r);stockState.rates=r;drawLines();toast('Tasas guardadas. No se modificaron precios históricos.')}catch(e){error(e)}});
  el('inv-product-form').addEventListener('submit',async e=>{
   e.preventDefault();const id=stockState.currentProduct,b=e.submitter||el('inv-save-product');if(!id||b.disabled)return;
   try{b.disabled=true;
    const variants=[...el('inv-stock-grid').querySelectorAll('[data-inv-qty]')].map((x,i)=>({...stockState.editingRows[i],quantity:Number(x.value)}));
    if(variants.some(v=>!Number.isInteger(v.quantity)||v.quantity<0))throw Error('Las cantidades deben ser números enteros positivos o cero.');
    const cost=N(el('inv-cost').value),usd=N(el('inv-usd').value),bcv=N(el('inv-bcv').value),markup=N(el('inv-markup').value);
    if([cost,usd,bcv,markup].some(x=>!Number.isFinite(x)||x<0))throw Error('Los costos y precios no pueden ser negativos.');
    await DB().inventorySaveProduct({product_id:id,sku:el('inv-sku').value.toUpperCase().trim(),cost,usd,bcv,markup,variants});
    await reloadProducts();await load();stockState.currentProduct=id;openProduct(id);toast('SKU, precios y existencias guardados correctamente.');
   }catch(e){error(e)}finally{b.disabled=false}
  });
  el('inv-add-line').addEventListener('click',()=>addLine());
  el('inv-lines').addEventListener('change',onLineChange);
  el('inv-lines').addEventListener('input',e=>{if(['qty','price'].includes(e.target.dataset.invField))onLineChange(e)});
  el('inv-lines').addEventListener('click',e=>{const b=e.target.closest('[data-inv-remove]');if(b){stockState.lines.splice(Number(b.dataset.invRemove),1);drawLines()}});
  el('inv-sale-currency').addEventListener('change',()=>{stockState.lines.forEach(l=>l.price=null);drawLines()});
  el('inv-sale-form').addEventListener('submit',async e=>{
   e.preventDefault();if(stockState.busy)return;
   try{
    if(!stockState.lines.length)throw Error('Agrega al menos una prenda.');
    const items=stockState.lines.map(l=>({product_id:l.product_id,color:l.color,size:l.size,quantity:l.qty,unit_price:Math.round((l.price===null?priceFor(l):l.price)*100)/100}));
    if(items.some(i=>!i.product_id||!i.color||!i.size||!Number.isInteger(i.quantity)||i.quantity<1||!Number.isFinite(i.unit_price)||i.unit_price<0))throw Error('Verifica las prendas, cantidades y precios de la venta.');
    if(!confirm('¿Confirmar esta venta y descontar todas las unidades de inventario?'))return;
    stockState.busy=true;el('inv-confirm-sale').disabled=true;
    await DB().inventoryRecordSale({request_id:stockState.invoiceKey,currency:el('inv-sale-currency').value,bcv:stockState.rates.bcv,replacement:stockState.rates.replacement,notes:el('inv-sale-notes').value,items});
    resetSale();await load();toast('Venta registrada y existencias actualizadas.');
   }catch(e){error(e)}finally{stockState.busy=false;el('inv-confirm-sale').disabled=false}
  });
  el('inv-sale-table').addEventListener('click',async e=>{const b=e.target.closest('[data-void-sale]');if(!b)return;if(!confirm('¿Anular la venta? Se devolverán todas sus unidades al inventario y quedará marcada como anulada.'))return;
   try{b.disabled=true;await DB().inventoryVoidSale(b.dataset.voidSale);await load();toast('Venta anulada y existencias restauradas.')}catch(e){error(e)}finally{b.disabled=false}
  });
  el('inv-export-inventory').addEventListener('click',()=>downloadInventory().catch(error));
  el('inv-export-sales').addEventListener('click',()=>downloadSales().catch(error));
  el('inv-reload').addEventListener('click',()=>load().catch(error));
  resetSale();
 });
 window.ATLE_INVENTORY={init,refresh:async()=>{if(stockState.initialized)await load()},state:stockState};
})();
