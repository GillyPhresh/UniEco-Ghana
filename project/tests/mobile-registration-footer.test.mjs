import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('student signup does not request or retain student ID numbers or ID-card files', async () => {
  const onboarding = await read('app/onboarding/student/page.tsx');
  assert.doesNotMatch(onboarding, /id="index_number"|Index \/ Student number|Student ID card photo|student_id_document_url/);
  assert.doesNotMatch(onboarding, /student_id_number, program_of_study/);
  assert.match(onboarding, /p_student_id_number: null/);
  assert.match(onboarding, /p_student_document_path: null/);
  assert.match(onboarding, /studentIdNumber: null/);
  assert.match(onboarding, /studentDocumentPath: null/);
  assert.match(onboarding, /Whitelist current fields so older browser drafts cannot retain ID/);
  assert.match(onboarding, /You do not need a student ID card or index number to register/);
});

test('school search fits narrow phones and offers a searchable selection control', async () => {
  const onboarding = await read('app/onboarding/student/page.tsx');
  assert.match(onboarding, /RegistrationAutocomplete/);
  assert.match(onboarding, /Search and choose your school/);
  assert.match(onboarding, /Type a school name or abbreviation/);
  assert.match(onboarding, /max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(onboarding, /max-h-\[min\(18rem,calc\(100dvh-12rem\)\)\]/);
});

test('mobile footer links collapse into accessible groups while remaining expanded on desktop', async () => {
  const footer = await read('components/layout/site-footer.tsx');
  assert.match(footer, /<details key=\{heading\} className="group/);
  assert.match(footer, /<summary className="flex min-h-12/);
  assert.match(footer, /hidden[\s\S]*group-open:block[\s\S]*md:block/);
  assert.match(footer, /container py-7 sm:py-12 lg:py-16/);
});

test('mobile account shortcuts share the single scrollable navigation region', async () => {
  const header = await read('components/layout/site-header.tsx');
  assert.match(header, /nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"[\s\S]*?aria-label="Account shortcuts"[\s\S]*?My dashboard[\s\S]*?<\/nav>/);
});
