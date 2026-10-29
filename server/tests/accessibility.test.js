import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPage } from '../src/services/accessibility.js';

test('Accessibility Engine - detects missing alt attributes and form labels', async () => {
  const sampleHtml = `
    <!doctype html>
    <html lang="en">
    <head><title>Test Store</title></head>
    <body>
      <main>
        <h1>Welcome</h1>
        <img src="banner.jpg">
        <form>
          <input type="text" name="username">
        </form>
      </main>
    </body>
    </html>
  `;

  const result = await auditPage('http://localhost/test', { htmlContent: sampleHtml, targetLevel: 'AA' });

  assert.equal(result.status, 'completed');
  assert.ok(result.violations.some((v) => v.ruleId === 'image-alt'));
  assert.ok(result.violations.some((v) => v.ruleId === 'label'));
  assert.ok(result.score < 100, 'Score should be penalized for critical violations');
});

test('Accessibility Engine - passes fully accessible document', async () => {
  const accessibleHtml = `
    <!doctype html>
    <html lang="en">
    <head>
      <title>Accessible Company Page</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
      <main>
        <h1>Accessible Heading</h1>
        <p>Introduction text.</p>
        <img src="product.jpg" alt="Description of product">
        <form>
          <label for="email-field">Email address</label>
          <input id="email-field" type="email" name="email">
          <button type="submit">Submit Form</button>
        </form>
      </main>
    </body>
    </html>
  `;

  const result = await auditPage('http://localhost/accessible', { htmlContent: accessibleHtml, targetLevel: 'AA' });

  assert.equal(result.status, 'completed');
  assert.equal(result.summary.byImpact.critical, 0);
  assert.equal(result.score, 100);
});

test('Accessibility Engine - flags viewport zoom restrictions (WCAG 1.4.4 AA)', async () => {
  const zoomLockedHtml = `
    <!doctype html>
    <html lang="en">
    <head>
      <title>Locked App</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
    </head>
    <body><main><h1>App</h1></main></body>
    </html>
  `;

  const result = await auditPage('http://localhost/locked', { htmlContent: zoomLockedHtml, targetLevel: 'AA' });
  assert.ok(result.violations.some((v) => v.ruleId === 'meta-viewport-zoomable'));
});

