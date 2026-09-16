/**
 * Refer & Race — сервер сайту реферальної кампанії.
 *
 * Додається як окремий файл у той самий проєкт Apps Script, що прив'язаний до
 * таблиці нарахувань. Нічого не пише і не змінює: не чіпає poll(), setup(),
 * тригери та службову вкладку __processed_app_ids.
 *
 * !!! ВАЖЛИВО: Apps Script має ОДИН глобальний скоуп на весь проєкт, спільний для
 * усіх .gs файлів. Тому кожна глобальна змінна й функція тут має префікс LB_ —
 * інакше вони перетирають CONFIG та хелпери скрипта нарахувань, і setup()/poll()
 * ламаються з помилками на кшталт "Cannot read properties of undefined".
 * Не прибирай префікси і не додавай сюди голих глобальних імен.
 *
 * doGet() віддає сам сайт (файл index.html), а LB_getLeaderboard() — дані для
 * таблиці. Клієнт викликає її через google.script.run, тобто в тому ж origin і
 * вже від імені залогіненого акаунта Solidgate. Ніякого CORS і ніякого
 * публічного URL: деплой стоїть на «Anyone within Solidgate», і сторінку
 * відкриє лише співробітник.
 *
 * Віддає ЛИШЕ агреговані пари «ім'я → сума балів». Колонка D (імена кандидатів)
 * не читається взагалі — запитуються тільки колонки A і C, тож персональні дані
 * кандидатів не можуть потрапити на сайт навіть випадково.
 * Джерело правди для цього файлу — репозиторій referral-race, а не редактор.
 */

var LB_CONFIG = {
  // Назва вкладки зі звітом. Задано ЯВНО, як і в скрипті нарахувань: з порожнім
  // значенням бралася перша вкладка, і перестановка вкладок тихо перемкнула б
  // лідерборд на іншу таблицю.
  REPORT_TAB: 'Employer Brand',

  // Скільки рядків шапки пропустити. У «Employer Brand» шапка займає 2 рядки.
  HEADER_ROWS: 2,

  // Позиції колонок (1 = A).
  NAME_COL: 1, // A — реферер
  DATE_COL: 2, // B — дата нарахування (використовується лише якщо задано START_DATE)
  POINTS_COL: 3, // C — коїни

  // Рахувати лише рядки з цієї дати включно. null = рахувати все.
  // Формат 'YYYY-MM-DD'.
  //
  // Це «обнулення» гонки: старі нарахування нікуди не діваються, вони просто
  // не потрапляють у підсумок. Щоб повернути всю історію — постав null назад.
  // Перед зміною запусти lbDateAudit(): він покаже, скільки рядків випаде і
  // чи не випадуть разом з ними живі нарахування з кривою датою.
  START_DATE: '2026-09-01',

  // Скільки секунд тримати відповідь у кеші (макс. 21600).
  CACHE_SECONDS: 60,
};

/**
 * Віддає сторінку сайту. Один HTML-файл, зібраний з Vue-застосунку.
 *
 * ALLOWALL потрібен, щоб сторінку можна було вбудувати в Google Sites:
 * sites.google.com — це інший origin, ніж script.google.com, і за замовчуванням
 * HtmlService виставляє X-Frame-Options так, що вбудовування блокується.
 * Доступ це не послаблює — його як і раніше вирішує вхід у Google-акаунт
 * Solidgate. Єдиний наслідок: сторінку тепер може показати в себе у фреймі
 * будь-який сайт (clickjacking). Тут це прийнятно: на сторінці немає дій,
 * лише читання.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Referral Race')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Точка входу для google.script.run із сайту. Має бути глобальною функцією.
 * Повертає { updatedAt, count, entries: [{ name, points }] }.
 */
function LB_getLeaderboard() {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'leaderboard_v1';

  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var data = LB_build();
  if (LB_CONFIG.CACHE_SECONDS > 0) {
    // CacheService rejects values over 100KB. At ~477 referrers we're around
    // 30KB, but a failed cache write must never take the page down with it —
    // serving uncached is slower, not broken.
    try {
      cache.put(cacheKey, JSON.stringify(data), LB_CONFIG.CACHE_SECONDS);
    } catch (err) {
      Logger.log('Не вдалося закешувати відповідь: ' + err);
    }
  }
  return data;
}

