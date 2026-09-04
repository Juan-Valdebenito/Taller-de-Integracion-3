/**
 * css-modules.d.ts
 * Declaración de tipos global para CSS Modules (archivos *.module.css).
 * Permite que TypeScript reconozca los imports de estilo como módulos válidos.
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
