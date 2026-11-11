// A stand-in for the Gemini API, for testing the screens without a key or the internet.
//   node tools/fake-gemini.mjs 8799
//   GEMINI_BASE_URL=http://localhost:8799/v1beta node server.js
// It speaks the same JSON shapes; its "Director" is a three-line script.
import http from 'node:http';

const port = Number(process.argv[2] || 8799);
http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers['x-goog-api-key'] !== 'TESTKEY') return send(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
    if (req.method === 'GET') return send(200, { models: [
      { name: 'models/gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
    ] });
    const body = JSON.parse(raw || '{}');
    const last = body.contents[body.contents.length - 1];
    const part = last.parts[0];
    let parts;
    if (part.functionResponse) {
      const sig = body.contents[body.contents.length - 2].parts[0].thoughtSignature;
      if (sig !== 'SIG') return send(400, { error: { message: 'Function call is missing a thought_signature.' } });
      parts = [{ text: 'Two swarms pour out of the torn flap, tasting for you. They want drink, not a fight. Bresk, what do you do?' }];
    } else if (/None are present yet/.test(part.text) && /# THE STORY SO FAR[\s\S]*[A-Z]+: /.test(part.text)) {
      parts = [{ functionCall: { name: 'bring_creatures', args: { block: 'gnaw-swarm', count: 2, band: 'near' } }, thoughtSignature: 'SIG' }];
    } else {
      parts = [{ text: 'The wound lip flexes with the current, and the drones at their gate turn to taste you. Brost, what do you taste in the water?' }];
    }
    setTimeout(() => send(200, { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 2100, candidatesTokenCount: 40 } }), 400);
  });
}).listen(port, () => console.log(`Stand-in Gemini on ${port}`));
