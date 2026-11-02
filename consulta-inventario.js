'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const API='/api/atle-inventario';
 let snapshot=[];
 let lastUpdate='';
 const formatInt=n=>Number(n||0).toLocaleString('es-VE');
 const formatMoney=n=>Number(n||0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2});
 function showLogin(){ $('access-screen').hidden=false; $('inventory-screen').hidden=true; $('pin').value=''; }
 function showInventory(){ $('access-screen').hidden=true; $('inventory-screen').hidden=false; }
 function message(id,text=''){const e=$(id);e.textContent=text;e.hidden=!text;}
 async function api(method,body){
  const res=await fetch(API,{method,cache:'no-store',credentials:'same-origin',headers:{'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const ex=Error(data.error||'No pudimos completar la consulta.');ex.status=res.status;throw ex;}
  return data;
 }
 function renderProduct(p){
  const box=document.createElement('article');box.className='product-card';
  const top=document.createElement('div');top.className='product-top';
  const image=document.createElement('div');image.className='image-box';
  if(p.photo && (/^https:\/\//i.test(p.photo)||/^\/(?!\/)/.test(p.photo))){
    const img=document.createElement('img');img.src=p.photo;img.alt='Foto de '+p.name;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{image.replaceChildren();const x=document.createElement('span');x.className='image-empty';x.textContent='Sin foto';image.append(x)};image.append(img);
  } else {const no=document.createElement('span');no.className='image-empty';no.textContent='Sin foto';image.append(no)}
  const ident=document.createElement('div');ident.className='product-ident';
  const h=document.createElement('h2');h.textContent=p.name;
  const sku=document.createElement('p');sku.className='sku';sku.textContent='SKU · '+p.sku;
  const price=document.createElement('div');price.className='price';price.textContent='$'+formatMoney(p.price_bcv);
  const small=document.createElement('small');small.textContent='PRECIO BCV (REFERENCIA USD)';price.prepend(small);
  const badge=document.createElement('span');badge.className='qty-pill'+(p.total===0?' empty':'');badge.textContent=p.total===0?'Agotado':formatInt(p.total)+' unidades disponibles';
  ident.append(h,sku,price,badge);top.append(image,ident);box.append(top);
  const vars=document.createElement('div');vars.className='variations';
  const label=document.createElement('p');label.className='variants-label';label.textContent='Existencias por color y talla';vars.append(label);
  const scroll=document.createElement('div');scroll.className='table-scroll';
  const table=document.createElement('table');table.className='size-table';
  const sizes=[...new Set(p.variants.map(v=>v.size))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  const colors=[...new Set(p.variants.map(v=>v.color))].sort((a,b)=>a.localeCompare(b,'es'));
  const head=document.createElement('thead');const headRow=document.createElement('tr');
  for(const value of ['Color',...sizes]){const cell=document.createElement('th');cell.textContent=value;headRow.append(cell)}head.append(headRow);table.append(head);
  const body=document.createElement('tbody');
  for(const color of colors){
   const tr=document.createElement('tr');const label=document.createElement('td');label.textContent=color;tr.append(label);
   for(const size of sizes){const match=p.variants.find(v=>v.color===color&&v.size===size);const td=document.createElement('td');const n=match?.quantity;td.className=n?'positive':'zero';td.textContent=n===undefined?'—':formatInt(n);tr.append(td)}body.append(tr);
  }
  table.append(body);scroll.append(table);vars.append(scroll);box.append(vars);return box;
 }
 function render(){
  const search=$('search').value.trim().toLocaleLowerCase();const only=$('only-available').checked;
  const filtered=snapshot.filter(p=> (!only||p.total>0)&&(!search||(p.name+' '+p.sku).toLocaleLowerCase().includes(search)));
  const root=$('product-list');root.replaceChildren(...filtered.map(renderProduct));$('empty-results').hidden=filtered.length>0;
  $('results-count').textContent=filtered.length+' modelo(s) mostrado(s)';
  $('count-models').textContent=formatInt(snapshot.length);
  $('count-units').textContent=formatInt(snapshot.reduce((a,p)=>a+p.total,0));
  $('count-empty').textContent=formatInt(snapshot.reduce((a,p)=>a+p.variants.filter(v=>v.quantity===0).length,0));
  $('updated-at').textContent=lastUpdate?'Actualizado: '+new Date(lastUpdate).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'}):'';
 }
 async function refresh(){
  message('inventory-error','');$('refresh-button').disabled=true;
  try{const data=await api('GET');snapshot=Array.isArray(data.products)?data.products:[];lastUpdate=data.updated_at||'';showInventory();render();}
  catch(e){if(e.status===401){showLogin();message('login-error','Tu sesión terminó. Introduce nuevamente el PIN.')}else{showInventory();message('inventory-error',e.message)}}
  finally{$('refresh-button').disabled=false}
 }
 $('login-form').addEventListener('submit',async e=>{
  e.preventDefault();message('login-error','');$('login-button').disabled=true;
  try{await api('POST',{action:'login',pin:$('pin').value});await refresh();}
  catch(err){message('login-error',err.message)}
  finally{$('login-button').disabled=false;$('pin').value=''}
 });
 $('logout-button').addEventListener('click',async()=>{try{await api('POST',{action:'logout'})}catch{}snapshot=[];showLogin()});
 $('refresh-button').addEventListener('click',refresh);
 $('search').addEventListener('input',render);$('only-available').addEventListener('change',render);
 refresh();
})();
