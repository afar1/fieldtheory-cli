import test from 'node:test';
import assert from 'node:assert/strict';
import { extractReadableText } from '../src/bookmark-enrich.js';
import type { ArticleContent } from '../src/bookmark-enrich.js';

// ── extractReadableText ─────────────────────────────────────────────────────

test('extractReadableText: extracts from <article> tag', () => {
  const html = `
    <html>
    <head><title>Test Page</title></head>
    <body>
      <nav>Navigation stuff</nav>
      <article>
        <h1>Great Article</h1>
        <p>This is a really interesting article about machine learning and its applications in modern healthcare systems and diagnostics.</p>
      </article>
      <footer>Footer stuff</footer>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.equal(result.title, 'Test Page');
  assert.ok(result.text.includes('machine learning'));
  assert.ok(!result.text.includes('Navigation'));
  assert.ok(!result.text.includes('Footer'));
});

test('extractReadableText: extracts from <main> tag when no <article>', () => {
  const html = `
    <html>
    <head><title>Main Content Page</title></head>
    <body>
      <nav>Nav</nav>
      <main>
        <p>This main section contains important information about programming languages and their evolution over the last few decades.</p>
      </main>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(result.text.includes('programming languages'));
});

test('extractReadableText: uses OG title when available', () => {
  const html = `
    <html>
    <head>
      <title>Site Name | Generic Title</title>
      <meta property="og:title" content="The Real Article Title" />
      <meta property="og:site_name" content="TechBlog" />
    </head>
    <body>
      <article>
        <p>Article content about distributed systems and their role in modern cloud infrastructure for enterprise applications.</p>
      </article>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.equal(result.title, 'The Real Article Title');
  assert.equal(result.siteName, 'TechBlog');
});

test('extractReadableText: falls back to meta description for short content', () => {
  const html = `
    <html>
    <head>
      <meta name="description" content="A comprehensive guide to building scalable web applications with modern frameworks and tooling for production deployment" />
    </head>
    <body><p>Short.</p></body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(result.text.includes('comprehensive guide'));
});

test('extractReadableText: extracts from JSON-LD structured data', () => {
  const html = `
    <html>
    <head>
      <script type="application/ld+json">
        {"@type": "Article", "articleBody": "This is a long form article about the future of artificial intelligence and how it will transform every industry in the coming decades."}
      </script>
    </head>
    <body><p>Tiny.</p></body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(result.text.includes('artificial intelligence'));
});

test('extractReadableText: returns null for content under 50 chars', () => {
  const html = `<html><body><p>Too short</p></body></html>`;
  const result = extractReadableText(html);
  assert.equal(result, null);
});

test('extractReadableText: decodes HTML entities', () => {
  const html = `
    <html>
    <head><title>Test &amp; Title</title></head>
    <body>
      <article>
        <p>This article discusses the relationship between risk &amp; reward in venture capital investing, and why it&#39;s important to understand the dynamics.</p>
      </article>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.equal(result.title, 'Test & Title');
  assert.ok(result.text.includes('risk & reward'));
});

test('extractReadableText: strips script and style tags', () => {
  const html = `
    <html>
    <head><title>Clean Page</title></head>
    <body>
      <script>var malicious = "code";</script>
      <style>.hidden { display: none; }</style>
      <article>
        <p>Only this clean content about database optimization techniques and query planning should remain in the extracted text output.</p>
      </article>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(!result.text.includes('malicious'));
  assert.ok(!result.text.includes('display'));
  assert.ok(result.text.includes('database optimization'));
});

test('extractReadableText: caps at 15000 chars', () => {
  const longText = 'word '.repeat(5000);
  const html = `
    <html><body><article><p>${longText}</p></article></body></html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(result.text.length <= 15004); // 15000 + "..."
  assert.ok(result.text.endsWith('...'));
});
