// Учебный MCP-сервер «Бухгалтерия» по спецификации 2026-07-28. Работает прямо в браузере.
// handle(message) возвращает сообщения, которые сервер отправил бы в ответ:
// уведомления (например, прогресс) и финальный ответ. Пустой массив — ответа нет (уведомление клиента).
// Инструменты повторяют примеры из глав книги, поэтому любой запрос из текста можно выполнить.

export const PROTOCOL = '2026-07-28';
const SUPPORTED = [PROTOCOL];
const M = 'io.modelcontextprotocol/';
export const SERVER_INFO = { name: 'mcp3d-demo', title: 'Учебный сервер «Бухгалтерия»', version: '0.3.0' };

const INN = { type: 'string', pattern: '^\\d{10}(\\d{2})?$', description: 'ИНН: 10 или 12 цифр' };

// Порядок инструментов фиксирован: спецификация рекомендует детерминированный tools/list.
// Часть описаний намеренно несовершенна — их найдёт аудит в «Рентгене».
const TOOLS = [
  {
    name: 'get_customer_debt', title: 'Задолженность клиента',
    description: 'Считает текущую задолженность клиента по ИНН по всем действующим договорам. Используйте, когда спрашивают о долге, просрочке или сверке с клиентом.',
    inputSchema: { type: 'object', properties: { inn: INN, as_of: { type: 'string', format: 'date', description: 'Дата расчёта, по умолчанию сегодня' } }, required: ['inn'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { customer: { type: 'string' }, total_debt: { type: 'number' }, overdue: { type: 'number' }, contracts: { type: 'array' } } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'find_customer', title: 'Найти клиента',
    description: 'Ищет клиента по ИНН. Возвращает customer_id — передайте его в list_contracts.',
    inputSchema: { type: 'object', properties: { inn: INN }, required: ['inn'] },
    outputSchema: { type: 'object', properties: { customer_id: { type: 'string' }, name: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_contracts', title: 'Договоры клиента',
    description: 'Договоры клиента по customer_id из find_customer. Возвращает contract_ids для calc_debt.',
    inputSchema: { type: 'object', properties: { customer_id: { type: 'string' } }, required: ['customer_id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'calc_debt', title: 'Расчёт долга',
    description: 'Считает задолженность по contract_ids из list_contracts.',
    inputSchema: { type: 'object', properties: { contract_ids: { type: 'array', items: { type: 'string' } } }, required: ['contract_ids'] },
  },
  {
    name: 'run_query', title: 'SQL-запрос (только чтение)',
    description: 'Выполняет SELECT в аналитической БД и возвращает не более 1000 строк. Для изменения данных не используется.',
    inputSchema: { type: 'object', properties: { sql: { type: 'string', description: 'Один SELECT-запрос' }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, required: ['sql'] },
    outputSchema: { type: 'object', properties: { rows: { type: 'array' }, rowCount: { type: 'integer' } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'export_orders', title: 'Выгрузка заказов',
    description: 'Выгружает заказы за год в файл. Долгая операция: если в _meta передан progressToken, присылает прогресс.',
    inputSchema: { type: 'object', properties: { year: { type: 'integer', minimum: 2020, maximum: 2026 } }, required: ['year'] },
    outputSchema: { type: 'object', properties: { rows: { type: 'integer' }, file: { type: 'string' } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'build_quarterly_report', title: 'Квартальный отчёт',
    description: 'Строит квартальный отчёт: выручка, топ клиентов, динамика к прошлому кварталу. Возвращает краткую сводку.',
    inputSchema: { type: 'object', properties: { quarter: { type: 'string', pattern: '^20\\d\\d-Q[1-4]$' } }, required: ['quarter'] },
    outputSchema: { type: 'object', properties: { quarter: { type: 'string' }, revenue: { type: 'number' }, pages: { type: 'integer' } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'apply_migration', title: 'Применить миграцию',
    description: 'Применяет миграцию схемы базы данных. Необратимо: перед выполнением запрашивает подтверждение у пользователя через elicitation.',
    inputSchema: { type: 'object', properties: { migration: { type: 'string' } }, required: ['migration'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'search_issues', title: 'Поиск issues',
    description: 'Ищет issues в репозитории по статусу и метке. Возвращает номер, заголовок и ссылку.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string', description: 'owner/name' }, state: { type: 'string', enum: ['open', 'closed', 'all'] }, label: { type: 'string' } }, required: ['repo'] },
    outputSchema: { type: 'object', properties: { total: { type: 'integer' }, items: { type: 'array' } } },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'get_weather', title: 'Погода',
    description: 'Погода в городе.',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

// Примеры аргументов для шаблонов в лаборатории
export const EXAMPLES = {
  get_customer_debt: { inn: '7700000001' },
  find_customer: { inn: '7700000001' },
  list_contracts: { customer_id: 'cst_4417' },
  calc_debt: { contract_ids: ['Д-12', 'Д-17'] },
  run_query: { sql: 'SELECT region, sum(total) FROM orders GROUP BY region', limit: 10 },
  export_orders: { year: 2026 },
  build_quarterly_report: { quarter: '2026-Q3' },
  apply_migration: { migration: '2026_09_drop_legacy_orders' },
  search_issues: { repo: 'acme/web', state: 'open', label: 'bug' },
  get_weather: { city: 'Казань' },
};

const RESOURCES = [
  { uri: 'postgres://analytics/schema/orders', name: 'orders', title: 'Схема таблицы orders', mimeType: 'application/json',
    text: JSON.stringify({ columns: ['id', 'customer_id', 'total', 'region', 'created_at'] }) },
  { uri: 'file:///work/report.md', name: 'report.md', title: 'Отчёт за квартал', mimeType: 'text/markdown',
    text: '# Отчёт за 2026-Q3\n\nВыручка выросла на 12% к Q2. Лидер роста — Поволжье.' },
  { uri: 'file:///project/config.json', name: 'config.json', title: 'Конфигурация проекта', mimeType: 'application/json',
    text: JSON.stringify({ env: 'staging', region: 'ru-central1' }) },
];
const TEMPLATES = [
  { uriTemplate: 'ledger://customers/{inn}', name: 'customer', title: 'Карточка клиента по ИНН', mimeType: 'application/json' },
];
const PROMPTS = [
  { name: 'sales_report', title: 'Отчёт по продажам', description: 'Отчёт по продажам региона за период',
    arguments: [{ name: 'region', description: 'Регион', required: true }, { name: 'period', description: 'Например, 2026-Q3', required: false }] },
  { name: 'reconciliation', title: 'Сверка с контрагентом', description: 'Сценарий сверки взаиморасчётов с клиентом',
    arguments: [{ name: 'inn', description: 'ИНН клиента', required: true }] },
];
const REGIONS = ['Поволжье', 'Северо-Запад', 'Сибирь', 'Урал', 'Центр', 'Юг', 'Дальний Восток'];

const CUSTOMERS = {
  '7700000001': { id: 'cst_4417', name: 'ООО «Ромашка»', contracts: [
    { id: 'Д-12', debt: 930500, overdue: 0 }, { id: 'Д-17', debt: 310000, overdue: 310000, days_overdue: 12 }] },
  '7700000002': { id: 'cst_5120', name: 'АО «Вектор»', contracts: [{ id: 'Д-31', debt: 0, overdue: 0 }] },
  '770000000312': { id: 'cst_6001', name: 'ИП Смирнов А. В.', contracts: [
    { id: 'Д-44', debt: 58200, overdue: 12000, days_overdue: 5 }] },
};
const byId = id => Object.values(CUSTOMERS).find(c => c.id === id);
const allContracts = () => Object.values(CUSTOMERS).flatMap(c => c.contracts);
const rub = n => n.toLocaleString('ru-RU') + ' ₽';

/* ── ответы ── */
const envelope = result => ({ ...result, _meta: { [M + 'serverInfo']: SERVER_INFO } });
const ok = (id, result) => ({ jsonrpc: '2.0', id, result: envelope({ resultType: 'complete', ...result }) });
const err = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const toolResult = (id, text, structured, isError = false) =>
  ok(id, { content: [{ type: 'text', text }], ...(structured !== undefined ? { structuredContent: structured } : {}), isError });

/* ── проверка аргументов по inputSchema (упрощённо) ── */
function validate(schema, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return 'arguments должен быть объектом';
  for (const r of schema.required || []) if (args[r] === undefined) return `не хватает обязательного аргумента «${r}»`;
  for (const [k, v] of Object.entries(args)) {
    const p = schema.properties?.[k];
    if (!p) { if (schema.additionalProperties === false) return `лишний аргумент «${k}»`; continue; }
    const t = Array.isArray(v) ? 'array' : typeof v;
    if (p.type === 'integer' ? !Number.isInteger(v) : p.type === 'number' ? t !== 'number' : t !== p.type) return `«${k}» должен быть типа ${p.type}`;
    if (p.enum && !p.enum.includes(v)) return `«${k}» должен быть одним из: ${p.enum.join(', ')}`;
    if (p.pattern && !new RegExp(p.pattern).test(v)) return `«${k}» не подходит под формат (${p.description || p.pattern})`;
    if (p.minimum !== undefined && v < p.minimum) return `«${k}» меньше ${p.minimum}`;
    if (p.maximum !== undefined && v > p.maximum) return `«${k}» больше ${p.maximum}`;
  }
  return null;
}

/* ── requestState: подпись HMAC, как требует спецификация для MRTR ── */
let keyP = null;
const key = () => (keyP ||= crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const stable = o => JSON.stringify(o, Object.keys(o || {}).sort());
async function seal(obj) {
  const body = b64u(enc.encode(JSON.stringify(obj)));
  const sig = await crypto.subtle.sign('HMAC', await key(), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}
async function unseal(s) {
  try {
    const [body, sig] = String(s).split('.');
    if (!body || !sig) return null;
    if (!(await crypto.subtle.verify('HMAC', await key(), fromB64u(sig), enc.encode(body)))) return null;
    return JSON.parse(new TextDecoder().decode(fromB64u(body)));
  } catch (e) { return null; }
}

/* ── инструменты ── */
async function callTool(id, params, meta, caps) {
  const tool = TOOLS.find(t => t.name === params.name);
  if (!tool) return [err(id, -32602, `Unknown tool: ${params.name}`)];
  const args = params.arguments ?? {};
  const bad = validate(tool.inputSchema, args);
  // ошибки валидации — это ошибки выполнения: модель увидит текст и сможет исправиться
  if (bad) return [toolResult(id, `Ошибка ввода: ${bad}.`, undefined, true)];

  switch (tool.name) {
    case 'get_customer_debt': {
      const c = CUSTOMERS[args.inn];
      if (!c) return [toolResult(id, `Клиент с ИНН ${args.inn} не найден. Проверьте ИНН или найдите клиента через find_customer.`, undefined, true)];
      const total = c.contracts.reduce((s, x) => s + x.debt, 0);
      const overdue = c.contracts.reduce((s, x) => s + x.overdue, 0);
      return [toolResult(id, `${c.name}: долг ${rub(total)}, из них просрочено ${rub(overdue)}.`,
        { customer: c.name, total_debt: total, overdue, contracts: c.contracts })];
    }
    case 'find_customer': {
      const c = CUSTOMERS[args.inn];
      if (!c) return [toolResult(id, `Клиент с ИНН ${args.inn} не найден.`, undefined, true)];
      return [toolResult(id, JSON.stringify({ customer_id: c.id, name: c.name }), { customer_id: c.id, name: c.name })];
    }
    case 'list_contracts': {
      const c = byId(args.customer_id);
      if (!c) return [toolResult(id, `Клиент ${args.customer_id} не найден. customer_id берётся из find_customer.`, undefined, true)];
      const ids = c.contracts.map(x => x.id);
      return [toolResult(id, JSON.stringify({ contract_ids: ids }), { contract_ids: ids })];
    }
    case 'calc_debt': {
      const list = allContracts().filter(x => args.contract_ids.includes(x.id));
      if (!list.length) return [toolResult(id, 'Договоры не найдены. contract_ids берутся из list_contracts.', undefined, true)];
      const total = list.reduce((s, x) => s + x.debt, 0);
      return [toolResult(id, `Задолженность по ${list.length} договорам: ${rub(total)}.`, { total_debt: total, contracts: list })];
    }
    case 'run_query': {
      if (!/^\s*select\b/i.test(args.sql)) return [toolResult(id, 'Разрешены только SELECT-запросы: инструмент работает в режиме «только чтение».', undefined, true)];
      const rows = [{ region: 'Поволжье', sum: 18400000 }, { region: 'Центр', sum: 15250000 }, { region: 'Урал', sum: 9100000 }].slice(0, args.limit ?? 1000);
      return [toolResult(id, JSON.stringify({ rows, rowCount: rows.length }), { rows, rowCount: rows.length })];
    }
    case 'export_orders': {
      const total = 120000;
      const out = [];
      if (meta.progressToken !== undefined) {
        for (const done of [40000, 80000, 120000]) {
          out.push({ jsonrpc: '2.0', method: 'notifications/progress',
            params: { progressToken: meta.progressToken, progress: done, total, message: `Выгружено ${done.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')} строк` } });
        }
      }
      out.push(toolResult(id, `Выгружено ${total.toLocaleString('ru-RU')} строк за ${args.year} год.`, { rows: total, file: `orders_${args.year}.csv` }));
      return out;
    }
    case 'build_quarterly_report':
      // сервер не поддерживает расширение Tasks — поэтому возвращает обычный результат, как и положено
      return [toolResult(id, `Отчёт за ${args.quarter} готов: выручка 42,75 млн ₽, 48 страниц.`, { quarter: args.quarter, revenue: 42750000, pages: 48 })];
    case 'search_issues': {
      const items = args.repo === 'acme/web' && (args.state ?? 'open') !== 'closed'
        ? [{ number: 812, title: 'Падает логин в Safari', url: 'https://github.com/acme/web/issues/812' },
           { number: 797, title: 'Дубли в корзине', url: 'https://github.com/acme/web/issues/797' }] : [];
      return [toolResult(id, JSON.stringify({ total: items.length, items }), { total: items.length, items })];
    }
    case 'get_weather': {
      const t = [...args.city].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 25 - 3;
      return [toolResult(id, `${args.city}: ${t > 0 ? '+' : ''}${t}°C, облачно`)];
    }
    case 'apply_migration':
      return applyMigration(id, params, args, caps);
  }
  return [err(id, -32603, 'Internal error')];
}

// Multi Round-Trip Request: без подтверждения человека миграция не выполняется
async function applyMigration(id, params, args, caps) {
  if (!caps.elicitation) {
    return [err(id, -32021, 'Missing required client capability: elicitation', { requiredCapabilities: { elicitation: { form: {} } } })];
  }
  if (!params.inputResponses) {
    const requestState = await seal({ tool: 'apply_migration', args: stable(args), exp: Date.now() + 10 * 60 * 1000 });
    return [{ jsonrpc: '2.0', id, result: envelope({
      resultType: 'input_required',
      inputRequests: {
        confirm: {
          method: 'elicitation/create',
          params: {
            mode: 'form',
            message: `Миграция ${args.migration} удалит таблицу legacy_orders (1,2 млн строк). Продолжить?`,
            requestedSchema: {
              type: 'object',
              properties: {
                approve: { type: 'boolean', title: 'Да, применить миграцию' },
                env: { type: 'string', title: 'Окружение', enum: ['staging', 'production'], default: 'staging' },
              },
              required: ['approve', 'env'],
            },
          },
        },
      },
      requestState,
    }) }];
  }
  const st = params.requestState ? await unseal(params.requestState) : null;
  if (!st || st.tool !== 'apply_migration' || st.args !== stable(args)) {
    return [err(id, -32602, 'Invalid requestState: подпись не сходится или состояние относится к другому запросу')];
  }
  if (st.exp < Date.now()) return [err(id, -32602, 'Invalid requestState: срок действия истёк')];
  const r = params.inputResponses.confirm;
  if (!r || r.action !== 'accept' || !r.content?.approve) {
    const why = r?.action === 'decline' ? 'пользователь отказался' : r?.action === 'cancel' ? 'пользователь закрыл форму' : 'нет подтверждения';
    return [toolResult(id, `Миграция не применена: ${why}.`, { applied: false }, true)];
  }
  return [toolResult(id, `Миграция ${args.migration} применена к ${r.content.env} за 4,2 с.`, { applied: true, env: r.content.env })];
}

/* ── обработчик ── */
export async function handle(msg) {
  if (Array.isArray(msg)) return [err(null, -32600, 'Invalid Request: пакетная отправка (batch) удалена из протокола')];
  if (!msg || typeof msg !== 'object') return [err(null, -32600, 'Invalid Request')];
  const hasId = Object.prototype.hasOwnProperty.call(msg, 'id');
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return hasId ? [err(msg.id ?? null, -32600, 'Invalid Request: нужны "jsonrpc": "2.0" и method')] : [];
  }
  if (!hasId) return []; // уведомление клиента: ответа нет (по HTTP — 202 Accepted)
  const id = msg.id;
  if (id === null || !(typeof id === 'string' || Number.isInteger(id))) return [err(null, -32600, 'Invalid Request: id должен быть строкой или целым числом')];

  const params = msg.params ?? {};
  const meta = params._meta ?? {};
  for (const k of ['protocolVersion', 'clientCapabilities']) {
    if (meta[M + k] === undefined) return [err(id, -32602, `Missing required _meta field: ${M}${k}`)];
  }
  const v = meta[M + 'protocolVersion'];
  if (!SUPPORTED.includes(v)) return [err(id, -32022, 'Unsupported protocol version', { supported: SUPPORTED, requested: v })];
  const caps = meta[M + 'clientCapabilities'] || {};
  if (params.cursor !== undefined && params.cursor !== '') return [err(id, -32602, 'Invalid cursor')];

  switch (msg.method) {
    case 'server/discover':
      return [ok(id, {
        supportedVersions: SUPPORTED,
        capabilities: { tools: { listChanged: false }, resources: {}, prompts: {}, completions: {} },
        instructions: 'Учебный сервер бухгалтерии: клиенты и задолженность, аналитика, отчёты. Данные вымышленные.',
        ttlMs: 3600000, cacheScope: 'public',
      })];
    case 'tools/list':
      return [ok(id, { tools: TOOLS, ttlMs: 300000, cacheScope: 'public' })];
    case 'tools/call':
      return callTool(id, params, meta, caps);
    case 'resources/list':
      return [ok(id, { resources: RESOURCES.map(({ text, ...r }) => r), ttlMs: 60000, cacheScope: 'public' })];
    case 'resources/templates/list':
      return [ok(id, { resourceTemplates: TEMPLATES, ttlMs: 300000, cacheScope: 'public' })];
    case 'resources/read': {
      const r = RESOURCES.find(x => x.uri === params.uri);
      const m = /^ledger:\/\/customers\/(\d+)$/.exec(params.uri || '');
      if (r) return [ok(id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.text }], ttlMs: 0, cacheScope: 'private' })];
      if (m && CUSTOMERS[m[1]]) {
        const c = CUSTOMERS[m[1]];
        return [ok(id, { contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify({ id: c.id, name: c.name, inn: m[1] }) }], ttlMs: 0, cacheScope: 'private' })];
      }
      return [err(id, -32602, `Resource not found: ${params.uri}`)];
    }
    case 'prompts/list':
      return [ok(id, { prompts: PROMPTS, ttlMs: 300000, cacheScope: 'public' })];
    case 'prompts/get': {
      const p = PROMPTS.find(x => x.name === params.name);
      if (!p) return [err(id, -32602, `Unknown prompt: ${params.name}`)];
      const a = params.arguments || {};
      const miss = p.arguments.find(x => x.required && !a[x.name]);
      if (miss) return [err(id, -32602, `Missing required argument: ${miss.name}`)];
      const text = p.name === 'sales_report'
        ? `Построй отчёт по продажам региона «${a.region}» за ${a.period || 'последний квартал'}: выручка, топ-10 клиентов, динамика.`
        : `Проведи сверку взаиморасчётов с клиентом ИНН ${a.inn}: сравни задолженность по договорам с актом сверки.`;
      return [ok(id, { description: p.description, messages: [{ role: 'user', content: { type: 'text', text } }] })];
    }
    case 'completion/complete': {
      const ref = params.ref || {};
      const arg = params.argument || {};
      let values = [];
      if (ref.type === 'ref/prompt' && ref.name === 'sales_report' && arg.name === 'region') {
        values = REGIONS.filter(r => r.toLowerCase().startsWith(String(arg.value || '').toLowerCase()));
      }
      return [ok(id, { completion: { values, total: values.length, hasMore: false } })];
    }
    case 'subscriptions/listen': {
      const want = params.notifications || {};
      const agreed = {};
      if (want.toolsListChanged) agreed.toolsListChanged = true;
      if (Array.isArray(want.resourceSubscriptions)) agreed.resourceSubscriptions = want.resourceSubscriptions.filter(u => RESOURCES.some(r => r.uri === u));
      return [
        { jsonrpc: '2.0', method: 'notifications/subscriptions/acknowledged', params: { _meta: { [M + 'subscriptionId']: id }, notifications: agreed } },
        ok(id, {}), // учебный сервер сразу закрывает поток подписки
      ];
    }
    default:
      return [err(id, -32601, `Method not found: ${msg.method}`)];
  }
}
