// js13k build: node build.js  (needs: npm i terser)
// Minifies index.html -> dist/index.html and zips it -> dist/game.zip, printing sizes.
// Property mangling is on: object keys never cross string boundaries in the source
// (sound voices are arrays, upgrades/baddies are indexed by number), so it is safe.
const fs = require('fs'), zlib = require('zlib'), { minify } = require('terser');
const src = fs.readFileSync('index.html', 'utf8');
const js = src.match(/<script>([\s\S]*)<\/script>/)[1];
const css = src.match(/<style>([\s\S]*)<\/style>/)[1].replace(/\s*\n\s*/g, '').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}');

const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = b => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(name, data){ // single-file zip, deflate
  const d = zlib.deflateRawSync(data, { level: 9 }), n = Buffer.from(name), crc = crc32(data);
  const hdr = (sig, extra) => { const b = Buffer.alloc(sig === 0x04034b50 ? 30 : 46); b.writeUInt32LE(sig, 0); return extra(b), b; };
  const local = hdr(0x04034b50, b => { b.writeUInt16LE(20, 4); b.writeUInt16LE(8, 8); b.writeUInt32LE(crc, 14); b.writeUInt32LE(d.length, 18); b.writeUInt32LE(data.length, 22); b.writeUInt16LE(n.length, 26); });
  const central = hdr(0x02014b50, b => { b.writeUInt16LE(20, 4); b.writeUInt16LE(20, 6); b.writeUInt16LE(8, 10); b.writeUInt32LE(crc, 16); b.writeUInt32LE(d.length, 20); b.writeUInt32LE(data.length, 24); b.writeUInt16LE(n.length, 28); });
  const cdOff = local.length + n.length + d.length, end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(cdOff, 16);
  return Buffer.concat([local, n, d, central, n, end]);
}

(async () => {
  const out = await minify(js, {
    toplevel: true, ecma: 2020,
    compress: { passes: 3, unsafe: true, unsafe_arrows: true, unsafe_math: true, pure_getters: true, booleans_as_integers: true },
    mangle: { toplevel: true, properties: { keep_quoted: true } },
    format: { comments: false },
  });
  const html = src.replace(/<style>[\s\S]*<\/style>/, `<style>${css}</style>`).replace(/<script>[\s\S]*<\/script>/, () => `<script>${out.code}</script>`)
    .replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\n\s*/g, '');
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', html);
  const z = zip('index.html', Buffer.from(html)); fs.writeFileSync('dist/game.zip', z);
  console.log(`source ${src.length} B -> minified ${Buffer.byteLength(html)} B -> zip ${z.length} B (${13312 - z.length} B under 13312)`);
})();
