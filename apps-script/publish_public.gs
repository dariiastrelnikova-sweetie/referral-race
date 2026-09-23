/**
 * Referral Race — публікація стандингів у ПУБЛІЧНУ таблицю.
 *
 * Навіщо це існує
 * ---------------
 * Щоб сайт жив на власному домені (а не на script.google.com) і відкривався без
 * входу в Google, дані має віддавати щось публічне. Політика Workspace не дає
 * задеплоїти веб-застосунок на «Anyone», тож лишається публічна таблиця.
 *
 * АЛЕ: публічна таблиця публічна ЦІЛКОМ — усі вкладки, усі колонки. У робочій
 * таблиці нарахувань колонка D — це імена кандидатів. Відкрити її світові не
 * можна. Тому робоча таблиця лишається приватною, а цей скрипт раз на годину
 * переливає в ОКРЕМУ публічну таблицю тільки «ім'я → сума балів».
 *
 * Тобто публічним стає рівно те, що й так видно на сайті.
 *
 * !!! Префікс PUB_ обов'язковий: у проєкті Apps Script один глобальний скоуп на
 * всі файли. Голе CONFIG тут перетерло б CONFIG зі скрипта нарахувань і зламало
 * б poll()/setup(). Див. те саме попередження в leaderboard_api.gs.
 *
 * Живе в проєкті, прив'язаному до ПРИВАТНОЇ таблиці — там, де coins.gs і
 * leaderboard_api.gs. Ashby-ключ лишається в приватному проєкті й у публічну
 * таблицю не потрапляє.
 */

var PUB_CONFIG = {
  // ID публічної таблиці — те, що між /d/ і /edit в її URL.
  // Порожнє значення = скрипт нічого не робить, тільки скаже, що не налаштований.
  TARGET_ID: '1usOrSJ9BscBOlhZskD965b4DMPbg-mUTlHIADtd50BY',

  // Дзеркалити детальні нарахування («Employer Brand») у публічну таблицю.
  //
  // Дзеркалення повністю перебудовує вкладку з приватної таблиці, але
  // колонку E (ручний статус Done) переносить ЗА ЗМІСТОМ РЯДКА, а не за його
  // номером. Тому зсув рядків між таблицями нічого не ламає: Done лишається
  // біля свого нарахування, навіть якщо воно переїхало на іншу позицію.
  // Рядки, які є лише в копії (додані вручну саме туди), не зникають —
  // вони дописуються в кінець.
  MIRROR_DETAIL: true,
  MIRROR_TAB: 'Employer Brand',

  // Вкладка в публічній таблиці, куди писати. Створюється автоматично.
  // Це та сама вкладка, яку читає сайт (VITE_PUBLIC_SHEET_TAB).
  //
  // У копії таблиці «Рейтинг» містить формулу QUERY по її ж «Employer Brand» —
  // тобто заморожений зліпок, який більше ніколи не оновиться, бо нарахування
  // йдуть у ПРИВАТНУ таблицю. Перший pubPublish() замінить цю формулу
  // звичайними значеннями і далі оновлюватиме їх щогодини з живих даних.
  TARGET_TAB: 'Рейтинг',

  // ID ПРИВАТНОЇ таблиці нарахувань — джерела даних.
  //
  // Раніше джерело бралося через SpreadsheetApp.getActiveSpreadsheet(). Це
  // працює, лише поки скрипт прив'язаний саме до приватної таблиці: варто
  // запустити копію цього коду з іншого проєкту — і «активною» стане інша
  // таблиця, а дзеркалення почне переливати таблицю саму в себе.
  // Явний ID знімає це питання назавжди. Це та сама причина, через яку
  // LB_CONFIG.REPORT_TAB задано явно, а не «перша вкладка».
  //
  // Порожнє значення = стара поведінка (активна таблиця).
  SOURCE_ID: '1I6czUyXm-jQQQldF49XX5a2CGXLCZpaWBYseWdeB3OE',

  // Запобіжник проти втрати даних.
  //
  // Дзеркалення перебудовує вкладку повністю, тобто в нормі може й скоротити
  // її. Але якщо приватна таблиця раптом прочиталася майже порожньою (не ті
  // права, не та вкладка, не та таблиця), повне перезаписування стерло б у
  // копії все зайве — а «зайвим» виявилася б уся історія.
  //
  // Тому: якщо після дзеркалення рядків стане менше, ніж (1 - MAX_SHRINK) від
  // того, що є зараз, запис НЕ відбувається і вилітає помилка з цифрами.
  // Це не «звірка розбіжностей» і ручної роботи не потребує — гейт спрацьовує
  // тільки на обвалі обсягу. 0 = вимкнути перевірку.
  MAX_SHRINK: 0.2,
};