/** Читає звіт і повертає агреговані стандинги. */
function LB_build() {
  var sheet = LB_reportSheet();
  var firstRow = LB_CONFIG.HEADER_ROWS + 1;
  var lastRow = sheet.getLastRow();

  if (lastRow < firstRow) {
    return { updatedAt: new Date().toISOString(), count: 0, entries: [] };
  }

  // Один запит на весь діапазон A:C. Колонка D свідомо не потрапляє у вибірку.
  var numRows = lastRow - firstRow + 1;
  var values = sheet.getRange(firstRow, 1, numRows, 3).getValues();

  var startDate = LB_startDate();
  var totals = {}; // ключ нормалізованого імені → { name, points }

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rawName = row[LB_CONFIG.NAME_COL - 1];
    var points = row[LB_CONFIG.POINTS_COL - 1];

    var name = LB_cleanName(rawName);
    if (!name) continue;

    points = LB_toNumber(points);
    if (points === null) continue;

    if (startDate && !LB_isOnOrAfter(row[LB_CONFIG.DATE_COL - 1], startDate)) continue;

    // Ручні рядки можуть відрізнятись регістром чи подвійними пробілами —
    // групуємо за нормалізованим ключем, показуємо перше зустрінуте написання.
    var key = name.toLowerCase();
    if (!totals[key]) totals[key] = { name: name, points: 0 };
    totals[key].points += points;
  }

  var entries = [];
  for (var key2 in totals) {
    if (Object.prototype.hasOwnProperty.call(totals, key2)) entries.push(totals[key2]);
  }

  entries.sort(function (a, b) {
    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
  });

  return {
    updatedAt: new Date().toISOString(),
    count: entries.length,
    entries: entries,
  };
}

/** Ручний запуск із редактора: дає дозволи і показує топ-10 у логах. */
function testLeaderboard() {
  var data = LB_build();
  Logger.log('Рефереров: ' + data.count);
  for (var i = 0; i < Math.min(10, data.entries.length); i++) {
    Logger.log(i + 1 + '. ' + data.entries[i].name + ' — ' + data.entries[i].points);
  }
  return data;
}

// ---------------------------------------------------------------- helpers

function LB_reportSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = LB_CONFIG.REPORT_TAB ? ss.getSheetByName(LB_CONFIG.REPORT_TAB) : ss.getSheets()[0];
  if (!sheet) {
    throw new Error('Не знайдено вкладку звіту "' + LB_CONFIG.REPORT_TAB + '".');
  }
  return sheet;
}

