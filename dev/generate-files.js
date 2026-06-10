// Quick & dirty sample data generator for the search demo.
// Usage:  node generate-files.js [count]
// Output: files.csv next to this script.

const fs = require('fs');
const path = require('path');

const COUNT = parseInt(process.argv[2], 10) || 12000;

const EXTENSIONS = [
  'txt', 'doc', 'rtf', 'wri', 'exe', 'com', 'bat', 'dll', 'sys', 'ini',
  'bmp', 'gif', 'jpg', 'png', 'ico', 'cur', 'wav', 'mid', 'mp3', 'avi',
  'mpg', 'mov', 'zip', 'arj', 'cab', 'hlp', 'chm', 'log', 'tmp', 'bak',
  'cfg', 'reg', 'lnk', 'pif', 'scr', 'fon', 'ttf', 'xls', 'mdb', 'ppt',
  'html', 'htm', 'css', 'js', 'asp', 'php', 'pdf', 'eps', 'ps', 'tif',
];

const ADJECTIVES = [
  'autoexec', 'config', 'readme', 'setup', 'install', 'system', 'win',
  'command', 'progman', 'explorer', 'notepad', 'calc', 'sol', 'minesweeper',
  'doom', 'wolf3d', 'duke3d', 'quake', 'monkey', 'kings_quest', 'oregon',
  'bluescreen', 'msdos', 'himem', 'emm386', 'mscdex', 'smartdrv', 'doskey',
  'letter', 'memo', 'report', 'invoice', 'budget', 'notes', 'todo',
  'family', 'vacation', 'birthday', 'wedding', 'graduation', 'kids',
  'recipe', 'shopping', 'taxes', 'mortgage', 'resume', 'cv', 'cover',
  'logo', 'banner', 'wallpaper', 'screensaver', 'icon', 'cursor',
  'mixtape', 'song', 'album', 'playlist', 'startup_sound',
  'backup', 'archive', 'old', 'new', 'final', 'final_v2', 'draft',
  'untitled', 'document', 'sheet', 'presentation', 'database',
  'project', 'thesis', 'chapter', 'appendix', 'manuscript',
  'screenshot', 'capture', 'render', 'export', 'thumbnail',
];

const SUFFIXES = [
  '', '_1', '_2', '_v1', '_v2', '_v3', '_final', '_FINAL', '_FINAL2',
  '_draft', '_old', '_new', '_backup', '_copy', '_(1)', '_(2)',
  '95', '98', '2000', '_jan', '_feb', '_mar', '_q1', '_q2', '_q3', '_q4',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function makeName() {
  let n = pick(ADJECTIVES) + pick(SUFFIXES);
  // ~20% chance of a 8.3-ish DOS style truncation
  if (Math.random() < 0.2 && n.length > 8) n = n.slice(0, 8);
  return n;
}

function makeSize(ext) {
  // bias size by extension type
  const heavy = ['avi', 'mpg', 'mov', 'mp3', 'wav', 'zip', 'cab', 'arj', 'exe', 'dll', 'mdb', 'pdf'];
  if (heavy.includes(ext)) return randInt(50_000, 50_000_000);
  return randInt(64, 2_000_000);
}

function makeDate() {
  // Win95 era: 1995-01-01 .. 2001-12-31
  const start = new Date('1995-01-01').getTime();
  const end = new Date('2001-12-31T23:59:59').getTime();
  const t = randInt(start, end);
  const d = new Date(t);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const out = ['file_name,file_extension,file_size,date_modified,hidden'];
const seen = new Set();

let i = 0;
while (i < COUNT) {
  const ext = pick(EXTENSIONS);
  const name = makeName();
  const key = name + '.' + ext;
  if (seen.has(key)) continue;
  seen.add(key);
  const size = makeSize(ext);
  const date = makeDate();
  const hidden = Math.random() < 0.08 ? 'true' : 'false';
  out.push(`${name},${ext},${size},${date},${hidden}`);
  i++;
}

const outPath = path.join(__dirname, 'files.csv');
fs.writeFileSync(outPath, out.join('\n'), 'utf8');
console.log(`Wrote ${i} rows to ${outPath}`);
