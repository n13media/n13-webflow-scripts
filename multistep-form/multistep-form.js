/*!
 * Multi-Step Form for Webflow · attribute-driven
 * Needs form-handler.js (validation, spam protection, sending) on the same page.
 * https://github.com/n13media/n13-webflow-scripts/tree/main/multistep-form
 */
(function () {
  'use strict';
  if (window.MultiStepForm) return; // already loaded (e.g. embed placed twice)

  var FIELD_SEL = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea';

  function qsa(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function fieldsIn(el) { return qsa(el, FIELD_SEL).filter(function (f) { return !f.closest('[data-msf-ignore], [data-fh-ignore]'); }); }
  function isCheck(el) { return el.type === 'checkbox' || el.type === 'radio'; }

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
    var FH = window.FormHandler;
    if (!FH) {
      if (window.console) console.error('[MultiStepForm] form-handler.js is missing. Load it before multistep-form.js.');
      return;
    }
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
      save: root.hasAttribute('data-msf-save'),
      // data-msf-save="2" = keep for 2 days after the last edit; empty/invalid = 1 day
      saveDays: parseFloat(root.getAttribute('data-msf-save')) > 0 ? parseFloat(root.getAttribute('data-msf-save')) : 1,
      history: root.getAttribute('data-msf-history') !== 'false'
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

    function goTo(step, focusEl, fromHistory) {
      current = step;
      render();
      if (!fromHistory) pushHistory();
      save();
      scrollUp();
      (focusEl || step).focus({ preventScroll: !focusEl });
    }

    function next() {
      FH.formatPhones(current);
      var r = FH.validate(current, form, 'show');
      if (!r.valid) { if (r.first) r.first.focus(); return; }
      var act = active(), idx = act.indexOf(current);
      if (idx < act.length - 1) goTo(act[idx + 1]);
    }

    function prev() {
      var act = active(), idx = act.indexOf(current);
      if (idx > 0) goTo(act[idx - 1]);
    }

    // Checks active steps from index `from` up to (not incl.) `to`; on error: go there and show it
    function firstInvalidBefore(from, to, fromHistory) {
      var act = active();
      FH.formatPhones(form);
      for (var i = Math.max(from, 0); i < to; i++) {
        var r = FH.validate(act[i], form, 'silent');
        if (!r.valid) {
          if (act[i] !== current) goTo(act[i], null, fromHistory);
          if (fromHistory) replaceHistory();
          FH.validate(act[i], form, 'show');
          if (r.first) r.first.focus();
          return true;
        }
      }
      return false;
    }

    function jumpTo(target, fromHistory) {
      var act = active(), from = act.indexOf(current), to = act.indexOf(target);
      if (to === -1 || to === from) return;
      if (to < from) return goTo(target, null, fromHistory);
      if (firstInvalidBefore(from, to, fromHistory)) return;
      goTo(target, null, fromHistory);
    }

    /* ---------- Browser back/forward = previous/next step (opt out: data-msf-history="false") ---------- */
    function historyState() {
      var s = {}, old = window.history.state;
      if (old && typeof old === 'object') for (var k in old) s[k] = old[k];
      s.msf = {};
      if (old && old.msf) for (var f in old.msf) s.msf[f] = old.msf[f];
      s.msf[key] = steps.indexOf(current);
      return s;
    }
    function pushHistory() {
      if (opts.history) try { window.history.pushState(historyState(), ''); } catch (e) {}
    }
    function replaceHistory() {
      if (opts.history) try { window.history.replaceState(historyState(), ''); } catch (e) {}
    }
    if (opts.history) {
      window.addEventListener('popstate', function (e) {
        var s = e.state && e.state.msf, i = s ? s[key] : null; // not our entry (e.g. an anchor link) → ignore
        if (typeof i !== 'number' || !steps[i] || steps[i] === current) return;
        if (form.style.display === 'none') return; // already submitted
        jumpTo(steps[i], true);
      });
    }

    /* ---------- Persistence (optional: data-msf-save) ---------- */
    function clearSaved() { try { localStorage.removeItem(key); } catch (e) {} }

    function save() {
      if (!opts.save || restoring) return;
      var data = { step: steps.indexOf(current), t: Date.now(), values: {} };
      fieldsIn(form).forEach(function (el) {
        if (!el.name || el.type === 'password' || el.type === 'file' || el.closest('[data-msf-nosave]')) return;
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
      if (!data.t || Date.now() - data.t > opts.saveDays * 864e5) { clearSaved(); return; } // expired
      restoring = true;
      fieldsIn(form).forEach(function (el) {
        var v = data.values[el.name];
        if (!v || el.type === 'password' || el.type === 'file' || el.closest('[data-msf-nosave]')) return;
        if (isCheck(el)) {
          var c = v.indexOf(el.value) > -1;
          if (el.checked !== c) { el.checked = c; el.dispatchEvent(new Event('change', { bubbles: true })); }
        } else el.value = v[0];
      });
      restoring = false;
      if (steps[data.step]) current = steps[data.step];
    }

    if (opts.save) {
      // Sent (also before a redirect) or hidden by Webflow/form handler → clear saved progress
      form.addEventListener('fh:success', clearSaved);
      form.addEventListener('fh:spam', clearSaved);
      new MutationObserver(function () {
        if (form.style.display === 'none') clearSaved();
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

    // Submit runs through the form handler; this hook decides whether it may go ahead
    FH.onBeforeSubmit(form, function () {
      var act = active(), idx = act.indexOf(current);
      if (idx < act.length - 1) { next(); return false; } // Enter key on an earlier step
      return !firstInvalidBefore(0, act.length);           // all active steps valid?
    });

    function onEdit(e) {
      if (restoring) return;
      if (e.type === 'change') render();
      save();
    }
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);

    restore();
    render();
    replaceHistory(); // current entry = current step, so "back" from step 2 lands on step 1
    root.setAttribute('data-msf-ready', '');
  }

  function initAll() {
    qsa(document, '[data-msf="form"]').forEach(function (r, i) { MultiStep(r, i); });
  }

  window.MultiStepForm = { version: '2.0.0', init: initAll };
  window.Webflow = window.Webflow || [];
  window.Webflow.push(initAll);
})();