function LB_cleanName(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Приймає число або рядок на кшталт '30' / '30,5'. Інакше null. */
function LB_toNumber(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  var normalised = value.replace(/\s/g, '').replace(',', '.');
  if (normalised === '' || !/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  var num = parseFloat(normalised);
  return isFinite(num) ? num : null;
}

function LB_startDate() {
  if (!LB_CONFIG.START_DATE) return null;
  var parts = String(LB_CONFIG.START_DATE).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/**
 * Колонка B буває або справжньою датою, або текстом 'dd.MM.yyyy' — залежно від
 * локалі таблиці. Обробляємо обидва випадки; нерозпізнані рядки не рахуємо.
 */
function LB_isOnOrAfter(value, startDate) {
  var date = null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    date = value;
  } else if (typeof value === 'string') {
    var m = value.trim().match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
    if (m) date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  if (!date || isNaN(date.getTime())) return false;
  return date.getTime() >= startDate.getTime();
}


// ---------------------------------------------------------------- diagnostics

/**
 * Разова діагностика: чому підсумки ендпоінта не збігаються з вкладкою «Рейтинг».
 * Нічого не пише, тільки читає A:C і друкує звіт у лог.
 *
 * Перевіряє три гіпотези одразу:
 *   1) варіанти написання імені (QUERY групує за точним текстом, ендпоінт — за
 *      нормалізованим), 2) числа, збережені як текст (QUERY їх мовчки ігнорує),
 *   3) свіжі рядки, дописані останнім poll().
 */
function lbDiagnose() {
  var sheet = LB_reportSheet();
  var firstRow = LB_CONFIG.HEADER_ROWS + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < firstRow) {
    Logger.log('Даних немає.');
    return;
  }

  var values = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 3).getValues();

  var exact = {}; // групування як у QUERY — за точним текстом комірки
  var norm = {}; // групування як в ендпоінті — за нормалізованим ключем
  var normNames = {};
  var numericPoints = 0;
  var textPoints = 0;
  var unparsablePoints = 0;
  var blankNames = 0;
  var newest = null;
  var byDate = {};

  for (var i = 0; i < values.length; i++) {
    var rawName = values[i][0];
    var rawPoints = values[i][2];
    var rawDate = values[i][1];

    var name = LB_cleanName(rawName);
    if (!name) {
      blankNames++;
      continue;
    }

    var points = LB_toNumber(rawPoints);
    if (points === null) {
      if (rawPoints !== '' && rawPoints !== null) unparsablePoints++;
      continue;
    }
    if (typeof rawPoints === 'number') numericPoints++;
    else textPoints++;

    var exactKey = String(rawName);
    exact[exactKey] = (exact[exactKey] || 0) + points;

    var normKey = name.toLowerCase();
    norm[normKey] = (norm[normKey] || 0) + points;
    if (!normNames[normKey]) normNames[normKey] = name;

    var d = LB_asDate(rawDate);
    if (d) {
      if (!newest || d.getTime() > newest.getTime()) newest = d;
      var stamp = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      byDate[stamp] = (byDate[stamp] || 0) + 1;
    }
  }

  Logger.log('=== Обсяг ===');
  Logger.log('Рядків даних: ' + values.length + ' (порожніх імен: ' + blankNames + ')');
  Logger.log('Балів числом: ' + numericPoints + ', текстом: ' + textPoints);
  Logger.log('Незрозумілих значень у колонці C: ' + unparsablePoints);
  Logger.log(
    'ГІПОТЕЗА 2 (числа як текст): ' +
      (textPoints > 0
        ? 'ТАК — ' + textPoints + ' рядків, QUERY їх ігнорує, ендпоінт рахує'
        : 'ні')
  );

  var exactCount = LB_size(exact);
  var normCount = LB_size(norm);
  Logger.log('');
  Logger.log('=== Групування ===');
  Logger.log('Унікальних імен за точним текстом (як QUERY): ' + exactCount);
  Logger.log('Унікальних імен після нормалізації (як ендпоінт): ' + normCount);
  Logger.log(
    'ГІПОТЕЗА 1 (варіанти написання): ' +
      (exactCount > normCount
        ? 'ТАК — ' + (exactCount - normCount) + ' зайвих варіантів злилися в одне'
        : 'ні')
  );

  // Хто найбільше виграв від злиття варіантів — це і є розбіжність із «Рейтингом».
  var gaps = [];
  for (var k in norm) {
    if (!Object.prototype.hasOwnProperty.call(norm, k)) continue;
    var best = 0;
    for (var ek in exact) {
      if (!Object.prototype.hasOwnProperty.call(exact, ek)) continue;
      if (LB_cleanName(ek).toLowerCase() === k && exact[ek] > best) best = exact[ek];
    }
    if (norm[k] > best) gaps.push({ name: normNames[k], total: norm[k], biggestPiece: best });
  }
  gaps.sort(function (a, b) {
    return b.total - b.biggestPiece - (a.total - a.biggestPiece);
  });

  Logger.log('');
  Logger.log('=== Найбільші розбіжності (ім’я: сума в ендпоінті / найбільший шматок у «Рейтингу») ===');
  if (!gaps.length) Logger.log('Немає — імена скрізь написані однаково.');
  for (var g = 0; g < Math.min(10, gaps.length); g++) {
    Logger.log(
      gaps[g].name + ': ' + gaps[g].total + ' / ' + gaps[g].biggestPiece +
        '  (різниця ' + (gaps[g].total - gaps[g].biggestPiece) + ')'
    );
  }

  Logger.log('');
  Logger.log('=== Свіжість ===');
  Logger.log('Найновіша дата в колонці B: ' + (newest ? newest.toDateString() : 'не розпізнано'));
  var stamps = [];
  for (var s in byDate) if (Object.prototype.hasOwnProperty.call(byDate, s)) stamps.push(s);
  stamps.sort();
  var tail = stamps.slice(-5);
  for (var t = 0; t < tail.length; t++) Logger.log(tail[t] + ': ' + byDate[tail[t]] + ' рядків');
  Logger.log(
    'ГІПОТЕЗА 3 (свіжі рядки): порівняй найновішу дату з моментом, коли ти робила скрін «Рейтингу».'
  );
}

/** Показує точні варіанти написання одного імені, з лапками — видно зайві пробіли. */
function lbDiagnoseName(fragment) {
  fragment = String(fragment || '').toLowerCase();
  if (!fragment) {
    Logger.log('Виклич як lbDiagnoseName("кратюк")');
    return;
  }

  var sheet = LB_reportSheet();
  var firstRow = LB_CONFIG.HEADER_ROWS + 1;
  var values = sheet.getRange(firstRow, 1, sheet.getLastRow() - firstRow + 1, 3).getValues();

  var variants = {};
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    if (String(raw).toLowerCase().indexOf(fragment) === -1) continue;
    var points = LB_toNumber(values[i][2]);
    var key = JSON.stringify(String(raw)); // лапки роблять видимими пробіли й регістр
    if (!variants[key]) variants[key] = { rows: 0, points: 0, textCells: 0 };
    variants[key].rows++;
    if (points !== null) variants[key].points += points;
    if (typeof values[i][2] === 'string') variants[key].textCells++;
  }

  Logger.log('=== Варіанти написання для «' + fragment + '» ===');
  for (var v in variants) {
    if (!Object.prototype.hasOwnProperty.call(variants, v)) continue;
    Logger.log(
      v + ' → ' + variants[v].rows + ' рядків, ' + variants[v].points + ' балів' +
        (variants[v].textCells ? ' (з них ' + variants[v].textCells + ' балів текстом)' : '')
    );
  }
  Logger.log('Кожен рядок вище — окремий запис для QUERY, але один і той самий для ендпоінта.');
}

