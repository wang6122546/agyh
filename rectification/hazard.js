import { request } from './demo-store.js';
const $ = (selector) => document.querySelector(selector);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const stages = { fix: ['隐患数量', '已整改', '整改中', '待整改'], review: ['待复查', '已复查'] };
const titles = { fix: '隐患整改', measure: '新增临时安全措施', assign: '重新指派验收人员', review: '隐患复查', detail: '隐患详情', remind: '催促整改', delete: '删除隐患' };
const editor = $('#editor');
const filters = $('#filters');
const records = $('#records');
const chosen = new Set();
const stage = location.pathname.endsWith('/hazard-review.html') ? 'review' : 'fix';
const pageName = titles[stage];
const currentActor = '0';
let reviewScope = 'mine';
const owner = record => record.rectifier ?? (record.id.endsWith('-004') ? '1' : '0');
const canAct = record => stage === 'review' ? record.reviewers.includes(currentActor) : owner(record) === currentActor;
$('#pageName').textContent = pageName;
$('#' + stage + 'Menu').setAttribute('aria-current', 'page');
document.title = pageName + ' · 安全生产鞍钢项目';
let statusIndex = 0;
let criteria = {};
let state;
let saving = false;
let sequence = 0;
let noticeTimer;

async function refresh() {
  if (saving) return;
  const id = ++sequence;
  try {
    const next = await request();
    if (id !== sequence) return;
    $('#connection').textContent = '演示数据 · 保存在当前浏览器';
    if (!state) filters.elements.unit.insertAdjacentHTML('beforeend', next.units.map(unit => '<option>' + safe(unit) + '</option>').join(''));
    if (state && next.records.length === state.records.length && next.records.every((record, index) => record.id === state.records[index].id && record.version === state.records[index].version)) return;
    state = next;
    render();
  } catch {
    if (id !== sequence) return;
    $('#connection').textContent = '演示数据暂不可用';
    if (!state) records.innerHTML = '<p class="empty">无法读取演示数据，请刷新后重试。</p>';
  }
}

function rectifyStatus(record) {
  if (record.status !== '待整改') return '已整改';
  return record.history.some(entry => entry.title.startsWith('提交整改') || entry.title === '复查不通过')
    ? '整改中' : '待整改';
}

function render() {
  if (!state) return;
  const review = stage === 'review';
  const names = stages[stage];
  const scoped = state.records.filter(record => !review || reviewScope === 'all' || canAct(record));
  const groups = names.map((status, index) => !review && index === 0 ? scoped : scoped.filter(record =>
    (review ? record.status : rectifyStatus(record)) === status));
  renderUnits();
  $('#summary').innerHTML = names.map((name, index) =>
    `<button class="metric" data-status="${index}" aria-pressed="${index === statusIndex}">${name}<strong>${groups[index].length}</strong></button>`).join('');
  const visible = groups[statusIndex].filter(record =>
    (!criteria.unit || record.unit === criteria.unit) &&
    (!criteria.level || record.level === criteria.level) &&
    (!criteria.keyword || [record.title, record.location, record.category].some(value => value.toLowerCase().includes(criteria.keyword))));
  const pending = review && statusIndex === 0;
  const available = new Set(visible.filter(canAct).map(record => record.id));
  for (const id of chosen) if (!pending || !available.has(id)) chosen.delete(id);
  $('#listTitle').textContent = names[statusIndex];
  $('#total').textContent = `共 ${visible.length} 条`;
  $('#batch').hidden = !pending || !available.size;
  updateBatch();

  const rows = visible.map((record, index) => {
    const mayAct = canAct(record);
    const action = (name, label, style = '', disabled = false) =>
      `<button class="${style}" data-id="${record.id}" data-action="${name}" ${disabled ? "disabled" : ""}>${label}</button>`;
    const status = review ? record.status : rectifyStatus(record);
    const actions = action('detail', '详情') +
      (review ? '' : action('remind', '催促', '', status !== '待整改') + action('delete', '删除', 'danger')) +
      (pending && mayAct ? action('assign', '重新指派', 'orange') + action('review', '验收审核', 'primary') :
        !review && record.status === '待整改' && mayAct ? action('measure', '新增安全措施') + action('fix', '整改', 'primary') : '');
    const reviewers = state.people.filter(person => record.reviewers.includes(person.id)).map(person => person.name).join('、');
    return `<tr>
      <td>${index + 1}</td>
      <td>${pending && mayAct ? `<input type="checkbox" data-select="${record.id}" aria-label="选择${safe(record.title)}" ${chosen.has(record.id) ? 'checked' : ''}>` : ''}
        <strong>${safe(record.title)}</strong><small>${record.id}</small></td>
      <td data-label="隐患位置">${safe(record.location)}<small>${safe(record.category)}</small></td>
      <td data-label="等级"><span class="pill level">${safe(record.level)}</span></td>
      <td data-label="单位">${safe(record.unit)}<small>检查人 · ${safe(record.inspector)}</small></td>
      <td data-label="接收时间">${safe(record.received)}</td>
      <td data-label="${review ? '验收人员' : '整改人'}">${safe(review ? reviewers : state.people.find(person => person.id === owner(record))?.name)}</td>
      <td data-label="状态"><span class="pill ${['已整改', '已复查'].includes(status) ? 'done' : ''}">${status}</span></td>
      <td><div class="row-actions">${actions}</div></td></tr>`;
  });
  records.innerHTML = rows.length ? `<table><thead><tr>${['序号', '隐患描述 / 编号', '隐患位置 / 类型', '等级', '单位 / 检查人', '接收时间', review ? '验收人员' : '整改人', '状态', '操作'].map(name => '<th>' + name + '</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` :
    '<p class="empty">暂无符合条件的隐患</p>';
}

