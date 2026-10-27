import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_POLICIES, parseWordwallResultV2 } from './parser-v2.mjs';
import { cropBounds, plannedPassesV2 } from './ocr-v2.mjs';

const matching = { title: 'Método de M Grande', activityId: '22610275' };
const run = (texts, options = {}) => parseWordwallResultV2(texts.map((text, i) => ({ pass: `p${i + 1}`, region: i ? 'center' : 'full', text })), { configuredActivity: matching, ...options });

test('final + 8/10 no acredita puntuación perfecta para actividad identificada', () => {
  const result = run(['Método de M Grande\nGAME COMPLETE\nScore 8/10']);
  assert.equal(result.finalization_detected, true);
  assert.equal(result.score, 8);
  assert.equal(result.max_score, 10);
  assert.equal(result.score_perfect_detected, false);
  assert.equal(result.decision, 'NO_ACREDITABLE');
});

test('actividad activa con 5/5 no acredita por faltar señal final', () => {
  const result = run(['Método de M Grande\n5/5\nTiempo restante 0:30']);
  assert.equal(result.score_perfect_detected, true);
  assert.equal(result.finalization_detected, false);
  assert.equal(result.timer_remaining_seconds, 30);
  assert.equal(result.duration_seconds, null);
  assert.equal(result.decision, 'INDETERMINADO');
});

test('un 61% aislado de batería se ignora', () => {
  const result = run(['Método de M Grande\nBatería 61%']);
  assert.equal(result.percentage, null);
  assert.equal(result.score_perfect_detected, null);
  assert.equal(result.uncontextualized_percent_ignored, true);
});

test('«¡Correcto!» solo es feedback, no finalización', () => {
  const result = run(['Método de M Grande\n¡Correcto!']);
  assert.equal(result.feedback_only, true);
  assert.equal(result.finalization_detected, false);
  assert.equal(result.decision, 'INDETERMINADO');
});

test('una fracción imposible 6/5 se conserva como ambigua', () => {
  const result = run(['Método de M Grande\nJUEGO COMPLETADO\nPuntuación 6/5']);
  assert.equal(result.score, null);
  assert.equal(result.max_score, null);
  assert.equal(result.data_inconsistent, true);
  assert.equal(result.score_inconsistent, true);
  assert.equal(result.decision, 'INDETERMINADO');
});

test('no corrige 6/5 hasta tener dos relecturas OCR coincidentes 6/6', () => {
  const oneConfirmation = run(['JUEGO COMPLETADO 6/5', 'JUEGO COMPLETADO 6/6']);
  assert.equal(oneConfirmation.score, null);
  const corroborated = run(['JUEGO COMPLETADO 6/5', 'JUEGO COMPLETADO 6/6', 'JUEGO COMPLETADO 6/6']);
  assert.equal(corroborated.score, 6);
  assert.equal(corroborated.max_score, 6);
  assert.equal(corroborated.score_perfect_detected, true);
  assert.equal(corroborated.data_inconsistent, false);
  assert.equal(corroborated.score_inconsistent, true);
  assert.ok(corroborated.warnings.some((warning) => warning.includes('fracciones imposibles')));
});

test('GAME COMPLETE sin puntos reconoce cierre sin inventar una calificación', () => {
  const result = run(['Método de M Grande\nGAME COMPLETE\nTime 2:07']);
  assert.equal(result.finalization_detected, true);
  assert.equal(result.successful_completion_detected, true);
  assert.equal(result.duration_seconds, 127);
  assert.equal(result.score, null);
  assert.equal(result.percentage, null);
});

test('un título alternativo se identifica como actividad distinta', () => {
  const result = run(['Características del M.P.L.\nJUEGO COMPLETADO\n6/6']);
  assert.equal(result.activity_identified, true);
  assert.equal(result.activity_matched, false);
  assert.equal(result.decision, 'NO_ACREDITABLE');
});

test('ACTIVIDAD_COMPLETADA acepta cierre exitoso si la identidad coincide, aunque no haya puntos', () => {
  const result = run(['Método de M Grande\nJUEGO COMPLETADO'], { policy: ACADEMIC_POLICIES.ACTIVITY_COMPLETED });
  assert.equal(result.decision, 'ACREDITABLE');
  assert.equal(result.score, null);
  assert.equal(result.evidence_authenticated, false);
});

test('finalización y tiempo de resolución se separan de la autenticidad', () => {
  const result = run(['Método de M Grande\nJUEGO COMPLETADO\nHora 12.3s\nPuntuación 5/5']);
  assert.equal(result.duration_seconds, 12.3);
  assert.equal(result.finalization_detected, true);
  assert.equal(result.evidence_authenticated, false);
});

test('lee tiempos cuando OCR separa la etiqueta y sitúa la puntuación antes del reloj', () => {
  const clock = run(['GAME COMPLETE\nScore\nTime\n14/14 1:07']);
  assert.equal(clock.duration_seconds, 67);
  const decimal = run(['JUEGO COMPLETADO\nPuntuación\nHora\n5/5\n12. 3']);
  assert.equal(decimal.duration_seconds, 12.3);
});

test('porcentaje explícito 100% puede definir perfección; porcentaje de batería no', () => {
  const explicit = run(['Método de M Grande\nGAME COMPLETE\nPuntuación: 100%']);
  assert.equal(explicit.score_perfect_detected, true);
  const adjacent = run(['Método de M Grande\nGAME COMPLETE\n6/6 100%']);
  assert.equal(adjacent.score_perfect_detected, true);
  const battery = run(['Método de M Grande\nGAME COMPLETE\n61%']);
  assert.equal(battery.percentage, null);
});

test('proporciones OCR se ajustan a dimensiones de pantalla', () => {
  assert.deepEqual(cropBounds(2000, 1000, 'center'), { x: 600, y: 220, width: 800, height: 560, label: 'Tarjeta central · 40 % × 56 %' });
});

test('plan adaptativo mantiene el límite de pasadas y se detiene ante actividad distinta', () => {
  const parsed = run(['GAME COMPLETE']);
  const next = plannedPassesV2([{ pass: 'full-auto' }], parsed, 5);
  assert.equal(next.length, 4);
  const other = run(['Características del M.P.L.']);
  assert.equal(plannedPassesV2([{ pass: 'full-auto' }], other).length, 0);
});
