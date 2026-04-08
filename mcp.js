/**
 * mcp.js — Implementación del protocolo MCP (JSON-RPC 2.0)
 *
 * Herramientas expuestas:
 *   buscar_partidas     — Busca partidas por texto libre o código
 *   obtener_partida     — Detalle completo de una partida (con descomposición)
 *   generar_presupuesto — Genera un presupuesto a partir de partidas + cantidades
 *   listar_bases        — Lista los BC3 disponibles en la sesión
 */

export class McpServer {
  constructor(env) {
    this.db = env.DB;
  }

  async handle(body) {
    const { jsonrpc, id, method, params } = body;

    if (jsonrpc !== '2.0') {
      return this._error(id, -32600, 'Se requiere JSON-RPC 2.0');
    }

    try {
      switch (method) {

        // ── Protocolo MCP estándar ──────────────────────────────────────────
        case 'initialize':
          return this._ok(id, {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'mcp-bc3', version: '1.0.0' },
            capabilities: { tools: {} },
          });

        case 'tools/list':
          return this._ok(id, { tools: HERRAMIENTAS });

        case 'tools/call':
          return await this._llamarHerramienta(id, params);

        default:
          return this._error(id, -32601, `Método desconocido: ${method}`);
      }
    } catch (err) {
      return this._error(id, -32000, err.message);
    }
  }

  // ── Dispatcher de herramientas ──────────────────────────────────────────────

  async _llamarHerramienta(id, params) {
    const { name, arguments: args } = params;

    let resultado;
    switch (name) {
      case 'buscar_partidas':
        resultado = await this._buscarPartidas(args);
        break;
      case 'obtener_partida':
        resultado = await this._obtenerPartida(args);
        break;
      case 'generar_presupuesto':
        resultado = await this._generarPresupuesto(args);
        break;
      case 'listar_bases':
        resultado = await this._listarBases(args);
        break;
      default:
        return this._error(id, -32601, `Herramienta desconocida: ${name}`);
    }

    return this._ok(id, {
      content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }]
    });
  }

  // ── Herramienta: buscar_partidas ─────────────────────────────────────────────

  async _buscarPartidas({ session_id, texto, limite = 20 }) {
    if (!session_id) throw new Error('Falta session_id');
    if (!texto)      throw new Error('Falta el texto de búsqueda');

    const busqueda = `%${texto.toLowerCase()}%`;
    const { results } = await this.db.prepare(`
      SELECT c.codigo, c.unidad, c.resumen, c.precio,
             t.texto AS descripcion
      FROM conceptos c
      LEFT JOIN textos t ON t.session_id = c.session_id AND t.codigo = c.codigo
      WHERE c.session_id = ?
        AND (LOWER(c.codigo)  LIKE ?
          OR LOWER(c.resumen) LIKE ?
          OR LOWER(t.texto)   LIKE ?)
        AND c.precio > 0
      ORDER BY c.precio DESC
      LIMIT ?
    `).bind(session_id, busqueda, busqueda, busqueda, limite).all();

    return {
      total:    results.length,
      partidas: results.map(r => ({
        codigo:      r.codigo,
        unidad:      r.unidad,
        resumen:     r.resumen,
        precio:      r.precio,
        descripcion: r.descripcion || r.resumen,
      }))
    };
  }

  // ── Herramienta: obtener_partida ─────────────────────────────────────────────

  async _obtenerPartida({ session_id, codigo }) {
    if (!session_id) throw new Error('Falta session_id');
    if (!codigo)     throw new Error('Falta el código de la partida');

    const concepto = await this.db.prepare(`
      SELECT c.*, t.texto AS descripcion
      FROM conceptos c
      LEFT JOIN textos t ON t.session_id = c.session_id AND t.codigo = c.codigo
      WHERE c.session_id = ? AND c.codigo = ?
    `).bind(session_id, codigo).first();

    if (!concepto) throw new Error(`Partida "${codigo}" no encontrada`);

    // Descomposición
    const descomp = await this.db.prepare(`
      SELECT contenido FROM descomposiciones
      WHERE session_id = ? AND codigo = ?
    `).bind(session_id, codigo).first();

    let hijos = [];
    if (descomp?.contenido) {
      const { extraerHijos } = await import('./parser.js');
      const hijosRaw = extraerHijos(descomp.contenido);

      // Enriquecer con precio de cada hijo
      for (const h of hijosRaw) {
        const hijo = await this.db.prepare(`
          SELECT codigo, unidad, resumen, precio FROM conceptos
          WHERE session_id = ? AND codigo = ?
        `).bind(session_id, h.codigo).first();

        hijos.push({
          codigo:      h.codigo,
          resumen:     hijo?.resumen || '',
          unidad:      hijo?.unidad  || '',
          precio_ud:   hijo?.precio  || 0,
          rendimiento: h.rendimiento,
          importe:     (hijo?.precio || 0) * h.rendimiento,
        });
      }
    }

    return {
      codigo:      concepto.codigo,
      unidad:      concepto.unidad,
      resumen:     concepto.resumen,
      descripcion: concepto.descripcion || concepto.resumen,
      precio:      concepto.precio,
      tipo:        concepto.tipo,
      descomposicion: hijos,
    };
  }

  // ── Herramienta: generar_presupuesto ─────────────────────────────────────────

  async _generarPresupuesto({ session_id, partidas, titulo = 'Presupuesto' }) {
    if (!session_id) throw new Error('Falta session_id');
    if (!partidas?.length) throw new Error('Falta la lista de partidas');

    // partidas = [{ codigo, cantidad, descripcion_opcional }]
    const lineas = [];
    let total = 0;

    for (const p of partidas) {
      const concepto = await this.db.prepare(`
        SELECT c.codigo, c.unidad, c.resumen, c.precio, t.texto AS descripcion
        FROM conceptos c
        LEFT JOIN textos t ON t.session_id = c.session_id AND t.codigo = c.codigo
        WHERE c.session_id = ? AND c.codigo = ?
      `).bind(session_id, p.codigo).first();

      if (!concepto) {
        lineas.push({
          codigo:   p.codigo,
          error:    'Partida no encontrada',
          cantidad: p.cantidad,
          importe:  0,
        });
        continue;
      }

      const cantidad = parseFloat(p.cantidad) || 1;
      const precio   = concepto.precio || 0;
      const importe  = precio * cantidad;
      total += importe;

      lineas.push({
        codigo:      concepto.codigo,
        unidad:      concepto.unidad,
        descripcion: p.descripcion_opcional || concepto.resumen,
        precio_ud:   precio,
        cantidad,
        importe,
      });
    }

    return {
      titulo,
      fecha:   new Date().toLocaleDateString('es-ES'),
      lineas,
      total,
      total_formateado: total.toLocaleString('es-ES', {
        style: 'currency', currency: 'EUR'
      }),
    };
  }

  // ── Herramienta: listar_bases ─────────────────────────────────────────────────

  async _listarBases({ session_id }) {
    let query, params;

    if (session_id) {
      query  = `SELECT * FROM sesiones WHERE session_id = ? ORDER BY fecha DESC`;
      params = [session_id];
    } else {
      query  = `SELECT * FROM sesiones ORDER BY fecha DESC LIMIT 20`;
      params = [];
    }

    const stmt = this.db.prepare(query);
    const { results } = params.length
      ? await stmt.bind(...params).all()
      : await stmt.all();

    return { bases: results };
  }

  // ── Helpers JSON-RPC ──────────────────────────────────────────────────────────

  _ok(id, result)          { return { jsonrpc: '2.0', id, result }; }
  _error(id, code, message){ return { jsonrpc: '2.0', id, error: { code, message } }; }
}


