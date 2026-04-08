# MCP BC3 — Servidor de presupuestos de construcción

Servidor MCP sobre Cloudflare Workers + D1 que permite buscar partidas 
de precio en archivos BC3 y generar presupuestos completos.

## Herramientas disponibles

| Herramienta | Descripción |
|---|---|
| `buscar_partidas` | Busca por texto libre en código o descripción |
| `obtener_partida` | Detalle completo con descomposición |
| `generar_presupuesto` | Presupuesto con importes y total |
| `listar_bases` | BC3 disponibles en la sesión |

---

## Despliegue paso a paso

### 1. Instalar Wrangler (una sola vez)

```bash
npm install -g wrangler
wrangler login
```

### 2. Crear la base de datos D1

```bash
wrangler d1 create mcp-bc3-db
```

Copia el `database_id` que te devuelva y ponlo en `wrangler.toml`.

### 3. Crear las tablas

```bash
wrangler d1 execute mcp-bc3-db --file=schema.sql
```

### 4. Desplegar el Worker

```bash
wrangler deploy
```

Te dará una URL del tipo: `https://mcp-bc3.TU-USUARIO.workers.dev`

---

## Uso

### Subir un BC3

```bash
curl -X POST https://mcp-bc3.TU-USUARIO.workers.dev/upload \
  -F "archivo=@mi_base.bc3" \
  -F "nombre=BCEXTREM25" \
  -F "session_id=sesion-001"
```

Respuesta:
```json
{
  "ok": true,
  "session_id": "sesion-001",
  "conceptos": 59473,
  "textos": 22986
}
```

### Llamar al MCP (buscar partidas)

```bash
curl -X POST https://mcp-bc3.TU-USUARIO.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "buscar_partidas",
      "arguments": {
        "session_id": "sesion-001",
        "texto": "excavación zanja"
      }
    }
  }'
```

### Llamar al MCP (generar presupuesto)

```bash
curl -X POST https://mcp-bc3.TU-USUARIO.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "generar_presupuesto",
      "arguments": {
        "session_id": "sesion-001",
        "titulo": "Piscina 8x4 — Finca Las Eras",
        "partidas": [
          { "codigo": "U01AA007", "cantidad": 120 },
          { "codigo": "E04CM040", "cantidad": 35.5 },
          { "codigo": "U06AA010", "cantidad": 200 }
        ]
      }
    }
  }'
```

---

## Integrar con Claude API

```javascript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': TU_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'mcp-client-2025-04-04',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    mcp_servers: [
      {
        type: 'url',
        url: 'https://mcp-bc3.TU-USUARIO.workers.dev/mcp',
        name: 'bc3',
      }
    ],
    messages: [
      {
        role: 'user',
        content: 'Busca partidas de excavación en zanja en la sesión sesion-001 y genera un presupuesto para 150 m³'
      }
    ]
  })
});
```

---

## Estructura de archivos

```
mcp-bc3/
├── src/
│   ├── index.js   — Worker principal (endpoints /upload y /mcp)
│   ├── mcp.js     — Servidor MCP con las 4 herramientas
│   └── parser.js  — Parser BC3 en JavaScript
├── schema.sql     — Tablas D1
├── wrangler.toml  — Configuración Cloudflare
└── README.md
```
