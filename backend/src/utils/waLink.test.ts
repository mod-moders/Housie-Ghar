import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWaLink } from './waLink';

test('strips non-numeric chars from phone except +', () => {
  assert.equal(
    buildWaLink('+91 90466-82303', 'hi'),
    'https://wa.me/+919046682303?text=hi'
  );
});

test('url-encodes the message', () => {
  const link = buildWaLink('919046682303', 'Hi Ram, ₹500?');
  assert.ok(link.startsWith('https://wa.me/919046682303?text='));
  assert.ok(link.includes(encodeURIComponent('Hi Ram, ₹500?')));
});
