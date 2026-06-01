const https = require('https');
const fs = require('fs');
const path = require('path');

// Primary CDN (direct GitHub)
const BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models';
// Fallback CDN mirrors (for regions with GitHub access issues)
const MIRRORS = [
  (url) => url.replace('https://raw.githubusercontent.com', 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main').replace('/glTF-Binary/', '/glTF-Binary/'),
  (url) => `https://ghfast.top/${url}`,
];
const DEST = path.join(__dirname, 'assets');

const files = [
  'DamagedHelmet',
  'ToyCar',
  'ABeautifulGame',
  'MaterialsVariantsShoe',
  'IridescenceLamp',
  'StainedGlassLamp',
  'PotOfCoals',
  'FlightHelmet',
];

const MAX_RETRIES = 5;
const IDLE_TIMEOUT = 15000; // 15s no data = stalled

function downloadOnce(url, dest) {
  return new Promise((resolve, reject) => {
    let file;
    let req;
    let idleTimer;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (req) req.destroy(new Error('Idle timeout'));
      }, IDLE_TIMEOUT);
    };
    try { file = fs.createWriteStream(dest); } catch(e) { return reject(e); }
    const request = (url) => {
      req = https.get(url, { timeout: 30000 }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          request(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`Failed ${response.statusCode}`));
          return;
        }
        const total = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;
        resetIdle();
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          resetIdle();
          if (total) {
            const pct = ((downloaded / total) * 100).toFixed(0);
            process.stdout.write(`\r  ${pct}% (${(downloaded/1048576).toFixed(2)} / ${(total/1048576).toFixed(2)} MB)`);
          }
        });
        response.pipe(file);
        file.on('finish', () => { clearTimeout(idleTimer); file.close(); console.log('\n  Done.'); resolve(); });
      }).on('error', (err) => { clearTimeout(idleTimer); file.close(() => { fs.unlink(dest, () => {}); }); reject(err); });
    };
    request(url);
  });
}

async function download(url, dest) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await downloadOnce(url, dest);
      return;
    } catch (err) {
      console.error(`\n  Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 2000;
        console.log(`  Retrying in ${delay / 1000}s ...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

(async () => {
  for (const name of files) {
    const dest = path.join(DEST, name + '.glb');
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`[SKIP] ${name}.glb already exists (${fs.statSync(dest).size} bytes)`);
      continue;
    }
    const url = `${BASE}/${name}/glTF-Binary/${name}.glb`;
    console.log(`[DOWNLOAD] ${name}.glb ...`);
    let success = false;
    // Try primary URL first, then mirrors
    const allUrls = [url, ...MIRRORS.map(m => m(url))];
    for (let i = 0; i < allUrls.length; i++) {
      const u = allUrls[i];
      if (i > 0) console.log(`  Trying mirror ${i}...`);
      try {
        await download(u, dest);
        success = true;
        break;
      } catch (err) {
        console.error(`  ERROR: ${err.message}`);
      }
    }
    if (!success) {
      console.error(`  FAILED all sources for ${name}.glb`);
    }
  }
  // Verify all
  console.log('\n=== Verification ===');
  for (const name of files) {
    const dest = path.join(DEST, name + '.glb');
    if (fs.existsSync(dest)) {
      const buf = fs.readFileSync(dest);
      const magic = buf.slice(0, 4).toString('ascii');
      const sizeMB = (buf.length / 1048576).toFixed(2);
      console.log(`${name}.glb: ${sizeMB} MB, valid=${magic === 'glTF'}`);
    } else {
      console.log(`${name}.glb: MISSING`);
    }
  }
  // Also check existing
  for (const name of ['SheenChair', 'SheenWoodLeatherSofa']) {
    const dest = path.join(DEST, name + '.glb');
    if (fs.existsSync(dest)) {
      const buf = fs.readFileSync(dest);
      const sizeMB = (buf.length / 1048576).toFixed(2);
      console.log(`${name}.glb: ${sizeMB} MB (already downloaded)`);
    }
  }
})();
