// Лаборатория: MCP-клиент прямо в браузере — два режима (задания и свободная работа) и «рентген» сервера.
// Загружается лениво, при первом входе в режим «Лаборатория». Сцену рисует app.js через api.
import * as demo from './lab-server.js?v=1';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const M = 'io.modelcontextprotocol/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stripComments = src => src.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*/g, (m, str) => str || '');
const LS_KEY = 'mcp3d-lab';

// Открытые MCP-серверы для теста: без авторизации, с CORS и подключением за 1–3 с (проверено 30.09.2026)
const LIBRARY = [
  { name: 'Context7', url: 'https://mcp.context7.com/mcp', desc: 'документация библиотек', era: 'new' },
  { name: 'Hugging Face', url: 'https://huggingface.co/mcp', desc: 'модели, датасеты, Spaces', era: 'new' },
  { name: 'Svelte', url: 'https://mcp.svelte.dev/mcp', desc: 'документация Svelte', era: 'new' },
  { name: 'Microsoft Learn', url: 'https://learn.microsoft.com/api/mcp', desc: 'документация Microsoft', era: 'old' },
  { name: 'DeepWiki', url: 'https://mcp.deepwiki.com/mcp', desc: 'вопросы по репозиториям GitHub', era: 'old' },
  { name: 'Exa', url: 'https://mcp.exa.ai/mcp', desc: 'поиск по вебу', era: 'old' },
  { name: 'Jina AI', url: 'https://mcp.jina.ai/v1', desc: 'чтение веб-страниц и поиск', era: 'old' },
];

// Выделение места правки в редакторе: значение строки по ключу, целый блок-объект, позиция после текста
function valueRange(t, key) {
  const k = `"${key}": "`;
  const i = t.indexOf(k);
  if (i < 0) return null;
  const a = i + k.length;
  return [a, t.indexOf('"', a)];
}
function blockRange(t, key) {
  const k = `"${key}": {`;
  const i = t.indexOf(k);
  if (i < 0) return null;
  let depth = 0, j = i + k.length - 1;
  for (; j < t.length; j++) { if (t[j] === '{') depth++; else if (t[j] === '}' && --depth === 0) break; }
  const c = t.lastIndexOf(',', i);
  const a = c >= 0 && !t.slice(c + 1, i).trim() ? c : i; // вместе с запятой перед блоком, чтобы JSON остался валидным
  return [a, j + 1];
}
function afterRange(t, k) {
  const i = t.indexOf(k);
  return i < 0 ? null : [i + k.length, i + k.length];
}

// Задания: по порядку, от основ к поломкам протокола и продвинутым сценариям.
// start — стартовый запрос, sel — что выделить в редакторе, ok — как понять, что задание выполнено.
const DEMO_TASKS = [
  { id: 'discover', g: 'Основы', t: 'Спросите сервер, что он умеет',
    d: 'Запрос <code>server/discover</code> уже в редакторе. Нажмите «Отправить» и найдите в ответе <code>capabilities</code>.',
    lesson: 'Рукопожатия больше нет: клиент в любой момент может спросить сервер о версиях и возможностях.',
    start: T => T.method('server/discover'),
    ok: (q, f) => q.method === 'server/discover' && !!f?.result },
  { id: 'list', g: 'Основы', t: 'Получите список инструментов',
    d: 'Название метода выделено в редакторе. Напечатайте вместо него <code>tools/list</code> и отправьте.',
    hint: 'Метод — строка в поле <code>"method"</code>. Кавычки вокруг оставьте.',
    lesson: 'Стойка на схеме — это ответ tools/list: цвет полки показывает аннотации инструмента.',
    start: T => T.method('server/discover'), sel: t => valueRange(t, 'method'),
    ok: (q, f) => q.method === 'tools/list' && !!f?.result?.tools },
  { id: 'call', g: 'Основы', t: 'Вызовите инструмент',
    d: 'В редакторе вызов <code>get_customer_debt</code> для ИНН 7700000001. Отправьте и посмотрите, куда на схеме полетит пакет.',
    lesson: 'В ответе и текст для модели (content), и структура по outputSchema (structuredContent).',
    start: T => T.call('get_customer_debt'),
    ok: (q, f) => q.method === 'tools/call' && f?.result?.resultType === 'complete' && f.result.isError === false },
  { id: 'toolerr', g: 'Сломай протокол', t: 'Ошибка выполнения, а не протокола',
    d: 'ИНН выделен. Напечатайте вместо него <code>12345</code> и отправьте.',
    hint: 'Протокол при этом не нарушен: запрос корректный, инструмент сам проверит аргумент.',
    lesson: 'isError: true — ошибка выполнения. Модель видит текст и может исправить аргументы.',
    start: T => T.call('get_customer_debt'), sel: t => valueRange(t, 'inn'),
    ok: (q, f) => f?.result?.isError === true },
  { id: 'meta', g: 'Сломай протокол', t: 'Уберите _meta',
    d: 'Блок <code>_meta</code> выделен. Удалите его клавишей Backspace и отправьте.',
    lesson: 'Без версии и capabilities сервер отвечает −32602: в 2026-07-28 их несёт каждый запрос.',
    start: T => T.method('tools/list'), sel: t => blockRange(t, '_meta'),
    ok: (q, f) => f?.error?.code === -32602 && /_meta/.test(f.error.message) },
  { id: 'version', g: 'Сломай протокол', t: 'Старая версия протокола',
    d: 'Версия протокола выделена. Напечатайте <code>2025-06-18</code> и отправьте.',
    lesson: 'Сервер отвечает −32022 и перечисляет свои версии — клиент повторяет запрос с подходящей.',
    start: T => T.method('tools/list'), sel: t => valueRange(t, M + 'protocolVersion'),
    ok: (q, f) => f?.error?.code === -32022 },
  { id: 'method', g: 'Сломай протокол', t: 'Метод, которого нет',
    d: 'Метод выделен. Напечатайте <code>tools/delete</code> и отправьте.',
    lesson: 'Неизвестный метод — ошибка −32601 Method not found.',
    start: T => T.method('tools/list'), sel: t => valueRange(t, 'method'),
    ok: (q, f) => f?.error?.code === -32601 },
  { id: 'cap', g: 'Сломай протокол', t: 'Без нужной возможности клиента',
    d: 'Миграции нужно подтверждение человека. Возможность <code>elicitation</code> выделена — удалите её и отправьте.',
    lesson: 'Сервер отвечает −32021: запросу нужна возможность клиента, которую тот не заявил.',
    start: T => T.call('apply_migration'), sel: t => blockRange(t, 'elicitation'),
    ok: (q, f) => f?.error?.code === -32021 },
  { id: 'mrtr', g: 'Продвинутое', t: 'Подтверждение человеком (MRTR)',
    d: 'Отправьте запрос — сервер не выполнит миграцию сразу, а пришлёт форму. Отметьте «Да, применить», нажмите «Принять» и отправьте собранный повтор.',
    lesson: 'Сервер не шлёт клиенту запросов: он отвечает input_required, а клиент повторяет исходный запрос с ответами.',
    start: T => T.call('apply_migration'),
    ok: (q, f) => q.params?.name === 'apply_migration' && !!q.params?.inputResponses && f?.result?.resultType === 'complete' && f.result.isError === false },
  { id: 'forge', g: 'Продвинутое', t: 'Подделайте requestState',
    d: 'Отправьте запрос и нажмите «Принять» в форме. В собранном повторе часть <code>requestState</code> будет выделена — напечатайте что угодно и отправьте.',
    lesson: 'Сервер подписывает requestState (HMAC) и привязывает к аргументам — подделку он отклоняет.',
    start: T => T.call('apply_migration'),
    ok: (q, f) => !!q.params?.requestState && f?.error?.code === -32602 && /requestState/.test(f.error.message) },
  { id: 'progress', g: 'Продвинутое', t: 'Прогресс долгой операции',
    d: 'Курсор стоит внутри <code>_meta</code>. Допишите строку <code>"progressToken": "p1",</code> и отправьте.',
    hint: 'Запятая в конце нужна — после строки идут другие поля.',
    lesson: 'Уведомления о прогрессе приходят потоком ответа на этот же запрос.',
    start: T => T.call('export_orders'), sel: t => afterRange(t, '"_meta": {'),
    ok: (q, f, all) => all.some(m => m.method === 'notifications/progress') },
  { id: 'chain', g: 'Продвинутое', t: 'Цепочка против одного вызова',
    d: 'Посчитайте долг «Ромашки» цепочкой из трёх вызовов, а потом одним. Заготовки — кнопками ниже, id в них уже подставлены: сверьте их с ответами.',
    chain: ['find_customer', 'list_contracts', 'calc_debt', 'get_customer_debt'],
    lesson: 'Один инструмент уровня задачи — меньше вызовов модели и меньше ошибок при переносе данных (глава 14).',
    start: T => T.call('find_customer'),
    ok: (q, f, all, S) => S.calls.has('calc_debt') && S.calls.has('get_customer_debt') },
];

