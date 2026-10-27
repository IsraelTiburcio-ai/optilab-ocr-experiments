import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { ACADEMIC_POLICIES, parseWordwallResultV2 } from './parser-v2.mjs';
import { evaluateEvidenceV3, makeRecordV3, nextPassesV3 } from './engine-v3.mjs';

const activity = { id: 'wordwall-metodo-m-grande', provider: 'wordwall', activityId: '22610275', title: 'Método de M Grande', gradingPolicy: ACADEMIC_POLICIES.PERFECT_SCORE, verificationMode: 'STRICT', allowContextualEvidence: true, knownOtherTitles: ['Características del M.P.L.', 'Actividad B'] };
const parsed = (text, config = activity, confidence = 95) => parseWordwallResultV2([{ pass: 'full-auto', region: 'full', text, confidence }], { configuredActivity: { title: config.title, activityId: config.activityId } });

test('cierre perfecto sin nombre queda pendiente en estricto y acreditable solo contextual aprobado', () => {
  const result = evaluateEvidenceV3(parsed('GAME COMPLETE\nScore 6/6'), activity);
  assert.equal(result.activityMatch, 'NO_COMPROBADA');
  assert.equal(result.decisions.STRICT.decision, 'REQUIERE_NUEVA_EVIDENCIA');
  assert.equal(result.decisions.CONTEXTUAL.decision, 'ACREDITABLE_SEGUN_POLITICA');
  assert.equal(result.decisions.CONTEXTUAL.academicGrade, 1);
  assert.equal(result.decisions.CONTEXTUAL.identityAssumedFromContext, true);
  assert.equal(result.authenticityVerified, false);
});

test('el modo contextual sin aprobación explícita no concede crédito', () => {
  const result = evaluateEvidenceV3(parsed('GAME COMPLETE\nScore 6/6'), { ...activity, allowContextualEvidence: false });
  assert.equal(result.decisions.CONTEXTUAL.decision, 'PENDIENTE_REVISION');
});

test('un título de otra actividad bloquea ambos modos y no produce cero', () => {
  const result = evaluateEvidenceV3(parsed('Actividad B\nJUEGO COMPLETADO\nPuntuación 6/6'), activity);
  assert.equal(result.activityMatch, 'CONTRADICHA');
  assert.equal(result.decisions.STRICT.decision, 'EVIDENCIA_DE_OTRA_ACTIVIDAD');
  assert.equal(result.decisions.CONTEXTUAL.decision, 'EVIDENCIA_DE_OTRA_ACTIVIDAD');
  assert.equal(result.decisions.CONTEXTUAL.academicGrade, null);
});

test('una pantalla final sin puntuación no se convierte en cero para puntuación perfecta', () => {
  const result = evaluateEvidenceV3(parsed('GAME COMPLETE\nTime 2:07'), activity);
  assert.equal(result.resultStatus, 'COMPLETADO');
  assert.equal(result.decisions.CONTEXTUAL.decision, 'REQUIERE_NUEVA_EVIDENCIA');
  assert.equal(result.decisions.CONTEXTUAL.academicGrade, null);
});

test('8/10 solo produce cero cuando se observa el criterio incumplido y la política permite la atribución', () => {
  const result = evaluateEvidenceV3(parsed('Método de M Grande\nGAME COMPLETE\nScore 8/10'), activity);
  assert.equal(result.activityMatch, 'CONFIRMADA');
  assert.equal(result.resultStatus, 'INSUFICIENTE');
  assert.equal(result.decisions.STRICT.decision, 'NO_CUMPLE_CRITERIO');
  assert.equal(result.decisions.STRICT.academicGrade, 0);
});

test('lectura recuperada 6/5 conserva warning, pero puede usar dos fracciones concordantes', () => {
  const p = parseWordwallResultV2([
    { pass: 'full-auto', region: 'full', text: 'JUEGO COMPLETADO 6/5', confidence: 90 },
    { pass: 'full-sparse', region: 'full', text: 'JUEGO COMPLETADO 6/6', confidence: 90 },
    { pass: 'wide-sparse', region: 'wide', text: 'JUEGO COMPLETADO 6/6', confidence: 80 },
  ], { configuredActivity: { title: activity.title, activityId: activity.activityId } });
  const result = evaluateEvidenceV3(p, activity);
  assert.equal(result.score, 6);
  assert.equal(result.scoreInconsistent, true);
  assert.equal(result.evidenceQuality, 'SUFICIENTE');
  assert.ok(result.warnings.some((x) => x.includes('fracciones imposibles')));
  assert.equal(result.decisions.CONTEXTUAL.decision, 'ACREDITABLE_SEGUN_POLITICA');
});

test('una fracción inválida sin corroboración no genera crédito y queda para revisión', () => {
  const result = evaluateEvidenceV3(parsed('JUEGO COMPLETADO 6/5'), activity);
  assert.equal(result.dataInconsistent, true);
  assert.equal(result.decisions.CONTEXTUAL.decision, 'PENDIENTE_REVISION');
});

test('la política ACTIVIDAD_COMPLETADA admite cierre satisfactorio sin puntuación', () => {
  const config = { ...activity, gradingPolicy: ACADEMIC_POLICIES.ACTIVITY_COMPLETED };
  const result = evaluateEvidenceV3(parsed('Método de M Grande\nJUEGO COMPLETADO', config), config);
  assert.equal(result.resultStatus, 'COMPLETADO');
  assert.equal(result.decisions.STRICT.decision, 'ACREDITABLE_SEGUN_POLITICA');
});

