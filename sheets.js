const axios = require('axios');
const { parse } = require('csv-parse/sync');

const CACHE_TTL = 60 * 1000;
let cache = { data: null, ts: 0 };

// индексы колонок (0-based), строка 1 — заголовки, строка 2 — русские подписи, строка 3+ — данные
const COL = {
  kontejner:   0,   // КОНТЕЙНЕР
  napravlenie: 1,   // НАПРАВЛЕНИЕ
  otplytie:    2,   // ОТПЛЫТИЕ
  kitaj:       3,   // ПРИБЫЛ В КИТАЙ
  jdStart:     4,   // СТАРТ ЖД
  location:    5,   // МЕСТОПОЛОЖЕНИЕ
  rasstoyanie: 6,   // РАССТОЯНИЕ ДО СТАНЦИИ ПЕРЕГРУЗКИ
  peregruzka:  7,   // ДАТА ПРИБЫТИЯ НА СТАНЦИЮ ПЕРЕГРУЗКИ
  mashina:     8,   // НОМ МАШ
  phone:       9,   // НОМ ВОДИТЕЛЯ
  granica:     10,  // ГРАНИЦА
  pribytie:    11,  // ПРИБЫТИЕ
  updated:     12,  // ФАКТИЧЕСКОЕ ПРИБЫТИЕ
};

async function loadSheet() {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) return cache.data;

  const res = await axios.get(process.env.SHEET_CSV_URL, { timeout: 15000 });

  // columns: false — читаем как массивы, без зависимости от заголовков
  const allRows = parse(res.data, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  // пропускаем строки 0 и 1 (заголовки на корейском и русском)
  // оставляем только строки где первая колонка похожа на номер контейнера
  const rows = allRows.slice(2).filter(r => /^[A-Z]{4}\d+$/i.test(String(r[0]).trim()));

  cache = { data: rows, ts: now };
  return rows;
}

function getCol(row, idx) {
  const val = row[idx];
  return val && String(val).trim() ? String(val).trim() : '—';
}

async function findKontejner(nomer) {
  const rows = await loadSheet();
  const target = nomer.toUpperCase().trim();
  return rows.find(r => String(r[COL.kontejner]).toUpperCase().trim() === target) || null;
}

function formatStatus(row) {
  const f = idx => getCol(row, idx);
  return `📦 *Контейнер:* ${f(COL.kontejner)}

🏁 Направление: ${f(COL.napravlenie)}
🚢 Отплытие: ${f(COL.otplytie)}
🇨🇳 Прибыл в Китай: ${f(COL.kitaj)}
🚆 Старт ЖД: ${f(COL.jdStart)}
📍 Местоположение: ${f(COL.location)}
📏 Расстояние: ${f(COL.rasstoyanie)}
🚉 Станция перегрузки: ${f(COL.peregruzka)}
🚛 Машина: ${f(COL.mashina)}
📱 Тел. водителя: ${f(COL.phone)}
🛂 Граница: ${f(COL.granica)}
🏠 Прибытие: ${f(COL.pribytie)}
🕐 Обновлено: ${f(COL.updated)}`;
}

module.exports = { findKontejner, formatStatus };
