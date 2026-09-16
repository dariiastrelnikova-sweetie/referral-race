/**
 * Ashby -> Google Sheet: нарахування реферальних коїнів за ТРИ етапи (полінг, без вебхука).
 *
 * Етапи (накопичуються, кожен — окремий рядок у таблиці):
 *   Phone Screen  — 20   кандидат пройшов далі стадії "Phone Screen"
 *   HM Interview  — 30   кандидат пройшов далі стадії "HM Interview"
 *   Hired         — 50   статус заявки Hired (також автоматично зараховує два попередні етапи)
 *
 * Умови для стадійних етапів (Phone Screen, HM Interview) — дві гілки:
 *   Гілка 1: статус Active/Hired і в історії є стадія ПІСЛЯ цієї (просунувся далі).
 *   Гілка 2: статус Archived, reasonType = RejectedByOrg ("We rejected them"), і стадію досягав.
 *   "They rejected us" — нічого нового не нараховується (як і раніше — вручну).
 *
 * Спільні фільтри: джерело у SOURCES_ALLOWED і заповнене "Credited To".
 *
 * Як працює poll() (тригери кілька разів на день, див. CONFIG.RUN_AT_HOURS):
 *   1) Сканує заявки, створені за останні LOOKBACK_DAYS днів.
 *   2) Кожного реферала запамʼятовує (маркер tracked) і дописує НОВІ зароблені етапи.
 *      Дедуп по парі applicationId + етап — повторно один етап не зараховується.
 *   3) Реферали, що випали з вікна (створені давно), але ще не закриті (не Hired/Archived),
 *      перевіряються окремо через application.info — щоб Hired не пропустити.
 *
 * Рядок у звіті: [Ім'я Прізвище реферера] [дата] [коїни] [опис етапу (кандидат)]
 * Вкладка "Рейтинг": формула-сума коїнів по кожному рефереру (оновлюється сама, підтягує і ручні рядки).
 *
 * ВСТАНОВЛЕННЯ / ОНОВЛЕННЯ:
 *   1) Замінити код, заповнити CONFIG.ASHBY_API_KEY (дозвіл: candidatesRead).
 *   2) testConnection -> listStages (звірити назви стадій) -> testDryRun.
 *   3) Запустити setup() ОДИН раз -> перестворить тригери (4 рази на день) і створить вкладку "Рейтинг".
 *   Старі записи у схованій вкладці стану читаються як етап Phone Screen — міграція не потрібна.
 */

// ====== CONFIG — заповни тут ======
var CONFIG = {
  ASHBY_API_KEY: '32158e2cbddbdc48f6c0e38646766be6a15699a319c4c5758bf95f3d64a4584d',     // ключ Ashby, дозвіл: candidatesRead
  REPORT_TAB: 'Employer Brand', // вкладка для запису. Задано ЯВНО: з порожнім значенням
                            // скрипт писав у першу вкладку, і перестановка вкладок тихо
                            // спрямувала б нарахування в «Рейтинг».
  REPORT_HEADER_ROWS: 2,    // скільки рядків шапки у звітній вкладці (дані починаються з наступного рядка)
  TOTALS_TAB: 'Рейтинг',    // вкладка із сумою коїнів по рефереру (створюється у setup())
  SOURCES_ALLOWED: ['Referral', 'Referral Link'], // ТОЧНІ назви джерел; "External Referral" ігнорується
  LOOKBACK_DAYS: 120,       // скільки днів назад сканувати щоразу (за датою СТВОРЕННЯ заявки)
  RUN_AT_HOURS: [7, 11, 15, 19], // години запусків щодня (0–23, за таймзоною проєкту); один тригер на кожну
  RUN_AT_MINUTE: 0          // хвилина (0–59); запуск БЛИЗЬКО цього часу (±кілька хв — обмеження Apps Script)
};

// ====== Етапи нарахування ======
// stageNames — можливі назви стадії в Ashby (без урахування регістру). Для 'hired' назви не потрібні —
// етап визначається статусом заявки. Порядок у масиві = порядок рядків у таблиці.
// onReach: true  — коїни за те, що кандидат ДІЙШОВ до цієї стадії.
// onReach: false — коїни за те, що кандидат ПРОЙШОВ її далі (в історії є пізніша стадія).
var MILESTONES = [
  { key: 'phone_screen', stageNames: ['Phone Screen'], coins: 20, onReach: false, label: 'Phone screen passed' },
  { key: 'hm_interview', stageNames: ['HM Interview'], coins: 30, onReach: true,  label: 'HM interview reached' },
  { key: 'hired',        stageNames: [],               coins: 50, onReach: false, label: 'Offer accepted' }
];