function updateBatch() {
  $('#batch').disabled = !chosen.size;
  $('#batch').textContent = chosen.size ? `批量复查（${chosen.size}）` : '批量复查';
}

const required = '<span class="required" aria-hidden="true">*</span>';
const noteField = (label, limit) => `<label><span>${required} ${label}</span><textarea name="note" placeholder="请输入${label}" maxlength="${limit}" required></textarea><span class="count">0/${limit}</span></label>`;
const photoField = (mandatory) => `<div><label><span>${mandatory ? required : ''} 现场照片</span><input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple ${mandatory ? 'required' : ''}></label><div class="photos" id="previews"></div></div>`;
const imageMarkup = (photos) => photos.map((url, index) => `<a href="${safe(url)}" download="现场照片-${index + 1}"><img src="${safe(url)}" alt="现场照片 ${index + 1}"></a>`).join('');
const context = (record) => `<div class="context"><h3>${safe(record.title)}</h3><p>${record.id} · ${safe(record.level)} · ${safe(record.status)}</p><p>${safe(record.unit)} / ${safe(record.location)}</p></div>`;
const historyMarkup = (record) => record.history.length ? `<ol class="history">${[...record.history].reverse().map(entry =>
  `<li><strong>${safe(entry.title)}</strong>　<small>${safe(entry.time)}</small><div>${safe(entry.note)}</div><div class="photos">${imageMarkup(entry.photos)}</div></li>`).join('')}</ol>` : '<p class="hint">暂无处理记录</p>';

function personPicker(record) {
  const selected = new Set(record.reviewers);
  const unit = $('#personUnit');
  const search = $('#personSearch');
  function showPeople() {
    const matches = state.people.filter(person => (!unit.value || person.unit === unit.value) && person.name.includes(search.value.trim()));
    $('#people').innerHTML = matches.map(person =>
      `<label><input type="checkbox" value="${person.id}" ${selected.has(person.id) ? 'checked' : ''}>${safe(person.name)}<small>${safe(person.phone)}</small></label>`).join('') || '<p class="hint">暂无匹配人员</p>';
    $('#picked').innerHTML = state.people.filter(person => selected.has(person.id)).map(person =>
      `<span>${safe(person.name)} <button type="button" data-remove="${person.id}" aria-label="移除${safe(person.name)}">×</button></span>`).join('') || '请选择人员';
  }
  unit.onchange = search.oninput = showPeople;
  $('#people').onchange = (event) => {
    const input = event.target;
    if (input.checked) selected.add(input.value);
    else selected.delete(input.value);
    showPeople();
    $('#people').querySelector(`[value="${input.value}"]`)?.focus();
  };
  $('#picked').onclick = (event) => {
    const id = event.target.dataset.remove;
    if (id === undefined) return;
    selected.delete(id);
    showPeople();
    search.focus();
  };
  showPeople();
  return selected;
}

