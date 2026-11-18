import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const src = readFileSync(new URL('../lib/server/spreadsheet-csv.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
runInNewContext(outputText, { exports });
const { csvCell } = exports;

test('spreadsheet formulas are encoded as text, including Unicode and padded prefixes', () => {
  for (const text of ['=1+1', '+1+1', '-1+1', '@SUM(1)', '  =1+1', '\u200B=1+1',
    '\uFEFF＝1+1', '　＋1+1', '\ttext', '\rtext', '\ntext', ' \ntext']) {
    assert.equal(csvCell(text), `"'${text}"`, JSON.stringify(text));
  }
});

test('quoted separators, Unicode text, numeric amounts and empty cells are preserved', () => {
  assert.equal(csvCell('Edna, "UniEco"'), '"Edna, ""UniEco"""');
  assert.equal(csvCell('GH₵ 20.00'), '"GH₵ 20.00"');
  assert.equal(csvCell(20), '"20"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell('text","=1+1'), '"text"",""=1+1"');
});
