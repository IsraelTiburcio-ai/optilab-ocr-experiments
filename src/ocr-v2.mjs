export const OCR_PASSES_V2 = [
  { pass: 'full-auto', region: 'full', psm: 'auto' },
  { pass: 'full-sparse', region: 'full', psm: 'sparse' },
  { pass: 'center-auto', region: 'center', psm: 'auto' },
  { pass: 'center-sparse', region: 'center', psm: 'sparse' },
  { pass: 'wide-sparse', region: 'wide', psm: 'sparse' },
];

export const OCR_REGION_V2 = {
  full: { x: 0, y: 0, width: 1, height: 1, label: 'Captura completa' },
  center: { x: 0.30, y: 0.22, width: 0.40, height: 0.56, label: 'Tarjeta central · 40 % × 56 %' },
  wide: { x: 0.15, y: 0.10, width: 0.70, height: 0.80, label: 'Zona ampliada · 70 % × 80 %' },
};

export function cropBounds(width, height, regionName) {
  const region = OCR_REGION_V2[regionName] ?? OCR_REGION_V2.full;
  const x = Math.round(width * region.x);
  const y = Math.round(height * region.y);
  const cropWidth = Math.min(width - x, Math.round(width * region.width));
  const cropHeight = Math.min(height - y, Math.round(height * region.height));
  return { x, y, width: Math.max(1, cropWidth), height: Math.max(1, cropHeight), label: region.label };
}

export function plannedPassesV2(readings, parsed, maxPasses = OCR_PASSES_V2.length) {
  const completed = new Set(readings.map((item) => item.pass));
  if (parsed.activity_matched === false) return [];
  if (!parsed.data_inconsistent && parsed.score_perfect_detected !== null
    && parsed.finalization_detected === true && parsed.activity_matched === true) return [];
  return OCR_PASSES_V2.filter((candidate) => !completed.has(candidate.pass)).slice(0, Math.max(0, maxPasses - readings.length));
}
