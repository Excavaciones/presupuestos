/**
 * MCP Server BC3 — Cloudflare Worker
 * 
 * Herramientas disponibles:
 *   - subir_bc3         : Sube y parsea un archivo BC3 a la base de datos
 *   - buscar_partidas   : Busca partidas por texto o código
 *   - obtener_partida   : Obtiene el detalle completo de una partida
 *   - generar_presupuesto : Genera un presupuesto a partir de una lista de partidas y cantidades
 *   - listar_bases      : Lista los BC3 subidos por el usuario
 */

import { parsearBC3 } from './parser.js';
import { McpServer }  from './mcp.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── Endpoint de subida de BC3 ─────────────────────────────────────────────
    if (url.pathname === '/upload' && request.method === 'POST') {
      return handleUpload(request, env, cors);
    }

    // ── Endpoint MCP (JSON-RPC 2.0) ───────────────────────────────────────────
    if (url.pathname === '/mcp' && request.method === 'POST') {
      return handleMCP(request, env, cors);
    }

    // ── Health check ──────────────────────────────────────────────────────────
    if (url.pathname === '/') {
      return Response.json({ status: 'ok', servicio: 'MCP BC3' }, { headers: cors });
    }

    return new Response('Not found', { status: 404, headers: cors });
  }
};


// ── Subida y parseo de BC3 ────────────────────────────────────────────────────

async function handleUpload(request, env, cors) {
  try {
    const formData  = await request.formData();
    const archivo   = formData.get('archivo');       // File
    const sessionId = formData.get('session_id') || crypto.randomUUID();
    const nombre    = formData.get('nombre') || archivo?.name || 'sin_nombre';

    if (!archivo) {
      return Response.json({ error: 'Falta el campo "archivo"' },
                           { status: 400, headers: cors });
    }

    const texto = await archivo.text();
    const datos = parsearBC3(texto);

    // Guardar en D1
    await guardarEnD1(env.DB, sessionId, nombre, datos);

    return Response.json({
      ok: true,
      session_id: sessionId,
      nombre,
      conceptos:        datos.conceptos.length,
      descomposiciones: datos.descomposiciones.length,
      textos:           datos.textos.length,
    }, { headers: cors });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: cors });
  }
}

async function guardarEnD1(db, sessionId, nombre, datos) {
  // Registrar la sesión/base
  await db.prepare(`
    INSERT OR REPLACE INTO sesiones (session_id, nombre, fecha)
    VALUES (?, ?, datetime('now'))
  `).bind(sessionId, nombre).run();

  // Borrar datos previos de esta sesión
  await db.prepare(`DELETE FROM conceptos        WHERE session_id = ?`).bind(sessionId).run();
  await db.prepare(`DELETE FROM textos           WHERE session_id = ?`).bind(sessionId).run();
  await db.prepare(`DELETE FROM descomposiciones WHERE session_id = ?`).bind(sessionId).run();

  // Insertar conceptos en lotes de 100
  const lote = 100;
  for (let i = 0; i < datos.conceptos.length; i += lote) {
    const trozo = datos.conceptos.slice(i, i + lote);
    const stmt  = db.prepare(`
      INSERT INTO conceptos (session_id, codigo, unidad, resumen, precio, fecha, tipo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    await db.batch(trozo.map(c =>
      stmt.bind(sessionId, c.codigo, c.unidad, c.resumen,
                c.precio, c.fecha, c.tipo)
    ));
  }

  // Insertar textos
  for (let i = 0; i < datos.textos.length; i += lote) {
    const trozo = datos.textos.slice(i, i + lote);
    const stmt  = db.prepare(`
      INSERT INTO textos (session_id, codigo, texto)
      VALUES (?, ?, ?)
    `);
    await db.batch(trozo.map(t =>
      stmt.bind(sessionId, t.codigo, t.texto)
    ));
  }

  // Insertar descomposiciones
  for (let i = 0; i < datos.descomposiciones.length; i += lote) {
    const trozo = datos.descomposiciones.slice(i, i + lote);
    const stmt  = db.prepare(`
      INSERT INTO descomposiciones (session_id, codigo, contenido)
      VALUES (?, ?, ?)
    `);
    await db.batch(trozo.map(d =>
      stmt.bind(sessionId, d.codigo, d.contenido)
    ));
  }
}


// ── MCP JSON-RPC ──────────────────────────────────────────────────────────────

async function handleMCP(request, env, cors) {
  const body = await request.json();
  const server = new McpServer(env);
  const result = await server.handle(body);
  return Response.json(result, { headers: cors });
}