const picker = `<fieldset><legend>${required} 隐患验收人员</legend>
  <label>组织架构<select id="personUnit"><option value="">全部组织</option></select></label>
  <label>选择人员<input id="personSearch" type="search" placeholder="按人员姓名搜索"></label>
  <div id="people" class="people"></div><div class="chips" id="picked"></div></fieldset>`;

const assignmentPicker = `
  <div class="selected-people"><span>已选人员</span><div id="picked" class="chips"></div></div>
  <div class="picker-grid">
    <section class="picker-units" aria-label="人员来源">
      <input id="pickerOrgSearch" type="search" placeholder="搜索组织" aria-label="搜索组织">
      <div class="picker-tabs" aria-label="人员类型">
        <button type="button" data-source="org" aria-pressed="true">组织架构</button>
        <button type="button" data-source="tenant" aria-pressed="false">承租方</button>
        <button type="button" data-source="related" aria-pressed="false">相关方</button>
      </div>
      <div id="pickerUnits"></div>
    </section>
    <section class="picker-results" aria-label="人员列表">
      <input id="personSearch" type="search" placeholder="搜索姓名、账号或手机号" aria-label="搜索人员" autofocus>
      <div class="picker-table"><table>
        <thead><tr><th><input id="selectPeople" type="checkbox" aria-label="全选当前列表"></th><th>姓名</th><th>单位名称</th><th>账号</th><th>手机号</th><th>岗位</th></tr></thead>
        <tbody id="people"></tbody>
      </table></div>
      <div id="pickerCount" role="status"></div>
    </section>
  </div>`;

function selectReviewers(record) {
  const selected = new Set(record.reviewers);
  const search = $('#personSearch');
  const orgSearch = $('#pickerOrgSearch');
  const units = $('#pickerUnits');
  const people = $('#people');
  const all = $('#selectPeople');
  let source = 'org';
  let unit = '';
  let matches = [];

  function showUnits() {
    const available = source === 'org' ? state.units : [...new Set(state.people
      .filter(person => person.source === source).map(person => person.unit))];
    const keyword = orgSearch.value.trim();
    units.innerHTML = ['', ...available.filter(name => name.includes(keyword))].map(name =>
      `<button type="button" data-unit="${safe(name)}" aria-pressed="${unit === name}">${safe(name || '全部单位')}</button>`).join('');
  }

  function showPeople() {
    const keyword = search.value.trim().toLowerCase();
    matches = state.people.filter(person => (person.source ?? 'org') === source &&
      (!unit || person.unit === unit) &&
      [person.name, person.account, person.phone].some(value => value?.toLowerCase().includes(keyword)));
    people.innerHTML = matches.map(person => `<tr><td><input type="checkbox" value="${safe(person.id)}"
      aria-label="选择${safe(person.name)}" ${selected.has(person.id) ? 'checked' : ''}></td>
      ${[person.name, person.unit, person.account, person.phone, person.position].map(value =>
        `<td>${safe(value || '—')}</td>`).join('')}</tr>`).join('') ||
      '<tr><td colspan="6" class="empty">暂无匹配人员</td></tr>';
    const count = matches.filter(person => selected.has(person.id)).length;
    all.checked = count > 0 && count === matches.length;
    all.indeterminate = count > 0 && count < matches.length;
    all.disabled = !matches.length;
    $('#pickerCount').textContent = `共 ${matches.length} 条`;
    $('#picked').innerHTML = state.people.filter(person => selected.has(person.id)).map(person =>
      `<span>${safe(person.name)} <button type="button" data-remove="${safe(person.id)}" aria-label="移除${safe(person.name)}">×</button></span>`).join('') || '请选择人员';
  }

  function toggle(id, checked) {
    if (checked) selected.add(id);
    else selected.delete(id);
  }

  $('.picker-tabs').onclick = (event) => {
    const tab = event.target.closest('[data-source]');
    if (!tab) return;
    source = tab.dataset.source;
    unit = '';
    for (const button of $('.picker-tabs').children) button.setAttribute('aria-pressed', button === tab);
    showUnits();
    showPeople();
  };
  units.onclick = (event) => {
    const button = event.target.closest('[data-unit]');
    if (!button) return;
    unit = button.dataset.unit;
    showUnits();
    showPeople();
    [...units.children].find(item => item.dataset.unit === unit)?.focus();
  };
  people.onchange = (event) => {
    const { value, checked } = event.target;
    toggle(value, checked);
    showPeople();
    [...people.querySelectorAll('input')].find(input => input.value === value)?.focus();
  };
  all.onchange = () => {
    const checked = all.checked;
    for (const person of matches) toggle(person.id, checked);
    showPeople();
  };
  $('#picked').onclick = (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    selected.delete(button.dataset.remove);
    showPeople();
    search.focus();
  };
  orgSearch.oninput = showUnits;
  search.oninput = showPeople;
  showUnits();
  showPeople();
  return selected;
}

