const database = new Promise((resolve, reject) => {
  const open = indexedDB.open('agyh-rectification-demo', 1);
  open.onupgradeneeded = () => open.result.createObjectStore('data');
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => reject(open.error);
});

let seed;
function loadSeed() {
  seed ??= fetch('./demo.json').then(response => {
    if (!response.ok) throw new Error('读取演示数据失败。');
    return response.json();
  });
  return seed;
}

function requireRule(condition, message) {
  if (!condition) throw new Error(message);
}

export function applyAction(snapshot, { action, ids, versions, actor, note = '', result, reviewers, photos }) {
  const expected = { fix: '待整改', measure: '待整改', review: '待复查', assign: '待复查', remind: '待整改' };
  const time = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  for (const id of ids) {
    const record = snapshot.records.find(item => item.id === id);
    requireRule(record && record.version === versions[id], '该隐患已更新，请重新打开。');
    if (action === 'delete') {
      snapshot.records = snapshot.records.filter(item => item.id !== id);
      continue;
    }
    requireRule(record.status === expected[action], '该隐患当前状态不支持此操作。');
    if (action === 'remind') {
      requireRule(!record.history.some(entry => entry.title.startsWith('提交整改') || entry.title === '复查不通过'), '仅待整改的隐患可以催促。');
    } else {
      const responsible = ['fix', 'measure'].includes(action) ? record.rectifier === actor : record.reviewers.includes(actor);
      requireRule(responsible, '只有该隐患对应的责任人可以执行此操作。');
    }
    const limit = { fix: 100, measure: 200, review: 500 }[action];
    if (limit) requireRule(note.trim() && note.length <= limit, '请填写说明并检查字数。');
    if (action === 'fix' || action === 'assign') {
      requireRule(reviewers.length && reviewers.every(personId => snapshot.people.some(person => person.id === personId)), '请选择验收人员。');
      record.reviewers = reviewers;
    }
    let description = note;
    let title = { remind: '催促整改', measure: '新增临时安全措施', assign: '重新指派验收人员' }[action];
    if (action === 'fix') {
      requireRule(photos.length && ['是', '否'].includes(result), '请上传照片并选择是否解决。');
      record.status = result === '是' ? '待复查' : '待整改';
      title = result === '是' ? '提交整改 · 已解决' : '提交整改 · 未解决';
    } else if (action === 'review') {
      requireRule(['通过', '不通过'].includes(result), '请选择复查结果。');
      record.status = result === '通过' ? '已复查' : '待整改';
      title = '复查' + result;
    } else if (action === 'assign') {
      description = snapshot.people.filter(person => reviewers.includes(person.id)).map(person => person.name).join('、');
    } else if (action === 'remind') {
      description = '已记录整改催促。';
    }
    record.version++;
    record.history.push({ title, note: description, photos, time });
  }
}

export async function request(options) {
  const [db, initial] = await Promise.all([database, loadSeed()]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', options ? 'readwrite' : 'readonly');
    const store = tx.objectStore('data');
    const get = store.get('snapshot');
    let snapshot;
    let failure;
    get.onsuccess = () => {
      snapshot = get.result ?? structuredClone(initial);
      if (!options) return;
      try {
        applyAction(snapshot, JSON.parse(options.body));
        store.put(snapshot, 'snapshot');
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(snapshot);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('无法保存演示数据。'));
  });
}
