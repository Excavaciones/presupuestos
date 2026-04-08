# -*- coding: utf-8 -*-

'''
Lector/escritor de archivos BC3 (formato FIEBDC)
Migrado a Python 3

Original: fran (2012)
Migración Python 3: 2026
'''

import re
from collections import defaultdict


def tree():
    return defaultdict(tree)


class presupuesto:
    """
    Representa un presupuesto completo en formato BC3 (FIEBDC).

    Registros soportados: C (conceptos), D (descomposiciones), T (textos), M (mediciones)
    TODO: Incluir registros V y K.
    """

    def __init__(self, *archivo):
        self.conceptos = {}
        self.descomposiciones = {}
        self.mediciones = {}
        self.textos = {}
        self.importe_tot = 0.0

        if archivo:
            self.leerBC3(archivo)
            print(f'{self} — presupuesto cargado desde: {archivo[0]}')

    def leerBC3(self, archivo):
        """
        Lee un archivo BC3 y carga sus datos en el objeto.
        Soporta codificaciones latin-1 / utf-8 (intenta ambas).
        """
        ruta = archivo[0] if isinstance(archivo, tuple) else archivo

        # Intentar leer con latin-1 (codificación habitual en BC3 españoles)
        try:
            contenido = open(ruta, encoding='latin-1').read()
        except UnicodeDecodeError:
            contenido = open(ruta, encoding='utf-8').read()

        regs = re.split('~', contenido)
        self.registros = [re.split(r'\|', reg) for reg in regs]

        regsC, regsD, regsM, regsT = {}, {}, {}, {}

        for reg in self.registros:
            tipo = reg[0].strip().upper()
            if len(reg) < 2:
                continue
            if tipo == 'C':
                regsC[reg[1]] = reg[2:-1]
            elif tipo == 'D':
                try:
                    regsD[reg[1]] = reg[2:-1]
                except IndexError:
                    print("Registro D sin descomposiciones, ignorado.")
            elif tipo == 'M':
                regsM[reg[1]] = reg[2:-1]
            elif tipo == 'T':
                if len(reg) > 2:
                    regsT[reg[1]] = reg[2:-1][0]

        self.conceptos = regsC
        self.descomposiciones = regsD
        self.mediciones = regsM
        self.textos = regsT

        # Calcular importe total (concepto raíz marcado con ##)
        for capitulo in self.descomposiciones:
            if re.search(r'.*##', capitulo):
                try:
                    self.importe_tot = float(self.conceptos[capitulo][2])
                except (IndexError, ValueError, KeyError):
                    pass

    def grabarBC3(self, archivo):
        """
        Graba los datos del objeto en un archivo BC3.
        """
        with open(archivo, 'w', encoding='latin-1') as f:
            f.write('~V|SOFT S.A.|FIEBDC-3/2002|ARPO-BC3||ANSI|\n')
            f.write(r'~K|\2\3\3\2\2\2\2\EUR\|0|' + '\n')

            for concepto in self.conceptos:
                f.write('~C|' + concepto + '|' + '|'.join(self.conceptos[concepto]) + '|\n')

            for texto in self.textos:
                f.write('~T|' + texto + '|' + self.textos[texto] + '|\n')

            for descomp in self.descomposiciones:
                f.write('~D|' + descomp + '|' + '|'.join(self.descomposiciones[descomp]) + '|\n')

            for med in self.mediciones:
                contenido_med = self.mediciones[med]
                if contenido_med:
                    f.write('~M|' + med + '|' + '|'.join(contenido_med) + '|\n')

    def buscar_concepto(self, codigo):
        """Devuelve los datos del concepto con ese código, o None si no existe."""
        return self.conceptos.get(codigo)

    def comprobar_importe_total(self):
        """Recalcula el importe total desde los datos cargados."""
        for capitulo in self.descomposiciones:
            if re.search(r'.*##', capitulo):
                try:
                    self.importe_tot = float(self.conceptos[capitulo][2])
                except (IndexError, ValueError, KeyError):
                    pass

    def resumen(self):
        """Muestra un resumen del presupuesto cargado."""
        print(f"  Conceptos:        {len(self.conceptos)}")
        print(f"  Descomposiciones: {len(self.descomposiciones)}")
        print(f"  Mediciones:       {len(self.mediciones)}")
        print(f"  Textos:           {len(self.textos)}")
        print(f"  Importe total:    {self.importe_tot:.2f} €")