function open(action, items) {
  const [record] = items;
  if (!record) return;
  if (action === 'remind' || action === 'delete') {
    if (stage !== 'fix' || (action === 'remind' && rectifyStatus(record) !== '待整改')) return;
  } else if (action !== 'detail' && !items.every(canAct)) return;
  const assigning = action === 'assign';
  editor.classList.toggle('assignment-dialog', assigning);
  const batch = items.length > 1;
  const heading = batch ? '批量复查' : titles[action];
  const fields = {
    detail: '',
    remind: '<p>确认催促该隐患的整改人处理？</p>',
    delete: '<p>确认删除这条隐患？删除后将从整改和复查列表移除。</p>',
    measure: noteField('临时安全措施', 200),
    assign: assignmentPicker,
    fix: noteField('整改描述', 100) + photoField(true) + `<fieldset><legend>${required} 隐患是否解决</legend>
      <div class="chips"><label><span><input type="radio" name="result" value="是" required> 是</span></label><label><span><input type="radio" name="result" value="否"> 否</span></label></div></fieldset>` + picker,
    review: `<label><span>${required} 复查结果</span><select name="result" required><option value="">请选择</option><option>通过</option><option>不通过</option></select></label>` + noteField('复查说明', 500) + photoField(false),
  }[action];
  $('#dialogBody').innerHTML = `<div class="dialog-heading"><h2 id="dialogTitle">${heading}</h2><button type="button" data-close aria-label="关闭">×</button></div>
    <div class="drawer-body">${batch ? `<div class="context">已选 ${items.length} 条隐患<ul>${items.map(item => '<li>' + safe(item.title) + '</li>').join('')}</ul></div>` : assigning ? '' : context(record)}
    ${action === 'detail' ? '<h3 style="margin-top:16px">处理记录</h3>' + historyMarkup(record) : `<form id="operation">
      ${fields}<div id="error" class="error" role="alert"></div>
      <div class="actions"><button type="button" data-close>${assigning ? '关闭' : '取消'}</button><button type="submit" class="${action === 'delete' ? 'danger' : 'primary'}">${{ assign: '确认', remind: '确认催促', delete: '确认删除' }[action] ?? '提交'}</button></div>
    </form>`}</div>`;
  editor.showModal();
  if (action === 'detail') return;
  const form = $('#operation');
  let selected;
  if (assigning) selected = selectReviewers(record);
  if ($('#personUnit')) {
    $('#personUnit').insertAdjacentHTML('beforeend', state.units.map(unit => '<option>' + safe(unit) + '</option>').join(''));
    $('#personUnit').value = record.unit;
    selected = personPicker(record);
  }
  const note = form.elements.note;
  if (note) note.oninput = () => { $('.count').textContent = `${note.value.length}/${note.maxLength}`; };
  const input = form.elements.photos;
  if (assigning) form.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.type === 'search') event.preventDefault();
  });
  let previews = [];
  if (input) input.onchange = () => {
    previews.forEach(url => URL.revokeObjectURL(url));
    previews = [...input.files].map(file => URL.createObjectURL(file));
    $('#previews').innerHTML = imageMarkup(previews);
  };
  editor.addEventListener('close', () => previews.forEach(url => URL.revokeObjectURL(url)), { once: true });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const message = $('#error');
    message.textContent = '';
    const files = [...(input?.files ?? [])];
    if (files.reduce((total, file) => total + file.size, 0) > 10_000_000) {
      message.textContent = '现场照片合计请控制在 10 MB 内。';
      return;
    }
    if (selected && !selected.size) {
      message.textContent = '请选择至少一名验收人员。';
      return;
    }
    const payload = {
      action, actor: currentActor, ids: items.map(item => item.id), versions: Object.fromEntries(items.map(item => [item.id, item.version])),
      note: note?.value.trim(), result: new FormData(form).get('result'), reviewers: [...(selected ?? [])],
    };
    saving = true;
    ++sequence;
    const submit = form.querySelector('[type=submit], button.primary');
    submit.disabled = true;
    try {
      payload.photos = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取照片失败。'));
        reader.readAsDataURL(file);
      })));
      state = await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      chosen.clear();
      editor.close();
      render();
      $('#notice').textContent = ({ remind: '已记录催促', delete: '隐患已删除' })[action] ?? '已保存';
      $('#notice').hidden = false;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 3000);
    } catch (error) {
      message.textContent = error.message || '保存失败，请重试。';
    } finally {
      saving = false;
      submit.disabled = false;
    }
  };
}