/**
 * Головна функція. Читає приватний звіт через LB_build() і перезаписує
 * публічну вкладку.
 *
 * LB_build() використано навмисно замість власної копії агрегації: у ньому вже
 * є нормалізація імен, фільтр за START_DATE і — головне — вибірка рівно колонок
 * A і C. Колонка D не читається в принципі, тож імена кандидатів не можуть
 * потрапити в публічну таблицю навіть помилково.
 */
function pubPublish() {
  var sheet = PUB_targetSheet();
  var data = LB_build();

  // Рядок 1 — шапка. Колонка C тримає час останнього оновлення (лише в
  // першому рядку даних) — щоб сайт міг показати «Updated HH:MM» чесно, а не
  // час власного запиту.
  var rows = [['Referrer', 'Points', 'Updated']];
  for (var i = 0; i < data.entries.length; i++) {
    rows.push([data.entries[i].name, data.entries[i].points, i === 0 ? data.updatedAt : '']);
  }

  // Спершу чистимо все, потім пишемо: інакше, якщо рефererів поменшало,
  // внизу лишився б хвіст від попереднього запуску.
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 3).setValues(rows);

  // Apps Script складає записи в чергу і скидає їх аж наприкінці виконання.
  // Без flush() рядок нижче писав «Опубліковано», а помилка доступу вилітала
  // вже після нього — лог брехав про успіх. flush() змушує запис статися ТУТ,
  // тож якщо він не проходить, падаємо до логу, а не після.
  SpreadsheetApp.flush();

  Logger.log('Опубліковано ' + data.entries.length + ' рефереров у «' + PUB_CONFIG.TARGET_TAB + '».');

  // Дзеркалення — окремо і в try/catch: якщо воно впаде (розбіжність, права),
  // рейтинг на сайті все одно має оновитися. Це різні задачі.
  if (PUB_CONFIG.MIRROR_DETAIL) {
    try {
      pubMirror();
    } catch (err) {
      Logger.log('Дзеркалення «' + PUB_CONFIG.MIRROR_TAB + '» НЕ виконано: ' + err);
    }
  }

  return data.entries.length;
}

/**
 * Дзеркалить детальні нарахування з приватної таблиці в публічну копію.
 *
 * Перебудовує вкладку повністю, а не «дописує різницю» — так результат не
 * залежить від того, наскільки таблиці встигли розійтися.
 *
 * Головне тут — колонка E (ручний статус Done). Вона переноситься за ЗМІСТОМ
 * рядка (ім'я + дата + коїни + опис), а не за його номером. Перша спроба
 * звіряти рядки за позицією дала 1319 розбіжностей на ~1300 рядках: досить
 * одного вставленого чи видаленого рядка на початку — і далі все зсунуте.
 * Прив'язка за змістом робить це неважливим, і ручна робота не потрібна.
 *
 * Ключ нечутливий до типу дати: '01.09.2026' текстом і справжня дата дають
 * однаковий ключ. Саме через цю різницю рядки й виглядали «різними».
 */
function pubMirror() {
  var plan = PUB_mirrorPlan();
  var sheet = PUB_mirrorSheet();

  if (!plan.rows.length) {
    Logger.log('Нема чого дзеркалити.');
    return 0;
  }

  // Запобіжник: обвал обсягу майже завжди означає, що джерело прочиталося не
  // так, а не що нарахувань справді поменшало вдесятеро.
  if (PUB_CONFIG.MAX_SHRINK > 0 && plan.dstRows > 0) {
    var floor = Math.floor(plan.dstRows * (1 - PUB_CONFIG.MAX_SHRINK));
    if (plan.rows.length < floor) {
      throw new Error(
        'СКАСОВАНО, нічого не записано. Дзеркалення скоротило б «' + PUB_CONFIG.MIRROR_TAB +
          '» з ' + plan.dstRows + ' рядків до ' + plan.rows.length + ' (у приватній таблиці ' +
          'знайдено лише ' + plan.fromPrivate + '). Схоже, джерело прочиталося неправильно. ' +
          'Запусти pubMirrorDiff() — він покаже, яку саме таблицю й вкладку читає скрипт. ' +
          'Якщо скорочення справді очікуване, тимчасово постав PUB_CONFIG.MAX_SHRINK = 0.',
      );
    }
  }

  sheet.getRange(plan.firstRow, 1, plan.rows.length, 5).setValues(plan.rows);

  // Прибрати хвіст, якщо раніше рядків було більше.
  var lastWritten = plan.firstRow + plan.rows.length - 1;
  if (plan.dstLast > lastWritten) {
    sheet.getRange(lastWritten + 1, 1, plan.dstLast - lastWritten, 5).clearContent();
  }
  SpreadsheetApp.flush();

  Logger.log('Здзеркалено ' + plan.fromPrivate + ' рядків із приватної таблиці.');
  Logger.log('Перенесено статусів Done: ' + plan.carriedStatuses);
  if (plan.onlyInCopy) {
    Logger.log('Збережено рядків, яких немає в приватній таблиці: ' + plan.onlyInCopy +
               ' (дописані в кінець).');
  }
  return plan.rows.length;
}

