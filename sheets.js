const axios = require('axios');
const { parse } = require('csv-parse/sync');
const { extractContainerNumber, getEnv, normalizeContainerKey } = require('./env');

const CACHE_TTL = 60 * 1000;
let cache = { data: null, ts: 0 };

const COL = {
  kontejner:   0,
  napravlenie: 1,
  otplytie:    2,
  kitaj:       3,
  jdStart:     4,
  location:    5,
  rasstoyanie: 6,
  peregruzka:  7,
  mashina:     8,
  phone:       9,
  granica:     10,
  pribytie:    11,
  updated:     12,
};

const WATCHABLE_FIELDS = [
  { idx: COL.napravlenie, label: '🏁 Направление' },
  { idx: COL.otplytie,    label: '🚢 Отплытие' },
  { idx: COL.kitaj,       label: '🇨🇳 Прибыл в Китай' },
  { idx: COL.jdStart,     label: '🚆 Старт ЖД' },
  { idx: COL.location,    label: '📍 Местоположение' },
  { idx: COL.rasstoyanie, label: '📏 Расстояние до Кашкара' },
  { idx: COL.peregruzka,  label: '🚉 Станция перегрузки' },
  { idx: COL.mashina,     label: '🚛 Машина' },
  { idx: COL.granica,     label: '🛂 Граница' },
  { idx: COL.pribytie,    label: '🏠 Прибытие' },
  { idx: COL.updated,     label: '🕐 Обновлено' },
];

async function loadSheet() {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) return cache.data;

  const res = await axios.get(getEnv('SHEET_CSV_URL'), { timeout: 15000 });

  const allRows = parse(res.data, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const rows = allRows.slice(2).filter(r => /^[A-Z]{4}\d+$/i.test(String(r[0]).trim()));

  cache = { data: rows, ts: now };
  return rows;
}

async function loadSheetFresh() {
  cache = { data: null, ts: 0 };
  return loadSheet();
}

function getCol(row, idx) {
  const val = row[idx];
  return val && String(val).trim() ? String(val).trim() : '—';
}

function hasVal(row, idx) {
  const val = row[idx];
  return !!(val && String(val).trim());
}

function computeStatus(row) {
  if (hasVal(row, COL.pribytie))   return '🏁 Прибыл';
  if (hasVal(row, COL.granica))    return '🛂 На границе';
  if (hasVal(row, COL.mashina))    return '🚛 Едет на машине';
  if (hasVal(row, COL.peregruzka)) return '🚉 На станции перегрузки';
  if (hasVal(row, COL.location))   return '🚆 В пути (ЖД)';
  return '🚢 В море';
}

async function findKontejner(nomer) {
  const rows = await loadSheet();
  const targetContainer = extractContainerNumber(nomer);
  const targetFull = normalizeContainerKey(nomer);
  return rows.find(r => {
    const rowContainer = extractContainerNumber(r[COL.kontejner]);
    return targetContainer
      ? rowContainer === targetContainer
      : normalizeContainerKey(r[COL.kontejner]) === targetFull;
  }) || null;
}

function formatStatus(row) {
  const f = idx => getCol(row, idx);
  return `📦 *Контейнер:* ${f(COL.kontejner)}
🔘 *Статус:* ${computeStatus(row)}

🏁 Направление: ${f(COL.napravlenie)}
🚢 Отплытие: ${f(COL.otplytie)}
🇨🇳 Прибыл в Китай: ${f(COL.kitaj)}
🚆 Старт ЖД: ${f(COL.jdStart)}
📍 Местоположение: ${f(COL.location)}
📏 Расстояние до Кашкара: ${f(COL.rasstoyanie)}
🚉 Станция перегрузки: ${f(COL.peregruzka)}
🚛 Машина: ${f(COL.mashina)}
📱 Тел. водителя: ${f(COL.phone)}
🛂 Граница: ${f(COL.granica)}
🏠 Прибытие: ${f(COL.pribytie)}
🕐 Обновлено: ${f(COL.updated)}`;
}

module.exports = { findKontejner, formatStatus, loadSheetFresh, WATCHABLE_FIELDS };
