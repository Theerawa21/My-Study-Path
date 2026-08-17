(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = {};
  let existing = null;
  let loadedStudentId = '';

  const labels = {
    likedSubjects: 'วิชาที่ฉันชอบ',
    goodSubjects: 'วิชาที่ฉันทำได้ดี',
    interests: 'กิจกรรมหรือเรื่องที่ฉันสนใจ',
    strengths: 'จุดเด่นของฉัน',
    factors: 'ปัจจัยที่มีผลต่อการเลือกเส้นทางเรียนต่อ',
    advisors: 'ผู้ที่ฉันปรึกษาเกี่ยวกับการเรียนต่อ',
    infoNeeded: 'ข้อมูลที่ฉันต้องการเพิ่มเติม'
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function extractOther(value) {
    const values = Array.isArray(value) ? value : (value ? [value] : []);
    const item = values.find(v => String(v).trim().startsWith('อื่น ๆ:'));
    return item ? String(item).replace(/^อื่น ๆ:\s*/, '').trim() : '';
  }

  function jsonpStudent(studentId) {
    const api = String(window.MY_STUDY_PATH_CONFIG?.API_URL || '').trim();
    if (!api || !studentId) return Promise.resolve(null);
    return new Promise(resolve => {
      const cb = '__msp_enh_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const url = new URL(api);
      url.searchParams.set('action','student');
      url.searchParams.set('studentId',studentId);
      url.searchParams.set('callback',cb);
      const timer = setTimeout(() => cleanup(null), 8000);
      function cleanup(data) {
        clearTimeout(timer);
        try { delete window[cb]; } catch (_) {}
        script.remove();
        resolve(data);
      }
      window[cb] = data => cleanup(data?.student?.existing || null);
      script.onerror = () => cleanup(null);
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function ensureExisting() {
    const studentView = $('studentView');
    const id = $('studentId')?.value.trim() || '';
    if (!studentView || studentView.classList.contains('hidden') || !id) return;
    if (loadedStudentId === id) return;
    loadedStudentId = id;
    existing = await jsonpStudent(id);
    hydrateStateFromExisting();
    enhanceCurrentStep();
  }

  function hydrateStateFromExisting() {
    if (!existing) return;
    Object.keys(labels).forEach(name => {
      const detail = extractOther(existing[name]);
      if (detail && !state[name]) state[name] = detail;
    });
    [1,2,3].forEach(n => {
      const raw = String(existing[`plan${n}`] || '').trim();
      if (raw.startsWith('อื่น ๆ:')) state[`plan${n}`] = raw.replace(/^อื่น ๆ:\s*/, '').trim();
    });
  }

  function makeOtherBox(key, label, detail='') {
    const wrap = document.createElement('div');
    wrap.className = 'field other-specify msp-other-box';
    wrap.dataset.otherKey = key;
    wrap.innerHTML = `<label for="mspOther_${esc(key)}">โปรดระบุ “อื่น ๆ”</label><input id="mspOther_${esc(key)}" class="input" value="${esc(detail)}" placeholder="พิมพ์รายละเอียดเพิ่มเติม" />`;
    const input = wrap.querySelector('input');
    input.addEventListener('input', () => {
      state[key] = input.value.trim();
      syncGroupValue(key);
    });
    return wrap;
  }

  function enhanceChipGroup(group) {
    const key = group.dataset.group;
    if (!key || !labels[key]) return;
    let other = [...group.querySelectorAll('input[type="checkbox"]')].find(i => i.value === 'อื่น ๆ' || i.dataset.otherChoice === '1' || String(i.value).startsWith('อื่น ๆ:'));
    if (!other) return;
    other.dataset.otherChoice = '1';

    const fetched = state[key] || extractOther(existing?.[key]);
    if (fetched) {
      state[key] = fetched;
      other.checked = true;
      other.value = `อื่น ๆ: ${fetched}`;
    }

    const parent = group.parentElement;
    let box = parent.querySelector(`.msp-other-box[data-other-key="${key}"]`);
    if (!box) {
      box = makeOtherBox(key, labels[key], state[key] || '');
      parent.appendChild(box);
    }
    box.classList.toggle('hidden', !other.checked);

    if (!other.dataset.enhancedOther) {
      other.dataset.enhancedOther = '1';
      other.addEventListener('change', () => {
        box.classList.toggle('hidden', !other.checked);
        if (other.checked) {
          other.value = state[key] ? `อื่น ๆ: ${state[key]}` : 'อื่น ๆ';
          setTimeout(() => box.querySelector('input')?.focus(), 30);
        } else {
          other.value = 'อื่น ๆ';
        }
      });
    }
  }

  function syncGroupValue(key) {
    const group = document.querySelector(`[data-group="${key}"]`);
    if (!group) return;
    const other = [...group.querySelectorAll('input[type="checkbox"]')].find(i => i.dataset.otherChoice === '1' || i.value === 'อื่น ๆ' || String(i.value).startsWith('อื่น ๆ:'));
    if (!other) return;
    const detail = String(state[key] || '').trim();
    other.value = detail ? `อื่น ๆ: ${detail}` : 'อื่น ๆ';
  }

  function enhancePlan(n) {
    const input = $(`plan${n}`);
    if (!input) return;
    const key = `plan${n}`;
    let raw = input.value.trim();
    if (raw.startsWith('อื่น ๆ:')) {
      state[key] = raw.replace(/^อื่น ๆ:\s*/, '').trim();
      input.value = 'อื่น ๆ';
      raw = 'อื่น ๆ';
    } else if (!state[key] && existing) {
      const saved = String(existing[key] || '').trim();
      if (saved.startsWith('อื่น ๆ:')) {
        state[key] = saved.replace(/^อื่น ๆ:\s*/, '').trim();
        input.value = 'อื่น ๆ';
        raw = 'อื่น ๆ';
      }
    }

    const field = input.closest('.field');
    let box = field?.querySelector(`.msp-other-box[data-other-key="${key}"]`);
    if (!box && field) {
      box = makeOtherBox(key, `แผน/สาขาอันดับ ${n}`, state[key] || '');
      field.appendChild(box);
    }
    if (box) box.classList.toggle('hidden', raw !== 'อื่น ๆ');

    if (!input.dataset.enhancedOther) {
      input.dataset.enhancedOther = '1';
      const toggle = () => {
        const isOther = input.value.trim() === 'อื่น ๆ' || input.value.trim().startsWith('อื่น ๆ:');
        if (box) box.classList.toggle('hidden', !isOther);
        if (isOther && input.value.trim().startsWith('อื่น ๆ:')) {
          state[key] = input.value.trim().replace(/^อื่น ๆ:\s*/, '');
          input.value = 'อื่น ๆ';
          if (box) box.querySelector('input').value = state[key];
        }
      };
      input.addEventListener('input', toggle);
      input.addEventListener('change', toggle);
    }
  }

  function enhancePathway() {
    const otherPath = $('otherPath');
    if (!otherPath) return;
    const box = $('otherPathBox');
    if (box) box.classList.add('other-specify');
  }

  function enhanceCurrentStep() {
    document.querySelectorAll('[data-group]').forEach(enhanceChipGroup);
    [1,2,3].forEach(enhancePlan);
    enhancePathway();
  }

  function prepareValues() {
    Object.keys(labels).forEach(syncGroupValue);
    [1,2,3].forEach(n => {
      const input = $(`plan${n}`);
      if (!input) return;
      if (input.value.trim() === 'อื่น ๆ') {
        const detail = String(state[`plan${n}`] || '').trim();
        if (detail) input.value = `อื่น ๆ: ${detail}`;
      }
    });
  }

  function restorePlanLabelsSoon() {
    setTimeout(() => [1,2,3].forEach(n => {
      const input = $(`plan${n}`);
      if (input && input.value.trim().startsWith('อื่น ๆ:')) {
        state[`plan${n}`] = input.value.trim().replace(/^อื่น ๆ:\s*/, '');
        input.value = 'อื่น ๆ';
      }
    }), 0);
  }

  function validationError() {
    for (const key of Object.keys(labels)) {
      const group = document.querySelector(`[data-group="${key}"]`);
      if (!group) continue;
      const other = [...group.querySelectorAll('input[type="checkbox"]')].find(i => i.dataset.otherChoice === '1' || i.value === 'อื่น ๆ' || String(i.value).startsWith('อื่น ๆ:'));
      if (other?.checked && !String(state[key] || '').trim()) return `กรุณาระบุ “อื่น ๆ” ในหัวข้อ ${labels[key]}`;
    }

    const pathOther = document.querySelector('input[name="pathway"][value="อื่น ๆ"]:checked');
    if (pathOther && !$('otherPath')?.value.trim()) return 'กรุณาระบุเส้นทางอื่นที่สนใจ';

    for (const n of [1,2,3]) {
      const input = $(`plan${n}`);
      if (input?.value.trim() === 'อื่น ๆ' && !String(state[`plan${n}`] || '').trim()) return `กรุณาระบุ “อื่น ๆ” ของแผน/สาขาอันดับ ${n}`;
    }
    return '';
  }

  function showValidation(text) {
    const el = $('wizardMessage');
    if (el) {
      el.textContent = text;
      el.style.color = 'var(--bad)';
      el.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }

  function captureAction(event, requireComplete) {
    enhanceCurrentStep();
    if (requireComplete) {
      const error = validationError();
      if (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showValidation(error);
        return;
      }
    }
    prepareValues();
    restorePlanLabelsSoon();
  }

  function bindActions() {
    $('nextBtn')?.addEventListener('click', e => captureAction(e, true), true);
    $('saveDraftBtn')?.addEventListener('click', e => captureAction(e, true), true);
    $('prevBtn')?.addEventListener('click', e => captureAction(e, false), true);
  }

  const observer = new MutationObserver(() => {
    enhanceCurrentStep();
    ensureExisting();
  });

  if ($('stepContent')) observer.observe($('stepContent'), {childList:true,subtree:true});
  if ($('studentView')) observer.observe($('studentView'), {attributes:true,attributeFilter:['class']});
  bindActions();
  enhanceCurrentStep();
  ensureExisting();
})();
