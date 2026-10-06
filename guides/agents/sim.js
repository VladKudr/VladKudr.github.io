// Тренажёр «Соберите свой harness»: включайте и выключайте компоненты и смотрите, где агент ломается.
// Сценарий фиксированный и условный: показывает типичные поломки, а не замеры продукта.
// Тексты на трёх языках; язык берётся из <html lang>.

const LANG = ['en', 'de'].includes(document.documentElement.lang) ? document.documentElement.lang : 'ru';

const I18N = {
  ru: {
    parts: {
      loop: ['Агентный цикл', 'повторять итерации, пока задача не решена'],
      tools: ['Инструменты', 'tool calls: файлы, правки, почта'],
      instr: ['Инструкции', 'системный промпт и правила проекта'],
      ctx: ['Compaction', 'сжатие переполненного контекста'],
      gate: ['Разрешения', 'permissions: что можно без подтверждения'],
      check: ['Проверка', 'хуки и тесты результата'],
      stop: ['Лимиты', 'итерации, токены, деньги'],
      memory: ['Память', 'записи между сессиями'],
    },
    ui: {
      quick: 'Быстрый выбор:', bare: 'Голая модель', proto: 'Прототип за вечер', full: 'Полный harness',
      run: '▶ Запустить агента', again: '▶ Запустить ещё раз', running: 'Агент работает…', fast: 'без анимации',
      found: 'Найдено поломок:', of: 'из',
      hint: 'Начните с «Голой модели», потом включайте компоненты по одному и запускайте снова.',
      missing: 'Не хватило:', helped: 'Помогло:',
      vOk: 'Задача решена ✓', vFail: 'Задача не выполнена', vHarm: 'Сделано, но с ущербом',
      vPartial: 'Сделано, но не до конца', vTomorrow: 'Сегодня решено, а завтра — всё с нуля',
      incidents: 'Инциденты:', problems: 'Проблемы:', enable: 'Что включить:',
      okLine: 'Каждый компонент сработал там, где модель сама бы не справилась. Попробуйте выключить любой один — и запустите снова.',
      allFound: '🎉 Вы нашли все поломки: теперь видно, зачем нужен каждый компонент harness.',
      iter: ['итерация', 'итерации', 'итераций'], inc: ['инцидент', 'инцидента', 'инцидентов'],
      price: 'условная цена', time: 'время', min: 'мин',
      enableAll: 'Включить всё и повторить', resetFound: 'Сбросить найденное',
    },
    money: v => '$' + v.toFixed(2).replace('.', ','),
    plural: (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2],
    files: ['sales_q3.xlsx', 'buh_q3.xlsx'],
    ev: {
      task: { t: 'Задача в контексте модели', dInstr: 'В контексте задача и системный промпт с регламентом компании.', dNo: 'В контексте только задача. Инструкций нет.', p: ['задача', 'системный промпт'] },
      noLoop: { t: 'Совет вместо работы', d: 'Без агентного цикла модель отвечает один раз: «Откройте оба отчёта, сравните итоги по месяцам и проверьте формулы». Это совет, а делать работу некому.', p: ['весь контекст', 'совет'] },
      noTools: { t: 'Нет инструментов', d: 'Модели нужно открыть файлы, но у агента нет инструментов: «Пришлите, пожалуйста, оба отчёта». Работа встала.', p: ['нечем открыть файл'] },
      opened: { t: 'Открыты оба отчёта', d: f => `Модель вызвала инструмент чтения для <code>${f[0]}</code> и <code>${f[1]}</code>, harness выполнил tool calls.`, p: ['tool call: открыть 2 отчёта', '2 отчёта'] },
      stopOk: { t: 'Файл занят — сработал лимит повторов', d: 'Отчёт по продажам открыт у коллеги. После трёх одинаковых ошибок harness остановил повторы и передал вопрос человеку. Ответ: «Возьми копию из архива».', p: ['файл занят', 'лимит: 3 ошибки подряд', 'нужна помощь'] },
      stopNo: { t: 'Агент застрял', d: 'Отчёт по продажам открыт у коллеги. Без лимитов агент пробовал снова и снова: 37 попыток за 50 минут, пока файл не освободился.', issue: '37 лишних попыток', p: ['ещё попытка', 'попытка 37…'] },
      ctxOk: { t: 'Контекст переполнился — сработал compaction', d: '12 листов отчётов не помещаются в контекстное окно. Harness заменил прочитанное краткой сводкой: что найдено и что осталось сделать.', p: ['12 листов', 'compaction: сводка вместо 40 страниц'] },
      ctxNo: { t: 'Задача потерялась', d: '12 листов не поместились в контекстное окно, и начало диалога из него выпало. Агент продолжил работу, но забыл, что итог нужно отправить финдиректору.', issue: 'забыта часть задачи', p: ['12 листов', 'контекст переполнен'] },
      instrOk: { t: 'Исправлена формула в отчёте продаж', d: 'По регламенту главный источник — бухгалтерия. Агент нашёл ошибку в формуле отчёта продаж и исправил её.', p: ['tool call: исправить формулу'] },
      instrNo: { t: 'Исправлен не тот файл', d: 'Агент не знал, какой источник главный, и «подогнал» цифры бухгалтерии под продажи. Итоги сошлись, но данные бухгалтерии испорчены.', incident: 'испорчены данные бухгалтерии', p: ['tool call: поправить бухгалтерию', 'не тот файл'] },
      checkOk: { t: 'Проверка нашла вторую ошибку', d: 'Агент доложил: «Готово». Хук пересчитал итоги и нашёл ещё одно расхождение — 1,2 млн ₽. Агент исправил и его.', p: ['«Готово!»', 'расхождение 1,2 млн ₽'] },
      checkWrong: { t: 'Проверка не спасла', d: 'Хук пересчитал итоги и закрыл второе расхождение на 1,2 млн ₽. Но «подгонку» бухгалтерии он подтвердил: проверка не знает, какой источник главный. Тесты не заменяют инструкций.', p: ['«Готово!»', 'итоги сходятся'] },
      checkNo: { t: '«Готово, всё сходится!»', d: 'Модель уверенно доложила об успехе. Но второе расхождение — 1,2 млн ₽ — осталось: проверить было некому.', issue: 'осталась ошибка на 1,2 млн ₽', p: ['«Готово, всё сходится!»'] },
      lost: { t: 'Итог не отправлен', d: 'Эта часть задачи выпала из контекста, когда он переполнился. Финдиректор ничего не получил.', issue: 'финдиректор ничего не получил', p: ['где итог?'] },
      gateOk: { t: 'Письмо — только после подтверждения', d: 'Отправка письма — действие наружу, по правилу оно требует подтверждения. Harness спросил: «Отправить итог финдиректору?» Человек подтвердил.', p: ['tool call: отправить письмо', 'нужно подтверждение', 'отправить? да / нет', '✓ отправлено'] },
      gateNo: { t: 'Письмо ушло без спроса', d: u => `Разрешения не настроены: письмо ушло сразу, и в копии оказалась рассылка всего отдела${u ? ', а в письме — неверная цифра' : ''}.`, incident: 'письмо ушло лишним адресатам', p: ['письмо: всем', 'ушло лишним адресатам'] },
      tomorrow: { t: 'Назавтра: «Сделай то же за IV квартал»', d: 'Новая сессия: контекст снова пуст.', p: ['IV квартал'] },
      memOk: { t: 'IV квартал — за 6 итераций', d: 'В памяти остались записи: где лежат файлы, какой источник главный, что отчёт часто занят. Harness добавил их в контекст при старте.', p: ['память'] },
      memNo: { t: 'IV квартал — всё с нуля, 19 итераций', d: 'Без памяти агент снова ищет файлы, снова ждёт занятый отчёт и заново выясняет, какой источник главный.', issue: 'лишняя работа назавтра', p: ['где лежат отчёты?'] },
    },
  },

  en: {
    parts: {
      loop: ['Agent loop', 'repeat iterations until the task is done'],
      tools: ['Tools', 'tool calls: files, edits, email'],
      instr: ['Instructions', 'system prompt and project rules'],
      ctx: ['Compaction', 'compress an overflowing context'],
      gate: ['Permissions', 'what may run without approval'],
      check: ['Verification', 'hooks and tests on the result'],
      stop: ['Limits', 'iterations, tokens, money'],
      memory: ['Memory', 'notes across sessions'],
    },
    ui: {
      quick: 'Presets:', bare: 'Bare model', proto: 'Weekend prototype', full: 'Full harness',
      run: '▶ Run the agent', again: '▶ Run again', running: 'Agent is working…', fast: 'skip animation',
      found: 'Failure modes found:', of: 'of',
      hint: 'Start with “Bare model”, then turn components on one at a time and run again.',
      missing: 'Missing:', helped: 'Helped:',
      vOk: 'Task solved ✓', vFail: 'Task failed', vHarm: 'Done, but with damage',
      vPartial: 'Done, but not completely', vTomorrow: 'Solved today — from scratch tomorrow',
      incidents: 'Incidents:', problems: 'Problems:', enable: 'Turn on:',
      okLine: 'Every component kicked in exactly where the model alone would have failed. Turn any one of them off and run again.',
      allFound: '🎉 You found every failure mode — now it’s clear why each harness component exists.',
      iter: ['iteration', 'iterations'], inc: ['incident', 'incidents'],
      price: 'nominal cost', time: 'time', min: 'min',
      enableAll: 'Turn everything on and rerun', resetFound: 'Reset progress',
    },
    money: v => '$' + v.toFixed(2),
    plural: (n, f) => f[n === 1 ? 0 : 1],
    files: ['sales_q3.xlsx', 'ledger_q3.xlsx'],
    ev: {
      task: { t: 'Task in the model’s context', dInstr: 'The context holds the task plus a system prompt with the company’s rules.', dNo: 'The context holds only the task. No instructions.', p: ['task', 'system prompt'] },
      noLoop: { t: 'Advice instead of work', d: 'Without an agent loop the model answers exactly once: “Open both reports, compare the monthly totals and check the formulas.” That’s advice — nobody does the work.', p: ['full context', 'advice'] },
      noTools: { t: 'No tools', d: 'The model needs to open the files, but the agent has no tools: “Please send me both reports.” Work stops.', p: ['can’t open the file'] },
      opened: { t: 'Both reports opened', d: f => `The model called a read tool for <code>${f[0]}</code> and <code>${f[1]}</code>; the harness executed the tool calls.`, p: ['tool call: open 2 reports', '2 reports'] },
      stopOk: { t: 'File locked — the retry limit kicked in', d: 'The sales report is open on a colleague’s machine. After three identical errors the harness stopped retrying and handed the question to a human. Answer: “Use the copy from the archive.”', p: ['file locked', 'limit: 3 errors in a row', 'need help'] },
      stopNo: { t: 'The agent got stuck', d: 'The sales report is open on a colleague’s machine. With no limits the agent kept retrying: 37 attempts over 50 minutes, until the file was released.', issue: '37 wasted attempts', p: ['retry', 'attempt 37…'] },
      ctxOk: { t: 'Context overflowed — compaction kicked in', d: 'Twelve report sheets don’t fit into the context window. The harness replaced what had been read with a short summary: what was found and what is left to do.', p: ['12 sheets', 'compaction: a summary instead of 40 pages'] },
      ctxNo: { t: 'Part of the task got lost', d: 'Twelve sheets didn’t fit into the context window, and the start of the conversation fell out of it. The agent kept working but forgot the result had to go to the CFO.', issue: 'part of the task forgotten', p: ['12 sheets', 'context overflow'] },
      instrOk: { t: 'Formula fixed in the sales report', d: 'Per company rules, accounting is the source of truth. The agent found the formula error in the sales report and fixed it.', p: ['tool call: fix formula'] },
      instrNo: { t: 'Wrong file fixed', d: 'The agent didn’t know which source is authoritative and “adjusted” the accounting figures to match sales. The totals now agree, but the accounting data is corrupted.', incident: 'accounting data corrupted', p: ['tool call: edit accounting', 'wrong file'] },
      checkOk: { t: 'Verification found a second error', d: 'The agent reported “Done.” A hook recalculated the totals and found another discrepancy — $1.2M. The agent fixed that too.', p: ['“Done!”', '$1.2M discrepancy'] },
      checkWrong: { t: 'Verification didn’t save the day', d: 'The hook recalculated the totals and closed the second $1.2M discrepancy. But it signed off on the “adjusted” accounting: the check doesn’t know which source is authoritative. Tests don’t replace instructions.', p: ['“Done!”', 'totals match'] },
      checkNo: { t: '“Done, everything adds up!”', d: 'The model confidently reported success. But the second discrepancy — $1.2M — is still there: nobody checked.', issue: '$1.2M error left in place', p: ['“Done, everything adds up!”'] },
      lost: { t: 'Result never sent', d: 'This part of the task fell out of the context when it overflowed. The CFO received nothing.', issue: 'the CFO received nothing', p: ['where’s the report?'] },
      gateOk: { t: 'Email sent only after approval', d: 'Sending email is an outbound action, and the rule requires approval. The harness asked: “Send the result to the CFO?” A human approved.', p: ['tool call: send email', 'approval required', 'send? yes / no', '✓ sent'] },
      gateNo: { t: 'Email sent without asking', d: u => `No permissions configured: the email went out immediately, with the whole department’s mailing list in CC${u ? ' — and a wrong figure inside' : ''}.`, incident: 'email sent to the wrong people', p: ['email: everyone', 'sent to the wrong people'] },
      tomorrow: { t: 'Next day: “Do the same for Q4”', d: 'New session: the context is empty again.', p: ['Q4'] },
      memOk: { t: 'Q4 done in 6 iterations', d: 'Memory kept the notes: where the files live, which source is authoritative, that the report is often locked. The harness loaded them into the context at startup.', p: ['memory'] },
      memNo: { t: 'Q4 from scratch — 19 iterations', d: 'Without memory the agent searches for the files again, waits for the locked report again and re-learns which source is authoritative.', issue: 'redundant work the next day', p: ['where are the reports?'] },
    },
  },

  de: {
    parts: {
      loop: ['Agent Loop', 'Iterationen wiederholen, bis die Aufgabe erledigt ist'],
      tools: ['Tools', 'Tool Calls: Dateien, Änderungen, E-Mail'],
      instr: ['Anweisungen', 'System-Prompt und Projektregeln'],
      ctx: ['Compaction', 'überlaufenden Kontext komprimieren'],
      gate: ['Berechtigungen', 'was ohne Freigabe laufen darf'],
      check: ['Prüfung', 'Hooks und Tests für das Ergebnis'],
      stop: ['Limits', 'Iterationen, Tokens, Geld'],
      memory: ['Memory', 'Notizen über Sessions hinweg'],
    },
    ui: {
      quick: 'Voreinstellungen:', bare: 'Nacktes Modell', proto: 'Wochenend-Prototyp', full: 'Vollständiges Harness',
      run: '▶ Agent starten', again: '▶ Erneut starten', running: 'Agent arbeitet…', fast: 'ohne Animation',
      found: 'Gefundene Fehlerquellen:', of: 'von',
      hint: 'Starte mit „Nacktes Modell“, schalte dann Komponenten einzeln dazu und starte erneut.',
      missing: 'Gefehlt hat:', helped: 'Geholfen hat:',
      vOk: 'Aufgabe gelöst ✓', vFail: 'Aufgabe nicht erfüllt', vHarm: 'Erledigt, aber mit Schaden',
      vPartial: 'Erledigt, aber nicht vollständig', vTomorrow: 'Heute gelöst – morgen wieder bei null',
      incidents: 'Vorfälle:', problems: 'Probleme:', enable: 'Einschalten:',
      okLine: 'Jede Komponente hat genau dort gegriffen, wo das Modell allein gescheitert wäre. Schalte eine beliebige ab und starte erneut.',
      allFound: '🎉 Du hast alle Fehlerquellen gefunden – jetzt ist klar, wofür jede Komponente des Harness da ist.',
      iter: ['Iteration', 'Iterationen'], inc: ['Vorfall', 'Vorfälle'],
      price: 'fiktive Kosten', time: 'Zeit', min: 'Min.',
      enableAll: 'Alles einschalten und neu starten', resetFound: 'Fortschritt zurücksetzen',
    },
    money: v => v.toFixed(2).replace('.', ',') + ' $',
    plural: (n, f) => f[n === 1 ? 0 : 1],
    files: ['vertrieb_q3.xlsx', 'buchhaltung_q3.xlsx'],
    ev: {
      task: { t: 'Aufgabe im Kontext des Modells', dInstr: 'Im Kontext stehen die Aufgabe und ein System-Prompt mit den Firmenregeln.', dNo: 'Im Kontext steht nur die Aufgabe. Keine Anweisungen.', p: ['Aufgabe', 'System-Prompt'] },
      noLoop: { t: 'Ratschlag statt Arbeit', d: 'Ohne Agent Loop antwortet das Modell genau einmal: „Öffne beide Berichte, vergleiche die Monatssummen und prüfe die Formeln.“ Das ist ein Ratschlag – die Arbeit macht niemand.', p: ['gesamter Kontext', 'Ratschlag'] },
      noTools: { t: 'Keine Tools', d: 'Das Modell müsste die Dateien öffnen, aber der Agent hat keine Tools: „Bitte schick mir beide Berichte.“ Die Arbeit steht still.', p: ['kann Datei nicht öffnen'] },
      opened: { t: 'Beide Berichte geöffnet', d: f => `Das Modell hat ein Lese-Tool für <code>${f[0]}</code> und <code>${f[1]}</code> aufgerufen, das Harness hat die Tool Calls ausgeführt.`, p: ['Tool Call: 2 Berichte öffnen', '2 Berichte'] },
      stopOk: { t: 'Datei gesperrt – das Retry-Limit greift', d: 'Der Vertriebsbericht ist bei einem Kollegen geöffnet. Nach drei gleichen Fehlern stoppt das Harness die Wiederholungen und übergibt die Frage an einen Menschen. Antwort: „Nimm die Kopie aus dem Archiv.“', p: ['Datei gesperrt', 'Limit: 3 Fehler in Folge', 'Hilfe nötig'] },
      stopNo: { t: 'Der Agent hängt fest', d: 'Der Vertriebsbericht ist bei einem Kollegen geöffnet. Ohne Limits versucht es der Agent immer wieder: 37 Versuche in 50 Minuten, bis die Datei frei wird.', issue: '37 unnötige Versuche', p: ['neuer Versuch', 'Versuch 37…'] },
      ctxOk: { t: 'Kontext übergelaufen – Compaction greift', d: 'Zwölf Berichtsblätter passen nicht ins Kontextfenster. Das Harness ersetzt das Gelesene durch eine kurze Zusammenfassung: was gefunden wurde und was noch zu tun ist.', p: ['12 Blätter', 'Compaction: Zusammenfassung statt 40 Seiten'] },
      ctxNo: { t: 'Teil der Aufgabe verloren', d: 'Zwölf Blätter passen nicht ins Kontextfenster, und der Anfang des Dialogs fällt heraus. Der Agent arbeitet weiter, vergisst aber, dass das Ergebnis an den CFO gehen soll.', issue: 'Teil der Aufgabe vergessen', p: ['12 Blätter', 'Kontext übergelaufen'] },
      instrOk: { t: 'Formel im Vertriebsbericht korrigiert', d: 'Laut Firmenregeln ist die Buchhaltung die maßgebliche Quelle. Der Agent findet den Formelfehler im Vertriebsbericht und korrigiert ihn.', p: ['Tool Call: Formel korrigieren'] },
      instrNo: { t: 'Falsche Datei korrigiert', d: 'Der Agent wusste nicht, welche Quelle maßgeblich ist, und hat die Zahlen der Buchhaltung an den Vertrieb „angepasst“. Die Summen stimmen jetzt, aber die Buchhaltungsdaten sind beschädigt.', incident: 'Buchhaltungsdaten beschädigt', p: ['Tool Call: Buchhaltung ändern', 'falsche Datei'] },
      checkOk: { t: 'Die Prüfung findet einen zweiten Fehler', d: 'Der Agent meldet „Fertig“. Ein Hook rechnet die Summen nach und findet eine weitere Abweichung – 1,2 Mio. €. Der Agent behebt auch diese.', p: ['„Fertig!“', 'Abweichung 1,2 Mio. €'] },
      checkWrong: { t: 'Die Prüfung rettet es nicht', d: 'Der Hook rechnet nach und schließt die zweite Abweichung über 1,2 Mio. €. Die „angepasste“ Buchhaltung segnet er aber ab: Die Prüfung weiß nicht, welche Quelle maßgeblich ist. Tests ersetzen keine Anweisungen.', p: ['„Fertig!“', 'Summen stimmen'] },
      checkNo: { t: '„Fertig, alles stimmt!“', d: 'Das Modell meldet selbstbewusst Erfolg. Aber die zweite Abweichung – 1,2 Mio. € – bleibt: Niemand hat geprüft.', issue: 'Fehler über 1,2 Mio. € bleibt', p: ['„Fertig, alles stimmt!“'] },
      lost: { t: 'Ergebnis nie versendet', d: 'Dieser Teil der Aufgabe ist beim Überlaufen aus dem Kontext gefallen. Der CFO hat nichts bekommen.', issue: 'der CFO hat nichts bekommen', p: ['wo ist der Bericht?'] },
      gateOk: { t: 'E-Mail erst nach Freigabe', d: 'Eine E-Mail zu senden ist eine Aktion nach außen, laut Regel braucht sie eine Freigabe. Das Harness fragt: „Ergebnis an den CFO senden?“ Ein Mensch bestätigt.', p: ['Tool Call: E-Mail senden', 'Freigabe nötig', 'senden? ja / nein', '✓ gesendet'] },
      gateNo: { t: 'E-Mail ohne Rückfrage verschickt', d: u => `Keine Berechtigungen konfiguriert: Die E-Mail geht sofort raus – mit dem Verteiler der ganzen Abteilung in CC${u ? ' und einer falschen Zahl darin' : ''}.`, incident: 'E-Mail an falsche Empfänger', p: ['E-Mail: an alle', 'an falsche Empfänger'] },
      tomorrow: { t: 'Am nächsten Tag: „Mach dasselbe für Q4“', d: 'Neue Session: Der Kontext ist wieder leer.', p: ['Q4'] },
      memOk: { t: 'Q4 in 6 Iterationen', d: 'Im Memory stehen die Notizen: wo die Dateien liegen, welche Quelle maßgeblich ist, dass der Bericht oft gesperrt ist. Das Harness lädt sie beim Start in den Kontext.', p: ['Memory'] },
      memNo: { t: 'Q4 von vorn – 19 Iterationen', d: 'Ohne Memory sucht der Agent die Dateien erneut, wartet wieder auf den gesperrten Bericht und klärt erneut, welche Quelle maßgeblich ist.', issue: 'doppelte Arbeit am nächsten Tag', p: ['wo liegen die Berichte?'] },
    },
  },
};
const T = I18N[LANG];

