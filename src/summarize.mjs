import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'capturas/manifest.json'),'utf8'));
const baseline=JSON.parse(await fs.readFile(path.join(root,'resultados/ocr-baseline.json'),'utf8')).runs;
const ablationFile=JSON.parse(await fs.readFile(path.join(root,'resultados/ocr-ablation.json'),'utf8'));
const ablation=ablationFile.runs;
const ref=new Map(manifest.images.map(x=>[x.filename,x.reference]));
const byImage=(rows)=>{const m=new Map();for(const row of rows){if(!m.has(row.image))m.set(row.image,[]);m.get(row.image).push(row)}return m};
const bmap=byImage(baseline);
function majority(values){const counts=new Map();for(const v of values){const k=JSON.stringify(v);counts.set(k,(counts.get(k)||0)+1)}const w=[...counts].sort((a,b)=>b[1]-a[1])[0];return w?JSON.parse(w[0]):null}
function stats(checks){return {correct:checks.filter(x=>x.correct).length,total:checks.length,accuracy:checks.length?checks.filter(x=>x.correct).length/checks.length:null,checks}}
function fieldChecks(rows, field, refField=field, category='original'){
 const chosen=manifest.images.filter(i=>i.category===category&&i.reference[refField]!==null&&i.reference[refField]!==undefined);
 const unique=category==='original'? [...new Map(chosen.map(i=>[i.sha256,i])).values()]:chosen;
 return stats(unique.map(item=>{const rr=rows.filter(r=>r.image===item.filename);const predicted=majority(rr.map(r=>r.parsed[field]));const expected=item.reference[refField];return {image:item.filename,expected,predicted,correct:JSON.stringify(expected)===JSON.stringify(predicted),repetitions:rr.length}}));
}
const originals=[...new Map(manifest.images.filter(i=>i.category==='original').map(i=>[i.sha256,i])).values()];
const classificationChecks=originals.map(i=>{const rows=bmap.get(i.filename)||[];const predicted=majority(rows.map(r=>r.parsed.decision));return {image:i.filename,expected:i.reference.decision,predicted,correct:predicted===i.reference.decision,sourceCaptureId:i.sourceCaptureId}});
const classification=stats(classificationChecks);
classification.counts=classificationChecks.reduce((o,x)=>(o[x.predicted]=(o[x.predicted]||0)+1,o),{});
classification.falsePositives=classificationChecks.filter(x=>x.predicted==='acreditable'&&x.expected!=='acreditable');
classification.perfectCases=classificationChecks.filter(x=>x.expected==='acreditable').length;
classification.falseNegatives=classification.perfectCases?classificationChecks.filter(x=>x.expected==='acreditable'&&x.predicted!=='acreditable'):null;
classification.indeterminate=classificationChecks.filter(x=>x.predicted==='indeterminado').length;