function LB_asDate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  if (typeof value === 'string') {
    var m = value.trim().match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  return null;
}

function LB_size(obj) {
  var n = 0;
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) n++;
  return n;
}

/**
 * Друкує всі групи, де одна людина записана кількома способами, і показує кожен
 * варіант у лапках — стають видимі зайві пробіли, нерозривні пробіли й регістр.
 * Нічого не змінює. Використовуй, щоб вичистити написання імен у таблиці.
 */
function lbListVariants() {
  var sheet = LB_reportSheet();
  var firstRow = LB_CONFIG.HEADER_ROWS + 1;
  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 5).getValues();

  var groups = {}; // нормалізований ключ → { варіант(точний текст) → бали }
  var namelessWithData = 0;
  var namelessRows = [];

  for (var i = 0; i < values.length; i++) {
    var rawName = values[i][0];
    var name = LB_cleanName(rawName);

    if (!name) {
      // Рядок без імені, але з чимось в інших колонках — саме такі зсувають appendRow.
      var hasOther = false;
      for (var c = 1; c < 5; c++) {
        if (values[i][c] !== '' && values[i][c] !== null) hasOther = true;
      }
      if (hasOther) {
        namelessWithData++;
        if (namelessRows.length < 5) namelessRows.push(firstRow + i);
      }
      continue;
    }

    var points = LB_toNumber(values[i][2]);
    var key = name.toLowerCase();
    var variant = JSON.stringify(String(rawName));
    if (!groups[key]) groups[key] = {};
    groups[key][variant] = (groups[key][variant] || 0) + (points === null ? 0 : points);
  }

  var multi = [];
  for (var k in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, k)) continue;
    if (LB_size(groups[k]) > 1) multi.push({ key: k, variants: groups[k] });
  }

  Logger.log('=== Люди, записані кількома способами: ' + multi.length + ' ===');
  Logger.log('(кожен рядок у лапках — окремий запис для QUERY, але одна людина для ендпоінта)');
  Logger.log('');
  for (var m = 0; m < multi.length; m++) {
    var total = 0;
    var lines = [];
    for (var v in multi[m].variants) {
      if (!Object.prototype.hasOwnProperty.call(multi[m].variants, v)) continue;
      total += multi[m].variants[v];
      lines.push('    ' + v + ' → ' + multi[m].variants[v]);
    }
    Logger.log('• разом ' + total);
    for (var l = 0; l < lines.length; l++) Logger.log(lines[l]);
  }

  Logger.log('');
  Logger.log('=== Рядки без імені, але з даними в інших колонках ===');
  Logger.log('Кількість: ' + namelessWithData);
  if (namelessRows.length) {
    Logger.log('Перші такі рядки: ' + namelessRows.join(', '));
    Logger.log(
      'Через них appendRow у скрипті нарахувань дописує НИЖЧЕ реальних даних. ' +
        'Якщо там просто залишки форматування чи випадаючих списків — варто очистити.'
    );
  }
  Logger.log('Останній рядок із будь-яким вмістом: ' + lastRow);
}