/**
 * ТІЛЬКИ ЧИТАЄ. Показує, що саме зробить pubMirror().
 */
function pubMirrorAudit() {
  var plan = PUB_mirrorPlan();
  Logger.log('Рядків у приватній таблиці:      ' + plan.fromPrivate);
  Logger.log('Рядків зараз у публічній копії:  ' + plan.dstRows);
  Logger.log('Статусів Done у копії:           ' + plan.statusesInCopy);
  Logger.log('  з них знайдуть свій рядок:     ' + plan.carriedStatuses);
  Logger.log('Рядків лише в копії (збережемо в кінці): ' + plan.onlyInCopy);
  Logger.log('Разом після дзеркалення:         ' + plan.rows.length);

  var lost = plan.statusesInCopy - plan.carriedStatuses - plan.statusesInCarried;
  if (lost > 0) {
    Logger.log('');
    Logger.log('УВАГА: ' + lost + ' статусів Done стоять біля рядків, яких немає ' +
               'у приватній таблиці і які не вдалося зіставити. Вони не зникнуть — ' +
               'ці рядки дописуються в кінець разом зі статусом.');
  }
  Logger.log('');
  Logger.log('Нічого не записано. Запусти pubMirror(), щоб застосувати.');
}

/**
 * ТІЛЬКИ ЧИТАЄ. Показує, ЯКУ САМЕ таблицю й вкладку скрипт вважає джерелом, і
 * що зараз лежить в обох вкладках — включно з останніми рядками.
 *
 * Це діагностика на випадок «у копії рядків набагато менше, ніж у приватній»:
 * майже завжди причина в тому, що джерелом виявилася не та таблиця.
 * Колонка D (імена кандидатів) тут не друкується.
 */
function pubMirrorDiff() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Скрипт виконує:  ' + Session.getEffectiveUser().getEmail());
  Logger.log('Активна таблиця: "' + active.getName() + '"  id=' + active.getId());
  Logger.log('SOURCE_ID:       ' + (PUB_CONFIG.SOURCE_ID || '(порожньо — береться активна)'));
  Logger.log('TARGET_ID:       ' + PUB_CONFIG.TARGET_ID);
  Logger.log('');

  var firstRow = LB_CONFIG.HEADER_ROWS + 1;

  var src = PUB_sourceSheet();
  var srcSs = src.getParent();
  Logger.log('ДЖЕРЕЛО: "' + srcSs.getName() + '" → вкладка «' + src.getName() + '"');
  Logger.log('  id=' + srcSs.getId());
  Logger.log('  getLastRow()=' + src.getLastRow() + ', getMaxRows()=' + src.getMaxRows());
  var srcRows = PUB_detailRows(src, firstRow);
  Logger.log('  рядків з іменем: ' + srcRows.length);
  PUB_logSample('  ', srcRows);
  Logger.log('');

  var dst = PUB_mirrorSheet();
  Logger.log('КОПІЯ: вкладка «' + dst.getName() + '»');
  Logger.log('  getLastRow()=' + dst.getLastRow() + ', getMaxRows()=' + dst.getMaxRows());
  var dstRows = PUB_detailRows(dst, firstRow);
  Logger.log('  рядків з іменем: ' + dstRows.length);
  PUB_logSample('  ', dstRows);
  Logger.log('');

  if (srcSs.getId() === PUB_CONFIG.TARGET_ID) {
    Logger.log('!!! ДЖЕРЕЛО І КОПІЯ — ОДНА Й ТА САМА ТАБЛИЦЯ. Це і є причина.');
    return;
  }

  var plan = PUB_mirrorPlan();
  Logger.log('Дзеркалення записало б рядків: ' + plan.rows.length +
             ' (з приватної ' + plan.fromPrivate + ', лише в копії ' + plan.onlyInCopy + ')');
  if (PUB_CONFIG.MAX_SHRINK > 0 && plan.dstRows > 0) {
    var floor = Math.floor(plan.dstRows * (1 - PUB_CONFIG.MAX_SHRINK));
    Logger.log('Поріг запобіжника: не менше ' + floor + ' рядків. ' +
               (plan.rows.length < floor ? 'СПРАЦЮЄ — запис буде скасовано.' : 'не спрацює.'));
  }
  Logger.log('');
  Logger.log('Нічого не записано.');
}

