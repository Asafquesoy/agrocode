import { describe, it, expect } from 'vitest';
import { parseProgram, ParseError } from './parser';

describe('Suite de Pruebas Exhaustivas - Analizador Agrocode', () => {
  
  // 1. Camino Feliz Completo (Happy Path)
  it('debe procesar un programa robusto con múltiples reglas y sensores', () => {
    const codigoValido = `
      CULTIVO CANA;
      SENSOR TEMPERATURA;
      SENSOR HUMEDAD;
      ACTUADOR VENTILADOR;
      ACTUADOR BOMBA;
      SI TEMPERATURA > 30 ENCENDER VENTILADOR;
      SI HUMEDAD < 20 ENCENDER BOMBA;
    `;
    expect(() => { parseProgram(codigoValido); }).not.toThrowError();
  });

  // 2. Error de Sintaxis Básico (Falta punto y coma)
  it('debe lanzar ParseError cuando falta un terminador de línea', () => {
    const codigoErroneo = `
      CULTIVO CANA
      SENSOR TEMPERATURA;
    `;
    expect(() => { parseProgram(codigoErroneo); }).toThrowError(ParseError);
  });

  // 3. Caso Extremo: Código completamente vacío
  it('debe manejar correctamente un programa vacío o con puros saltos de línea', () => {
    const codigoVacio = `
       
    `;
    // Dependiendo de cómo lo programaron los desarrolladores, esto podría pasar 
    // sin hacer nada, o lanzar un error de "Programa vacío". Asumimos que no debe crashear.
    expect(() => { parseProgram(codigoVacio); }).not.toThrowError();
  });

  // 4. Error Léxico: Uso de caracteres especiales no permitidos
  it('debe detectar y rechazar caracteres extraños no válidos (@, #, $)', () => {
    const codigoLexico = `
      CULTIVO CANA@;
      SENSOR #TEMPERATURA;
    `;
    expect(() => { parseProgram(codigoLexico); }).toThrowError(ParseError);
  });

  // 5. Error Estructural: Regla incompleta
  it('debe rechazar una instrucción condicional incompleta', () => {
    const codigoIncompleto = `
      CULTIVO CANA;
      SI TEMPERATURA > 
    `;
    expect(() => { parseProgram(codigoIncompleto); }).toThrowError(ParseError);
  });

  // 6. Sensibilidad de Mayúsculas (Case Sensitivity)
  it.skip('debe rechazar palabras reservadas en minúsculas si el lenguaje exige mayúsculas', () => {
    const codigoMinusculas = `
      cultivo cana;
      sensor temperatura;
    `;
    expect(() => { parseProgram(codigoMinusculas); }).toThrowError(ParseError);
  });

  // 7. Error Semántico: Uso de componentes no declarados
  it.skip('debe rechazar el uso de un sensor o actuador que no fue declarado previamente', () => {
    const codigoSinDeclarar = `
      CULTIVO CANA;
      SI HUMEDAD < 20 ENCENDER BOMBA; 
    `;
    // Falla porque nunca declaramos "SENSOR HUMEDAD;" ni "ACTUADOR BOMBA;"
    expect(() => { parseProgram(codigoSinDeclarar); }).toThrowError();
  });

  // 8. Error Semántico: Declaraciones duplicadas
  it.skip('debe lanzar error si se declara el mismo componente dos veces', () => {
    const codigoDuplicado = `
      CULTIVO CANA;
      SENSOR TEMPERATURA;
      SENSOR TEMPERATURA;
    `;
    expect(() => { parseProgram(codigoDuplicado); }).toThrowError();
  });

  // 9. Error de Sintaxis: Operadores relacionales inexistentes
  it('debe detectar operadores relacionales mal escritos (ej. => en lugar de >=)', () => {
    const codigoOperadorMalo = `
      CULTIVO CANA;
      SENSOR TEMPERATURA;
      ACTUADOR VENTILADOR;
      SI TEMPERATURA => 30 ENCENDER VENTILADOR;
    `;
    expect(() => { parseProgram(codigoOperadorMalo); }).toThrowError(ParseError);
  });

  // 10. Error Lógico: Condiciones sin acción
  it('debe rechazar una condición que no tiene una instrucción de acción', () => {
    const codigoSinAccion = `
      CULTIVO CANA;
      SENSOR TEMPERATURA;
      SI TEMPERATURA > 30;
    `;
    expect(() => { parseProgram(codigoSinAccion); }).toThrowError(ParseError);
  });

  // 11. Error de Tipos: Comparar con valores inválidos
  it.skip('debe rechazar la comparación de un sensor con texto en lugar de números', () => {
    const codigoTipoInvalido = `
      CULTIVO CANA;
      SENSOR TEMPERATURA;
      ACTUADOR VENTILADOR;
      SI TEMPERATURA > MUCHO ENCENDER VENTILADOR;
    `;
    expect(() => { parseProgram(codigoTipoInvalido); }).toThrowError(ParseError);
  });

});