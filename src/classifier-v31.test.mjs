import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { classifyEvidenceV31, CLASSIFICATION_V31, TEMPLATE_TYPES_V31 } from './classifier-v31.mjs';
import { nextPassPlanV31 } from './plan-v31.mjs';
import { fitOcrDimensionsV31 } from './image-sizing-v31.mjs';

const profiles = JSON.parse(await fs.readFile(new URL('../capturas/perfiles-v31.json', import.meta.url), 'utf8'));
const reading = (text, confidence = 95) => [{ pass: 'synthetic-test', region: 'full', confidence, text }];

test('PUZZLE_COMPLETE requiere felicitación, tiempo y piezas; piezas no son score', () => {
  const result = classifyEvidenceV31(reading('¡Felicidades! Tiempo [mm:ss]: 3:26 Número de piezas: 28'), { profiles });
  assert.equal(result.templateType, 'PUZZLE_COMPLETE');
  assert.equal(result.finalizationStatus, CLASSIFICATION_V31.FINAL);
  assert.equal(result.durationSeconds, 206);
  assert.equal(result.pieceCount, 28);
  assert.equal(result.score, null);
  assert.equal(result.scorePerfect, null);
});

test('una felicitación intermedia con solo nivel y continuar queda indeterminada', () => {
  const result = classifyEvidenceV31(reading('¡Felicidades! Nivel 2 de 5 Continuar'), { profiles });
  assert.equal(result.templateType, 'UNKNOWN_LAYOUT');
  assert.notEqual(result.finalizationStatus, CLASSIFICATION_V31.FINAL);
  assert.equal(result.score, null);
});

test('Genially con felicitación y volver a empezar es solo finalización, sin perfección', () => {
  const result = classifyEvidenceV31(reading('¡ENHORABUENA! Powered by Genially · Volver a empezar'), { profiles });
  assert.equal(result.provider, 'GENIALLY');
  assert.equal(result.templateType, 'COMPLETION_ONLY');
  assert.equal(result.finalizationStatus, CLASSIFICATION_V31.FINAL);
  assert.equal(result.score, null);
  assert.equal(result.scorePerfect, null);
});

test('«Muy bien» y «Correcto» con pregunta siguiente son feedback, no fin', () => {
  for (const text of ['¡Muy bien! Pregunta 3 de 5 Siguiente pregunta', 'Correcto · Siguiente pregunta']) {
    const result = classifyEvidenceV31(reading(text), { profiles });
    assert.equal(result.templateType, 'FEEDBACK_ONLY');
    assert.equal(result.finalizationStatus, CLASSIFICATION_V31.NOT_FINAL);
    assert.equal(result.resultStatus, CLASSIFICATION_V31.UNKNOWN);
  }
});

test('una fracción 5/5 o progreso no se transforma en score final', () => {
  const result = classifyEvidenceV31(reading('Progreso de actividad · Pregunta 5 de 5 · 5/5'), { profiles });
  assert.equal(result.templateType, 'PROGRESS_ONLY');
  assert.equal(result.finalizationStatus, CLASSIFICATION_V31.NOT_FINAL);
  assert.equal(result.resultStatus, CLASSIFICATION_V31.ACTIVE);
  assert.equal(result.score, null);
  assert.deepEqual(result.observedFraction, { numerator: 5, denominator: 5, meaning: 'NO_DETERMINABLE_SIN_CIERRE' });
});

test('«Has terminado» es finalización sin puntuación', () => {
  const result = classifyEvidenceV31(reading('Has terminado · Volver a empezar'), { profiles });
  assert.equal(result.templateType, 'COMPLETION_ONLY');
  assert.equal(result.finalizationStatus, CLASSIFICATION_V31.FINAL);
  assert.equal(result.score, null);
});

test('Wordwall score final separa perfecto de resultado insuficiente sin emitir calificación', () => {
  const perfect = classifyEvidenceV31(reading('GAME COMPLETE · Score 14/14 · Time 1:07'), { profiles });
  assert.equal(perfect.templateType, 'SCORE_FINAL');
  assert.equal(perfect.score, 14);
  assert.equal(perfect.maxScore, 14);
  assert.equal(perfect.scorePerfect, true);
  assert.equal(perfect.durationSeconds, 67);
  assert.equal('academicGrade' in perfect, false);

  const insufficient = classifyEvidenceV31(reading('JUEGO COMPLETADO · Puntuación 4/5 · Hora 0:34'), { profiles });
  assert.equal(insufficient.resultStatus, CLASSIFICATION_V31.INSUFFICIENT);
  assert.equal(insufficient.scorePerfect, false);
  assert.equal('academicGrade' in insufficient, false);
});