// ── Definición de herramientas para tools/list ────────────────────────────────

const HERRAMIENTAS = [
  {
    name: 'buscar_partidas',
    description: 'Busca partidas de precio en un BC3 por texto libre (descripción, código). Devuelve código, unidad, precio y descripción.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'ID de sesión del BC3 subido' },
        texto:      { type: 'string', description: 'Texto a buscar (ej: "excavación zanja", "hormigón HA-25")' },
        limite:     { type: 'number', description: 'Número máximo de resultados (defecto: 20)' },
      },
      required: ['session_id', 'texto'],
    },
  },
  {
    name: 'obtener_partida',
    description: 'Obtiene el detalle completo de una partida: descripción larga, precio, unidad y descomposición en materiales/mano de obra.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'ID de sesión del BC3 subido' },
        codigo:     { type: 'string', description: 'Código exacto de la partida (ej: "U01AA007")' },
      },
      required: ['session_id', 'codigo'],
    },
  },
  {
    name: 'generar_presupuesto',
    description: 'Genera un presupuesto completo a partir de una lista de partidas con sus cantidades. Devuelve importes por partida y total.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'ID de sesión del BC3 subido' },
        titulo:     { type: 'string', description: 'Título del presupuesto' },
        partidas: {
          type: 'array',
          description: 'Lista de partidas con cantidad',
          items: {
            type: 'object',
            properties: {
              codigo:               { type: 'string', description: 'Código de la partida' },
              cantidad:             { type: 'number', description: 'Cantidad (m³, m², ud...)' },
              descripcion_opcional: { type: 'string', description: 'Descripción personalizada (opcional)' },
            },
            required: ['codigo', 'cantidad'],
          },
        },
      },
      required: ['session_id', 'partidas'],
    },
  },
  {
    name: 'listar_bases',
    description: 'Lista los archivos BC3 subidos y disponibles en la sesión.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'ID de sesión (opcional, sin él lista todas)' },
      },
    },
  },
];
