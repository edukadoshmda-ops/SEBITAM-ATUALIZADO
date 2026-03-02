const fs = require('fs');
const file = 'd:/Users/eduka/Downloads/SEBITAM OFICIAL/main.js';
let c = fs.readFileSync(file, 'utf8');

// Remove the <th>Módulo / Escola</th> line (handles encoding)
c = c.split('\n').filter(line => !line.includes('dulo / Escola')).join('\n');

// Remove the td block containing p.module || p.modulo || p.escola
const lines = c.split('\n');
const out = [];
let skip = 0;
for (let i = 0; i < lines.length; i++) {
    if (skip > 0) { skip--; continue; }
    if (lines[i].includes('p.module || p.modulo || p.escola')) {
        // Remove 2 already-pushed lines (<td> and <span ...>)
        out.splice(out.length - 2, 2);
        // Skip next 2 lines (</span> and </td>)
        skip = 2;
        continue;
    }
    out.push(lines[i]);
}
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('Done');