/**
 * Перевіряє, що index.html доїхав у проєкт цілим.
 * Довжину порівняй із числом, яке друкує `npm run build`.
 */
function lbCheckIndex() {
  var content;
  try {
    content = HtmlService.createHtmlOutputFromFile('index').getContent();
  } catch (err) {
    Logger.log('НЕ ЗНАЙДЕНО файл index.html: ' + err);
    return;
  }
  Logger.log('Довжина index.html: ' + content.length + ' символів');
  Logger.log('Закінчується на </html>: ' + (content.slice(-200).indexOf('</html>') !== -1));
  Logger.log('Порівняй довжину з тією, що надрукував npm run build.');
}

/**
 * ТІЛЬКИ ЧИТАЄ. Показує "хвіст" вкладки звіту: де закінчуються справжні
 * нарахування і що саме тримає getLastRow() нижче них.
 *
 * Навіщо: appendRow() дописує після останнього рядка, у якому є хоч щось
 * ХОЧ В ЯКІЙСЬ колонці. Якщо внизу висять рядки з порожнім іменем, але
 * з датою, нулем, пробілом чи значенням у ручній колонці E — нові
 * нарахування падають на тисячі рядків нижче даних, і здається, що
 * вкладка "перестала заповнюватись".
 *
 * Колонку D (імена кандидатів) не читає.
 */
function lbTailReport() {
  var sheet = LB_reportSheet();
  var lastRow = sheet.getLastRow();
  var firstRow = LB_CONFIG.HEADER_ROWS + 1;
  if (lastRow < firstRow) {
    Logger.log('Даних немає.');
    return;
  }

  // A (ім'я), B (дата), C (коїни), E (ручний статус). D навмисно пропускаємо.
  var a = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 3).getValues();
  var e = sheet.getRange(firstRow, 5, lastRow - firstRow + 1, 1).getValues();

  var lastNamed = -1;
  for (var i = a.length - 1; i >= 0; i--) {
    if (LB_cleanName(a[i][0])) { lastNamed = i; break; }
  }
  if (lastNamed === -1) {
    Logger.log('Жодного рядка з іменем не знайдено.');
    return;
  }

  var lastNamedRow = firstRow + lastNamed;
  Logger.log('Останній рядок з іменем: ' + lastNamedRow);
  Logger.log('getLastRow(): ' + lastRow + '  (сюди appendRow допише наступний рядок: '
             + (lastRow + 1) + ')');

  var tail = lastRow - lastNamedRow;
  if (tail <= 0) {
    Logger.log('Хвоста немає — appendRow допише одразу під даними. Нічого видаляти не треба.');
    return;
  }

  Logger.log('Порожніх на вигляд рядків нижче даних: ' + tail);
  Logger.log('--- що саме тримає ці рядки (перші 20) ---');

  var shown = 0;
  var holders = { B: 0, C: 0, E: 0, A_whitespace: 0 };
  for (var j = lastNamed + 1; j < a.length; j++) {
    var row = firstRow + j;
    var parts = [];
    if (String(a[j][0]).length) { parts.push('A=' + JSON.stringify(a[j][0])); holders.A_whitespace++; }
    if (a[j][1] !== '' && a[j][1] !== null) { parts.push('B=' + JSON.stringify(String(a[j][1]))); holders.B++; }
    if (a[j][2] !== '' && a[j][2] !== null) { parts.push('C=' + JSON.stringify(a[j][2])); holders.C++; }
    if (e[j][0] !== '' && e[j][0] !== null) { parts.push('E=' + JSON.stringify(e[j][0])); holders.E++; }
    if (parts.length && shown < 20) {
      Logger.log('рядок ' + row + ': ' + parts.join('  '));
      shown++;
    }
  }

  Logger.log('--- підсумок по хвосту ---');
  Logger.log('з непорожньою A (пробіли/сміття): ' + holders.A_whitespace);
  Logger.log('з непорожньою B (дата): ' + holders.B);
  Logger.log('з непорожньою C (коїни): ' + holders.C);
  Logger.log('з непорожньою E (ручний статус): ' + holders.E);
  if (!holders.A_whitespace && !holders.B && !holders.C && !holders.E) {
    Logger.log('УВАГА: у видимих колонках порожньо. Тоді хвіст тримає щось інше —');
    Logger.log('колонка D, колонка правіше за E, або форматування/валідація даних.');
    Logger.log('Видаляй рядки цілком (right-click -> Delete rows), а не Delete values.');
  }
}

