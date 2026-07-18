import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNextId, incrementLetters } from './idGenerator';

test('incrementLetters helper logic', () => {
  assert.equal(incrementLetters(''), 'A');
  assert.equal(incrementLetters('A'), 'B');
  assert.equal(incrementLetters('Z'), 'AA');
  assert.equal(incrementLetters('AA'), 'AB');
  assert.equal(incrementLetters('AZ'), 'BA');
  assert.equal(incrementLetters('ZZ'), 'AAA');
});

test('generateNextId - null handling', () => {
  assert.equal(generateNextId(null, 'HGTK'), 'HGTK001');
});

test('generateNextId - sequential numeric increment', () => {
  assert.equal(generateNextId('HGTK001', 'HGTK'), 'HGTK002');
  assert.equal(generateNextId('HGTK098', 'HGTK'), 'HGTK099');
  assert.equal(generateNextId('HGTK123', 'HGTK'), 'HGTK124');
});

test('generateNextId - rollover from 999 to A001', () => {
  assert.equal(generateNextId('HGTK999', 'HGTK'), 'HGTKA001');
});

test('generateNextId - increment with single alphabetical prefix', () => {
  assert.equal(generateNextId('HGTKA001', 'HGTK'), 'HGTKA002');
  assert.equal(generateNextId('HGTKA999', 'HGTK'), 'HGTKB001');
});

test('generateNextId - rollover from Z999 to AA001', () => {
  assert.equal(generateNextId('HGTKZ999', 'HGTK'), 'HGTKAA001');
});

test('generateNextId - rollover from ZZ999 to AAA001', () => {
  assert.equal(generateNextId('HGTKZZ999', 'HGTK'), 'HGTKAAA001');
});

test('generateNextId - operates correctly on other prefixes', () => {
  assert.equal(generateNextId(null, 'HGWR'), 'HGWR001');
  assert.equal(generateNextId('HGWR999', 'HGWR'), 'HGWRA001');
  assert.equal(generateNextId(null, 'HGPCR'), 'HGPCR001');
  assert.equal(generateNextId('HGPCRZ999', 'HGPCR'), 'HGPCRAA001');
});
