// Lee los archivos fuente con fs: @types/node viene con Jest.
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, join } from 'path';

// En web, Metro resuelve './X' a X.web.tsx: si X.web.tsx importa VALORES desde
// './X' se importa a sí mismo y recibe undefined (pasó con el color de "tu
// ubicación"). Desde su versión nativa solo puede importar tipos, que se borran
// al compilar. En Jest './X' es la versión nativa, por eso este test lo revisa
// en el código.

function webVariants(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : webVariants(path);
    return /\.web\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = webVariants(join(__dirname, '..', '..'));

it('hay versiones web que revisar', () => {
  expect(files.length).toBeGreaterThan(0);
});

it.each(files.map((file) => [basename(file), file]))('%s solo importa tipos desde su versión nativa', (_name, file) => {
  const base = basename(file).replace(/\.web\.tsx?$/, '');
  const source = readFileSync(file, 'utf8');
  const fromNative = new RegExp(String.raw`^import\s+(?!type\b)[^;]*from\s+['"]\./${base}['"]`, 'm');
  expect(source).not.toMatch(fromNative);
});