/**
 * ТІЛЬКИ ЧИТАЄ. Аудит фільтра за датою перед тим, як його вмикати.
 *
 * Навіщо: LB_isOnOrAfter() повертає false для всього, що не розпізналось як
 * дата. Тобто з увімкненим START_DATE зникають не лише старі рядки, а й будь-які
 * рядки з порожньою або дивно записаною колонкою B — а це якраз ручні
 * нарахування. Ця функція показує, скільки таких.
 *
 * Колонку D (імена кандидатів) не читає.
 */
function lbDateAudit() {
  var sheet = LB_reportSheet();
  var firstRow = LB_CONFIG.HEADER_ROWS + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < firstRow) {
    Logger.log('Даних немає.');
    return;
  }

  var values = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 3).getValues();
  var startDate = LB_startDate();
  if (!startDate) {
    Logger.log('START_DATE не задано — фільтр вимкнено, нічого не відсікається.');
    return;
  }

  var kept = 0, keptPoints = 0;
  var tooOld = 0, tooOldPoints = 0;
  var unreadable = 0, unreadablePoints = 0;
  var samples = [];

  for (var i = 0; i < values.length; i++) {
    var name = LB_cleanName(values[i][LB_CONFIG.NAME_COL - 1]);
    if (!name) continue;
    var points = LB_toNumber(values[i][LB_CONFIG.POINTS_COL - 1]);
    if (points === null) continue;

    var raw = values[i][LB_CONFIG.DATE_COL - 1];
    if (LB_isOnOrAfter(raw, startDate)) {
      kept++; keptPoints += points;
      continue;
    }

    // Різниця принципова: «стара» — це саме те, що ми хотіли відсікти,
    // «нечитабельна» — це, найімовірніше, помилка, і бали зникнуть дарма.
    var readable = Object.prototype.toString.call(raw) === '[object Date]' ||
      (typeof raw === 'string' && /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.test(String(raw).trim()));

    if (readable) {
      tooOld++; tooOldPoints += points;
    } else {
      unreadable++; unreadablePoints += points;
      if (samples.length < 10) {
        samples.push('рядок ' + (firstRow + i) + ': B=' + JSON.stringify(raw) + ', коїнів ' + points);
      }
    }
  }

  Logger.log('START_DATE = ' + LB_CONFIG.START_DATE);
  Logger.log('Зараховано:   ' + kept + ' рядків, ' + keptPoints + ' коїнів');
  Logger.log('Відсічено як старі: ' + tooOld + ' рядків, ' + tooOldPoints + ' коїнів');
  Logger.log('ВИПАЛИ ЧЕРЕЗ НЕЧИТАБЕЛЬНУ ДАТУ: ' + unreadable + ' рядків, ' +
             unreadablePoints + ' коїнів');
  if (unreadable) {
    Logger.log('Це, найпевніше, ручні рядки. Виправ дату в колонці B — інакше ці ' +
               'бали не потраплять у рейтинг:');
    for (var j = 0; j < samples.length; j++) Logger.log('  ' + samples[j]);
  }
}
