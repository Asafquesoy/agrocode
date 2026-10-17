import { describe, it, expect } from 'vitest';
import { parseProgram, ParseError } from './parser';

describe('Analizador Sintáctico y Semántico', () => {
  it('debe lanzar un ParseError cuando hay un error de sintaxis (Prueba PM-03)', () => {
    const codigoErroneo = `
      CULTIVO CANA;
      SENSOR TEMPERATURA;
      ACTUADOR LED;
      SI HUMEDAD_SUELO > BOMBA_PRINCIPAL
      ENCENDER LUZ_INVERNADERO CUANDO ESTÉ TRISTE
    `;

    // Ejecutamos parseProgram y verificamos que arroje el error ParseError
    expect(() => {
      parseProgram(codigoErroneo);
    }).toThrowError(ParseError);
  });
});
