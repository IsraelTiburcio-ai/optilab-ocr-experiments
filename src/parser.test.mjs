import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWordwallResult } from './parser.mjs';

test('an isolated final score never becomes a percentage or a pass', () => {
  const result = parseWordwallResult('SE ACABÓ EL TIEMPO\nPuntuación\n3', { confidence: 98 });
  assert.equal(result.score, 3);
  assert.equal(result.maxScore, null);
  assert.equal(result.percentage, null);
  assert.equal(result.finished, true);
  assert.equal(result.decision, 'indeterminado');
});

test('an explicit fraction can support a perfect result only after completion', () => {
  const result = parseWordwallResult('Método de M Grande\nActividad completada\nPuntuación: 10 de 10', { confidence: 96 });
  assert.equal(result.score, 10);
  assert.equal(result.maxScore, 10);
  assert.equal(result.percentage, 100);
  assert.equal(result.decision, 'acreditable');
});

test('an explicit non-perfect fraction is not accreditable', () => {
  const result = parseWordwallResult('Actividad completada\nPuntuación 8/10', { confidence: 94 });
  assert.equal(result.percentage, 80);
  assert.equal(result.decision, 'no_acreditable');
});

test('generic correct-answer feedback is not completion', () => {
  const result = parseWordwallResult('¡Correcto! ✓ 1 1:19 Verdadero Falso', { confidence: 92 });
  assert.equal(result.finished, false);
  assert.equal(result.feedback, 'correcto');
  assert.equal(result.decision, 'indeterminado');
});

test('zero score at the end is insufficient for this non-empty activity', () => {
  const result = parseWordwallResult('Se acabó el tiempo\nPuntuación 0', { confidence: 95 });
  assert.equal(result.decision, 'no_acreditable');
});

test('a visible countdown is not interpreted as elapsed resolution time', () => {
  const result = parseWordwallResult('Verdadero Falso 1:25 ✓ 2', { confidence: 91 });
  assert.equal(result.timerReadingSeconds, 85);
  assert.equal(result.durationSeconds, null);
});

test('an unlabeled Wordwall timer is not treated as elapsed resolution time', () => {
  const result = parseWordwallResult('Tiempo 1:25 ✓ 2', { confidence: 91 });
  assert.equal(result.timerReadingSeconds, 85);
  assert.equal(result.durationSeconds, null);
});

// These are parser rule checks over constructed OCR strings, not Wordwall screenshots or accuracy data.
