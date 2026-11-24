/*!
 * Multi-Step Form for Webflow · attribute-driven
 * https://github.com/n13media/n13-webflow-scripts/tree/main/multistep-form
 */
(function () {
  'use strict';
  if (window.MultiStepForm) return; // already loaded (e.g. embed placed twice)

  /* ---------- Default messages (German site) — change here if needed ---------- */
  var MESSAGES = {
    required: 'Bitte fülle dieses Feld aus.',
    email: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    match: 'Die Eingaben stimmen nicht überein.',
    minChecked: 'Bitte wähle mindestens {n} Option(en) aus.',
    maxChecked: 'Bitte wähle höchstens {n} Option(en) aus.'
  };
  // Per-site override, e.g. <script>window.MSF_MESSAGES = { required: 'Please fill in this field.' }</script>
  if (window.MSF_MESSAGES) for (var k in window.MSF_MESSAGES) MESSAGES[k] = window.MSF_MESSAGES[k];

  var FIELD_SEL = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var uid = 0;

  function qsa(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function fieldsIn(el) { return qsa(el, FIELD_SEL).filter(function (f) { return !f.closest('[data-msf-ignore]'); }); }
  function isCheck(el) { return el.type === 'checkbox' || el.type === 'radio'; }
  function attr(el, wrap, name) { return el.getAttribute(name) || (wrap && wrap.getAttribute(name)) || ''; }

  /* ---------- Where errors go ---------- */
  function getWrap(el) {
    var w = el.closest('[data-msf="field"]');
    if (w) return w;
    if (el.type === 'radio') return el.closest('[data-msf="group"], fieldset') || el.closest('label') || el.parentElement;
    if (el.type === 'checkbox') return el.closest('label') || el.parentElement;
    return el.parentElement;
  }

  function setError(wrap, msg) {
    var err = wrap.querySelector('[data-msf="error"]') || wrap.querySelector(':scope > .msf_error');
    if (!err && !msg) { wrap.classList.remove('is-invalid'); return; }
    if (!err) {
      err = document.createElement('div');
      err.className = 'msf_error';
      wrap.appendChild(err);
    }
    if (!err.id) err.id = 'msf-err-' + (++uid);
    err.setAttribute('aria-live', 'polite');
    err.textContent = msg || '';
    err.hidden = !msg;
    wrap.classList.toggle('is-invalid', !!msg);
    fieldsIn(wrap).forEach(function (f) {
      f.setAttribute('aria-invalid', msg ? 'true' : 'false');
      var d = (f.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (d.indexOf(err.id) === -1) { d.push(err.id); f.setAttribute('aria-describedby', d.join(' ')); }
    });
  }

  /* ---------- Validation ---------- */
  function checkField(el, form) {
    if (el.disabled) return '';
    var wrap = getWrap(el);
    var custom = attr(el, wrap, 'data-msf-message');
    var isText = !isCheck(el) && el.tagName !== 'SELECT' && !/^(file|range|color)$/.test(el.type);

    if (el.required && isText && el.value.trim() === '') return custom || MESSAGES.required;

    var match = attr(el, wrap, 'data-msf-match');
    if (match) {
      var other = form.elements.namedItem(match) || document.getElementById(match);
      if (other && other.value !== el.value) return attr(el, wrap, 'data-msf-match-message') || MESSAGES.match;
    }

    if (el.type === 'email' && el.value && !EMAIL_RE.test(el.value.trim())) return custom || MESSAGES.email;
    if (el.checkValidity()) return '';
    if (custom) return custom;
    if (el.validity.valueMissing) return MESSAGES.required;
    if (el.validity.typeMismatch && el.type === 'email') return MESSAGES.email;
    return el.validationMessage;
  }

  function checkGroup(g) {
    var boxes = qsa(g, 'input[type="checkbox"]:not(:disabled)');
    var n = boxes.filter(function (b) { return b.checked; }).length;
    var min = parseInt(g.getAttribute('data-msf-min'), 10) || 0;
    var max = parseInt(g.getAttribute('data-msf-max'), 10) || Infinity;
    if (n < min) return g.getAttribute('data-msf-message') || MESSAGES.minChecked.replace('{n}', min);
    if (n > max) return g.getAttribute('data-msf-message') || MESSAGES.maxChecked.replace('{n}', max);
    return '';
  }

  /* mode: 'show' = render all errors · 'live' = only update fields already marked invalid · 'silent' = no UI */
  function validateStep(step, form, mode) {
    var results = new Map(), valid = true, first = null;
    fieldsIn(step).forEach(function (el) {
      var msg = checkField(el, form), wrap = getWrap(el), prev = results.get(wrap);
      if (!prev || (!prev.msg && msg)) results.set(wrap, { msg: msg, el: el });
    });
    qsa(step, '[data-msf="group"][data-msf-min], [data-msf="group"][data-msf-max]').forEach(function (g) {
      results.set(g, { msg: checkGroup(g), el: g.querySelector('input') });
    });
    results.forEach(function (r, wrap) {
      if (r.msg && valid) { valid = false; first = r.el; }
      if (mode === 'silent') return;
      if (mode === 'live' && !wrap.classList.contains('is-invalid')) return;
      setError(wrap, r.msg);
    });
    return { valid: valid, first: first };
  }

  /* ---------- Conditional steps: data-msf-if="name=value|value2 && other!=x" ---------- */
  function valuesOf(form, name) {
    return qsa(form, '[name="' + CSS.escape(name) + '"]').reduce(function (acc, el) {
      if (isCheck(el)) { if (el.checked) acc.push(el.value); }
      else if (el.value) acc.push(el.value);
      return acc;
    }, []);
  }

  function conditionMet(cond, form) {
    if (!cond) return true;
    return cond.split('&&').every(function (part) {
      part = part.trim();
      var m = part.match(/^([^!=]+?)\s*(!?=)\s*(.*)$/);
      if (!m) return valuesOf(form, part).length > 0;
      var wanted = m[3].split('|').map(function (s) { return s.trim(); });
      var hit = valuesOf(form, m[1].trim()).some(function (v) { return wanted.indexOf(v) > -1; });
      return m[2] === '=' ? hit : !hit;
    });
  }

  /* ---------- One form instance ---------- */
  function MultiStep(root, index) {
    if (root.__msf) return;
    var form = root.tagName === 'FORM' ? root : root.querySelector('form');
    if (!form) return;
    var steps = qsa(form, '[data-msf="step"]');
    if (!steps.length) return;
    root.__msf = true;

    var scope = root.closest('[data-msf="wrapper"]') || root;
    var opts = {
      scroll: root.getAttribute('data-msf-scroll') !== 'false',
      offset: parseInt(root.getAttribute('data-msf-offset'), 10) || 0,
      clickable: root.hasAttribute('data-msf-clickable'),
      save: root.hasAttribute('data-msf-save')
    };
    var key = 'msf:' + location.pathname + ':' + (form.id || form.getAttribute('name') || index);
    var current = steps[0];
    var restoring = false;

    form.noValidate = true;
    steps.forEach(function (s) { s.setAttribute('tabindex', '-1'); });

    function active() {
      return steps.filter(function (s) { return s === current || conditionMet(s.getAttribute('data-msf-if'), form); });
    }

    function setSkipped(step, skipped) {
      fieldsIn(step).forEach(function (el) {
        if (skipped && !el.hasAttribute('data-msf-skipped')) {
          el.setAttribute('data-msf-skipped', el.required ? 'required' : '');
          el.required = false;
          el.disabled = true;
        } else if (!skipped && el.hasAttribute('data-msf-skipped')) {
          el.required = el.getAttribute('data-msf-skipped') === 'required';
          el.disabled = false;
          el.removeAttribute('data-msf-skipped');
        }
      });
    }

    function labelOf(el) {
      var l = el.closest('label');
      return el.getAttribute('data-msf-label') || (l && l.textContent.trim()) || el.value;
    }

    function renderSummary() {
      qsa(scope, '[data-msf-summary]').forEach(function (out) {
        var vals = [];
        qsa(form, '[name="' + CSS.escape(out.getAttribute('data-msf-summary')) + '"]').forEach(function (el) {
          if (el.disabled) return;
          if (isCheck(el)) { if (el.checked) vals.push(labelOf(el)); }
          else if (el.tagName === 'SELECT') { var o = el.options[el.selectedIndex]; if (o && el.value) vals.push(o.text); }
          else if (el.value.trim()) vals.push(el.value.trim());
        });
        out.textContent = vals.length ? vals.join(', ') : (out.getAttribute('data-msf-empty') || '–');
      });
    }

    function render() {
      var act = active(), idx = act.indexOf(current), total = act.length, last = idx === total - 1;

      steps.forEach(function (s) {
        s.hidden = s !== current;
        setSkipped(s, act.indexOf(s) === -1);
      });

      qsa(scope, '[data-msf="prev"]').forEach(function (b) { b.hidden = idx === 0; });
      qsa(scope, '[data-msf="next"]').forEach(function (b) { b.hidden = last; });
      qsa(scope, '[data-msf="submit"]').forEach(function (b) { b.hidden = !last; });
      qsa(scope, '[data-msf="current"]').forEach(function (e) { e.textContent = idx + 1; });
      qsa(scope, '[data-msf="total"]').forEach(function (e) { e.textContent = total; });
      qsa(scope, '[data-msf="step-title"]').forEach(function (e) { e.textContent = current.getAttribute('data-msf-title') || ''; });

      var pct = Math.round(((idx + 1) / total) * 100);
      scope.style.setProperty('--msf-progress', pct + '%');
      qsa(scope, '[data-msf="progress-bar"]').forEach(function (b) { b.style.width = pct + '%'; });

      qsa(scope, '[data-msf="indicator"]').forEach(function (ind, i) {
        var s = steps[i], pos = act.indexOf(s);
        if (!s) return;
        ind.classList.toggle('is-active', s === current);
        ind.classList.toggle('is-complete', pos > -1 && pos < idx);
        ind.classList.toggle('is-skipped', pos === -1);
        if (s === current) ind.setAttribute('aria-current', 'step'); else ind.removeAttribute('aria-current');
      });

      renderSummary();
      root.setAttribute('data-msf-current', idx + 1);
      form.dispatchEvent(new CustomEvent('msf:change', {
        bubbles: true, detail: { step: current, index: idx, total: total, isLast: last }
      }));
    }

    function scrollUp() {
      if (!opts.scroll) return;
      var top = scope.getBoundingClientRect().top;
      if (top >= opts.offset) return;
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: top + window.pageYOffset - opts.offset, behavior: reduce ? 'auto' : 'smooth' });
    }

    function goTo(step, focusEl) {
      current = step;
      render();
      save();
      scrollUp();
      (focusEl || step).focus({ preventScroll: !focusEl });
    }

    function next() {
      var r = validateStep(current, form, 'show');
      if (!r.valid) { if (r.first) r.first.focus(); return; }
      var act = active(), idx = act.indexOf(current);
      if (idx < act.length - 1) goTo(act[idx + 1]);
    }

    function prev() {
      var act = active(), idx = act.indexOf(current);
      if (idx > 0) goTo(act[idx - 1]);
    }

    function jumpTo(target) {
      var act = active(), from = act.indexOf(current), to = act.indexOf(target);
      if (to === -1 || to === from) return;
      if (to < from) return goTo(target);
      for (var i = from; i < to; i++) {
        var r = validateStep(act[i], form, 'silent');
        if (!r.valid) {
          if (act[i] !== current) goTo(act[i]);
          validateStep(act[i], form, 'show');
          if (r.first) r.first.focus();
          return;
        }
      }
      goTo(target);
    }

    /* ---------- Persistence (optional: data-msf-save) ---------- */
    function save() {
      if (!opts.save || restoring) return;
      var data = { step: steps.indexOf(current), values: {} };
      fieldsIn(form).forEach(function (el) {
        if (!el.name || el.type === 'password' || el.type === 'file') return;
        if (isCheck(el)) { if (el.checked) (data.values[el.name] = data.values[el.name] || []).push(el.value); }
        else data.values[el.name] = [el.value];
      });
      try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
    }

    function restore() {
      if (!opts.save) return;
      var data = null;
      try { data = JSON.parse(localStorage.getItem(key)); } catch (e) {}
      if (!data || !data.values) return;
      restoring = true;
      fieldsIn(form).forEach(function (el) {
        var v = data.values[el.name];
        if (!v || el.type === 'password' || el.type === 'file') return;
        if (isCheck(el)) {
          var c = v.indexOf(el.value) > -1;
          if (el.checked !== c) { el.checked = c; el.dispatchEvent(new Event('change', { bubbles: true })); }
        } else el.value = v[0];
      });
      restoring = false;
      if (steps[data.step]) current = steps[data.step];
    }

    if (opts.save) {
      // Webflow hides the form on success → clear saved progress
      new MutationObserver(function () {
        if (form.style.display === 'none') { try { localStorage.removeItem(key); } catch (e) {} }
      }).observe(form, { attributes: true, attributeFilter: ['style'] });
    }

    /* ---------- Events ---------- */
    scope.addEventListener('click', function (e) {
      var t = e.target.closest('[data-msf="next"], [data-msf="prev"], [data-msf="indicator"]');
      if (!t || !scope.contains(t)) return;
      var type = t.getAttribute('data-msf');
      if (type === 'indicator' && !opts.clickable) return;
      e.preventDefault();
      if (type === 'next') next();
      else if (type === 'prev') prev();
      else {
        var i = qsa(scope, '[data-msf="indicator"]').indexOf(t);
        if (steps[i]) jumpTo(steps[i]);
      }
    });

    // Capture phase: runs before Webflow's own submit handler
    form.addEventListener('submit', function (e) {
      var act = active(), idx = act.indexOf(current);
      function block() { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }

      if (idx < act.length - 1) { block(); next(); return; } // Enter key on an earlier step

      for (var i = 0; i < act.length; i++) {
        var r = validateStep(act[i], form, 'silent');
        if (!r.valid) {
          block();
          if (act[i] !== current) goTo(act[i]);
          validateStep(act[i], form, 'show');
          if (r.first) r.first.focus();
          return;
        }
      }
      // valid → Webflow submits as usual
    }, true);

    function onEdit(e) {
      if (restoring) return;
      validateStep(current, form, 'live');
      if (e.type === 'change') render();
      save();
    }
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);

    restore();
    render();
    root.setAttribute('data-msf-ready', '');
  }

  function initAll() {
    qsa(document, '[data-msf="form"]').forEach(function (r, i) { MultiStep(r, i); });
  }

  window.MultiStepForm = { init: initAll };
  window.Webflow = window.Webflow || [];
  window.Webflow.push(initAll);
})();
