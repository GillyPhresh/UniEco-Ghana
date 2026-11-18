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
});

test('school search fits narrow phones and offers a searchable selection control', async () => {
  const [onboarding, picker] = await Promise.all([read('app/onboarding/student/page.tsx'), read('components/registration/registration-option-picker.tsx')]);
  assert.match(onboarding, /RegistrationOptionPicker/);
  assert.match(onboarding, /Search and choose your school/);
  assert.match(onboarding, /Type a school name or abbreviation/);
  assert.match(picker, /max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(picker, /max-h-\[min\(18rem,calc\(100dvh-12rem\)\)\]/);
});

test('footer navigation stays visible and uses comfortable tap targets on mobile and desktop', async () => {
  const footer = await read('components/layout/site-footer.tsx');
  assert.match(footer, /aria-label="Footer navigation"/);
  assert.match(footer, /grid-cols-2[\s\S]*sm:grid-cols-3/);
  assert.match(footer, /min-h-11/);
  assert.match(footer, /max-w-7xl/);
});

test('public footer replaces the student-built slogan with useful onboarding and support cues', async () => {
  const footer = await read('components/layout/site-footer.tsx');
  assert.doesNotMatch(footer, /Built for students, by students\. Made in Ghana\./);
  assert.match(footer, /Find your place on UniEco/);
  assert.match(footer, /href="\/universities"[\s\S]*Find my school/);
  assert.match(footer, /href="\/signup"[\s\S]*Join UniEco/);
  assert.match(footer, /Contact UniEco support/);
});

test('mobile account shortcuts share the single scrollable navigation region', async () => {
  const header = await read('components/layout/site-header.tsx');
  assert.match(header, /nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"[\s\S]*?aria-label="Account shortcuts"[\s\S]*?My dashboard[\s\S]*?<\/nav>/);
});