/** Друкує перші 2 і останні 3 рядки вибірки. Колонку D не показує. */
function PUB_logSample(pad, rows) {
  if (!rows.length) {
    Logger.log(pad + '(порожньо)');
    return;
  }
  var show = function (i) {
    var r = rows[i];
    Logger.log(pad + '  [' + (i + 1) + '] ' + LB_cleanName(r[0]) +
               ' | ' + PUB_dateKey(r[1]) + ' | ' + r[2]);
  };
  var head = Math.min(2, rows.length);
  for (var i = 0; i < head; i++) show(i);
  if (rows.length > head + 3) Logger.log(pad + '  ...');
  for (var j = Math.max(head, rows.length - 3); j < rows.length; j++) show(j);
}

/**
 * Готує підсумковий вміст вкладки. Нічого не пише.
 * Повертає рядки [A, B, C, D, E] у порядку приватної таблиці, а вкінці —
 * рядки, які існують лише в копії.
 */
function PUB_mirrorPlan() {
  var firstRow = LB_CONFIG.HEADER_ROWS + 1;
  var src = PUB_detailRows(PUB_sourceSheet(), firstRow);

  var sheet = PUB_mirrorSheet();
  var dstLast = sheet.getLastRow();
  var old = [];
  if (dstLast >= firstRow) {
    old = sheet.getRange(firstRow, 1, dstLast - firstRow + 1, 5).getValues();
  }

  // Скільки разів кожен ключ зустрічається в приватній таблиці. Дублікати
  // бувають (двічі однакове нарахування), тому рахуємо, а не позначаємо.
  var need = {};
  for (var i = 0; i < src.length; i++) {
    var k = PUB_key(src[i]);
    need[k] = (need[k] || 0) + 1;
  }

  // Розкладаємо рядки копії: ті, що мають пару в приватній, віддають свій
  // статус; решта — це нарахування, додані лише в копію, їх треба зберегти.
  var statusQueue = {};
  var carried = [];
  var statusesInCopy = 0;
  var statusesInCarried = 0;

  for (var j = 0; j < old.length; j++) {
    if (!LB_cleanName(old[j][0])) continue;
    var hasStatus = String(old[j][4] === null || old[j][4] === undefined ? '' : old[j][4]).trim() !== '';
    if (hasStatus) statusesInCopy++;

    var key = PUB_key(old[j]);
    if (need[key] > 0) {
      need[key]--;
      if (!statusQueue[key]) statusQueue[key] = [];
      statusQueue[key].push(old[j][4]);
    } else {
      carried.push([old[j][0], old[j][1], old[j][2], old[j][3], old[j][4]]);
      if (hasStatus) statusesInCarried++;
    }
  }

  var rows = [];
  var carriedStatuses = 0;
  for (var m = 0; m < src.length; m++) {
    var k2 = PUB_key(src[m]);
    var status = '';
    if (statusQueue[k2] && statusQueue[k2].length) {
      status = statusQueue[k2].shift();
      if (String(status === null || status === undefined ? '' : status).trim() !== '') {
        carriedStatuses++;
      }
    }
    rows.push([src[m][0], src[m][1], src[m][2], src[m][3], status]);
  }

  return {
    firstRow: firstRow,
    dstLast: dstLast,
    dstRows: old.length,
    fromPrivate: src.length,
    onlyInCopy: carried.length,
    statusesInCopy: statusesInCopy,
    statusesInCarried: statusesInCarried,
    carriedStatuses: carriedStatuses,
    rows: rows.concat(carried),
  };
}