function renderUnits() {
  const keyword = $('#orgSearch').value.trim();
  const units = ['', ...state.units].filter(unit => !unit || unit.includes(keyword));
  $('#orgList').innerHTML = units.map(unit =>
    `<button data-unit="${safe(unit)}" aria-pressed="${unit === (criteria.unit || '')}">${safe(unit || '全部单位')}</button>`).join('');
}

$('#orgSearch').oninput = () => { if (state) renderUnits(); };
$('#orgList').onclick = (event) => {
  const button = event.target.closest('[data-unit]');
  if (!button) return;
  filters.elements.unit.value = button.dataset.unit;
  criteria.unit = button.dataset.unit;
  render();
};
$('#summary').onclick = (event) => {
  const metric = event.target.closest('[data-status]');
  if (!metric) return;
  statusIndex = Number(metric.dataset.status);
  render();
};
const scopeTabs = $('#scope');
if (scopeTabs) {
  const tabs = [...scopeTabs.querySelectorAll('[role=tab]')];
  function activateScope(tab) {
    if (reviewScope === tab.dataset.scope) return;
    reviewScope = tab.dataset.scope;
    chosen.clear();
    for (const item of tabs) {
      item.setAttribute('aria-selected', item === tab);
      item.tabIndex = item === tab ? 0 : -1;
    }
    $('#reviewPanel').setAttribute('aria-labelledby', tab.id);
    render();
  }
  scopeTabs.onclick = (event) => {
    const tab = event.target.closest('[role=tab]');
    if (tab) activateScope(tab);
  };
  scopeTabs.onkeydown = (event) => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const next = { ArrowLeft: 1 - index, ArrowRight: 1 - index, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].focus();
    activateScope(tabs[next]);
  };
}
filters.onsubmit = (event) => {
  event.preventDefault();
  criteria = Object.fromEntries(new FormData(filters));
  criteria.keyword = criteria.keyword.trim().toLowerCase();
  render();
};
filters.onreset = () => { criteria = {}; render(); };
records.onchange = (event) => {
  if (!event.target.dataset.select) return;
  if (event.target.checked) chosen.add(event.target.dataset.select);
  else chosen.delete(event.target.dataset.select);
  updateBatch();
};
records.onclick = (event) => {
  const button = event.target.closest('[data-action]');
  if (button) open(button.dataset.action, state.records.filter(record => record.id === button.dataset.id));
};
$('#batch').onclick = () => open('review', state.records.filter(record => chosen.has(record.id) && canAct(record)));
editor.onclick = (event) => { if (event.target.closest('[data-close]') && !saving) editor.close(); };
editor.oncancel = (event) => { if (saving) event.preventDefault(); };
refresh();
setInterval(refresh, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
