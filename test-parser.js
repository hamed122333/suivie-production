const SmartParser = require('./backend/src/services/smartParser');

const rawText = `ar — 4 Ne
E Slice
| HIDROSAICA —
105 gw 1920 mm
12516091328
ATH`;

const parser = new SmartParser();
const result = parser.parseAll(rawText);

console.log('=== Parsed Result ===');
console.log(JSON.stringify(result, null, 2));