import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '../..');

export function testModules(overrides = {}) {
  const cache = new Map();
  function load(absolute) {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const { outputText } = ts.transpileModule(readFileSync(absolute, 'utf8'), {
      fileName: absolute,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const mockedRequire = (specifier) => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      const local = specifier.startsWith('@/') ? resolve(root, specifier.slice(2))
        : specifier.startsWith('.') ? resolve(dirname(absolute), specifier) : null;
      if (!local) return require(specifier);
      if (extname(local) === '.json') return JSON.parse(readFileSync(local, 'utf8'));
      return load(!extname(local) ? local + (existsSync(local + '.ts') ? '.ts' : '.tsx') : local);
    };
    new Function('require', 'module', 'exports', outputText)(mockedRequire, module, module.exports);
    return module.exports;
  }
  return (name) => load(resolve(root, name));
}
