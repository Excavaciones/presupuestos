-- Schema D1 para el MCP BC3
-- Ejecutar: wrangler d1 execute mcp-bc3-db --file=schema.sql

CREATE TABLE IF NOT EXISTS sesiones (
  session_id TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  fecha      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conceptos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  codigo     TEXT NOT NULL,
  unidad     TEXT,
  resumen    TEXT,
  precio     REAL DEFAULT 0,
  fecha      TEXT,
  tipo       TEXT DEFAULT '0',
  UNIQUE(session_id, codigo)
);

CREATE TABLE IF NOT EXISTS textos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  codigo     TEXT NOT NULL,
  texto      TEXT,
  UNIQUE(session_id, codigo)
);

CREATE TABLE IF NOT EXISTS descomposiciones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  codigo     TEXT NOT NULL,
  contenido  TEXT,
  UNIQUE(session_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_conceptos_session ON conceptos (session_id);
CREATE INDEX IF NOT EXISTS idx_conceptos_codigo  ON conceptos (session_id, codigo);
CREATE INDEX IF NOT EXISTS idx_conceptos_resumen ON conceptos (resumen);
CREATE INDEX IF NOT EXISTS idx_textos_session    ON textos (session_id);
CREATE INDEX IF NOT EXISTS idx_descomp_session   ON descomposiciones (session_id);
