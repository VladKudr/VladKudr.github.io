// Лаборатория: MCP-клиент прямо в браузере, задания «Сломай протокол» и «рентген» сервера.
// Загружается лениво, при первом входе в режим «Лаборатория». Сцену рисует app.js через api.
import * as demo from './lab-server.js?v=1';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const M = 'io.modelcontextprotocol/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stripComments = src => src.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*/g, (m, str) => str || '');
const LS_KEY = 'mcp3d-lab';

// Задания «Сломай протокол»: проверка по запросу, финальному ответу и всем сообщениям потока
const CHALLENGES = [
  { id: 'discover', t: 'Спросите сервер, что он умеет', h: '<code>server/discover</code>',
    ok: (q, f) => q.method === 'server/discover' && f?.result, tpl: T => T.method('server/discover') },
  { id: 'list', t: 'Получите список инструментов', h: '<code>tools/list</code>',
    ok: (q, f) => q.method === 'tools/list' && f?.result?.tools, tpl: T => T.method('tools/list') },
  { id: 'call', t: 'Вызовите инструмент и получите результат', h: 'например <code>get_customer_debt</code>',
    ok: (q, f) => q.method === 'tools/call' && f?.result?.resultType === 'complete' && f.result.isError === false, tpl: T => T.call('get_customer_debt') },
  { id: 'toolerr', t: 'Получите ошибку выполнения — <code>isError: true</code>', h: 'передайте ИНН из пяти цифр',
    ok: (q, f) => f?.result?.isError === true, tpl: T => T.call('get_customer_debt') },
  { id: 'meta', t: 'Уберите из запроса <code>_meta</code>', h: 'что ответит сервер без версии и capabilities?',
    ok: (q, f) => f?.error?.code === -32602 && /_meta/.test(f.error.message), tpl: T => T.method('tools/list') },
  { id: 'version', t: 'Укажите старую версию протокола <code>2025-06-18</code>', h: 'поле <code>protocolVersion</code> в <code>_meta</code>',
    ok: (q, f) => f?.error?.code === -32022, tpl: T => T.method('tools/list') },
  { id: 'method', t: 'Вызовите метод, которого нет', h: 'например <code>tools/delete</code>',
    ok: (q, f) => f?.error?.code === -32601, tpl: T => T.method('tools/list') },
  { id: 'cap', t: 'Вызовите <code>apply_migration</code>, не заявив <code>elicitation</code>', h: 'уберите его из <code>clientCapabilities</code>',
    ok: (q, f) => f?.error?.code === -32021, tpl: T => T.call('apply_migration') },
  { id: 'mrtr', t: 'Примените миграцию: подтвердите её в форме и отправьте повтор', h: 'Multi Round-Trip, глава 7',
    ok: (q, f) => q.params?.name === 'apply_migration' && q.params?.inputResponses && f?.result?.resultType === 'complete' && f.result.isError === false,
    tpl: T => T.call('apply_migration') },
  { id: 'forge', t: 'Подделайте <code>requestState</code> в повторе', h: 'измените в нём один символ',
    ok: (q, f) => q.params?.requestState && f?.error?.code === -32602 && /requestState/.test(f.error.message), tpl: T => T.call('apply_migration') },
  { id: 'progress', t: 'Получите прогресс долгой операции', h: '<code>export_orders</code> + <code>progressToken</code> в <code>_meta</code>',
    ok: (q, f, all) => all.some(m => m.method === 'notifications/progress'), tpl: T => T.call('export_orders') },
  { id: 'chain', t: 'Посчитайте долг цепочкой из трёх вызовов, а затем одним', h: '<code>find_customer</code> → <code>list_contracts</code> → <code>calc_debt</code>, потом <code>get_customer_debt</code> (глава 14)',
    ok: (q, f, all, S) => S.calls.has('calc_debt') && S.calls.has('get_customer_debt'), tpl: T => T.call('find_customer') },
];