test('6/5 inicial se conserva como warning y se resuelve con dos lecturas 6/6 concordantes', () => {
  const reads = [
    { pass: 'full-auto', confidence: 93, text: 'JUEGO COMPLETADO Puntuación Hora 6/5 1:26' },
    { pass: 'full-sparse', confidence: 94, text: 'JUEGO COMPLETADO Puntuación Hora 6/6 1:26' },
    { pass: 'wide-sparse', confidence: 93, text: 'JUEGO COMPLETADO Puntuación Hora 6/6 1:26' },
  ];
  const result = classifyEvidenceV31(reads, { profiles, expectedActivityTitle: 'Método de M Grande', expectedActivityId: '22610275' });
  assert.equal(result.score, 6);
  assert.equal(result.maxScore, 6);
  assert.equal(result.scorePerfect, true);
  assert.equal(result.scoreInconsistent, false);
  assert.ok(result.warnings.some((warning) => warning.includes('imposibles')));
});

test('una batería 61% no cambia el score explícito', () => {
  const result = classifyEvidenceV31(reading('GAME COMPLETE Score 6/6 Time 0:45 Battery 61%'), { profiles });
  assert.equal(result.score, 6);
  assert.equal(result.maxScore, 6);
  assert.ok(result.warnings.some((warning) => warning.toLowerCase().includes('porcentaje')));
});

test('un número de piezas sin cierre se conserva como metadato y nunca como score', () => {
  const result = classifyEvidenceV31(reading('Número de piezas: 28 · Continuar armando'), { profiles });
  assert.equal(result.templateType, 'UNKNOWN_LAYOUT');
  assert.equal(result.finalizationStatus, CLASSIFICATION_V31.UNKNOWN);
  assert.equal(result.pieceCount, 28);
  assert.equal(result.score, null);
});

test('felicitación aislada no equivale a feedback ni a cierre confirmado', () => {
  const result = classifyEvidenceV31(reading('¡Enhorabuena!'), { profiles });
  assert.equal(result.templateType, 'UNKNOWN_LAYOUT');
  assert.equal(result.finalizationStatus, CLASSIFICATION_V31.UNKNOWN);
});

test('sin texto legible devuelve formato desconocido e ILEGIBLE', () => {
  const result = classifyEvidenceV31(reading(''), { profiles });
  assert.equal(result.templateType, 'UNKNOWN_LAYOUT');
  assert.equal(result.finalizationStatus, CLASSIFICATION_V31.UNKNOWN);
  assert.equal(result.evidenceQuality, 'ILEGIBLE');
});

test('una pista de proveedor no se declara identidad visual ni autenticidad', () => {
  const result = classifyEvidenceV31(reading('GAME COMPLETE'), { profiles, providerHint: 'PUZZLE' });
  assert.equal(result.provider, 'PUZZLE');
  assert.equal(result.providerSource, 'PISTA_SELECCIONADA_POR_USUARIO_NO_VERIFICADA');
  assert.equal(result.identityMatch, 'NO_COMPROBADA');
  assert.equal(result.authenticityVerified, false);
});

test('los seis perfiles configurables están presentes', () => {
  assert.deepEqual(profiles.profiles.map((profile) => profile.id), TEMPLATE_TYPES_V31);
});

test('la salida temprana no relee feedback ni progreso y limita rescate a dos lecturas', () => {
  const feedback = classifyEvidenceV31(reading('¡Muy bien! Siguiente pregunta'), { profiles });
  assert.equal(nextPassPlanV31(reading('¡Muy bien! Siguiente pregunta'), feedback), null);
  const progress = classifyEvidenceV31(reading('5/5'), { profiles });
  assert.equal(nextPassPlanV31(reading('5/5'), progress), null);
  const empty = classifyEvidenceV31(reading(''), { profiles });
  assert.deepEqual(nextPassPlanV31(reading(''), empty), { pass: 'full-sparse', region: 'full', psm: 'sparse' });
  assert.equal(nextPassPlanV31([reading('x')[0], reading('y')[0]], empty), null);
});

test('una captura grande sin texto útil permite una pasada centrada; una pequeña se detiene antes', () => {
  const empty = classifyEvidenceV31(reading(''), { profiles });
  assert.deepEqual(nextPassPlanV31([reading('')[0], reading('')[0]], empty, 5, { width: 1080, height: 1920 }), { pass: 'center-auto', region: 'center', psm: 'auto' });
  assert.equal(nextPassPlanV31([reading('')[0], reading('')[0]], empty, 5, { width: 301, height: 301 }), null);
});

test('el límite de canvas reduce alta resolución y amplía capturas pequeñas con tope', () => {
  assert.deepEqual(fitOcrDimensionsV31(6000, 4000), { width: 2400, height: 1600, scale: 0.4, sourcePixels: 24000000 });
  assert.deepEqual(fitOcrDimensionsV31(301, 301), { width: 900, height: 900, scale: 900 / 301, sourcePixels: 90601 });
  assert.deepEqual(fitOcrDimensionsV31(2048, 1423), { width: 2048, height: 1423, scale: 1, sourcePixels: 2914304 });
});
