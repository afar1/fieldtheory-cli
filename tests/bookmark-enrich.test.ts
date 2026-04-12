import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl } from '../src/bookmark-enrich.js';

// ── Safe URLs (should pass) ──────────────────────────────────────────────

test('isSafeUrl: accepts public https URLs', () => {
  assert.equal(isSafeUrl('https://example.com/article'), true);
  assert.equal(isSafeUrl('https://news.ycombinator.com/item?id=42'), true);
  assert.equal(isSafeUrl('https://sub.domain.co.uk/path'), true);
});

test('isSafeUrl: accepts public http URLs', () => {
  assert.equal(isSafeUrl('http://example.com'), true);
});

test('isSafeUrl: accepts public IPv4 that happens to start with 1 or 17', () => {
  // Numeric-prefix domains that are NOT private ranges
  assert.equal(isSafeUrl('https://173.252.74.22'), true); // Facebook
  assert.equal(isSafeUrl('https://8.8.8.8'), true);        // Google DNS
});

// ── IPv4 loopback and private ranges ─────────────────────────────────────

test('isSafeUrl: rejects localhost by name', () => {
  assert.equal(isSafeUrl('http://localhost/admin'), false);
  assert.equal(isSafeUrl('https://LOCALHOST'), false);
});

test('isSafeUrl: rejects entire 127.0.0.0/8 loopback range', () => {
  assert.equal(isSafeUrl('http://127.0.0.1/'), false);
  assert.equal(isSafeUrl('http://127.1.2.3/'), false);
  assert.equal(isSafeUrl('http://127.255.255.254/'), false);
});

test('isSafeUrl: rejects 0.0.0.0', () => {
  assert.equal(isSafeUrl('http://0.0.0.0/'), false);
});

test('isSafeUrl: rejects RFC1918 private ranges', () => {
  assert.equal(isSafeUrl('http://10.0.0.1/'), false);
  assert.equal(isSafeUrl('http://10.255.255.255/'), false);
  assert.equal(isSafeUrl('http://192.168.1.1/'), false);
  assert.equal(isSafeUrl('http://172.16.0.1/'), false);
  assert.equal(isSafeUrl('http://172.31.255.255/'), false);
  // Just outside 172.16-31 should pass
  assert.equal(isSafeUrl('http://172.15.0.1/'), true);
  assert.equal(isSafeUrl('http://172.32.0.1/'), true);
});

test('isSafeUrl: rejects entire 169.254.0.0/16 link-local (not just metadata IP)', () => {
  assert.equal(isSafeUrl('http://169.254.169.254/latest/meta-data/'), false); // AWS metadata
  assert.equal(isSafeUrl('http://169.254.1.1/'), false);
  assert.equal(isSafeUrl('http://169.254.255.255/'), false);
});

test('isSafeUrl: rejects CGNAT 100.64.0.0/10', () => {
  assert.equal(isSafeUrl('http://100.64.0.1/'), false);
  assert.equal(isSafeUrl('http://100.127.255.254/'), false);
});

// ── Numeric IP encoding bypasses ─────────────────────────────────────────

test('isSafeUrl: rejects decimal integer form of 127.0.0.1', () => {
  // 2130706433 === 0x7f000001 === 127.0.0.1
  assert.equal(isSafeUrl('http://2130706433/'), false);
});

test('isSafeUrl: rejects hex form of 127.0.0.1', () => {
  assert.equal(isSafeUrl('http://0x7f000001/'), false);
});

// ── IPv6 loopback and link-local ─────────────────────────────────────────

test('isSafeUrl: rejects IPv6 loopback ::1', () => {
  assert.equal(isSafeUrl('http://[::1]/'), false);
});

test('isSafeUrl: rejects IPv6 unspecified ::', () => {
  assert.equal(isSafeUrl('http://[::]/'), false);
});

test('isSafeUrl: rejects IPv6 link-local fe80::/10', () => {
  assert.equal(isSafeUrl('http://[fe80::1]/'), false);
  assert.equal(isSafeUrl('http://[fe80::abcd:1234]/'), false);
});

test('isSafeUrl: rejects IPv6 unique-local fc00::/7', () => {
  assert.equal(isSafeUrl('http://[fc00::1]/'), false);
  assert.equal(isSafeUrl('http://[fd12:3456:789a::1]/'), false);
});

test('isSafeUrl: rejects IPv4-mapped IPv6 loopback', () => {
  assert.equal(isSafeUrl('http://[::ffff:127.0.0.1]/'), false);
});

// ── Non-http schemes ─────────────────────────────────────────────────────

test('isSafeUrl: rejects file://', () => {
  assert.equal(isSafeUrl('file:///etc/passwd'), false);
});

test('isSafeUrl: rejects ftp://', () => {
  assert.equal(isSafeUrl('ftp://example.com/'), false);
});

test('isSafeUrl: rejects javascript:', () => {
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
});

test('isSafeUrl: rejects data:', () => {
  assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
});

// ── Malformed ────────────────────────────────────────────────────────────

test('isSafeUrl: rejects garbage', () => {
  assert.equal(isSafeUrl('not a url'), false);
  assert.equal(isSafeUrl(''), false);
});
