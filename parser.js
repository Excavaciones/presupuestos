/**
 * parser.js — Parsea un archivo BC3 (FIEBDC) en JavaScript
 * Compatible con la lógica del presupuesto.py original
 */

export function parsearBC3(texto) {
  const registros = texto.split('~');

  const conceptos        = [];
  const textos           = [];
  const descomposiciones = [];

  for (const reg of registros) {
    const partes = reg.split('|');
    const tipo   = partes[0].trim().toUpperCase();

    if (tipo === 'C' && partes.length >= 3) {
      const codigo  = partes[1]?.trim() || '';
      const unidad  = partes[2]?.trim() || '';
      const resumen = partes[3]?.trim() || '';
      const precio  = parseFloat(partes[4]?.trim()) || 0;
      const fecha   = partes[5]?.trim() || '';
      const tipoC   = partes[6]?.trim() || '0';
      if (codigo) {
        conceptos.push({ codigo, unidad, resumen, precio, fecha, tipo: tipoC });
      }

    } else if (tipo === 'T' && partes.length >= 3) {
      const codigo = partes[1]?.trim() || '';
      const texto  = partes[2]?.trim() || '';
      if (codigo && texto) {
        textos.push({ codigo, texto });
      }

    } else if (tipo === 'D' && partes.length >= 3) {
      const codigo    = partes[1]?.trim() || '';
      const contenido = partes[2]?.trim() || '';
      if (codigo && contenido) {
        descomposiciones.push({ codigo, contenido });
      }
    }
  }

  return { conceptos, textos, descomposiciones };
}


/**
 * Extrae los hijos de una descomposición BC3.
 * Formato: codigo\rendimiento\factor\  (grupos de 3 separados por \)
 * Devuelve array de { codigo, rendimiento, factor }
 */
export function extraerHijos(contenido) {
  const hijos = [];
  // Cada hijo: texto\texto\texto\
  const patron = /([^\\]*?)\\([^\\]*?)\\([^\\]*?)\\/g;
  let m;
  while ((m = patron.exec(contenido)) !== null) {
    const codigo      = m[1].trim();
    const rendimiento = parseFloat(m[2]) || 0;
    const factor      = parseFloat(m[3]) || 1;
    if (codigo) hijos.push({ codigo, rendimiento, factor });
  }
  return hijos;
}
