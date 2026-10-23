/**
 * What the clinic simulator sends, and when. Pure functions, so the timing
 * and content are tested on any machine; sim.mjs does the writing on Windows.
 *
 * Serial scenarios replay real captures (src-tauri/tests/fixtures) into the
 * far end of a com0com pair, in small timed chunks like a real UART. Exigo
 * scenarios write files into the watched folder the way the BM800 does.
 */

export const SCENARIOS = {
  'pointcare-panel': { kind: 'serial', port: 'pointcare', fixture: 'real_chem_pcv.bin', chunkSize: 64, gapMs: 15 },
  'pointcare-twice': { kind: 'serial', port: 'pointcare', fixture: 'real_chem_pcv.bin', chunkSize: 64, gapMs: 15, repeat: 2 },
  'pointcare-cut-frame': { kind: 'serial', port: 'pointcare', fixture: 'real_chem_pcv.bin', chunkSize: 64, gapMs: 15, cutAt: 0.5 },
  'healvet-result': { kind: 'serial', port: 'healvet', fixture: 'real_healvet_com12.bin', chunkSize: 16, gapMs: 25 },
  'pcr-result': { kind: 'serial', port: 'pcr', fixture: 'real_pcr_com13.bin', chunkSize: 64, gapMs: 15 },
  'exigo-day': { kind: 'exigo', mode: 'day' },
  'exigo-day-growing': { kind: 'exigo', mode: 'growing', growAfterMs: 8000 },
  'exigo-single': { kind: 'exigo', mode: 'single' },
  'exigo-unreadable': { kind: 'exigo', mode: 'unreadable' },
};

export function chunk(bytes, size) {
  const parts = [];
  for (let at = 0; at < bytes.length; at += size) parts.push(bytes.subarray(at, at + size));
  return parts;
}

/** `[{ bytes, delayMs }]`: wait `delayMs`, then write `bytes`. */
export function serialPlan(scenario, capture) {
  let bytes = capture;
  if (scenario.cutAt) bytes = capture.subarray(0, Math.floor(capture.length * scenario.cutAt));
  const steps = [];
  for (let round = 0; round < (scenario.repeat ?? 1); round += 1) {
    chunk(bytes, scenario.chunkSize).forEach((piece, index) => {
      // A pause between two sends, like a machine sending a second time.
      const delayMs = index === 0 && round > 0 ? 3000 : scenario.gapMs;
      steps.push({ bytes: piece, delayMs });
    });
  }
  return steps;
}

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const singleResult = (sampleId, when) => `<?xml version="1.0" encoding="UTF-8"?>
<ExigoResult>
  <Header>
    <SampleId>${sampleId}</SampleId>
    <DateTime>${when.toISOString().slice(0, 19)}</DateTime>
    <DeviceType>Exigo Eos Vet</DeviceType>
    <OperatorId>SIM</OperatorId>
  </Header>
  <Results>
    <Parameter><Code>WBC</Code><Value>12.5</Value><Unit>10^9/L</Unit><RefRange>5.5-16.9</RefRange><Flag>N</Flag></Parameter>
    <Parameter><Code>RBC</Code><Value>7.2</Value><Unit>10^12/L</Unit><RefRange>5.5-8.5</RefRange><Flag>N</Flag></Parameter>
    <Parameter><Code>HGB</Code><Value>15.8</Value><Unit>g/dL</Unit><RefRange>12-18</RefRange><Flag>N</Flag></Parameter>
    <Parameter><Code>PLT</Code><Value>285</Value><Unit>10^9/L</Unit><RefRange>175-500</RefRange><Flag>N</Flag></Parameter>
  </Results>
</ExigoResult>
`;

/** `[{ name, content, delayMs }]`: wait `delayMs`, then write `content` to `name`. */
export function exigoPlan(scenario, dayXml, now = new Date()) {
  const sno = /<samples[^>]*\sSNO="(\d+)"/.exec(dayXml)?.[1] ?? '00000';
  const dayFile = `BM-${sno}_${ymd(now)}.xml`;

  switch (scenario.mode) {
    case 'day':
      return [{ name: dayFile, content: dayXml, delayMs: 0 }];
    case 'growing': {
      const first = dayXml.indexOf('<sample ');
      const second = dayXml.indexOf('<sample ', first + 1);
      const firstOnly = `${dayXml.slice(0, second)}</samples>\n`;
      return [
        { name: dayFile, content: firstOnly, delayMs: 0 },
        { name: dayFile, content: dayXml, delayMs: scenario.growAfterMs },
      ];
    }
    case 'single': {
      const id = `SIM-${now.getTime() % 100000}`;
      return [{ name: `exigo_${id}.xml`, content: singleResult(id, now), delayMs: 0 }];
    }
    case 'unreadable':
      return [{ name: `BM-broken_${ymd(now)}.xml`, content: 'this is not xml <<<', delayMs: 0 }];
    default:
      throw new Error(`unknown Exigo mode: ${scenario.mode}`);
  }
}

export function parseConfig(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}
