'use strict';
/* ATLE · Validación pública de existencias antes de añadir/confirmar el carrito.
   Reutiliza la clave privada que ya utiliza api/atle-inventario.js.
   Solo devuelve el resultado de la validación; nunca expone costos, ventas, SKU ni claves. */

const NO_STORE = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow'
};

function reply(res, status, payload) {
  for (const [key, value] of Object.entries(NO_STORE)) res.setHeader(key, value);
  return res.status(status).json(payload);
}

function getEnv() {
  const url = String(process.env.ATLE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.ATLE_SUPABASE_SECRET_KEY || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || key.length < 20) {
    throw new Error('Falta la configuración privada de Supabase en Vercel.');
  }
  return { url, key };
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || req.headers.referer || '');
  const host = String(req.headers.host || '').toLowerCase();
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

function inFilter(values) {
  // Los IDs se validan como alfanuméricos, guion y guion bajo antes de llegar aquí.
  return 'in.(' + values.map(value => '"' + value + '"').join(',') + ')';
}

async function supabaseRows(env, table, filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) params.set(key, value);
  const headers = { apikey: env.key, Accept: 'application/json' };
  // Compatibilidad con service_role JWT antiguo y con sb_secret_ actual.
  if (env.key.split('.').length === 3) headers.Authorization = 'Bearer ' + env.key;
  const response = await fetch(env.url + '/rest/v1/' + table + '?' + params.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('ATLE stock: Supabase HTTP', response.status, table, detail.slice(0, 180));
    throw new Error('No fue posible consultar las existencias en Supabase.');
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Respuesta de inventario no válida.');
  return rows;
}

function normalizeItems(raw) {
  if (!Array.isArray(raw) || raw.length > 40) throw new Error('El carrito contiene demasiados artículos para validar.');
  const grouped = new Map();
  for (const entry of raw) {
    const productId = String(entry?.product_id || '');
    const color = String(entry?.color || '').trim();
    const size = String(entry?.size || '').trim();
    const quantity = Number(entry?.quantity);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(productId) || !color || color.length > 60 || !size || size.length > 30 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('Hay una variante o cantidad inválida en el carrito.');
    }
    const key = JSON.stringify([productId, color, size]);
    const existing = grouped.get(key);
    const total = (existing?.quantity || 0) + quantity;
    if (total > 99) throw new Error('La cantidad solicitada supera el límite permitido por variante.');
    grouped.set(key, { product_id: productId, color, size, quantity: total });
  }
  return [...grouped.values()];
}

function variantSizes(product, color) {
  const record = (Array.isArray(product?.colores) ? product.colores : []).find(item => String(item?.nombre || '') === color);
  if (!record) return null;
  const colorSizes = Array.isArray(record.tallas) ? record.tallas.filter(Boolean) : [];
  const productSizes = Array.isArray(product.tallas) ? product.tallas.filter(Boolean) : [];
  return colorSizes.length ? colorSizes : productSizes;
}

async function validateItems(env, items) {
  if (!items.length) return { ok: true, checked: 0 };
  const ids = [...new Set(items.map(item => item.product_id))];
  const filter = inFilter(ids);
  const [productRows, inventoryRows, stockGroups] = await Promise.all([
    supabaseRows(env, 'atle_products', { select: 'id,data', id: filter }),
    supabaseRows(env, 'atle_inventory_products', { select: 'product_id,stock_enabled', product_id: filter }),
    // Consultar por producto evita alcanzar el límite de filas REST cuando hay muchos colores/tallas.
    Promise.all(ids.map(id => supabaseRows(env, 'atle_inventory_stock', { select: 'product_id,color,size,quantity', product_id: 'eq.' + id })))
  ]);
  const stockRows = stockGroups.flat();

  const products = new Map(productRows.map(row => [String(row.id), row.data || {}]));
  const inventory = new Map(inventoryRows.map(row => [String(row.product_id), row]));
  const errors = [];

  for (const item of items) {
    const product = products.get(item.product_id);
    const inv = inventory.get(item.product_id);
    const name = String(product?.nombre || 'Este producto');
    let available = 0;
    let message = '';

    if (!product || product.activo === false) {
      message = 'Este producto ya no está disponible.';
    } else if (!inv || inv.stock_enabled !== true) {
      message = 'El inventario de este producto todavía no está configurado. Escríbenos por WhatsApp para confirmar disponibilidad.';
    } else {
      const sizes = variantSizes(product, item.color);
      if (!sizes || !sizes.includes(item.size)) {
        message = 'Esta combinación de color y talla ya no está disponible.';
      } else {
        available = stockRows
          .filter(row => String(row.product_id) === item.product_id && String(row.color) === item.color && String(row.size) === item.size)
          .reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
        if (available < item.quantity) {
          message = available > 0
            ? `Solo quedan ${available} unidad(es) disponibles de ${name} (${item.color}, talla ${item.size}).`
            : `No quedan unidades disponibles de ${name} (${item.color}, talla ${item.size}).`;
        }
      }
    }

    if (message) errors.push({
      product_id: item.product_id,
      product_name: name,
      color: item.color,
      size: item.size,
      requested: item.quantity,
      available,
      message
    });
  }

  if (errors.length) return { ok: false, checked: items.length, errors, message: errors[0].message };
  return { ok: true, checked: items.length };
}

async function main(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: 'Método no permitido.' });
  if (!sameOrigin(req)) return reply(res, 403, { ok: false, message: 'Solicitud no permitida.' });

  let env;
  try { env = getEnv(); }
  catch (error) {
    console.error('ATLE stock:', error.message);
    return reply(res, 503, { ok: false, message: 'No se puede verificar el inventario en este momento. Inténtalo nuevamente.' });
  }

  try {
    const body = parseBody(req);
    const items = normalizeItems(body.items);
    const result = await validateItems(env, items);
    return reply(res, result.ok ? 200 : 409, result);
  } catch (error) {
    console.error('ATLE stock validation:', error.message);
    const status = /carrito|variante|cantidad inválida|límite permitido/i.test(error.message) ? 400 : 503;
    return reply(res, status, { ok: false, message: status === 400 ? error.message : 'No se pudo verificar el inventario. Inténtalo nuevamente en unos segundos.' });
  }
}

module.exports = main;
module.exports._test = { getEnv, sameOrigin, normalizeItems, variantSizes, validateItems, main };