// ====== Константи логіки ======
var REJECT_REASON_TYPES = ['RejectedByOrg']; // тип причини "We rejected them" (НЕ "They rejected us")
var PROCESSED_TAB       = '__processed_app_ids'; // стан/дедуп (схована): [appId, ключ етапу або маркер, дата]
var MARK_TRACKED        = 'tracked'; // реферал побачено — стежимо за ним і поза вікном LOOKBACK_DAYS
var MARK_CLOSED         = 'closed';  // заявка Hired/Archived — нових етапів не буде, більше не перевіряємо
var LEGACY_KEY          = 'phone_screen'; // старі рядки стану [appId, дата] = зараховано Phone Screen
var ASHBY_BASE          = 'https://api.ashbyhq.com/';

/** Запусти ОДИН раз вручну — поставить тригери на poll() (по одному на кожну годину з RUN_AT_HOURS)
 *  і створить вкладку "Рейтинг". Повторний запуск перестворює тригери. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'poll') ScriptApp.deleteTrigger(t);
  });
  CONFIG.RUN_AT_HOURS.forEach(function (h) {
    ScriptApp.newTrigger('poll').timeBased().everyDays(1)
      .atHour(h).nearMinute(CONFIG.RUN_AT_MINUTE).create();
  });
  setupTotals();
  var mm = ('0' + CONFIG.RUN_AT_MINUTE).slice(-2);
  Logger.log('Готово: poll() виконуватиметься ' + CONFIG.RUN_AT_HOURS.length + ' рази на день, близько ' +
             CONFIG.RUN_AT_HOURS.map(function (h) { return h + ':' + mm; }).join(', ') + '.');
}

/** Створює/оновлює вкладку "Рейтинг" з формулою суми коїнів по рефереру. Можна запускати повторно. */
function setupTotals() {
  var ss = SpreadsheetApp.getActive();
  var reportName = _reportSheet(ss).getName().replace(/'/g, "''");
  var sh = ss.getSheetByName(CONFIG.TOTALS_TAB) || ss.insertSheet(CONFIG.TOTALS_TAB);
  var sep = _formulaSeparators(sh); // роздільники залежать від локалі таблиці (, або ;)
  var q = "select Col1, sum(Col2) where Col1 is not null and Col2 is not null " +
          "group by Col1 order by sum(Col2) desc label Col1 'Реферер', sum(Col2) 'Всього коїнів'";
  var formula = "=QUERY({'" + reportName + "'!A:A" + sep.col + " '" + reportName + "'!C:C}" +
                sep.arg + " \"" + q + "\"" + sep.arg + " " + CONFIG.REPORT_HEADER_ROWS + ")";
  var cell = sh.getRange('A1');
  cell.setFormula(formula);
  SpreadsheetApp.flush();
  sh.setColumnWidth(1, 260);
  var shown = cell.getDisplayValue();
  if (/^#/.test(shown)) {
    Logger.log('УВАГА: формула у "' + CONFIG.TOTALS_TAB + '" дає ' + shown + '. Формула: ' + formula +
               '. Перевір локаль таблиці (File -> Settings -> Locale) і назву вкладки звіту.');
  } else {
    Logger.log('Вкладка "' + CONFIG.TOTALS_TAB + '" готова, перший рядок: "' + shown + '". Формула: ' + formula);
  }
}

/** Визначає роздільники формул для локалі таблиці пробною формулою в тимчасовій комірці. */
function _formulaSeparators(sh) {
  var probe = sh.getRange('Z1');
  probe.setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  var commaOk = probe.getValue() === 3;
  probe.clearContent();
  return commaOk ? { arg: ',', col: ',' } : { arg: ';', col: '\\' };
}

/** Основний цикл: скан вікна + перевірка відстежуваних заявок поза вікном + дедуп по етапах. */
function poll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('poll: інший запуск ще триває, пропускаю'); return; }
  try {
    var apiKey = CONFIG.ASHBY_API_KEY;
    var state  = _loadState();
    var seen   = {};
    var stats  = { scanned: 0, rechecked: 0, credited: 0 };

    Logger.log('poll старт: скан заявок за останні ' + CONFIG.LOOKBACK_DAYS + ' днів');

    _scanWindow(apiKey, function (app) {
      stats.scanned++;
      seen[String(app.id)] = true;
      if (state.closed[String(app.id)]) return;
      try { stats.credited += _process(apiKey, app, state, false); }
      catch (e) { Logger.log('app ' + app.id + ': ' + e); }
    });

    _recheckTracked(apiKey, state, seen, function (app) {
      stats.rechecked++;
      try { stats.credited += _process(apiKey, app, state, false); }
      catch (e) { Logger.log('app ' + app.id + ': ' + e); }
    });

    Logger.log('poll кінець: переглянуто заявок=' + stats.scanned + ', перевірено поза вікном=' +
               stats.rechecked + ', нових нарахувань=' + stats.credited);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Обробляє одну заявку: ставить маркери, дописує нові зароблені етапи.
 * dryRun=true — тільки лог, нічого не пише. Повертає кількість (нових) нарахувань.
 */
function _process(apiKey, app, state, dryRun) {
  var d = _decide(apiKey, app);
  if (!d.referral) return 0;
  var id = String(d.appId), n = 0;

  if (!state.tracked[id] && !dryRun) { _appendState(id, MARK_TRACKED, null); state.tracked[id] = true; }

  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy');
  var parts = [];
  MILESTONES.forEach(function (m) {
    if (!d.earned[m.key]) return;
    var k = id + '|' + m.key;
    if (state.credited[k]) { parts.push(m.key + ' (вже є)'); return; }
    var row = [d.referrerName, dateStr, m.coins, m.label + ' (' + d.candidateName + ')'];
    if (dryRun) { parts.push(m.key + ' +' + m.coins + ' НОВЕ'); n++; return; }
    if (_appendState(id, m.key, row)) { state.credited[k] = true; parts.push(m.key + ' +' + m.coins + ' ЗАРАХОВАНО'); n++; }
  });

  if (d.closed && !state.closed[id] && !dryRun) { _appendState(id, MARK_CLOSED, null); state.closed[id] = true; }

  if (n > 0 || dryRun) {
    Logger.log((n > 0 ? 'НАРАХУВАННЯ: ' : 'без змін: ') + d.referrerName + ' -> ' + d.candidateName +
               ' | ' + (parts.length ? parts.join(', ') : 'жодного етапу') + ' | ' + d.info);
  }
  return n;
}

/**
 * Чисте рішення по одній заявці (НІЧОГО не пише).
 * Повертає { appId, referral, referrerName, candidateName, earned:{key:bool}, closed, info }.
 */
function _decide(apiKey, app) {
  var out = { appId: app && app.id, referral: false, referrerName: '', candidateName: '',
              earned: {}, closed: false, info: '' };
  if (!app || !app.id) { out.info = 'немає заявки/id'; return out; }

  // 1) Тільки дозволені джерела — перевіряємо ОДРАЗУ з обʼєкта списку (без зайвих запитів).
  var srcType  = (app.source && app.source.sourceType && app.source.sourceType.title) || '';
  var srcTitle = (app.source && app.source.title) || '';
  var allowed  = CONFIG.SOURCES_ALLOWED.map(_norm);
  if (allowed.indexOf(_norm(srcTitle)) === -1) {
    out.info = 'джерело не у списку (source: "' + (srcTitle || srcType) + '")'; return out;
  }

  // Це реферал. Якщо в обʼєкті зі списку немає Credited To — доберемо повну заявку (лише для рефералів).
  if (!app.creditedToUser) {
    var full = _ashby(apiKey, 'application.info', { applicationId: app.id });
    if (full) app = full;
  }

  // 2) Реферер з поля "Credited To"
  var u = app.creditedToUser;
  if (!u || (!u.firstName && !u.lastName)) { out.info = 'реферал без Credited To'; return out; }
  out.referral      = true;
  out.referrerName  = _toLatin([u.firstName, u.lastName].filter(String).join(' ').trim());
  out.candidateName = (app.candidate && app.candidate.name) || '';

  // 3) Історія стадій і статус
  var history    = _ashbyHistory(apiKey, app.id);
  var current    = history.reduce(function (a, b) { return (a && a.stageNumber >= b.stageNumber) ? a : b; }, null);
  var status     = app.status; // Active | Archived | Hired | Lead
  var reasonText = (app.archiveReason && (app.archiveReason.text || app.archiveReason.title)) || '';
  var reasonType = (app.archiveReason && app.archiveReason.reasonType) || '';
  var hired      = status === 'Hired';

  // 4) Етапи
  MILESTONES.forEach(function (m) {
    out.earned[m.key] = m.key === 'hired'
      ? hired
      : hired || _stageEarned(m.stageNames, history, status, reasonType, m.onReach); // найм = усі етапи пройдено
  });
  out.closed = status === 'Hired' || status === 'Archived';

  out.info = 'source="' + (srcTitle || srcType) + '", статус=' + status +
             ', стадія="' + (current && current.title) + '"' +
             (reasonText ? ', причина="' + reasonText + '" [reasonType=' + reasonType + ']' : '');
  return out;
}

/**
 * Чи зароблено стадійний етап:
 *   гілка 1 — Active/Hired і в історії є стадія з більшим stageNumber (просунувся далі; повернення назад не "стирає");
 *   гілка 2 — Archived з причиною RejectedByOrg і стадію досягав.
 */
function _stageEarned(stageNames, history, status, reasonType, onReach) {
  var names  = stageNames.map(_norm);
  var isThis = function (h) { return names.indexOf(_norm(h.title)) !== -1; };
  var events = history.filter(isThis);
  if (!events.length) return false; // стадії взагалі не було — етап не зароблено

  // onReach: достатньо того, що стадія є в історії. Інакше — потрібна пізніша стадія.
  var reached;
  if (onReach) {
    reached = true;
  } else {
    var num = Math.min.apply(null, events.map(function (h) { return h.stageNumber; }));
    reached = history.some(function (h) { return !isThis(h) && h.stageNumber > num; });
  }
  if (!reached) return false;

  // Умова "кандидат сам відмовився — не нараховуємо" лишається і для onReach:
  // Archived зараховується лише з причиною типу RejectedByOrg ("We rejected them").
  var branch1 = status === 'Active' || status === 'Hired';
  var branch2 = status === 'Archived' && REJECT_REASON_TYPES.indexOf(reasonType) !== -1;
  return branch1 || branch2;
}

function _norm(s) { return String(s || '').toLowerCase().trim(); }

// ====== Транслітерація імен ======
// Нові рядки пишемо латиницею. Старі рядки НЕ чіпаємо — вони лишаються як є.
// Увага: та сама людина, записана раніше кирилицею, а тепер латиницею, для
// лідерборда буде ДВОМА різними людьми. Для кампанії це нормально, бо таблицю
// чистять перед стартом; якщо не чистити — старі рядки треба перейменувати.
var _TRANSLIT = {
  'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','ж':'zh','з':'z','и':'y',
  'і':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
  'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ъ':'',
  'ё':'e','ы':'y','э':'e'
};
// Ці залежать від позиції: на початку слова — одне, всередині — інше (правила КМУ).
var _TRANSLIT_POSITIONAL = {
  'є': ['ye', 'ie'],
  'ї': ['yi', 'i'],
  'й': ['y',  'i'],
  'ю': ['yu', 'iu'],
  'я': ['ya', 'ia']
};

/** Кирилиця -> латиниця. Уже латинські імена повертає без змін. */
function _toLatin(name) {
  var src = String(name || '');
  if (!/[\u0400-\u04FF]/.test(src)) return src.trim(); // вже латиниця

  var out = '';
  var atWordStart = true;
  for (var i = 0; i < src.length; i++) {
    var ch = src.charAt(i);
    var lower = ch.toLowerCase();
    var isUpper = ch !== lower;

    var mapped;
    if (Object.prototype.hasOwnProperty.call(_TRANSLIT_POSITIONAL, lower)) {
      mapped = _TRANSLIT_POSITIONAL[lower][atWordStart ? 0 : 1];
    } else if (Object.prototype.hasOwnProperty.call(_TRANSLIT, lower)) {
      mapped = _TRANSLIT[lower];
    } else {
      mapped = ch; // пробіли, дефіси, латинські літери
    }

    if (mapped && isUpper) mapped = mapped.charAt(0).toUpperCase() + mapped.slice(1);
    out += mapped;
    atWordStart = !/[\u0400-\u04FFa-zA-Z\u0027]/.test(ch);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Ручна перевірка транслітерації — запусти й звір лог. */
function testTranslit() {
  ['Михайло Кратюк', 'Владислав Павленко', 'Юрій Її', 'Євген Ящук',
   'Ігор Старик', 'John Smith', 'Анна-Марія Ковальчук'].forEach(function (n) {
    Logger.log(n + '  ->  ' + _toLatin(n));
  });
}

/** Проганяє fn(app) по всіх заявках, створених за останні LOOKBACK_DAYS днів. */
function _scanWindow(apiKey, fn) {
  var since = Date.now() - CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  var cursor = null, guard = 0;
  do {
    var body = { limit: 100, createdAfter: since };
    if (cursor) body.cursor = cursor;
    var resp = _ashbyRaw(apiKey, 'application.list', body);
    if (!resp || !resp.success) { Logger.log('ПОМИЛКА application.list: ' + JSON.stringify(resp)); break; }
    (resp.results || []).forEach(function (app) { if (app && app.id) fn(app); });
    cursor = resp.moreDataAvailable ? resp.nextCursor : null;
  } while (cursor && ++guard < 300);
}

/** Для відстежуваних рефералів, що не потрапили у скан і не закриті, тягне application.info і викликає fn(app). */
function _recheckTracked(apiKey, state, seen, fn) {
  Object.keys(state.tracked).forEach(function (id) {
    if (seen[id] || state.closed[id]) return;
    var app = _ashby(apiKey, 'application.info', { applicationId: id });
    if (app) fn(app);
  });
}

/** Уся історія стадій з пагінацією. */
function _ashbyHistory(apiKey, appId) {
  return _ashbyAll(apiKey, 'application.listHistory', { applicationId: appId }, 20);
}

/** Усі results ендпоінта з пагінацією по cursor. */
function _ashbyAll(apiKey, endpoint, payload, maxPages) {
  var out = [], cursor = null, guard = 0;
  do {
    var body = JSON.parse(JSON.stringify(payload || {}));
    if (cursor) body.cursor = cursor;
    var json = _ashbyRaw(apiKey, endpoint, body);
    if (!json || !json.success) { Logger.log(endpoint + ': ' + JSON.stringify(json)); break; }
    out = out.concat(json.results || []);
    cursor = json.moreDataAvailable ? json.nextCursor : null;
  } while (cursor && ++guard < (maxPages || 50));
  return out;
}

/** Виклик Ashby API (Basic auth: apiKey як логін, порожній пароль). Повертає весь JSON. */
function _ashbyRaw(apiKey, endpoint, payload) {
  var res = UrlFetchApp.fetch(ASHBY_BASE + endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(apiKey + ':') },
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText() || '{}');
}

/** Те саме, але повертає лише results (або null при помилці). */
function _ashby(apiKey, endpoint, payload) {
  var j = _ashbyRaw(apiKey, endpoint, payload);
  if (!j.success) { Logger.log(endpoint + ': ' + JSON.stringify(j)); return null; }
  return j.results;
}

// ====== Стан (схована вкладка) ======

function _reportSheet(ss) {
  if (!CONFIG.REPORT_TAB) return ss.getSheets()[0];
  var sh = ss.getSheetByName(CONFIG.REPORT_TAB);
  // Раніше тут був тихий фолбек на першу вкладку. Це небезпечно: перейменуй
  // «Employer Brand» — і нарахування молча посипались би в «Рейтинг», затерши
  // формулу. Краще впасти з помилкою.
  if (!sh) {
    throw new Error('Не знайдено вкладку "' + CONFIG.REPORT_TAB +
                    '". Перевір назву в CONFIG.REPORT_TAB або перейменуй вкладку назад.');
  }
  return sh;
}

function _stateSheet(ss) {
  var sh = ss.getSheetByName(PROCESSED_TAB);
  if (!sh) { sh = ss.insertSheet(PROCESSED_TAB); sh.hideSheet(); }
  return sh;
}

/** Ключ рядка стану. Старі рядки [appId, дата] (без ключа етапу) = Phone Screen зараховано. */
function _rowKey(r) {
  var k = String(r[1] === undefined || r[1] === null ? '' : r[1]);
  var known = MILESTONES.map(function (m) { return m.key; }).concat([MARK_TRACKED, MARK_CLOSED]);
  return known.indexOf(k) !== -1 ? k : LEGACY_KEY;
}

function _stateRows(sh) {
  if (!sh || sh.getLastRow() === 0) return [];
  return sh.getRange(1, 1, sh.getLastRow(), 2).getValues().filter(function (r) { return String(r[0]); });
}

/**
 * Завантажує стан: credited {"appId|key": true}, tracked {appId: true}, closed {appId: true}.
 * Будь-який appId, що є у стані, вважається відстежуваним (у т.ч. старі записи).
 */
function _loadState() {
  var state = { credited: {}, tracked: {}, closed: {} };
  _stateRows(SpreadsheetApp.getActive().getSheetByName(PROCESSED_TAB)).forEach(function (r) {
    var id = String(r[0]), k = _rowKey(r);
    state.tracked[id] = true;
    if (k === MARK_CLOSED) state.closed[id] = true;
    else if (k !== MARK_TRACKED) state.credited[id + '|' + k] = true;
  });
  return state;
}

/**
 * Дописує запис стану [appId, key, дата] і, якщо row не null, рядок у звіт.
 * Не дублює пару appId+key. Повертає true, якщо реально дописали.
 */
function _appendState(appId, key, row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActive();
    var state = _stateSheet(ss);
    var exists = _stateRows(state).some(function (r) { return String(r[0]) === String(appId) && _rowKey(r) === key; });
    if (exists) return false;
    if (row) _reportSheet(ss).appendRow(row);
    state.appendRow([String(appId), key, new Date()]);
    return true;
  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// ====== ТЕСТУВАННЯ (запускай вручну через кнопку Run) ======
// Результати: View -> Logs (Ctrl/Cmd+Enter) або в Executions.
// ============================================================

/** ТЕСТ 1. Перевірка ключа й доступу до Ashby. */
function testConnection() {
  var r = _ashbyRaw(CONFIG.ASHBY_API_KEY, 'application.list', { limit: 1 });
  if (r && r.success) {
    Logger.log('OK: звʼязок з Ashby працює (отримано: ' + (r.results || []).length + ').');
  } else {
    Logger.log('ПОМИЛКА доступу. Перевір ASHBY_API_KEY і дозвіл candidatesRead.\n' + JSON.stringify(r));
  }
}

/** ТЕСТ 2. Сухий прогін — для кожного реферала показує зароблені етапи і які з них НОВІ. НІЧОГО не пише. */
function testDryRun() {
  var apiKey = CONFIG.ASHBY_API_KEY;
  var state  = _loadState();
  var seen   = {};
  var stats  = { scanned: 0, rechecked: 0, newCredits: 0 };

  _scanWindow(apiKey, function (app) {
    stats.scanned++;
    seen[String(app.id)] = true;
    if (state.closed[String(app.id)]) return;
    stats.newCredits += _process(apiKey, app, state, true);
  });
  _recheckTracked(apiKey, state, seen, function (app) {
    stats.rechecked++;
    stats.newCredits += _process(apiKey, app, state, true);
  });

  Logger.log('--- Сухий прогін: переглянуто ' + stats.scanned + ', поза вікном ' + stats.rechecked +
             ', нових нарахувань було б ' + stats.newCredits + '. (нічого не записано) ---');
}

/** ТЕСТ 3. Детальна діагностика ОДНІЄЇ заявки (нічого не пише). Встав applicationId. */
function diagnoseApplication() {
  var applicationId = '';  // <-- ВСТАВ СЮДИ applicationId
  if (!applicationId) { Logger.log('Встав applicationId у diagnoseApplication().'); return; }
  var app = _ashby(CONFIG.ASHBY_API_KEY, 'application.info', { applicationId: applicationId });
  if (!app) { Logger.log('Заявку не знайдено.'); return; }

  var state = _loadState();
  var d = _decide(CONFIG.ASHBY_API_KEY, app);
  Logger.log('Кандидат: ' + ((app.candidate && app.candidate.name) || '—') + ' | реферер: ' + (d.referrerName || '—'));
  Logger.log('archiveReason (сире): ' + JSON.stringify(app.archiveReason));
  Logger.log('Історія стадій: ' + _ashbyHistory(CONFIG.ASHBY_API_KEY, app.id)
    .map(function (h) { return h.stageNumber + ':"' + h.title + '"'; }).join(' -> '));
  Logger.log('Деталі: ' + d.info);
  if (!d.referral) { Logger.log('Рішення: не реферал / не зараховується'); return; }
  MILESTONES.forEach(function (m) {
    var was = state.credited[String(d.appId) + '|' + m.key];
    Logger.log('  ' + m.key + ' (' + m.coins + '): ' + (d.earned[m.key] ? (was ? 'зароблено, вже є в таблиці' : 'зароблено, НОВЕ') : 'ні'));
  });
  Logger.log('Закрита (більше не перевіряти): ' + d.closed);
}

/** ТЕСТ 4. Реальний запис усіх нових етапів ОДНОГО кандидата (перевірка формату). Встав applicationId. */
function testWriteOne() {
  var applicationId = '';  // <-- ВСТАВ СЮДИ applicationId
  if (!applicationId) { Logger.log('Встав applicationId у testWriteOne().'); return; }
  var app = _ashby(CONFIG.ASHBY_API_KEY, 'application.info', { applicationId: applicationId });
  if (!app) { Logger.log('Заявку не знайдено.'); return; }
  var n = _process(CONFIG.ASHBY_API_KEY, app, _loadState(), false);
  Logger.log(n > 0 ? 'Записано нових етапів: ' + n : 'Нічого нового не записано (не реферал / етапи вже є / умови не виконано).');
}

/** ТЕСТ 5. Друкує точні назви всіх джерел з Ashby (звір зі SOURCES_ALLOWED). */
function listSources() {
  var sources = _ashbyAll(CONFIG.ASHBY_API_KEY, 'source.list', {}, 20);
  sources.forEach(function (s) {
    var type = (s.sourceType && s.sourceType.title) || '';
    Logger.log('• "' + s.title + '"   (тип: ' + type + (s.isArchived ? ', архівне' : '') + ')');
  });
  Logger.log('--- Усього джерел: ' + sources.length + ' ---');
}

/** ТЕСТ 6. Друкує назви стадій усіх interview plan (звір зі stageNames у MILESTONES).
 *  Якщо помилка доступу — ключу може знадобитися додатковий дозвіл (interviewsRead / jobsRead). */
function listStages() {
  var apiKey = CONFIG.ASHBY_API_KEY;
  var plans = _ashbyAll(apiKey, 'interviewPlan.list', {}, 20);
  if (!plans.length) { Logger.log('Interview plan не отримано — див. помилку вище.'); return; }
  var titles = {};
  plans.forEach(function (p) {
    var stages = _ashbyAll(apiKey, 'interviewStage.list', { interviewPlanId: p.id }, 20)
      .sort(function (a, b) { return (a.orderInInterviewPlan || 0) - (b.orderInInterviewPlan || 0); });
    Logger.log('Plan "' + p.title + '"' + (p.isArchived ? ' (архівний)' : '') + ':');
    stages.forEach(function (s) {
      titles[s.title] = (titles[s.title] || 0) + 1;
      Logger.log('    ' + s.orderInInterviewPlan + '. "' + s.title + '" (' + s.type + ')');
    });
  });
  Logger.log('--- Унікальні назви стадій (кількість планів): ' +
             Object.keys(titles).sort().map(function (t) { return '"' + t + '"×' + titles[t]; }).join(', ') + ' ---');
}

/** ТЕСТ 7. Одноразовий запуск poll() через 2 хв (перевірка автоспрацювання тригера). */
function testScheduleSoon() {
  var when = new Date(Date.now() + 2 * 60 * 1000);
  ScriptApp.newTrigger('poll').timeBased().at(when).create();
  Logger.log('poll заплановано приблизно на ' +
             Utilities.formatDate(when, Session.getScriptTimeZone(), 'HH:mm:ss') + '. Дивись Executions.');
}