test('ACTIVIDAD_COMPLETADA contextual puede aceptar cierre sin puntos, pero registra identidad asumida', () => {
  const config = { ...activity, gradingPolicy: ACADEMIC_POLICIES.ACTIVITY_COMPLETED, verificationMode: 'CONTEXTUAL' };
  const result = evaluateEvidenceV3(parsed('GAME COMPLETE\nTime 2:07', config), config);
  assert.equal(result.resultStatus, 'COMPLETADO');
  assert.equal(result.decisions.STRICT.decision, 'REQUIERE_NUEVA_EVIDENCIA');
  assert.equal(result.decisions.CONTEXTUAL.decision, 'ACREDITABLE_SEGUN_POLITICA');
  assert.equal(result.decisions.CONTEXTUAL.identityAssumedFromContext, true);
});

test('fixture cruzado con título legible se rechaza en ambos modos y no genera cero', () => {
  const result = evaluateEvidenceV3(parsed('Actividad B\nGAME COMPLETE\nScore 4/4'), activity);
  assert.equal(result.activityMatch, 'CONTRADICHA');
  assert.equal(result.decisions.STRICT.academicGrade, null);
  assert.equal(result.decisions.CONTEXTUAL.academicGrade, null);
});

test('una captura cruzada 4/4 sin nombre es indistinguible y entra como falso crédito contextual', () => {
  const result = evaluateEvidenceV3(parsed('GAME COMPLETE\nScore 4/4'), activity);
  assert.equal(result.activityMatch, 'NO_COMPROBADA');
  assert.equal(result.decisions.STRICT.decision, 'REQUIERE_NUEVA_EVIDENCIA');
  assert.equal(result.decisions.CONTEXTUAL.decision, 'ACREDITABLE_SEGUN_POLITICA');
});

test('una captura cruzada 8/10 sin nombre podría producir un cero contextual equivocado', () => {
  const result = evaluateEvidenceV3(parsed('JUEGO COMPLETADO\nPuntuación 8/10\nHora 0:52'), activity);
  assert.equal(result.activityMatch, 'NO_COMPROBADA');
  assert.equal(result.decisions.STRICT.decision, 'REQUIERE_NUEVA_EVIDENCIA');
  assert.equal(result.decisions.CONTEXTUAL.decision, 'NO_CUMPLE_CRITERIO');
  assert.equal(result.decisions.CONTEXTUAL.academicGrade, 0);
});

test('un recorte 6/6 sin señal final no acredita', () => {
  const result = evaluateEvidenceV3(parsed('6/6'), activity);
  assert.equal(result.scorePerfectDetected, true);
  assert.equal(result.finalizationDetected, false);
  assert.equal(result.decisions.CONTEXTUAL.decision, 'REQUIERE_NUEVA_EVIDENCIA');
});

test('la batería 61% no reemplaza la fracción válida del juego', () => {
  const p = parseWordwallResultV2([{ pass:'full-auto', text:'61%\nJUEGO COMPLETADO\nScore 6/6' }], { configuredActivity:{title:activity.title,activityId:activity.resourceId} });
  const result = evaluateEvidenceV3(p, activity);
  assert.equal(result.percentage, 100);
  assert.equal(p.uncontextualized_percent_ignored, true);
  assert.equal(result.decisions.CONTEXTUAL.decision, 'ACREDITABLE_SEGUN_POLITICA');
});

test('los archivos genéricos sintéticos son idénticos byte a byte aunque la fuente etiquetada cambie', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const folder = path.join(root, 'capturas/sinteticas-v3');
  const first = await fs.readFile(path.join(folder, 'synthetic-generic-target.png'));
  const second = await fs.readFile(path.join(folder, 'synthetic-generic-cross-game-duplicate.png'));
  assert.equal(crypto.createHash('sha256').update(first).digest('hex'), crypto.createHash('sha256').update(second).digest('hex'));
  const sameRead1 = evaluateEvidenceV3(parsed('JUEGO COMPLETADO\nPuntuación 6/6\nHora 1:26'), activity);
  const sameRead2 = evaluateEvidenceV3(parsed('JUEGO COMPLETADO\nPuntuación 6/6\nHora 1:26'), activity);
  assert.deepEqual(sameRead1.decisions, sameRead2.decisions);
  assert.equal(sameRead2.decisions.CONTEXTUAL.decision, 'ACREDITABLE_SEGUN_POLITICA');
});

test('scheduler V3 no repite OCR solo para buscar una identidad ausente', () => {
  const p = parsed('GAME COMPLETE\nScore 6/6');
  assert.equal(nextPassesV3([{ pass: 'full-auto', text: 'GAME COMPLETE Score 6/6' }], p, activity).length, 0);
});

test('scheduler reintenta fracción imposible y se detiene al resolverla', () => {
  const p = parsed('JUEGO COMPLETADO 6/5');
  assert.equal(nextPassesV3([{ pass: 'full-auto', text: 'JUEGO COMPLETADO 6/5' }], p, activity).length, 1);
  const resolved = parseWordwallResultV2([
    { pass: 'full-auto', text: 'JUEGO COMPLETADO 6/5' },
    { pass: 'full-sparse', text: 'JUEGO COMPLETADO 6/6' },
    { pass: 'center-auto', text: 'JUEGO COMPLETADO 6/6' },
  ], { configuredActivity: { title: activity.title, activityId: activity.activityId } });
  assert.equal(nextPassesV3(resolved.ocr_passes, resolved, activity).length, 0);
});

test('las filas de registro no convierten evidencia rechazada por identidad en cero', () => {
  const evidence = evaluateEvidenceV3(parsed('Características del M.P.L.\nJUEGO COMPLETADO 6/6'), activity);
  const row = makeRecordV3(evidence, 'Alumno demo 002');
  assert.equal(row.academicGrade, null);
  assert.equal(row.submissionStatus, 'EVIDENCIA_DE_OTRA_ACTIVIDAD');
  assert.equal(row.simulated, true);
});