/**
 * Ключ рядка нарахування. Навмисно нечутливий до типу й формату дати та до
 * регістру й зайвих пробілів — саме ці дрібниці й робили однакові на вигляд
 * рядки «різними».
 */
function PUB_key(row) {
  var name = LB_cleanName(row[0]).toLowerCase();
  var coins = LB_toNumber(row[2]);
  var desc = String(row[3] === null || row[3] === undefined ? '' : row[3])
    .replace(/\s+/g, ' ').trim().toLowerCase();
  return [name, PUB_dateKey(row[1]), coins === null ? '' : coins, desc].join('|');
}

/** Дата у вигляді 'yyyy-MM-dd' — і зі справжньої дати, і з тексту 'dd.MM.yyyy'. */
function PUB_dateKey(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var text = String(value === null || value === undefined ? '' : value).trim();
  var m = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (!m) return text;
  return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

/**
 * Рядки A–D до останнього, де є ім'я.
 * Обрізати хвіст обов'язково: під даними у звіті висять сотні порожніх на
 * вигляд рядків, і без обрізання ми б дзеркалили їх усі.
 */
function PUB_detailRows(sheet, firstRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < firstRow) return [];
  var vals = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 4).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (LB_cleanName(vals[i][0])) return vals.slice(0, i + 1);
  }
  return [];
}

/**
 * Вкладка-джерело в ПРИВАТНІЙ таблиці нарахувань.
 * Якщо SOURCE_ID заданий — відкриваємо строго її; інакше активну таблицю.
 */
function PUB_sourceSheet() {
  var ss;
  if (PUB_CONFIG.SOURCE_ID) {
    try {
      ss = SpreadsheetApp.openById(PUB_CONFIG.SOURCE_ID);
    } catch (err) {
      throw new Error('Не вдалося відкрити приватну таблицю ' + PUB_CONFIG.SOURCE_ID + ': ' + err);
    }
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  if (ss.getId() === PUB_CONFIG.TARGET_ID) {
    throw new Error(
      'Джерело і призначення — це та сама таблиця (' + ss.getId() + '). ' +
        'Дзеркалення переливало б її саму в себе. Впиши ID приватної таблиці в PUB_CONFIG.SOURCE_ID.',
    );
  }

  var sheet = ss.getSheetByName(LB_CONFIG.REPORT_TAB);
  if (!sheet) {
    throw new Error('У таблиці "' + ss.getName() + '" немає вкладки «' + LB_CONFIG.REPORT_TAB + '».');
  }
  return sheet;
}

/** Вкладка з деталізацією в публічній копії. */
function PUB_mirrorSheet() {
  var ss = SpreadsheetApp.openById(PUB_CONFIG.TARGET_ID);
  var sheet = ss.getSheetByName(PUB_CONFIG.MIRROR_TAB);
  if (!sheet) {
    throw new Error('У публічній таблиці немає вкладки «' + PUB_CONFIG.MIRROR_TAB + '».');
  }
  return sheet;
}

/**
 * Показує, що саме пішло б у публічну таблицю. Нічого не пише.
 * Запусти це ПЕРШИМ — перевірити, що в даних немає нічого зайвого.
 */
function pubPreview() {
  var data = LB_build();
  Logger.log('Рефереров: ' + data.entries.length + ', оновлено: ' + data.updatedAt);
  Logger.log('Колонки, які підуть у публічну таблицю: Referrer, Points, Updated. Більше нічого.');
  var top = data.entries.slice(0, 10);
  for (var i = 0; i < top.length; i++) {
    Logger.log('  ' + (i + 1) + '. ' + top[i].name + ' — ' + top[i].points);
  }
  if (!PUB_CONFIG.TARGET_ID) {
    Logger.log('PUB_CONFIG.TARGET_ID порожній — pubPublish() поки нічого не запише.');
  }
}

/**
 * Ставить тригер: раз на годину.
 *
 * Щогодини, а не 4 рази на день у такт poll(), з двох причин: Apps Script не
 * гарантує порядок тригерів в одну годину (публікація могла б відпрацювати
 * ДО нарахування), і ручні рядки, які додають люди, теж мають доїжджати на сайт.
 *
 * Безпечно запускати повторно: спершу знімає свої ж старі тригери.
 * Тригерів poll() не чіпає.
 */
function pubSetup() {
  if (!PUB_CONFIG.TARGET_ID) {
    throw new Error('Спочатку впиши ID публічної таблиці в PUB_CONFIG.TARGET_ID.');
  }

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pubPublish') ScriptApp.deleteTrigger(triggers[i]);
  }

  ScriptApp.newTrigger('pubPublish').timeBased().everyHours(1).create();
  Logger.log('Тригер поставлено: pubPublish раз на годину.');

  // Одразу наповнюємо таблицю, щоб не чекати годину на першу перевірку.
  pubPublish();
}

