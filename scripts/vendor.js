// Lucide (icons) aur Leaflet (map) ko node_modules se public/vendor mein copy karta hai.
// Isse page CDN (unpkg) par nirbhar nahi rehta: koi CDN hack ho to bhi hamari site safe rahegi,
// aur CSP mein sirf 'self' allow karna kaafi hota hai.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'vendor');
fs.mkdirSync(out, { recursive: true });

const copy = (from, to) => {
  const src = path.join(root, 'node_modules', from);
  if (!fs.existsSync(src)) throw new Error(`Missing ${from}. Pehle "npm install" chalayein.`);
  fs.cpSync(src, path.join(out, to), { recursive: true });
  console.log('copied', from, '->', 'public/vendor/' + to);
};

copy('lucide/dist/umd/lucide.min.js', 'lucide.min.js');
copy('leaflet/dist/leaflet.js', 'leaflet/leaflet.js');
copy('leaflet/dist/leaflet.css', 'leaflet/leaflet.css');
copy('leaflet/dist/images', 'leaflet/images');
