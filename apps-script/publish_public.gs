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

  // Вкладка в публічній таблиці, куди писати. Створюється автоматично.
  // Це та сама вкладка, яку читає сайт (VITE_PUBLIC_SHEET_TAB).
  //
  // У копії таблиці «Рейтинг» містить формулу QUERY по її ж «Employer Brand» —
  // тобто заморожений зліпок, який більше ніколи не оновиться, бо нарахування
  // йдуть у ПРИВАТНУ таблицю. Перший pubPublish() замінить цю формулу
  // звичайними значеннями і далі оновлюватиме їх щогодини з живих даних.
  TARGET_TAB: 'Рейтинг',
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

  Logger.log('Опубліковано ' + data.entries.length + ' рефереров у «' + PUB_CONFIG.TARGET_TAB + '».');
  return data.entries.length;
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