/** Знімає тригер публікації. Тригери нарахувань не чіпає. */
function pubRemoveTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pubPublish') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('Знято тригерів pubPublish: ' + removed);
}

/** Відкриває (і за потреби створює) цільову вкладку в публічній таблиці. */
function PUB_targetSheet() {
  if (!PUB_CONFIG.TARGET_ID) {
    throw new Error('PUB_CONFIG.TARGET_ID порожній — впиши ID публічної таблиці.');
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(PUB_CONFIG.TARGET_ID);
  } catch (err) {
    throw new Error(
      'Не вдалося відкрити таблицю ' + PUB_CONFIG.TARGET_ID + '. ' +
        'Перевір ID і те, що акаунт, від імені якого працює скрипт, має до неї доступ на редагування. ' +
        'Деталі: ' + err,
    );
  }

  var sheet = ss.getSheetByName(PUB_CONFIG.TARGET_TAB);
  if (!sheet) sheet = ss.insertSheet(PUB_CONFIG.TARGET_TAB);
  return sheet;
}

/**
 * ТІЛЬКИ ЧИТАЄ (крім одного пробного запису, який одразу прибирає).
 * Показує, чому pubPublish() не може писати в публічну таблицю.
 */
function pubDiagnose() {
  Logger.log('Скрипт виконує: ' + Session.getEffectiveUser().getEmail());
  Logger.log('TARGET_ID: ' + PUB_CONFIG.TARGET_ID);

  var ss;
  try {
    ss = SpreadsheetApp.openById(PUB_CONFIG.TARGET_ID);
  } catch (err) {
    Logger.log('openById НЕ ВДАВСЯ: ' + err);
    Logger.log('Тобто акаунт не бачить цей файл узагалі. Перевір ID і доступ.');
    return;
  }
  Logger.log('Відкрито: "' + ss.getName() + '"');
  Logger.log('URL: ' + ss.getUrl());

  try {
    Logger.log('Власник: ' + ss.getOwner().getEmail());
  } catch (err) {
    Logger.log('getOwner() не спрацював: ' + err);
  }
  try {
    var eds = ss.getEditors().map(function (u) { return u.getEmail(); });
    Logger.log('Редактори: ' + (eds.length ? eds.join(', ') : '(немає)'));
  } catch (err) {
    Logger.log('getEditors() не спрацював: ' + err);
  }

  var names = ss.getSheets().map(function (sh) { return sh.getName(); });
  Logger.log('Вкладки: ' + names.join(' | '));

  var sheet = ss.getSheetByName(PUB_CONFIG.TARGET_TAB);
  if (!sheet) {
    Logger.log('Немає вкладки «' + PUB_CONFIG.TARGET_TAB + '».');
    return;
  }

  // Захищені діапазони переїжджають разом із копією таблиці — часта причина
  // «немає доступу» там, де доступ до файлу насправді є.
  try {
    var prSheet = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var prRange = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    Logger.log('Захист вкладки: ' + prSheet.length + ', захищених діапазонів: ' + prRange.length);
    for (var i = 0; i < prSheet.length; i++) {
      Logger.log('  вкладка захищена, я можу редагувати: ' + prSheet[i].canEdit());
    }
    for (var j = 0; j < prRange.length; j++) {
      Logger.log('  діапазон ' + prRange[j].getRange().getA1Notation() +
                 ', я можу редагувати: ' + prRange[j].canEdit());
    }
  } catch (err) {
    Logger.log('Перевірка захисту не спрацювала: ' + err);
  }

  // Найголовніше: пробний запис із негайним flush(), щоб помилка вилізла тут.
  try {
    sheet.getRange('Z999').setValue('probe');
    SpreadsheetApp.flush();
    Logger.log('ПРОБНИЙ ЗАПИС: OK — писати можна.');
    sheet.getRange('Z999').clearContent();
    SpreadsheetApp.flush();
  } catch (err) {
    Logger.log('ПРОБНИЙ ЗАПИС НЕ ВДАВСЯ: ' + err);
  }
}