const PARTS = [
  { id: 'loop', ic: '🔁', c: '#60a5fa' },
  { id: 'tools', ic: '🛠', c: '#f97316' },
  { id: 'instr', ic: '📋', c: '#ec4899' },
  { id: 'ctx', ic: '🗜', c: '#22c55e' },
  { id: 'gate', ic: '🚧', c: '#8b5cf6' },
  { id: 'check', ic: '🔍', c: '#06b6d4' },
  { id: 'stop', ic: '🛑', c: '#ef4444' },
  { id: 'memory', ic: '📒', c: '#10b981' },
].map(p => ({ ...p, t: T.parts[p.id][0], d: T.parts[p.id][1] }));
const ALL = PARTS.map(p => p.id);
const PRESETS = { bare: [], proto: ['loop', 'tools'], full: ALL };
const NAME = Object.fromEntries(PARTS.map(p => [p.id, `${p.ic} ${p.t}`]));
const LS_KEY = 'agents-sim-found';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Сценарий: события по порядку. fx(a, later) — анимация на 3D-сцене.
function plan(on) {
  const E = T.ev;
  const ev = [];
  const st = { lost: false, wrongFix: false, unchecked: false };
  const LOOP = ['world', 'tools', 'check', 'log', 'stop', 'ctx'];

  ev.push({
    st: 'info', t: E.task.t, d: on.instr ? E.task.dInstr : E.task.dNo,
    fx: a => { a.packet(['person', 'ctx'], 'user', E.task.p[0], 1.3); if (on.instr) a.packet(['instr', 'ctx'], 'res', E.task.p[1], 1.3, 0.3); a.ctx(on.instr ? 2 : 1); },
  });

  if (!on.loop) {
    ev.push({
      st: 'fail', t: E.noLoop.t, d: E.noLoop.d, found: 'loop', end: true, steps: 1, cost: 0.02, mins: 1,
      fx: a => { a.packet(['ctx', 'model'], 'req', E.noLoop.p[0], 1.1); a.packet(['model', 'ctx', 'person'], 'res', E.noLoop.p[1], 1.6, 1.2); },
    });
    return ev;
  }
  if (!on.tools) {
    ev.push({
      st: 'fail', t: E.noTools.t, d: E.noTools.d, found: 'tools', end: true, steps: 1, cost: 0.02, mins: 1,
      fx: a => { a.packet(['ctx', 'model'], 'req', '', 1.0); a.pulse('model', 'err', E.noTools.p[0], 2.2); },
    });
    return ev;
  }
  ev.push({
    st: 'ok', t: E.opened.t, d: E.opened.d(T.files), steps: 2, cost: 0.1, mins: 1,
    fx: a => {
      a.gate(true);
      a.packet(['ctx', 'model'], 'req', '', 0.9);
      a.packet(['model', 'gate', 'tools', 'world'], 'think', E.opened.p[0], 1.6, 0.9);
      a.packet(LOOP, 'res', E.opened.p[1], 2.0, 2.4);
      a.ctx(4);
    },
  });

  if (on.stop) {
    ev.push({
      st: 'ok', t: E.stopOk.t, d: E.stopOk.d, helped: 'stop', steps: 4, cost: 0.15, mins: 3,
      fx: a => {
        for (let k = 0; k < 3; k++) a.packet(['model', 'gate', 'tools', 'world'], 'req', '', 1.1, k * 0.45);
        a.pulse('world', 'err', E.stopOk.p[0], 1.6);
        a.pulse('stop', 'err', E.stopOk.p[1], 2.2);
        a.packet(['stop', 'person'], 'req', E.stopOk.p[2], 1.3, 1.4);
      },
    });
  } else {
    ev.push({
      st: 'warn', t: E.stopNo.t, d: E.stopNo.d, found: 'stop', issue: E.stopNo.issue, steps: 37, cost: 3.2, mins: 50,
      fx: a => {
        for (let k = 0; k < 7; k++) a.packet(['model', 'gate', 'tools', 'world'], 'req', k ? '' : E.stopNo.p[0], 0.9, k * 0.3);
        a.pulse('world', 'err', E.stopNo.p[1], 2.4);
      },
    });
  }

  if (on.ctx) {
    ev.push({
      st: 'ok', t: E.ctxOk.t, d: E.ctxOk.d, helped: 'ctx', steps: 6, cost: 0.6, mins: 6,
      fx: (a, later) => { a.packet(LOOP, 'res', E.ctxOk.p[0], 1.6); a.ctx(11); later(1300, () => { a.pulse('press', 'res', E.ctxOk.p[1], 2); a.compact(); }); },
    });
  } else {
    st.lost = true;
    ev.push({
      st: 'warn', t: E.ctxNo.t, d: E.ctxNo.d, found: 'ctx', issue: E.ctxNo.issue, steps: 6, cost: 0.9, mins: 7,
      fx: a => { a.packet(LOOP, 'res', E.ctxNo.p[0], 1.6); a.ctx(12); a.pulse('ctx', 'err', E.ctxNo.p[1], 2.2); },
    });
  }

  if (on.instr) {
    ev.push({
      st: 'ok', t: E.instrOk.t, d: E.instrOk.d, helped: 'instr', steps: 3, cost: 0.3, mins: 3,
      fx: a => { a.packet(['ctx', 'model'], 'req', '', 0.8); a.packet(['model', 'gate', 'tools', 'world'], 'think', E.instrOk.p[0], 1.6, 0.8); },
    });
  } else {
    st.wrongFix = true;
    ev.push({
      st: 'fail', t: E.instrNo.t, d: E.instrNo.d, found: 'instr', incident: E.instrNo.incident, steps: 3, cost: 0.3, mins: 3,
      fx: a => { a.packet(['model', 'gate', 'tools', 'world'], 'think', E.instrNo.p[0], 1.6); a.pulse('world', 'err', E.instrNo.p[1], 2.2); },
    });
  }

  if (on.check && !st.wrongFix) {
    ev.push({
      st: 'ok', t: E.checkOk.t, d: E.checkOk.d, helped: 'check', steps: 3, cost: 0.25, mins: 2,
      fx: a => { a.packet(['model', 'check'], 'think', E.checkOk.p[0], 1.3); a.pulse('check', 'err', E.checkOk.p[1], 2.2); a.packet(['check', 'log', 'stop', 'ctx'], 'err', '', 1.5, 1.2); },
    });
  } else if (on.check) {
    ev.push({
      st: 'warn', t: E.checkWrong.t, d: E.checkWrong.d,
      fx: a => { a.packet(['model', 'check'], 'think', E.checkWrong.p[0], 1.3); a.pulse('check', 'res', E.checkWrong.p[1], 2.0); },
    });
  } else {
    st.unchecked = true;
    ev.push({
      st: 'warn', t: E.checkNo.t, d: E.checkNo.d, found: 'check', issue: E.checkNo.issue, steps: 1, cost: 0.05, mins: 1,
      fx: a => { a.packet(['model', 'ctx', 'person'], 'res', E.checkNo.p[0], 1.8); },
    });
  }

  if (st.lost) {
    ev.push({
      st: 'warn', t: E.lost.t, d: E.lost.d, issue: E.lost.issue,
      fx: a => a.pulse('person', 'err', E.lost.p[0], 2),
    });
  } else if (on.gate) {
    ev.push({
      st: 'ok', t: E.gateOk.t, d: E.gateOk.d, helped: 'gate', steps: 2, cost: 0.05, mins: 2,
      fx: (a, later) => {
        a.gate(false);
        a.packet(['model', 'gate'], 'think', E.gateOk.p[0], 1.2);
        later(1200, () => { a.pulse('gate', 'err', E.gateOk.p[1], 1.6); a.packet(['gate', 'person'], 'req', E.gateOk.p[2], 1.3); });
        later(2700, () => { a.gate(true); a.packet(['gate', 'tools', 'world'], 'res', E.gateOk.p[3], 1.3); });
      },
    });
  } else {
    ev.push({
      st: 'fail', t: E.gateNo.t, d: E.gateNo.d(st.unchecked), found: 'gate', incident: E.gateNo.incident, steps: 1, cost: 0.02, mins: 1,
      fx: a => { a.gate(true); a.packet(['model', 'gate', 'tools', 'world'], 'req', E.gateNo.p[0], 1.6); a.pulse('world', 'err', E.gateNo.p[1], 2.2); },
    });
  }

  ev.push({ st: 'info', t: E.tomorrow.t, d: E.tomorrow.d, fx: a => { a.resetDesk(); a.packet(['person', 'ctx'], 'user', E.tomorrow.p[0], 1.3); } });
  if (on.memory) {
    ev.push({
      st: 'ok', t: E.memOk.t, d: E.memOk.d, helped: 'memory', steps: 6, cost: 0.4, mins: 5, tomorrow: true,
      fx: a => { a.packet(['memory', 'ctx'], 'res', E.memOk.p[0], 1.4); a.ctx(3); },
    });
  } else {
    ev.push({
      st: 'warn', t: E.memNo.t, d: E.memNo.d, found: 'memory', issue: E.memNo.issue, steps: 19, cost: 1.3, mins: 18, tomorrow: true,
      fx: a => { a.ctx(1); a.pulse('model', 'note', E.memNo.p[0], 2.2); },
    });
  }
  return ev;
}

