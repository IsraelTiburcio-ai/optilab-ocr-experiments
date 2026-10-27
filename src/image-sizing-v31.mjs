export const OCR_LIMITS_V31 = Object.freeze({
  maxLongEdge: 2400,
  minLongEdge: 900,
  maxUpscale: 3,
  maxPasses: 5,
});

export function fitOcrDimensionsV31(width, height, limits = OCR_LIMITS_V31) {
  const longest = Math.max(width, height);
  let scale = 1;
  if (longest > limits.maxLongEdge) scale = limits.maxLongEdge / longest;
  else if (longest < limits.minLongEdge) scale = Math.min(limits.minLongEdge / longest, limits.maxUpscale);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    sourcePixels: width * height,
  };
}