const finalOriginals=originals.filter(i=>i.reference.state==='fin_por_tiempo');
const finalChecks=finalOriginals.map(i=>{const rows=bmap.get(i.filename)||[];const predicted=majority(rows.map(r=>r.parsed.score));const finished=majority(rows.map(r=>r.parsed.finished));return {image:i.filename,expectedScore:i.reference.score,predictedScore:predicted,scoreCorrect:predicted===i.reference.score,expectedFinished:i.reference.finished,predictedFinished:finished,finishedCorrect:finished===i.reference.finished}});
function runStats(rows, refField='score', parsedField='score'){
 const tests=rows.filter(r=>ref.get(r.image)?.[refField]!==null&&ref.get(r.image)?.[refField]!==undefined);
 return {correct:tests.filter(r=>r.parsed[parsedField]===ref.get(r.image)[refField]).length,total:tests.length,accuracy:tests.length?tests.filter(r=>r.parsed[parsedField]===ref.get(r.image)[refField]).length/tests.length:null,avgConfidence:rows.length?rows.reduce((a,r)=>a+r.confidence,0)/rows.length:null,meanRecognitionMs:rows.length?rows.reduce((a,r)=>a+r.recognitionMs,0)/rows.length:null};
}
const langImages=new Set(ablationFile.experiments.languageComparison);
const languageComparison={};
for(const language of ['spa','eng','spa+eng']){const candidates=ablation.filter(r=>langImages.has(r.image)&&r.config.language===language&&r.config.psm==='auto'&&r.config.region==='full');const rows=[];for(const image of ablationFile.experiments.languageComparison) rows.push(...candidates.filter(r=>r.image===image).slice(0,3));languageComparison[language]={images:4,repetitionsPerImage:3,score:runStats(rows),title:runStats(rows,'activityRecognized','activityRecognized'),finished:runStats(rows,'finished','finished')};}
const regionComparison=[];
for(const image of ablationFile.experiments.fullVsRegion){const rows=ablation.filter(r=>r.image===image[0]&&r.config.region===image[1]&&r.config.psm==='auto'&&r.config.language==='spa+eng').slice(0,3);regionComparison.push({image:image[0],region:image[1],...runStats(rows),finished:runStats(rows,'finished','finished')});}
const psmComparison=[];
for(const psm of ['auto','sparse','block','line']) for(const region of ['full','central-crop']){
 const images=['capturas/originales/wordwall-fin-por-tiempo-puntuacion-3.png','capturas/variantes/v10-final3-recorte-centro.png','capturas/originales/wordwall-resultado-ronda-1.png','capturas/variantes/v13-final0-recorte-centro.png'].filter(image=>ref.get(image)?.state==='fin_por_tiempo' && (region==='full' ? image.includes('/originales/') : image.includes('/variantes/')));const rows=[];for(const image of images)rows.push(...ablation.filter(r=>r.image===image&&r.config.psm===psm&&r.config.region===region&&r.config.language==='spa+eng').slice(0,3));
 psmComparison.push({psm,region,repetitions:rows.length,...runStats(rows),finished:runStats(rows,'finished','finished')});
}
const variants=[...manifest.images.filter(i=>i.category==='variant')];
const variantScore=fieldChecks(baseline,'score','score','variant');
const variantFinished=fieldChecks(baseline,'finished','finished','variant');
const times=baseline.map(r=>r.recognitionMs).sort((a,b)=>a-b);
const percentile=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)];
const metrics={
 generatedAt:new Date().toISOString(),engine:'Tesseract.js 7.0.0',
 dataset:{imageFiles:manifest.images.length,originalFiles:16,variantFiles:variants.length,byteUniqueFiles:new Set(manifest.images.map(x=>x.sha256)).size,uniqueOriginalScreenshots:originals.length,exactDuplicateOriginals:manifest.images.filter(i=>i.category==='original'&&i.exactDuplicateOf!==null).length,baselineRepetitionsPerImage:3,baselineRuns:baseline.length,variantsCountedAsIndependent:false,documentedEarlierRunCount:2,runProvenanceNote:'El resumen previo describe dos corridas: una finalizó con 3 y otra quedó en una respuesta incorrecta. La carpeta también contiene cierres con 0 puntos y las revisiones no fijan su pertenencia a una corrida. Las capturas únicas no se presentan como partidas independientes.'},
 fields:{activityTitle:fieldChecks(baseline,'activityRecognized'),score:fieldChecks(baseline,'score'),scoreFinalOnly:stats(finalChecks.map(x=>({image:x.image,expected:x.expectedScore,predicted:x.predictedScore,correct:x.scoreCorrect}))),runningCounter:stats(originals.filter(i=>i.reference.scoreKind==='marcador_en_curso').map(i=>{const rows=bmap.get(i.filename)||[];const predicted=majority(rows.map(r=>r.parsed.score));return {image:i.filename,expected:i.reference.score,predicted,correct:predicted===i.reference.score}})),finished:fieldChecks(baseline,'finished'),timerRemainingSeconds:fieldChecks(baseline,'timerReadingSeconds','timerRemainingSeconds'),maxScore:{accuracy:null,referenceCases:0,recognizedInBaseline:baseline.filter(r=>r.parsed.maxScore!==null).length,note:'El máximo no aparece en ninguna imagen de referencia; la exactitud no se puede estimar.'},percentage:{accuracy:null,referenceCases:0,recognizedInBaseline:baseline.filter(r=>r.parsed.percentage!==null).length,note:'No hay porcentaje ni denominador nativo visible.'},durationSeconds:{accuracy:null,referenceCases:0,recognizedInBaseline:baseline.filter(r=>r.parsed.durationSeconds!==null).length,note:'El temporizador en curso es una cuenta regresiva; ninguna captura muestra duración de resolución.'}},
 classification:{...classification,note:'Exactitud de tres clases sobre 14 capturas originales únicas por hash. La muestra está dominada por casos indeterminados y no contiene capturas perfectas.'},
 variants:{files:variants.length,score:variantScore,finished:variantFinished,note:'Cada variante se deriva de un original y se evalúa aparte; no aumenta el número de partidas.'},
 ablation:{languageComparison,fullVsRegion:regionComparison,segmentation:psmComparison,numericWhitelist:{runs:ablation.filter(r=>r.config.whitelist).length,note:'Una lectura de solo dígitos pierde el contexto semántico del número y no sirve por sí sola para decidir que es la puntuación.'}},
 repeatStability:{files:[...byImage(baseline).entries()].map(([image,rows])=>({image,stable:new Set(rows.map(r=>JSON.stringify({score:r.parsed.score,maxScore:r.parsed.maxScore,finished:r.parsed.finished,decision:r.parsed.decision}))).size===1})).filter(x=>x.stable).length,totalFiles:manifest.images.length},
 runtime:{runs:baseline.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,medianMs:percentile(.5),p95Ms:percentile(.95),minMs:times[0],maxMs:times.at(-1),workerLoads:ablationFile.workerLoads,note:'Tiempos tomados con modelos en caché, en este Mac; la primera descarga de idioma no quedó medida como fría.'},
};
await fs.writeFile(path.join(root,'resultados/metrics.json'),JSON.stringify(metrics,null,2)+'\n');
const csvRows=[['image','category','sourceCaptureId','replicate','language','psm','region','recognitionMs','confidence','score','maxScore','percentage','finished','decision','rawText']];
for(const r of baseline){csvRows.push([r.image,r.category,r.sourceCaptureId,r.replicate,r.config.language,r.config.psm,r.config.region,r.recognitionMs,r.confidence,r.parsed.score,r.parsed.maxScore,r.parsed.percentage,r.parsed.finished,r.parsed.decision,r.rawText]);}
const csv=csvRows.map(row=>row.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}).join(',')).join('\n')+'\n';
await fs.writeFile(path.join(root,'resultados/ocr-baseline.csv'),csv);
console.log(JSON.stringify({dataset:metrics.dataset,fields:{activityTitle:metrics.fields.activityTitle,score:metrics.fields.score,scoreFinalOnly:metrics.fields.scoreFinalOnly,finished:metrics.fields.finished,timerRemainingSeconds:metrics.fields.timerRemainingSeconds},classification:metrics.classification,variants:{score:variantScore,finished:variantFinished},ablation:metrics.ablation,runtime:metrics.runtime},null,2));