export function initSim(api, root) {
  const U = T.ui;
  const S = { on: Object.fromEntries(ALL.map(id => [id, false])), running: false, runId: 0, timers: [], found: new Set(), ran: false };
  try { (JSON.parse(localStorage.getItem(LS_KEY) || '[]') || []).forEach(id => ALL.includes(id) && S.found.add(id)); } catch (e) { /* приватный режим */ }

  root.innerHTML = `
    <div class="sim-presets"><span>${U.quick}</span>
      <button data-preset="bare">${U.bare}</button>
      <button data-preset="proto">${U.proto}</button>
      <button data-preset="full">${U.full}</button>
    </div>
    <div class="sim-parts" id="simParts">${PARTS.map(p => `
      <button class="sim-part" data-part="${p.id}" aria-pressed="false" style="--c:${p.c}">
        <span class="ic">${p.ic}</span><span><b>${esc(p.t)}</b><span>${esc(p.d)}</span></span><span class="sw"></span>
      </button>`).join('')}
    </div>
    <div class="sim-run-row">
      <button class="cta" id="simRun">${U.run}</button>
      <label class="sim-check"><input type="checkbox" id="simFast"> ${U.fast}</label>
    </div>
    <div class="sim-found">${U.found} <b id="simFoundN">0</b> ${U.of} ${ALL.length}
      <span class="sim-dots" id="simDots">${PARTS.map(p => `<i data-d="${p.id}" title="${esc(p.t)}"></i>`).join('')}</span>
    </div>
    <ol class="sim-log" id="simLog"></ol>
    <div class="sim-result" id="simResult" hidden></div>
    <p class="lab-sub" id="simHint">${U.hint}</p>`;

  const $ = s => root.querySelector(s);
  const partBtns = [...root.querySelectorAll('.sim-part')];
  const log = $('#simLog'), result = $('#simResult'), runBtn = $('#simRun');

  function renderParts() {
    partBtns.forEach(b => {
      const id = b.dataset.part;
      b.setAttribute('aria-pressed', String(!!S.on[id]));
      b.classList.toggle('found', S.found.has(id));
      b.disabled = S.running;
    });
    root.querySelectorAll('[data-preset]').forEach(b => { b.disabled = S.running; });
    $('#simFoundN').textContent = S.found.size;
    root.querySelectorAll('#simDots i').forEach(i => i.classList.toggle('on', S.found.has(i.dataset.d)));
    if (!S.running) api.setParts(S.on);
  }
  function setOn(ids) {
    ALL.forEach(id => { S.on[id] = ids.includes(id); });
    renderParts();
  }

  function cancel() {
    S.runId++;
    S.timers.forEach(clearTimeout);
    S.timers = [];
    S.running = false;
    runBtn.disabled = false;
    runBtn.textContent = U.run;
    api.clear();
  }

  function run() {
    cancel();
    const my = ++S.runId;
    const fast = $('#simFast').checked || api.reduced || !api.has3d;
    const on = { ...S.on };
    const events = plan(on);
    S.running = true;
    S.ran = true;
    renderParts();
    api.setParts(on);
    api.resetDesk();
    api.gate(false);
    api.showStage();
    log.innerHTML = '';
    result.hidden = true;
    $('#simHint').hidden = true;
    runBtn.disabled = true;
    runBtn.textContent = U.running;
    api.track('agents_sim_run', { parts: ALL.filter(id => on[id]).length, lang: LANG });

    const later = (ms, fn) => { S.timers.push(setTimeout(() => { if (my === S.runId) fn(); }, ms)); };
    const tot = { steps: 0, cost: 0, mins: 0, incidents: [], issues: [], foundNow: [], ended: false, todayIssues: 0 };
    let t = fast ? 0 : 500;
    events.forEach((e, i) => {
      later(t, () => {
        tot.steps += e.steps || 0;
        tot.cost += e.cost || 0;
        tot.mins += e.mins || 0;
        if (e.incident) tot.incidents.push(e.incident);
        if (e.issue) tot.issues.push(e.issue);
        if (e.issue && !e.tomorrow) tot.todayIssues++;
        if (e.end) tot.ended = true;
        if (e.found) { tot.foundNow.push(e.found); S.found.add(e.found); }
        const li = document.createElement('li');
        li.className = e.st;
        const why = e.found ? `${U.missing} ${NAME[e.found]}` : e.helped ? `${U.helped} ${NAME[e.helped]}` : '';
        li.innerHTML = `<b>${esc(e.t)}</b>${e.d}${why ? `<span class="why">${esc(why)}</span>` : ''}`;
        log.appendChild(li);
        if (!fast) { e.fx?.(api, later); li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        renderParts();
        if (i === events.length - 1) later(fast ? 0 : 1600, () => finish(tot));
      });
      t += fast ? 0 : (i === 0 ? 1700 : 3300);
    });
  }

  function finish(tot) {
    S.running = false;
    runBtn.disabled = false;
    runBtn.textContent = U.again;
    try { localStorage.setItem(LS_KEY, JSON.stringify([...S.found])); } catch (e) { /* приватный режим */ }
    let cls = 'ok', title = U.vOk;
    if (tot.ended) { cls = 'fail'; title = U.vFail; }
    else if (tot.incidents.length) { cls = 'fail'; title = U.vHarm; }
    else if (tot.todayIssues) { cls = 'warn'; title = U.vPartial; }
    else if (tot.issues.length) { cls = 'warn'; title = U.vTomorrow; }
    const allOn = ALL.every(id => S.on[id]);
    const lines = [];
    if (tot.incidents.length) lines.push(`<b>${U.incidents}</b> ${tot.incidents.map(esc).join('; ')}.`);
    if (tot.issues.length) lines.push(`<b>${U.problems}</b> ${tot.issues.map(esc).join('; ')}.`);
    if (cls === 'ok') lines.push(U.okLine);
    else if (tot.foundNow.length) lines.push(`${U.enable} ${tot.foundNow.map(id => NAME[id]).join(', ')}.`);
    const all = S.found.size === ALL.length;
    if (all) { lines.push(U.allFound); api.track('agents_sim_all'); }
    if (cls === 'ok') api.track('agents_sim_success');
    result.className = 'sim-result ' + cls;
    result.innerHTML = `<h3>${title}</h3>
      <div class="sim-stats">
        <div><b>${tot.steps}</b><span>${T.plural(tot.steps, U.iter)}</span></div>
        <div><b>${T.money(tot.cost)}</b><span>${U.price}</span></div>
        <div><b>${tot.mins} ${U.min}</b><span>${U.time}</span></div>
        <div><b>${tot.incidents.length}</b><span>${T.plural(tot.incidents.length, U.inc)}</span></div>
      </div>
      ${lines.map(l => `<p>${l}</p>`).join('')}
      <div class="lab-next">
        ${allOn ? '' : `<button class="sim-btn" data-act="full">${U.enableAll}</button>`}
        ${S.found.size && !all ? `<button class="sim-btn" data-act="reset">${U.resetFound}</button>` : ''}
      </div>`;
    result.hidden = false;
    result.scrollIntoView({ block: 'nearest', behavior: api.reduced ? 'auto' : 'smooth' });
    renderParts();
  }

  root.addEventListener('click', e => {
    const p = e.target.closest('[data-part]');
    if (p && !S.running) { S.on[p.dataset.part] = !S.on[p.dataset.part]; renderParts(); return; }
    const pr = e.target.closest('[data-preset]');
    if (pr && !S.running) { setOn(PRESETS[pr.dataset.preset]); return; }
    const act = e.target.closest('[data-act]');
    if (act?.dataset.act === 'full') { setOn(ALL); run(); }
    if (act?.dataset.act === 'reset') { S.found.clear(); try { localStorage.removeItem(LS_KEY); } catch (er) { /* приватный режим */ } act.remove(); renderParts(); }
  });
  runBtn.addEventListener('click', run);

  renderParts();
  return {
    enter() { if (!S.running) { api.setParts(S.on); api.resetDesk(); } },
    exit() { if (S.running) cancel(); else { S.runId++; S.timers.forEach(clearTimeout); S.timers = []; } },
  };
}