export function initLab(api) {
  const root = $('#lab');
  const editor = $('#labEditor', root);
  const S = {
    src: 'demo', url: '', auth: '', era: 'modern', legacy: null, session: null,
    cat: null, shelves: {}, id: 1, busy: false, calls: new Set(), done: loadDone(),
  };

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
  const setEditor = v => { editor.value = typeof v === 'string' ? v : pretty(v); checkParse(); };

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

  function buildTemplates() {
    const sel = $('#labTpl', root);
    const opts = [['', 'Шаблон запроса…']];
    const c = S.cat;
    if (S.era === 'modern') opts.push(['m:server/discover', 'server/discover']);
    if (c?.caps?.tools) {
      opts.push(['m:tools/list', 'tools/list']);
      for (const t of c.tools) opts.push([`t:${t.name}`, `tools/call · ${t.name}`]);
    }
    if (c?.caps?.resources) {
      opts.push(['m:resources/list', 'resources/list']);
      for (const r of c.resources) opts.push([`r:${r.uri}`, `resources/read · ${r.name || r.uri}`]);
    }
    if (c?.caps?.prompts) {
      opts.push(['m:prompts/list', 'prompts/list']);
      for (const p of c.prompts) opts.push([`p:${p.name}`, `prompts/get · ${p.name}`]);
    }
    if (S.src === 'demo') {
      opts.push(['x:completion', 'completion/complete · регион']);
      opts.push(['x:listen', 'subscriptions/listen']);
    }
    opts.push(['x:cancel', 'уведомление · notifications/cancelled']);
    sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  }
  function fromTemplate(v) {
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
  async function transport(msg) {
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
    try {
      res = await fetch(S.url, { method: 'POST', headers, body: JSON.stringify(msg) });
    } catch (e) {
      return { netError: true, ms: Math.round(performance.now() - t0) };
    }
    const sid = res.headers.get('Mcp-Session-Id');
    if (sid) S.session = sid;
    const ct = res.headers.get('Content-Type') || '';
    const text = res.status === 202 ? '' : await res.text();
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

  async function exchange(msg, { speed = 1, quiet = false, silent = false } = {}) {
    const k = silent || $('#labFast', root).checked ? 0 : speed;
    const isNote = msg && typeof msg === 'object' && !Array.isArray(msg) && !('id' in msg);
    const pending = transport(msg);
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
        setEditor(retry);
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
  function loadDone() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveDone() { try { localStorage.setItem(LS_KEY, JSON.stringify(S.done)); } catch (e) { /* приватный режим */ } }
  function check(ex) {
    const q = ex.msg && typeof ex.msg === 'object' ? ex.msg : {};
    const f = ex.final;
    if (q.method === 'tools/call' && f?.result && !f.result.isError && f.result.resultType === 'complete') S.calls.add(q.params?.name);
    if (S.src !== 'demo') return;
    const fresh = CHALLENGES.filter(c => !S.done[c.id] && c.ok(q, f, ex.messages || [], S));
    if (!fresh.length) return;
    fresh.forEach(c => { S.done[c.id] = true; api.track('mcp3d_lab_challenge', { id: c.id }); });
    saveDone();
    renderChallenges(fresh.map(c => c.id));
    api.pulse('lab_c', 'res', `Задание выполнено: ${fresh.length > 1 ? fresh.length + ' шт.' : '✓'}`, 1.8);
  }
  function renderChallenges(fresh = []) {
    const list = $('#labChallenges', root);
    const n = CHALLENGES.filter(c => S.done[c.id]).length;
    $('#labScore', root).textContent = `${n} / ${CHALLENGES.length}`;
    list.innerHTML = CHALLENGES.map(c => `<li class="${S.done[c.id] ? 'done' : ''} ${fresh.includes(c.id) ? 'fresh' : ''}" data-id="${c.id}">
      <span class="t">${c.t}</span><span class="h">${c.h}</span></li>`).join('');
    $('#labChallengesCard', root).hidden = S.src !== 'demo';
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
    api.setCatalog([]);
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
      const d = await exchange(req('server/discover'), { speed: 0.6, quiet: true });
      if (d.netError || d.http === 401 || d.http === 403) {
        const e = explain(d);
        status(e.html, 'err');
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
        if (!r) { status('Сервер не ответил ни по новой схеме (2026-07-28), ни по старой (initialize).', 'err'); S.era = 'modern'; return; }
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
      buildTemplates();
      status(isDemo
        ? '<b>Подключено.</b> Сервер работает в этой вкладке, данные вымышленные.'
        : `<b>Подключено</b> (${S.era === 'modern' ? 'протокол 2026-07-28' : `старая схема ${esc(S.legacy.version)}`}).`, 'ok');
      if (!editor.value.trim()) setEditor(T.call(S.cat.tools[0]?.name || '') );
    } finally {
      S.busy = false;
      setBusy(false);
      renderChallenges();
    }
  }

  function setBusy(v) { $('#labSend', root).disabled = v; $('#labConnect', root).disabled = v; }

  async function onSend() {
    if (S.busy) return;
    const p = checkParse();
    if (!p.ok) return;
    $('#labSend', root).classList.remove('pulse');
    S.busy = true;
    setBusy(true);
    try { await exchange(p.value); } finally { S.busy = false; setBusy(false); }
  }

  /* ── события ── */
  $('#labSend', root).addEventListener('click', onSend);
  $('#labFormat', root).addEventListener('click', () => { const p = checkParse(); if (p.ok) setEditor(p.value); });
  $('#labTpl', root).addEventListener('change', e => { const v = fromTemplate(e.target.value); if (v) setEditor(v); e.target.value = ''; });
  editor.addEventListener('input', () => checkParse());
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
    else { $('#labConn', root).className = 'lab-status'; $('#labConn', root).innerHTML = 'Укажите адрес MCP-сервера (Streamable HTTP) и нажмите «Подключить».'; api.setCatalog([]); api.setServer('Ваш сервер', 'не подключён'); renderChallenges(); }
  }));
  $('#labConnect', root).addEventListener('click', connect);
  $('#labUrl', root).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') connect(); });
  $('#labAuth', root).addEventListener('keydown', e => e.stopPropagation());
  root.addEventListener('click', e => {
    const chip = e.target.closest('.lab-chip');
    if (chip) { setEditor(T.call(chip.dataset.tool)); editor.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const ch = e.target.closest('#labChallenges li');
    if (ch) {
      const c = CHALLENGES.find(x => x.id === ch.dataset.id);
      if (c) { setEditor(c.tpl(T)); editor.scrollIntoView({ block: 'center', behavior: 'smooth' }); editor.focus({ preventScroll: true }); }
      return;
    }
    const link = e.target.closest('[data-chapter]');
    if (link) api.goChapter(link.dataset.chapter);
  });
  $('#labReset', root).addEventListener('click', () => { S.done = {}; S.calls.clear(); saveDone(); renderChallenges(); });

  renderChallenges();
  connect();

  return {
    load(text) {
      const p = parse(text);
      setEditor(p.ok ? p.value : text);
      editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('#labSend', root).classList.add('pulse');
    },
  };
}