export function initLab(api) {
  const root = $('#lab');
  const editor = $('#labEditor', root);
  const S = {
    src: 'demo', url: '', auth: '', era: 'modern', legacy: null, session: null,
    cat: null, shelves: {}, id: 1, busy: false, calls: new Set(), done: {},
    lmode: 'tasks', task: 0, loaded: '', dirty: false, undo: null, undoTimer: 0,
    gtasks: [], consented: new Set(), verdicts: {},
  };
  // учебный сервер — готовые задания; любой другой — задания, собранные по его каталогу
  const tasks = () => (S.src === 'demo' ? DEMO_TASKS : S.gtasks);
  S.done = loadDone();
  S.task = loadTask();

  /* ── запросы и шаблоны ── */
  const nextId = () => S.id++;
  const meta = () => ({
    [M + 'protocolVersion']: demo.PROTOCOL,
    [M + 'clientCapabilities']: { elicitation: { form: {} } },
    [M + 'clientInfo']: { name: 'mcp3d-lab', version: '0.1.0' },
  });
  function req(method, params = {}) {
    const p = S.era === 'modern' ? { ...params, _meta: meta() } : params;
    return { jsonrpc: '2.0', id: nextId(), method, params: p };
  }
  function argsFor(tool) {
    if (S.src === 'demo' && demo.EXAMPLES[tool.name]) return structuredClone(demo.EXAMPLES[tool.name]);
    const out = {};
    const props = tool.inputSchema?.properties || {};
    for (const k of tool.inputSchema?.required || Object.keys(props).slice(0, 2)) {
      const p = props[k] || {};
      out[k] = p.enum ? p.enum[0] : p.type === 'integer' || p.type === 'number' ? (p.minimum ?? 1) : p.type === 'boolean' ? false : p.type === 'array' ? [] : '';
    }
    return out;
  }
  const T = {
    method: m => req(m),
    call: name => {
      const t = S.cat?.tools.find(x => x.name === name) || { name };
      return req('tools/call', { name, arguments: argsFor(t) });
    },
  };
  const pretty = v => JSON.stringify(v, null, 2);
  // подставляет запрос в редактор; если пользователь уже правил текст — предлагает «Вернуть прежний»
  function setEditor(v, { sel = null, undo = true } = {}) {
    const text = typeof v === 'string' ? v : pretty(v);
    if (undo && S.dirty && editor.value.trim() && editor.value !== text) showUndo(editor.value);
    editor.value = text;
    S.loaded = text;
    S.dirty = false;
    checkParse();
    const r = sel?.(text);
    if (r) {
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(r[0], r[1]);
      const lh = parseFloat(getComputedStyle(editor).lineHeight) || 19;
      editor.scrollTop = Math.max(0, (text.slice(0, r[0]).split('\n').length - 4) * lh);
    }
  }
  function showUndo(prev) {
    S.undo = prev;
    const box = $('#labUndo', root);
    box.hidden = false;
    clearTimeout(S.undoTimer);
    S.undoTimer = setTimeout(() => { box.hidden = true; }, 9000);
  }

  function parse(text) {
    try { return { ok: true, value: JSON.parse(stripComments(text)) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  function checkParse() {
    const p = parse(editor.value);
    const box = $('#labParse', root);
    box.hidden = p.ok;
    if (!p.ok) box.textContent = `Не JSON: ${p.error}`;
    return p;
  }

  // палитра «Что отправить» в свободном режиме
  function renderPicker() {
    const c = S.cat;
    const b = (key, label, cls = '') => `<button class="lab-pk ${cls}" data-make="${esc(key)}">${esc(label)}</button>`;
    const groups = [
      ['О сервере', [S.era === 'modern' && b('m:server/discover', 'server/discover'), c?.caps?.tools && b('m:tools/list', 'tools/list'),
        c?.caps?.resources && b('m:resources/list', 'resources/list'), c?.caps?.prompts && b('m:prompts/list', 'prompts/list')]],
      ['Вызвать инструмент', (c?.tools || []).map(t => b(`t:${t.name}`, t.name, `k-${toolKind(t)[0]}`))],
      ['Прочитать ресурс', (c?.resources || []).map(r => b(`r:${r.uri}`, r.name || r.uri, 'k-resource'))],
      ['Получить промпт', (c?.prompts || []).map(p => b(`p:${p.name}`, p.name, 'k-prompt'))],
      ['Ещё', [S.src === 'demo' && b('x:completion', 'completion/complete'), S.src === 'demo' && b('x:listen', 'subscriptions/listen'),
        b('x:cancel', 'notifications/cancelled')]],
    ];
    $('#labPick', root).innerHTML = groups.map(([h, items]) => {
      const it = items.filter(Boolean);
      return it.length ? `<div class="lab-pk-g"><div class="lab-pk-h">${h}</div><div class="lab-pk-row">${it.join('')}</div></div>` : '';
    }).join('');
  }
  function make(v) {
    const [kind, ...rest] = v.split(':');
    const key = rest.join(':');
    if (kind === 'm') return req(key);
    if (kind === 't') return T.call(key);
    if (kind === 'r') return req('resources/read', { uri: key });
    if (kind === 'p') {
      const p = S.cat.prompts.find(x => x.name === key);
      const a = {};
      for (const x of p?.arguments || []) if (x.required) a[x.name] = x.name === 'inn' ? '7700000001' : x.name === 'region' ? 'Поволжье' : '';
      return req('prompts/get', { name: key, arguments: a });
    }
    if (key === 'completion') return req('completion/complete', { ref: { type: 'ref/prompt', name: 'sales_report' }, argument: { name: 'region', value: 'Пов' } });
    if (key === 'listen') return req('subscriptions/listen', { notifications: { toolsListChanged: true, resourceSubscriptions: ['file:///project/config.json'] } });
    if (key === 'cancel') return { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: S.id - 1, reason: 'Отменено пользователем' } };
    return null;
  }

  /* ── транспорт ── */
  async function transport(msg, { timeout = 20000 } = {}) {
    const t0 = performance.now();
    if (S.src === 'demo') {
      await sleep(40 + Math.random() * 80);
      const messages = await demo.handle(msg);
      return { http: messages.length ? 200 : 202, messages, ms: Math.round(performance.now() - t0), where: 'в браузере' };
    }
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    const pv = msg?.params?._meta?.[M + 'protocolVersion'] || S.legacy?.version;
    if (pv) headers['MCP-Protocol-Version'] = pv;
    if (S.era === 'modern' && msg && typeof msg.method === 'string') {
      headers['Mcp-Method'] = msg.method;
      const name = ['tools/call', 'prompts/get'].includes(msg.method) ? msg.params?.name : msg.method === 'resources/read' ? msg.params?.uri : null;
      if (name) headers['Mcp-Name'] = /^[\x20-\x7e]*$/.test(name) ? name : `=?base64?${btoa(unescape(encodeURIComponent(name)))}?=`;
    }
    if (S.session) headers['Mcp-Session-Id'] = S.session;
    if (S.auth) headers.Authorization = S.auth;
    let res;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      res = await fetch(S.url, { method: 'POST', headers, body: JSON.stringify(msg), signal: ctl.signal });
    } catch (e) {
      clearTimeout(timer);
      return { netError: true, timedOut: ctl.signal.aborted, ms: Math.round(performance.now() - t0) };
    }
    const sid = res.headers.get('Mcp-Session-Id');
    if (sid) S.session = sid;
    const ct = res.headers.get('Content-Type') || '';
    let text = '';
    try { text = res.status === 202 ? '' : await res.text(); } catch (e) { clearTimeout(timer); return { netError: true, timedOut: ctl.signal.aborted, ms: Math.round(performance.now() - t0) }; }
    clearTimeout(timer);
    let messages = [];
    if (ct.includes('text/event-stream')) messages = parseSSE(text);
    else if (text) { try { const j = JSON.parse(text); messages = Array.isArray(j) ? j : [j]; } catch (e) { /* не JSON */ } }
    return { http: res.status, messages, ms: Math.round(performance.now() - t0), where: `HTTP ${res.status}`, wwwAuth: res.headers.get('WWW-Authenticate'), raw: messages.length ? '' : text.slice(0, 400) };
  }
  function parseSSE(text) {
    const out = [];
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (data) { try { out.push(JSON.parse(data)); } catch (e) { /* пропускаем */ } }
    }
    return out;
  }

  /* ── обмен сообщениями с анимацией ── */
  const shortM = m => String(m || '').replace(/^notifications\//, '');
  function targetOf(msg) {
    const p = msg?.params || {};
    if (msg?.method === 'tools/call') return S.shelves[`tool:${p.name}`];
    if (msg?.method === 'resources/read') return S.shelves[`res:${p.uri}`];
    if (msg?.method === 'prompts/get') return S.shelves[`prompt:${p.name}`];
    return null;
  }
  function kindOf(f) {
    if (!f) return 'note';
    if (f.error) return 'err';
    if (f.result?.resultType === 'input_required') return 'task';
    return f.result?.isError ? 'err' : 'res';
  }
  function labelOf(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return 'batch';
    const n = msg.params?.name;
    return msg.method ? (n ? `${msg.method} · ${n}` : msg.method) : '???';
  }

  async function exchange(msg, { speed = 1, quiet = false, silent = false, timeout } = {}) {
    const k = silent || $('#labFast', root).checked ? 0 : speed;
    const isNote = msg && typeof msg === 'object' && !Array.isArray(msg) && !('id' in msg);
    const pending = transport(msg, timeout ? { timeout } : undefined);
    if (k) { api.packet(['lab_c', 'lab_srv'], isNote ? 'note' : 'req', labelOf(msg), 1.0 * k); await sleep(1000 * k); }
    const r = await pending;
    const ex = { msg, ...r };
    ex.final = (r.messages || []).find(m => m && 'id' in m && (m.result || m.error)) || null;
    ex.notes = (r.messages || []).filter(m => m && !('id' in m));
    if (k) {
      if (r.netError) api.pulse('lab_srv', 'err', 'нет ответа', 1.6);
      else {
        const target = targetOf(msg);
        if (target && ex.final?.result) {
          api.packet(['lab_srv', target], 'req', '', 0.5 * k);
          await sleep(520 * k);
          api.pulse(target, ex.final.result.isError ? 'err' : ex.final.result.resultType === 'input_required' ? 'task' : 'res', '', 0.9);
          api.packet([target, 'lab_srv'], kindOf(ex.final), '', 0.5 * k);
          await sleep(520 * k);
        }
        ex.notes.forEach((n, i) => api.packet(['lab_srv', 'lab_c'], 'note', i === 0 ? shortM(n.method) : '', 0.8 * k, i * 0.3));
        if (ex.notes.length) await sleep((0.8 + ex.notes.length * 0.3) * 1000 * k);
        if (ex.final) {
          const f = ex.final;
          const lbl = f.error ? `error ${f.error.code}` : f.result?.resultType === 'input_required' ? 'input_required' : f.result?.isError ? 'isError' : 'result';
          api.packet(['lab_srv', 'lab_c'], kindOf(f), lbl, 1.0 * k);
          await sleep(1000 * k);
        } else if (isNote || r.http === 202) api.pulse('lab_srv', 'note', '202 Accepted', 1.2);
      }
    }
    if (!quiet) { render(ex); check(ex); }
    return ex;
  }

  /* ── ответ и пояснения ── */
  function explain(ex) {
    const f = ex.final;
    const origin = esc(location.origin);
    if (ex.netError && ex.timedOut) return { cls: 'err', html: '<b>Сервер не ответил вовремя.</b> Запрос отменён по таймауту — сервер перегружен или ждёт чего-то, чего лаборатория не отправляет.' };
    if (ex.netError) return { cls: 'err', html: `<b>Браузер не получил ответ.</b> Чаще всего сервер не разрешает запросы с этой страницы (CORS) или недоступен. Для своего сервера разрешите origin <code>${origin}</code>, заголовки <code>content-type, mcp-protocol-version, mcp-method, mcp-name, authorization</code> и откройте <code>mcp-session-id</code> в Expose-Headers.` };
    if (ex.http === 401 || ex.http === 403) return { cls: 'err', html: `<b>HTTP ${ex.http}: нужна авторизация.</b> ${ex.wwwAuth ? `Сервер прислал <code>WWW-Authenticate: ${esc(ex.wwwAuth)}</code>. ` : ''}Вход по OAuth в лаборатории пока не реализован (глава 10). Если у сервера статический токен, укажите его в поле Authorization.` };
    if (!f) {
      if (ex.http === 202 || ex.msg && !('id' in ex.msg)) return { cls: 'note', html: '<b>202 Accepted.</b> Это уведомление: у него нет <code>id</code>, поэтому сервер ничего не отвечает (глава 3).' };
      return { cls: 'err', html: `<b>Ответ не похож на JSON-RPC</b> (HTTP ${esc(ex.http)}).${ex.raw ? ` Тело: <code>${esc(ex.raw)}</code>` : ''}` };
    }
    if (f.error) {
      const { code, message, data } = f.error;
      if (code === -32602 && /_meta/.test(message)) return { cls: 'err', fix: ['Добавить _meta', fixMeta], html: '<b>Нет обязательных метаданных.</b> С версии 2026-07-28 рукопожатия нет: каждый запрос сам несёт версию протокола и возможности клиента в <code>_meta</code> (глава 4).' };
      if (code === -32022) return { cls: 'err', fix: [`Взять версию ${data?.supported?.[0] || ''}`, () => fixVersion(data?.supported?.[0])], html: `<b>Сервер не знает версию <code>${esc(data?.requested)}</code>.</b> Клиент должен повторить запрос с версией из <code>data.supported</code> — так клиенты разных «эпох» договариваются без рукопожатия (глава 4).` };
      if (code === -32601) return { cls: 'err', html: '<b>Такого метода нет.</b> Сервер отвечает <code>-32601</code>. Полный список методов 2026-07-28 — в главе 3.' };
      if (code === -32021) return { cls: 'err', fix: ['Заявить elicitation', fixElicit], html: '<b>Не хватает возможности клиента.</b> Инструменту нужно спросить человека, а запрос не заявил <code>elicitation</code> в <code>clientCapabilities</code> (глава 7).' };
      if (code === -32602 && /requestState/.test(message)) return { cls: 'ok', html: '<b>Подделка распознана.</b> <code>requestState</code> подписан сервером (HMAC) и привязан к аргументам и сроку. Изменённое или чужое состояние отклоняется — так спецификация требует защищать MRTR (глава 7).' };
      if (code === -32602 && /Unknown tool/.test(message)) return { cls: 'err', html: '<b>Инструмента с таким именем нет.</b> Это протокольная ошибка: модель её обычно не видит (глава 8).' };
      if (code === -32602 && /cursor/i.test(message)) return { cls: 'err', html: '<b>Неверный курсор.</b> Курсор непрозрачен: его можно только вернуть из <code>nextCursor</code>. У учебного сервера нет страниц (глава 9).' };
      if (code === -32602 && /Resource not found/.test(message)) return { cls: 'err', html: '<b>Ресурс не найден.</b> С 2026-07-28 это <code>-32602</code>, раньше был <code>-32002</code> (глава 3).' };
      if (code === -32600) return { cls: 'err', html: `<b>Некорректный JSON-RPC.</b> ${esc(message)}. Нужны <code>"jsonrpc": "2.0"</code>, <code>method</code> и <code>id</code> (строка или целое).` };
      return { cls: 'err', html: `<b>Ошибка ${esc(code)}.</b> ${esc(message)}` };
    }
    const r = f.result || {};
    if (r.resultType === 'input_required') return { cls: 'task', html: '<b>Серверу нужен человек.</b> Операция не выполнена: сервер вернул вопросы (<code>inputRequests</code>) и подписанное состояние (<code>requestState</code>). Ответьте в форме — клиент соберёт повтор исходного запроса (глава 7).' };
    if (r.isError) return { cls: 'err', html: '<b>Ошибка выполнения, а не протокола.</b> Запрос корректный, но инструмент не справился. Модель увидит этот текст и сможет исправить аргументы (глава 8).' };
    const m = ex.msg?.method;
    if (m === 'server/discover') return { cls: 'ok', html: '<b>Сервер рассказал о себе:</b> версии, возможности, инструкции для модели и сколько можно кэшировать ответ (глава 4).' };
    if (m === 'tools/list') return { cls: 'ok', html: `<b>${(r.tools || []).length} инструментов.</b> Стойка на схеме — это они: зелёные только читают, оранжевые меняют данные, красные — разрушающие. Без аннотаций инструмент по умолчанию считается разрушающим (глава 6).` };
    if (ex.notes.length) return { cls: 'ok', html: `<b>${ex.notes.length} уведомления о прогрессе, затем ответ.</b> Всё пришло по потоку ответа этого же запроса (глава 9).` };
    if (m === 'tools/call') return { cls: 'ok', html: `<b>Готово.</b> ${r.structuredContent !== undefined ? 'В ответе и текст для модели (<code>content</code>), и структура (<code>structuredContent</code>).' : 'Инструмент вернул только текст — без <code>outputSchema</code> структуры нет.'}` };
    return { cls: 'ok', html: '<b>Готово:</b> <code>resultType: "complete"</code>.' };
  }

  function render(ex) {
    const card = $('#labResult', root);
    card.hidden = false;
    $('#labMeta', root).textContent = ex.netError ? 'нет ответа' : `${ex.where} · ${ex.ms} мс`;
    const e = explain(ex);
    const box = $('#labExplain', root);
    box.className = `lab-explain ${e.cls}`;
    box.innerHTML = e.html;
    if (e.fix) {
      const b = document.createElement('button');
      b.className = 'lab-btn small';
      b.textContent = e.fix[0];
      b.addEventListener('click', () => { e.fix[1](); editor.focus(); });
      box.append(' ', b);
    }
    const notes = $('#labNotes', root);
    notes.hidden = !ex.notes?.length;
    if (ex.notes?.length) {
      $('summary', notes).textContent = `Поток ответа: ${ex.notes.length} уведомл. до финального сообщения`;
      $('code', notes).innerHTML = ex.notes.map(n => api.highlightJSON(JSON.stringify(n))).join('\n');
    }
    const shown = ex.final || (ex.messages?.[0]) || null;
    $('#labOut', root).innerHTML = shown ? api.highlightJSON(pretty(shown)) : '<span class="j-c">// тела ответа нет</span>';
    renderForm(ex);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderForm(ex) {
    const box = $('#labForm', root);
    box.innerHTML = '';
    const r = ex.final?.result;
    if (r?.resultType !== 'input_required') return;
    for (const [key, ir] of Object.entries(r.inputRequests || {})) {
      if (ir.method !== 'elicitation/create') {
        box.insertAdjacentHTML('beforeend', `<div class="lab-hint">Запрос <code>${esc(ir.method)}</code> в лаборатории пока не поддержан.</div>`);
        continue;
      }
      const p = ir.params || {};
      const form = document.createElement('form');
      form.className = 'lab-form';
      form.innerHTML = `<div class="lab-form-h">Форма от сервера <span>elicitation · ${esc(p.mode || 'form')}</span></div><p>${esc(p.message)}</p>`;
      if (p.mode === 'url') {
        form.insertAdjacentHTML('beforeend', `<p>Сервер просит открыть страницу: <code>${esc(p.url)}</code></p>`);
      } else {
        for (const [name, s] of Object.entries(p.requestedSchema?.properties || {})) {
          const id = `labf_${key}_${name}`;
          let field;
          if (s.type === 'boolean') field = `<label class="lab-check"><input type="checkbox" id="${id}" name="${esc(name)}" ${s.default ? 'checked' : ''}> ${esc(s.title || name)}</label>`;
          else if (s.enum) field = `<label for="${id}">${esc(s.title || name)}</label><select id="${id}" name="${esc(name)}">${s.enum.map(v => `<option ${v === s.default ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
          else field = `<label for="${id}">${esc(s.title || name)}</label><input id="${id}" name="${esc(name)}" type="${s.type === 'number' || s.type === 'integer' ? 'number' : 'text'}" value="${esc(s.default ?? '')}">`;
          form.insertAdjacentHTML('beforeend', `<div class="lab-field">${field}</div>`);
        }
      }
      form.insertAdjacentHTML('beforeend', `<div class="lab-actions">
        <button class="lab-btn primary" data-a="accept" type="submit">Принять</button>
        <button class="lab-btn" data-a="decline" type="button">Отклонить</button>
        <button class="lab-btn" data-a="cancel" type="button">Отмена</button></div>`);
      const respond = action => {
        const schema = p.requestedSchema?.properties || {};
        const content = {};
        for (const [name, s] of Object.entries(schema)) {
          const el = form.elements[name];
          if (!el) continue;
          content[name] = s.type === 'boolean' ? el.checked : s.type === 'number' || s.type === 'integer' ? Number(el.value) : el.value;
        }
        const retry = structuredClone(ex.msg);
        retry.id = nextId();
        retry.params = retry.params || {};
        retry.params.inputResponses = { ...(retry.params.inputResponses || {}), [key]: action === 'accept' ? { action, content } : { action } };
        if (r.requestState !== undefined) retry.params.requestState = r.requestState;
        else delete retry.params.requestState;
        const forging = S.lmode === 'tasks' && tasks()[S.task]?.id === 'forge';
        setEditor(retry, { undo: false, sel: forging ? t => { const r = valueRange(t, 'requestState'); return r && [r[0] + 10, r[0] + 16]; } : null });
        box.innerHTML = '<div class="lab-hint ok">Повтор собран в редакторе: тот же запрос, новый <code>id</code>, ответы в <code>inputResponses</code> и неизменённый <code>requestState</code>. Нажмите «Отправить». А можно сначала изменить в <code>requestState</code> один символ — и посмотреть, что скажет сервер.</div>';
        $('#labSend', root).classList.add('pulse');
        editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      form.addEventListener('submit', ev => { ev.preventDefault(); respond('accept'); });
      $$('button[data-a="decline"], button[data-a="cancel"]', form).forEach(b => b.addEventListener('click', () => respond(b.dataset.a)));
      box.append(form);
    }
  }

  /* ── быстрые исправления ── */
  function editJSON(fn) {
    const p = parse(editor.value);
    if (!p.ok) return;
    fn(p.value);
    setEditor(p.value);
  }
  const fixMeta = () => editJSON(v => { v.params = { ...(v.params || {}), _meta: meta() }; });
  const fixVersion = ver => editJSON(v => { v.params = v.params || {}; v.params._meta = { ...(v.params._meta || meta()), [M + 'protocolVersion']: ver || demo.PROTOCOL }; v.id = nextId(); });
  const fixElicit = () => editJSON(v => { v.params = v.params || {}; v.params._meta = v.params._meta || meta(); v.params._meta[M + 'clientCapabilities'] = { ...(v.params._meta[M + 'clientCapabilities'] || {}), elicitation: { form: {} } }; v.id = nextId(); });

  /* ── задания ── */
  const storeKey = () => LS_KEY + (S.src === 'demo' ? '' : '@' + S.url);
  function loadDone() { try { return JSON.parse(localStorage.getItem(storeKey()) || '{}'); } catch (e) { return {}; } }
  function loadTask() { try { return Math.min(Math.max(0, tasks().length - 1), Math.max(0, +localStorage.getItem(storeKey() + '-task') || 0)); } catch (e) { return 0; } }
  function saveDone() { try { localStorage.setItem(storeKey(), JSON.stringify(S.done)); localStorage.setItem(storeKey() + '-task', S.task); } catch (e) { /* приватный режим */ } }

  // Задания для любого сервера: собираются по его каталогу. Реальные серверы отвечают по-разному,
  // поэтому в «поломках» засчитываем любой осмысленный отказ, а урок объясняет, чего ждёт спецификация.
  function buildGenericTasks() {
    const c = S.cat || {};
    const tools = c.tools || [];
    const needs = t => (t.inputSchema?.required || []).length > 0;
    const ro = tools.filter(t => t.annotations?.readOnlyHint === true);
    const pick = ro.find(needs) || ro[0] || tools.find(needs) || tools[0];
    const arg = pick?.inputSchema?.required?.[0];
    const argDesc = arg ? (pick.inputSchema.properties?.[arg]?.description || '') : '';
    const argSel = arg ? (t => valueRange(t, arg) || afterRange(t, `"${arg}": `)) : null;
    // «поломку» засчитываем по отправленному запросу, а вердикт — соблюдает ли сервер спецификацию — выносим по ответу
    const KNOWN = ['server/discover', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'resources/templates/list', 'prompts/list',
      'prompts/get', 'completion/complete', 'subscriptions/listen', 'initialize', 'ping', 'logging/setLevel'];
    const answered = ex => !ex?.netError && (!!ex?.final || ex?.http >= 400);
    const judge = ex => {
      const f = ex.final;
      const good = !!f?.error || f?.result?.isError === true || (ex.http >= 400 && ex.http < 500);
      return { good, code: f?.error?.code ?? (f?.result?.isError ? 'isError: true' : `HTTP ${ex.http}`) };
    };
    const L = [];
    if (S.era === 'modern') L.push({ id: 'discover', g: 'Основы', t: 'Спросите сервер, что он умеет',
      d: 'Запрос <code>server/discover</code> уже в редакторе. Отправьте и найдите в ответе <code>capabilities</code> и <code>instructions</code>.',
      lesson: 'Сервер новой схемы рассказывает о себе без рукопожатия.',
      start: T => T.method('server/discover'), ok: (q, f) => q.method === 'server/discover' && !!f?.result });
    if (c.caps?.tools) L.push({ id: 'list', g: 'Основы', t: 'Получите список инструментов',
      d: `Отправьте <code>tools/list</code>. Инструментов у сервера: ${tools.length} — это полки на схеме.`,
      lesson: 'Цвет полки — аннотации инструмента: зелёные только читают, красные могут менять данные.',
      start: T => T.method('tools/list'), ok: (q, f) => q.method === 'tools/list' && !!f?.result?.tools });
    if (pick) L.push({ id: 'call', g: 'Основы', t: `Вызовите ${pick.name}`,
      d: arg ? `Аргумент <code>${esc(arg)}</code> выделен — впишите значение и отправьте.${argDesc ? ` Подсказка сервера: «${esc(argDesc.slice(0, 160))}».` : ''}` : 'У инструмента нет обязательных аргументов — просто отправьте.',
      hint: pick.annotations?.readOnlyHint === true ? 'Инструмент помечен «только чтение» — вызов безопасен.' : 'Инструмент не помечен «только чтение» — лаборатория спросит согласие, как настоящий host.',
      lesson: 'Это настоящий вызов реального сервера: ответ пришёл из внешнего мира.',
      start: T => T.call(pick.name), sel: argSel,
      ok: (q, f) => q.method === 'tools/call' && !!f?.result && f.result.isError !== true && f.result.resultType !== 'input_required' });
    const res = (c.resources || [])[0];
    if (res) L.push({ id: 'read', g: 'Основы', t: 'Прочитайте ресурс',
      d: `В редакторе запрос <code>resources/read</code> для <code>${esc(res.name || res.uri)}</code>. Отправьте.`,
      lesson: 'Ресурсы — данные для контекста; какие подмешать, решает приложение.',
      start: T => req('resources/read', { uri: res.uri }), ok: (q, f) => q.method === 'resources/read' && !!f?.result?.contents });
    const pr = (c.prompts || [])[0];
    if (pr) {
      const pa = (pr.arguments || []).find(a => a.required);
      L.push({ id: 'prompt', g: 'Основы', t: 'Получите промпт',
        d: `Промпт <code>${esc(pr.name)}</code>.${pa ? ` Аргумент <code>${esc(pa.name)}</code> выделен — впишите значение.` : ''} Отправьте.`,
        lesson: 'Промпт — заготовка сценария, его выбирает пользователь.',
        start: T => req('prompts/get', { name: pr.name, arguments: Object.fromEntries((pr.arguments || []).filter(a => a.required).map(a => [a.name, ''])) }),
        sel: pa ? (t => valueRange(t, pa.name)) : null, ok: (q, f) => q.method === 'prompts/get' && !!f?.result?.messages });
    }
    L.push({ id: 'method', g: 'Сломай протокол', t: 'Метод, которого нет',
      d: 'Метод выделен. Напечатайте <code>tools/delete</code> и отправьте.',
      lesson: 'По спецификации ответ — −32601 Method not found. Сравните, что ответил этот сервер.',
      start: T => T.method(c.caps?.tools ? 'tools/list' : 'ping'), sel: t => valueRange(t, 'method'), judge,
      ok: (q, f, all, S2, ex) => typeof q.method === 'string' && !KNOWN.includes(q.method) && !q.method.startsWith('notifications/') && answered(ex) });
    if (pick) L.push({ id: 'tool404', g: 'Сломай протокол', t: 'Инструмент, которого нет',
      d: 'Имя инструмента выделено. Напечатайте <code>no_such_tool</code> и отправьте.',
      lesson: 'Неизвестный инструмент — протокольная ошибка (обычно −32602), модель её обычно не видит.',
      start: T => T.call(pick.name), sel: t => valueRange(t, 'name'), judge,
      ok: (q, f, all, S2, ex) => q.method === 'tools/call' && !tools.some(t => t.name === q.params?.name) && answered(ex) });
    if (arg) L.push({ id: 'noargs', g: 'Сломай протокол', t: 'Без обязательного аргумента',
      d: 'Блок <code>arguments</code> выделен. Удалите его и отправьте.',
      lesson: 'Без обязательного аргумента сервер отказывает — протокольной ошибкой или результатом с isError: true.',
      start: T => T.call(pick.name), sel: t => blockRange(t, 'arguments'), judge,
      ok: (q, f, all, S2, ex) => q.method === 'tools/call' && q.params?.name === pick.name && q.params?.arguments?.[arg] === undefined && answered(ex) });
    if (S.era === 'modern') {
      L.push({ id: 'meta', g: 'Сломай протокол', t: 'Уберите _meta',
        d: 'Блок <code>_meta</code> выделен. Удалите его клавишей Backspace и отправьте.',
        lesson: 'Без _meta сервер новой схемы не знает версию протокола и возможности клиента (по спецификации −32602).',
        start: T => T.method('tools/list'), sel: t => blockRange(t, '_meta'), judge,
        ok: (q, f, all, S2, ex) => typeof q.method === 'string' && !q.params?._meta && answered(ex) });
      L.push({ id: 'version', g: 'Сломай протокол', t: 'Неизвестная версия протокола',
        d: 'Версия выделена. Напечатайте <code>2099-01-01</code> и отправьте.',
        lesson: 'По спецификации сервер отвечает −32022 и перечисляет поддерживаемые версии.',
        start: T => T.method('tools/list'), sel: t => valueRange(t, M + 'protocolVersion'), judge,
        ok: (q, f, all, S2, ex) => { const v = q.params?._meta?.[M + 'protocolVersion']; return !!v && v !== demo.PROTOCOL && answered(ex); } });
    }
    L.push({ id: 'note', g: 'Сломай протокол', t: 'Сообщение без ответа',
      d: 'В редакторе уведомление: у него нет <code>id</code>. Отправьте и посмотрите, что вернёт сервер.',
      lesson: 'На уведомление сервер не отвечает — по HTTP это 202 Accepted без тела.',
      start: T => make('x:cancel'), ok: (q, f, all, S2, ex) => !ex?.netError && !('id' in q) && !f && ex?.http < 300 });
    return L;
  }
  function check(ex) {
    const q = ex.msg && typeof ex.msg === 'object' ? ex.msg : {};
    const f = ex.final;
    if (q.method === 'tools/call' && f?.result && !f.result.isError && f.result.resultType === 'complete') S.calls.add(q.params?.name);
    const bar = $('#labResTask', root);
    bar.hidden = true;
    if (!tasks().length) return;
    const fresh = tasks().filter(t => !S.done[t.id] && t.ok(q, f, ex.messages || [], S, ex));
    fresh.forEach(t => { S.done[t.id] = true; if (t.judge) S.verdicts[t.id] = t.judge(ex); api.track('mcp3d_lab_challenge', { id: t.id }); });
    if (fresh.length) saveDone();
    const cur = tasks()[S.task];
    if (S.lmode === 'tasks' && S.done[cur.id] && (fresh.includes(cur) || cur.chain)) {
      bar.hidden = false;
      const v = S.verdicts[cur.id];
      bar.classList.toggle('warn', !!v && !v.good);
      bar.innerHTML = `<span>${v && !v.good ? `⚠ Сервер принял некорректный запрос — задание пройдено, но это отступление от спецификации` : `✓ Задание «${esc(cur.t)}» выполнено`}</span>${S.task < tasks().length - 1 ? '<button class="lab-btn small primary" data-next>Следующее задание →</button>' : ''}`;
      api.pulse('lab_c', 'res', 'Задание выполнено ✓', 1.8);
    } else if (fresh.length) {
      api.pulse('lab_c', 'res', `Засчитано: ${fresh[0].t}`, 1.8);
    }
    renderTask();
  }
  function renderTask() {
    const t = tasks()[S.task];
    $('#labTaskNote', root).hidden = S.src === 'demo';
    if (!t) {
      $('#labDots', root).innerHTML = '';
      $('#labProg', root).textContent = '';
      $('#labTaskN', root).textContent = '';
      $('#labTaskT', root).textContent = 'Подключите сервер';
      $('#labTaskD', root).innerHTML = 'Задания соберутся по каталогу сервера после подключения.';
      $('#labTaskOk', root).hidden = true;
      return;
    }
    const n = tasks().filter(x => S.done[x.id]).length;
    $('#labProg', root).textContent = `${n}/${tasks().length}`;
    $('#labTaskN', root).textContent = `Задание ${S.task + 1} из ${tasks().length} · ${t.g}`;
    $('#labDots', root).innerHTML = tasks().map((x, i) =>
      `<button class="${S.done[x.id] ? 'done' : ''} ${i === S.task ? 'cur' : ''}" data-task="${i}" title="${esc(x.t)}" aria-label="Задание ${i + 1}: ${esc(x.t)}"></button>`).join('');
    $('#labTaskT', root).textContent = t.t;
    $('#labTaskD', root).innerHTML = t.d;
    const hint = $('#labTaskHint', root);
    hint.hidden = !t.hint;
    hint.open = false;
    $('div', hint).innerHTML = t.hint || '';
    $('#labTaskX', root).innerHTML = t.chain
      ? `<div class="lab-chain">${t.chain.map((name, i) => `${i ? '<span>→</span>' : ''}<button class="lab-pk ${S.calls.has(name) ? 'ok' : ''}" data-make="t:${name}">${S.calls.has(name) ? '✓ ' : ''}${name}</button>`).join('')}</div>`
      : '';
    const done = !!S.done[t.id];
    const ok = $('#labTaskOk', root);
    ok.hidden = !done;
    const v = S.verdicts[t.id];
    ok.classList.toggle('warn', !!v && !v.good);
    ok.innerHTML = !done ? '' : v
      ? (v.good ? `<b>✓ Сервер отказал (${esc(v.code)})</b> — как и требует спецификация. ${esc(t.lesson)}`
        : `<b>⚠ Сервер принял некорректный запрос</b> (${esc(v.code)}). Это отступление от спецификации 2026-07-28 — или сервер молча понимает запросы старой схемы. ${esc(t.lesson)}`)
      : `<b>✓ Выполнено.</b> ${esc(t.lesson)}`;
    const next = $('#labTaskNext', root);
    next.hidden = S.task >= tasks().length - 1 && done;
    next.textContent = done ? 'Следующее задание →' : 'Пропустить →';
    next.classList.toggle('primary', done);
    $('#labTask', root).classList.toggle('is-done', done);
    if (n === tasks().length && S.task === tasks().length - 1 && done) ok.innerHTML += `<br><b>Все задания пройдены.</b> ${S.src === 'demo' ? 'Дальше — свой сервер по URL или сервер из библиотеки.' : 'Попробуйте другой сервер из библиотеки или «Свободный режим».'}`;
  }
  function goTask(i, { load = true } = {}) {
    S.task = Math.max(0, Math.min(tasks().length - 1, i));
    saveDone();
    renderTask();
    $('#labResTask', root).hidden = true;
    const t = tasks()[S.task];
    if (load && t) setEditor(t.start(T), { sel: t.sel, undo: true });
  }
  function setLMode(m) {
    if (m === 'tasks' && !tasks().length) m = 'free';
    S.lmode = m;
    $$('.lab-modes button', root).forEach(b => b.setAttribute('aria-selected', String(b.dataset.lmode === m)));
    $('#labTask', root).hidden = m !== 'tasks';
    $('#labFree', root).hidden = m !== 'free';
    const tb = $('.lab-modes [data-lmode="tasks"]', root);
    tb.disabled = !tasks().length;
    tb.title = tb.disabled ? 'Подключите сервер — задания соберутся по его каталогу' : '';
  }

  /* ── рентген: каталог на схеме и аудит качества ── */
  function toolKind(t) {
    const a = t.annotations || {};
    if (a.readOnlyHint === true) return ['ro', 'только чтение'];
    if (a.destructiveHint === false) return ['rw', 'меняет данные'];
    return ['danger', t.annotations ? 'разрушающий · нужен человек' : 'нет аннотаций → считается разрушающим'];
  }
  function audit(list1, list2) {
    const tools = list1?.tools || [];
    const findings = [];
    let pass = 0, total = 0;
    const chk = (good, tool, text, sev = 'warn') => { total++; if (good) pass++; else findings.push({ tool, text, sev }); };
    for (const t of tools) {
      chk(/^[A-Za-z0-9_.-]{1,128}$/.test(t.name), t.name, 'имя нарушает правила: 1–128 символов A–Z a–z 0–9 _ - .', 'err');
      const d = (t.description || '').length;
      chk(d >= 40, t.name, `короткое описание (${d} симв.) — модели трудно понять, когда вызывать`);
      chk(t.inputSchema?.type === 'object', t.name, 'inputSchema должен быть type: "object"', 'err');
      chk(!!t.outputSchema, t.name, 'нет outputSchema — результат без структуры');
      chk(typeof t.annotations?.readOnlyHint === 'boolean', t.name, 'нет аннотаций: host не знает, спрашивать ли подтверждение');
    }
    if (S.era === 'modern') chk(list1 && list1.ttlMs !== undefined && !!list1.cacheScope, null, 'в ответе tools/list нет ttlMs и cacheScope — они обязательны с 2026-07-28', 'err');
    chk(tools.length <= 20, null, `инструментов ${tools.length}: каждый занимает контекст модели`);
    if (list2) chk(JSON.stringify((list2.tools || []).map(t => t.name)) === JSON.stringify(tools.map(t => t.name)), null, 'порядок tools/list меняется между вызовами — хуже кэширование');
    const names = tools.map(t => t.name);
    const chained = tools.filter(t => names.some(n => n !== t.name && (t.description || '').includes(n)));
    if (chained.length >= 2) findings.push({ tool: chained.map(t => t.name).join(' → '), sev: 'idea', link: 'api-chain',
      text: 'описания ссылаются друг на друга — похоже на цепочку 1:1 к API. Подумайте об одном инструменте уровня задачи' });
    return { pass, total, score: total ? Math.round((pass / total) * 100) : 0, findings };
  }
  function renderXray(a) {
    const c = S.cat;
    const info = c.info || {};
    const caps = Object.keys(c.caps || {}).filter(k => k !== 'extensions');
    $('#labCaps', root).innerHTML = `<b>${esc(info.title || info.name || 'Сервер')}</b> ${esc(info.version || '')}
      · протокол ${esc(S.era === 'modern' ? demo.PROTOCOL : S.legacy?.version + ' (старая схема)')}
      · ${caps.map(x => `<code>${esc(x)}</code>`).join(' ')}
      ${c.instructions ? `<div class="lab-instr">${esc(c.instructions)}</div>` : ''}`;
    $('#labChips', root).innerHTML = c.tools.map(t => {
      const [kind] = toolKind(t);
      return `<button class="lab-chip k-${kind}" data-tool="${esc(t.name)}">${esc(t.name)}</button>`;
    }).join('');
    const q = $('#labQuality', root);
    q.textContent = `качество ${a.score}%`;
    q.className = `lab-meta q ${a.score >= 85 ? 'good' : a.score >= 65 ? 'mid' : 'bad'}`;
    $('#labAudit', root).innerHTML = a.findings.length
      ? a.findings.map(f => `<li class="${f.sev}">${f.tool ? `<code>${esc(f.tool)}</code> ` : ''}${esc(f.text)}${f.link ? ` <button class="linklike" data-chapter="${f.link}">глава 14 →</button>` : ''}</li>`).join('')
      : '<li class="ok">Замечаний нет.</li>';
  }

  async function connect() {
    if (S.busy) return;
    S.busy = true;
    setBusy(true);
    S.session = null;
    S.legacy = null;
    S.era = 'modern';
    S.cat = null;
    S.gtasks = [];
    api.setCatalog([]);
    // всё от прошлого сервера убираем сразу, чтобы при неудаче не остались чужие данные
    $('#labCaps', root).innerHTML = '';
    $('#labChips', root).innerHTML = '';
    $('#labAudit', root).innerHTML = '';
    $('#labQuality', root).textContent = '';
    renderPicker();
    setLMode(S.lmode);
    renderTask();
    const status = (html, cls = '') => { const el = $('#labConn', root); el.className = `lab-status ${cls}`; el.innerHTML = html; };
    const isDemo = S.src === 'demo';
    if (!isDemo) {
      S.url = $('#labUrl', root).value.trim();
      S.auth = $('#labAuth', root).value.trim();
      if (!/^https?:\/\//i.test(S.url)) { status('Укажите адрес вида <code>https://…/mcp</code>.', 'err'); S.busy = false; setBusy(false); return; }
    }
    api.setServer(isDemo ? 'Учебный сервер' : new URL(S.url).host, isDemo ? 'работает в браузере' : 'подключение…');
    status('Сканирую сервер…');
    try {
      const d = await exchange(req('server/discover'), { speed: 0.6, quiet: true, timeout: 5000 });
      if (d.http === 401 || d.http === 403) {
        status(explain(d).html, 'err');
        api.setServer(new URL(S.url).host, 'нет доступа');
        return;
      }
      let caps, info, instructions;
      if (d.final?.result?.supportedVersions?.includes(demo.PROTOCOL)) {
        ({ capabilities: caps, instructions } = d.final.result);
        info = d.final.result._meta?.[M + 'serverInfo'];
      } else {
        // сервер старой «эпохи»: пробуем рукопожатие initialize, как делают клиенты с поддержкой обеих схем
        S.era = 'legacy';
        const init = await exchange({ jsonrpc: '2.0', id: nextId(), method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp3d-lab', version: '0.1.0' } } }, { speed: 0.6, quiet: true });
        const r = init.final?.result;
        if (!r) {
          // сетевая ошибка на обеих схемах — почти всегда CORS; старые серверы не разрешают заголовок Mcp-Method
          status(d.netError && init.netError ? explain(d).html : 'Сервер не ответил ни по новой схеме (2026-07-28), ни по старой (initialize).', 'err');
          api.setServer(new URL(S.url).host, 'нет ответа');
          S.era = 'modern';
          return;
        }
        S.legacy = { version: r.protocolVersion };
        caps = r.capabilities; info = r.serverInfo; instructions = r.instructions;
        await transport({ jsonrpc: '2.0', method: 'notifications/initialized' });
      }
      const get = async (method, key, opt) => (caps?.[key] ? (await exchange(req(method), opt)).final?.result : null);
      const tl = await get('tools/list', 'tools', { speed: 0.6, quiet: true });
      const tl2 = await get('tools/list', 'tools', { silent: true, quiet: true });
      const rl = await get('resources/list', 'resources', { speed: 0.6, quiet: true });
      const rt = await get('resources/templates/list', 'resources', { silent: true, quiet: true });
      const pl = await get('prompts/list', 'prompts', { speed: 0.6, quiet: true });
      S.cat = { caps: caps || {}, info, instructions, tools: tl?.tools || [], resources: rl?.resources || [], templates: rt?.resourceTemplates || [], prompts: pl?.prompts || [] };
      const items = [
        ...S.cat.tools.map(t => { const [kind, sub] = toolKind(t); return { key: `tool:${t.name}`, name: t.name, kind, sub, group: 'tools' }; }),
        ...S.cat.resources.map(r => ({ key: `res:${r.uri}`, name: r.name || r.uri, kind: 'resource', sub: r.uri, group: 'res' })),
        ...S.cat.templates.map(r => ({ key: `tpl:${r.uriTemplate}`, name: r.name || r.uriTemplate, kind: 'template', sub: r.uriTemplate, group: 'res' })),
        ...S.cat.prompts.map(p => ({ key: `prompt:${p.name}`, name: p.name, kind: 'prompt', sub: 'промпт', group: 'prompts' })),
      ];
      S.shelves = api.setCatalog(items);
      const a = audit(tl, tl2);
      renderXray(a);
      api.markIssues(a.findings.filter(f => f.sev !== 'idea' && f.tool).map(f => S.shelves[`tool:${f.tool}`]).filter(Boolean));
      api.setServer(isDemo ? 'Учебный сервер' : (info?.title || info?.name || new URL(S.url).host), `${S.cat.tools.length} tools · ${S.cat.resources.length + S.cat.templates.length} resources · ${S.cat.prompts.length} prompts`);
      renderPicker();
      S.calls.clear();
      S.verdicts = {};
      S.gtasks = isDemo ? [] : buildGenericTasks();
      S.done = loadDone();
      S.task = loadTask();
      if (!isDemo && !S.external) S.lmode = 'tasks';
      status(isDemo
        ? '<b>Подключено.</b> Сервер работает в этой вкладке, данные вымышленные.'
        : `<b>Подключено</b> (${S.era === 'modern' ? 'протокол 2026-07-28' : `старая схема ${esc(S.legacy.version)}`}).`, 'ok');
      if (S.lmode === 'tasks' && !S.dirty && !S.external) goTask(S.task);
      else if (!editor.value.trim()) setEditor(T.call(S.cat.tools[0]?.name || ''), { undo: false });
    } finally {
      S.busy = false;
      setBusy(false);
      setLMode(S.lmode);
      renderTask();
    }
  }

  function setBusy(v) { $('#labSend', root).disabled = v; $('#labConnect', root).disabled = v; }

  async function onSend() {
    if (S.busy) return;
    const p = checkParse();
    if (!p.ok) return;
    const q = p.value;
    if (S.src === 'url' && q?.method === 'tools/call' && !S.consented.has(q.params?.name)) {
      const tool = S.cat?.tools.find(t => t.name === q.params?.name);
      if (tool && tool.annotations?.readOnlyHint !== true) {
        const box = $('#labConsent', root);
        box.hidden = false;
        box.innerHTML = `<b>Вызвать «${esc(tool.name)}»?</b> Инструмент не помечен «только чтение» и может менять данные на сервере. Настоящий host обязан спросить согласие (глава 11).
          <div class="lab-actions"><button class="lab-btn small primary" data-consent="yes">Вызвать</button><button class="lab-btn small" data-consent="no">Отмена</button></div>`;
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
    }
    $('#labConsent', root).hidden = true;
    $('#labSend', root).classList.remove('pulse');
    S.busy = true;
    setBusy(true);
    try { await exchange(p.value); } finally { S.busy = false; setBusy(false); }
  }

  /* ── события ── */
  $('#labSend', root).addEventListener('click', onSend);
  $('#labFormat', root).addEventListener('click', () => { const p = checkParse(); if (p.ok) setEditor(p.value); });
  editor.addEventListener('input', () => { S.dirty = editor.value !== S.loaded; checkParse(); });
  $('#labUndoBtn', root).addEventListener('click', () => {
    if (S.undo == null) return;
    const cur = editor.value;
    editor.value = S.undo; S.loaded = cur; S.dirty = true; S.undo = null;
    $('#labUndo', root).hidden = true;
    checkParse();
  });
  $$('.lab-modes button', root).forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    setLMode(b.dataset.lmode);
    if (b.dataset.lmode === 'tasks') goTask(S.task);
  }));
  $('#labTaskNext', root).addEventListener('click', () => goTask(S.task + 1));
  $('#labTaskRestart', root).addEventListener('click', () => goTask(S.task));
  editor.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSend(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b, value } = editor;
      editor.value = value.slice(0, a) + '  ' + value.slice(b);
      editor.selectionStart = editor.selectionEnd = a + 2;
    }
    e.stopPropagation(); // стрелки в редакторе не листают книгу
  });
  $$('.lab-srv-tabs button', root).forEach(b => b.addEventListener('click', () => {
    S.src = b.dataset.src;
    $$('.lab-srv-tabs button', root).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('.lab-url', root).hidden = S.src !== 'url';
    if (S.src === 'demo') connect();
    else { $('#labConn', root).className = 'lab-status'; $('#labConn', root).innerHTML = 'Укажите адрес MCP-сервера (Streamable HTTP) и нажмите «Подключить».'; api.setCatalog([]); api.setServer('Ваш сервер', 'не подключён'); setLMode('free'); }
  }));
  $('#labConnect', root).addEventListener('click', connect);
  $('#labLib', root).innerHTML = LIBRARY.map(s2 => `<button class="lab-lib-item" data-url="${esc(s2.url)}"><b>${esc(s2.name)}</b><span>${esc(s2.desc)}</span><i class="${s2.era}">${s2.era === 'new' ? '2026-07-28' : 'старая схема'}</i></button>`).join('');
  $('#labLib', root).addEventListener('click', e => {
    const b = e.target.closest('[data-url]');
    if (!b || S.busy) return;
    $('#labUrl', root).value = b.dataset.url;
    S.external = false;
    connect();
  });
  $('#labConsent', root).addEventListener('click', e => {
    const b = e.target.closest('[data-consent]');
    if (!b) return;
    const box = $('#labConsent', root);
    box.hidden = true;
    if (b.dataset.consent === 'yes') {
      const p = parse(editor.value);
      if (p.ok) S.consented.add(p.value?.params?.name);
      onSend();
    }
  });
  $('#labUrl', root).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') connect(); });
  $('#labAuth', root).addEventListener('keydown', e => e.stopPropagation());
  root.addEventListener('click', e => {
    const chip = e.target.closest('.lab-chip');
    if (chip) { setLMode('free'); setEditor(T.call(chip.dataset.tool)); editor.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const pk = e.target.closest('[data-make]');
    if (pk) { const v = make(pk.dataset.make); if (v) { setEditor(v); editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
    const dot = e.target.closest('[data-task]');
    if (dot) { goTask(+dot.dataset.task); return; }
    if (e.target.closest('[data-next]')) { goTask(S.task + 1); $('#labTask', root).scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const link = e.target.closest('[data-chapter]');
    if (link) api.goChapter(link.dataset.chapter);
  });
  $('#labReset', root).addEventListener('click', () => { S.done = {}; S.calls.clear(); saveDone(); goTask(0); });

  setLMode('tasks');
  renderTask();
  connect();

  return {
    load(text) {
      // запрос из главы книги — это свободная работа, а не задание
      S.external = true;
      setLMode('free');
      const p = parse(text);
      setEditor(p.ok ? p.value : text);
      editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('#labSend', root).classList.add('pulse');
    },
  };
}
