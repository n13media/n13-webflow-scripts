/*!
 * Form Handler for Webflow · validation + sending to a webhook / form proxy
 * https://github.com/n13media/n13-webflow-scripts/tree/main/form-handler
 */
(function () {
  'use strict';
  if (window.FormHandler) return; // already loaded (e.g. embed placed twice)

  /* ---------- Messages (German default), override: window.FH_MESSAGES (window.MSF_MESSAGES also read) ---------- */
  var MESSAGES = {
    required: 'Bitte fülle dieses Feld aus.',
    email: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    phone: 'Bitte gib eine gültige Telefonnummer mit Vorwahl ein, z. B. 0151 23456789.',
    match: 'Die Eingaben stimmen nicht überein.',
    minChecked: 'Bitte wähle mindestens {n} Option(en) aus.',
    maxChecked: 'Bitte wähle höchstens {n} Option(en) aus.',
    sendError: 'Leider ist beim Senden etwas schiefgelaufen. Bitte versuche es gleich noch einmal.'
  };
  [window.MSF_MESSAGES, window.FH_MESSAGES].forEach(function (o) {
    if (o) for (var k in o) MESSAGES[k] = o[k];
  });

  var FIELD_SEL = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var HONEYPOT_NAME = 'msf_website';
  var SEND_TIMEOUT_MS = 15000;
  var RETRY_DELAY_MS = 2000;
  var ATTR_KEY = 'fh:attribution';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid'];
  var uid = 0;

  function qsa(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function isCheck(el) { return el.type === 'checkbox' || el.type === 'radio'; }
  // Attributes: new data-fh-* first, data-msf-* still works
  function a(el, name) {
    if (!el || !el.getAttribute) return null;
    var v = el.getAttribute('data-fh-' + name);
    return v !== null ? v : el.getAttribute('data-msf-' + name);
  }
  function has(el, name) { return !!el && (el.hasAttribute('data-fh-' + name) || el.hasAttribute('data-msf-' + name)); }
  function attr(el, wrap, name) { return a(el, name) || a(wrap, name) || ''; }
  function role(r) { return '[data-fh="' + r + '"], [data-msf="' + r + '"]'; }
  function fieldsIn(el) {
    return qsa(el, FIELD_SEL).filter(function (f) { return !f.closest('[data-fh-ignore], [data-msf-ignore]'); });
  }

  /* ---------- Phone numbers ----------
   * type="tel" (opt out: data-fh-phone="false") or any input with data-fh-phone.
   * Country for numbers starting with 0: data-fh-phone-country="49" on field/wrapper/form (default 49). */
  function isPhone(el) {
    var v = a(el, 'phone');
    if (v === 'false') return false;
    return el.type === 'tel' || v !== null;
  }

  function normalizePhone(raw, cc) {
    var v = raw.trim();
    if (/[^\d\s+()\/.\-]/.test(v)) return null;          // letters or other symbols
    v = v.replace(/\(0\)/g, '');                          // "+49 (0)151 …"
    var plus = v.charAt(0) === '+';
    if (v.lastIndexOf('+') > 0) return null;              // "+" only at the start
    var d = v.replace(/\D/g, '');
    if (!plus) {
      if (d.slice(0, 2) === '00') d = d.slice(2);         // 0049 … → 49 …
      else if (d.charAt(0) === '0') d = cc + d.slice(1);  // 0151 … → 49151 …
      else return null;                                   // no area code / country code
    }
    if (d.slice(0, 2) === '49') {
      var n = d.slice(2).replace(/^0/, '');               // "+49 0151" → 151
      if (n.charAt(0) === '0') return null;
      if (/^1[5-7]/.test(n)) {                            // mobile: 015x/016x/017x
        if (n.length < 10 || n.length > 11) return null;
        return '+49 ' + n.slice(0, 3) + ' ' + n.slice(3);
      }
      if (n.length < 7 || n.length > 12) return null;     // landline incl. area code
      return '+49 ' + n;
    }
    if (d.charAt(0) === '0' || d.length < 8 || d.length > 15) return null; // E.164
    return '+' + d;
  }

  function phoneCountry(el) {
    var c = el.closest('[data-fh-phone-country], [data-msf-phone-country]');
    return ((c && a(c, 'phone-country')) || '49').replace(/\D/g, '') || '49';
  }

  function formatPhone(el) {
    if (!el || el.disabled || el.tagName !== 'INPUT' || !isPhone(el) || !el.value.trim()) return;
    var p = normalizePhone(el.value, phoneCountry(el));
    if (p && p !== el.value) el.value = p;
  }
  function formatPhones(container) { fieldsIn(container).forEach(formatPhone); }

  /* ---------- Where errors go ---------- */
  function getWrap(el) {
    var w = el.closest(role('field'));
    if (w) return w;
    if (el.type === 'radio') return el.closest(role('group') + ', fieldset') || el.closest('label') || el.parentElement;
    if (el.type === 'checkbox') return el.closest('label') || el.parentElement;
    return el.parentElement;
  }

  function setError(wrap, msg) {
    var err = wrap.querySelector(role('error')) || wrap.querySelector(':scope > .fh_error');
    if (!err && !msg) { wrap.classList.remove('is-invalid'); return; }
    if (!err) {
      err = document.createElement('div');
      err.className = 'fh_error';
      wrap.appendChild(err);
    }
    if (!err.id) err.id = 'fh-err-' + (++uid);
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
    var custom = attr(el, wrap, 'message');
    var isText = !isCheck(el) && el.tagName !== 'SELECT' && !/^(file|range|color)$/.test(el.type);

    if (el.required && isText && el.value.trim() === '') return custom || MESSAGES.required;

    var match = attr(el, wrap, 'match');
    if (match) {
      var other = form.elements.namedItem(match) || document.getElementById(match);
      if (other && other.value !== el.value) return attr(el, wrap, 'match-message') || MESSAGES.match;
    }

    if (el.type === 'email' && el.value && !EMAIL_RE.test(el.value.trim())) return custom || MESSAGES.email;
    if (isPhone(el) && el.value.trim() && !normalizePhone(el.value, phoneCountry(el))) return custom || MESSAGES.phone;
    if (el.checkValidity()) return '';
    if (custom) return custom;
    if (el.validity.valueMissing) return MESSAGES.required;
    if (el.validity.typeMismatch && el.type === 'email') return MESSAGES.email;
    return el.validationMessage;
  }

  function checkGroup(g) {
    var boxes = qsa(g, 'input[type="checkbox"]:not(:disabled)');
    var n = boxes.filter(function (b) { return b.checked; }).length;
    var min = parseInt(a(g, 'min'), 10) || 0;
    var max = parseInt(a(g, 'max'), 10) || Infinity;
    if (n < min) return a(g, 'message') || MESSAGES.minChecked.replace('{n}', min);
    if (n > max) return a(g, 'message') || MESSAGES.maxChecked.replace('{n}', max);
    return '';
  }

  /* mode: 'show' = render all errors · 'live' = only update fields already marked invalid · 'silent' = no UI */
  function validate(container, form, mode) {
    var results = new Map(), valid = true, first = null;
    fieldsIn(container).forEach(function (el) {
      var msg = checkField(el, form), wrap = getWrap(el), prev = results.get(wrap);
      if (!prev || (!prev.msg && msg)) results.set(wrap, { msg: msg, el: el });
    });
    qsa(container, role('group')).forEach(function (g) {
      if (!has(g, 'min') && !has(g, 'max')) return;
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

  /* ---------- Attribution: UTM + landing page/referrer, kept for the browser session ---------- */
  function attribution() {
    var stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(ATTR_KEY)); } catch (e) {}
    var params = new URLSearchParams(location.search), utm = {}, found = false;
    UTM_KEYS.forEach(function (k) { var v = params.get(k); if (v) { utm[k] = v; found = true; } });
    if (!stored || found) {
      // First page of the session, or a new campaign click → (re)start attribution
      stored = { utm: found ? utm : (stored ? stored.utm : {}), landingPage: location.href, referrer: document.referrer || '' };
      try { sessionStorage.setItem(ATTR_KEY, JSON.stringify(stored)); } catch (e) {}
    }
    return stored;
  }
  var ATTRIBUTION = attribution();

  function deviceType() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    return w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  }

  function formName(form) {
    return form.getAttribute('data-name') || form.getAttribute('name') || form.id || 'form';
  }

  function buildMeta(form) {
    return {
      form: formName(form),
      formId: form.id || '',
      page: location.href,
      path: location.pathname,
      title: document.title,
      submittedAt: new Date().toISOString(),
      language: navigator.language || '',
      device: deviceType(),
      viewport: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
      referrer: ATTRIBUTION.referrer,
      landingPage: ATTRIBUTION.landingPage,
      utm: ATTRIBUTION.utm || {}
    };
  }

  /* ---------- Collect field values ---------- */
  var SKIP_NAMES = [HONEYPOT_NAME, 'cf-turnstile-response', 'g-recaptcha-response', 'h-captcha-response'];

  function collect(form) {
    var data = {}, counts = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name && el.type === 'checkbox') counts[el.name] = (counts[el.name] || 0) + 1;
    });
    Array.prototype.forEach.call(form.elements, function (el) {
      var name = el.name;
      if (!name || el.disabled || SKIP_NAMES.indexOf(name) > -1) return;
      if (/^(submit|button|reset|file|image)$/.test(el.type)) return;
      if (el.matches(role('endpoint')) || el.closest('[data-fh-exclude]')) return;

      if (el.type === 'checkbox') {
        if (counts[name] > 1) {                           // checkbox group → array of checked values
          if (!data[name]) data[name] = [];
          if (el.checked) data[name].push(el.value);
        } else {                                          // single checkbox → true/false (or its value)
          data[name] = el.checked ? (el.value && el.value !== 'on' ? el.value : true) : false;
        }
      } else if (el.type === 'radio') {
        if (!(name in data)) data[name] = '';
        if (el.checked) data[name] = el.value;
      } else if (el.tagName === 'SELECT' && el.multiple) {
        data[name] = Array.prototype.filter.call(el.options, function (o) { return o.selected; })
          .map(function (o) { return o.value; });
      } else {
        data[name] = typeof el.value === 'string' ? el.value.trim() : el.value;
      }
    });
    return data;
  }

  // Only relative paths or http(s) URLs (never "javascript:" from a webhook answer)
  function safeRedirect(url) {
    if (!url || typeof url !== 'string') return '';
    url = url.trim();
    if (/^\/(?!\/)/.test(url)) return url;
    try {
      var u = new URL(url, location.href);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
    } catch (e) { return ''; }
  }

  /* ---------- One form instance ---------- */
  function Handler(form) {
    if (form.__fh) return;
    form.__fh = true;

    var root = form.closest('[data-fh="form"], [data-msf="form"]') || form;
    var scope = form.closest('.w-form') || form.parentElement || form;
    var endpointEl = form.querySelector(role('endpoint'));
    var endpoint = (a(form, 'endpoint') || a(root, 'endpoint') || (endpointEl && endpointEl.value) || '').trim();
    var hpAttr = a(form, 'honeypot') !== null ? a(form, 'honeypot') : a(root, 'honeypot');
    var opts = {
      endpoint: endpoint,
      redirect: a(form, 'redirect') || a(root, 'redirect') || '',
      honeypot: hpAttr !== null,
      minTime: parseFloat(hpAttr) >= 0 ? parseFloat(hpAttr) : 3
    };
    var startedAt = Date.now();
    var sending = false;

    form.noValidate = true;

    // Phone fields: numeric keypad + autofill, unless set in Webflow
    fieldsIn(form).forEach(function (el) {
      if (el.tagName !== 'INPUT' || !isPhone(el)) return;
      if (!el.hasAttribute('inputmode')) el.setAttribute('inputmode', 'tel');
      if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'tel');
    });

    /* Honeypot: hidden trap field (data-fh-honeypot, "5" = also block submits faster than 5 s) */
    var honeypot = null;
    if (opts.honeypot) {
      var hpWrap = document.createElement('div');
      hpWrap.setAttribute('data-fh-ignore', '');
      hpWrap.setAttribute('aria-hidden', 'true');
      hpWrap.style.cssText = 'position:absolute!important;left:-10000px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important;';
      honeypot = document.createElement('input');
      honeypot.type = 'text';
      honeypot.name = HONEYPOT_NAME;
      honeypot.tabIndex = -1;
      honeypot.autocomplete = 'off';
      hpWrap.appendChild(honeypot);
      form.appendChild(hpWrap);
    }
    function isSpam() {
      if (!opts.honeypot) return false;
      return (honeypot && honeypot.value !== '') || (Date.now() - startedAt) < opts.minTime * 1000;
    }
    function removeHoneypot() {
      if (honeypot && honeypot.parentNode && honeypot.parentNode.parentNode) {
        honeypot.parentNode.parentNode.removeChild(honeypot.parentNode);
      }
    }

    function emit(name, detail) {
      form.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail || {} }));
    }

    /* ---------- UI states ---------- */
    function loaders() { return qsa(scope, role('loader')); }
    function submitButtons() {
      return qsa(form, 'input[type="submit"], button[type="submit"], button:not([type])');
    }

    function setSending(on) {
      sending = on;
      scope.setAttribute('data-fh-state', on ? 'sending' : 'idle');
      form.setAttribute('aria-busy', on ? 'true' : 'false');
      loaders().forEach(function (l) { l.classList.toggle('is-active', on); });
      submitButtons().forEach(function (b) {
        b.disabled = on;
        var wait = b.getAttribute('data-wait');          // Webflow's "Waiting text"
        if (!wait) return;
        if (on) {
          if (b.tagName === 'INPUT') { b.setAttribute('data-fh-label', b.value); b.value = wait; }
          else if (b.children.length === 0) { b.setAttribute('data-fh-label', b.textContent); b.textContent = wait; }
        } else if (b.hasAttribute('data-fh-label')) {
          if (b.tagName === 'INPUT') b.value = b.getAttribute('data-fh-label'); else b.textContent = b.getAttribute('data-fh-label');
          b.removeAttribute('data-fh-label');
        }
      });
    }

    function showDone() {
      var done = scope.querySelector('.w-form-done'), fail = scope.querySelector('.w-form-fail');
      form.style.display = 'none';
      if (fail) fail.style.display = 'none';
      if (done) {
        done.style.display = 'block';
        done.setAttribute('tabindex', '-1');
        done.setAttribute('role', 'status');
        done.focus({ preventScroll: true });
      }
    }

    function showFail(msg) {
      var fail = scope.querySelector('.w-form-fail');
      if (!fail) { window.alert(msg); return; }
      var text = fail.querySelector(role('error-text'));
      if (text) text.textContent = msg;
      fail.style.display = 'block';
      fail.setAttribute('role', 'alert');
    }

    function hideFail() {
      var fail = scope.querySelector('.w-form-fail');
      if (fail) fail.style.display = 'none';
    }

    /* ---------- Sending ---------- */
    function post(body) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, SEND_TIMEOUT_MS);
      return fetch(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        credentials: 'omit',
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        clearTimeout(timer);
        return res.text().then(function (txt) {
          var data = null;
          try { data = JSON.parse(txt); } catch (e) {}
          return { status: res.status, ok: res.ok, data: data || { message: txt } };
        });
      }, function (err) {
        clearTimeout(timer);
        return { status: 0, ok: false, data: { error: err && err.name === 'AbortError' ? 'timeout' : 'network' } };
      });
    }

    function send() {
      var payload = { fields: collect(form), meta: buildMeta(form) };
      var ts = form.querySelector('[name="cf-turnstile-response"]');
      if (ts && ts.value) payload.turnstile = ts.value;
      var body = JSON.stringify(payload);

      setSending(true);
      hideFail();
      emit('fh:send', { payload: payload });

      function attempt(n) {
        post(body).then(function (r) {
          var ok = r.ok && !(r.data && r.data.ok === false);
          if (ok) return success(r.data || {});
          var retryable = r.status === 0 || r.status >= 500;
          if (retryable && n === 1) { setTimeout(function () { attempt(2); }, RETRY_DELAY_MS); return; }
          failure(r);
        });
      }
      attempt(1);
    }

    function success(data) {
      emit('fh:success', { response: data });
      var target = safeRedirect(data.redirect) || safeRedirect(opts.redirect);
      if (target) { location.assign(target); return; } // stays "sending" until the page changes
      setSending(false);
      showDone();
    }

    function failure(r) {
      setSending(false);
      emit('fh:error', { status: r.status, response: r.data });
      if (window.turnstile && typeof window.turnstile.reset === 'function') {
        try { window.turnstile.reset(); } catch (e) {}
      }
      showFail(MESSAGES.sendError);
    }

    /* ---------- Submit (capture phase: runs before Webflow's own handler) ---------- */
    form.addEventListener('submit', function (e) {
      function block() { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }

      if (sending) { block(); return; }

      // Hooks (e.g. multi-step: Enter on an earlier step, validate all steps) — false = stop
      var hooks = form.__fhHooks || [];
      if (hooks.length) {
        for (var i = 0; i < hooks.length; i++) if (hooks[i](e) === false) { block(); return; }
      } else {
        formatPhones(form);
        var r = validate(form, form, 'show');
        if (!r.valid) { block(); if (r.first) r.first.focus(); return; }
      }

      if (isSpam()) {                                     // pretend success, send nothing
        block();
        emit('fh:spam');
        showDone();
        return;
      }

      if (!opts.endpoint) {                               // validation only → Webflow submits as usual
        removeHoneypot();
        return;
      }

      block();                                            // no Webflow submit: we send ourselves
      send();
    }, true);

    // Live validation + phone formatting on blur
    form.addEventListener('input', function () { validate(form, form, 'live'); });
    form.addEventListener('change', function (e) {
      formatPhone(e.target);
      validate(form, form, 'live');
    });

    form.setAttribute('data-fh-ready', '');
  }

  function initAll() {
    var forms = [];
    qsa(document, '[data-fh="form"], [data-msf="form"], [data-fh-endpoint], ' + role('endpoint')).forEach(function (el) {
      var f = el.tagName === 'FORM' ? el : (el.closest('form') || el.querySelector('form'));
      if (f && forms.indexOf(f) === -1) forms.push(f);
    });
    forms.forEach(Handler);
  }

  window.FormHandler = {
    version: '2.2.0',
    init: initAll,
    // Shared validator API (used by the multi-step script)
    validate: validate,
    checkField: checkField,
    setError: setError,
    formatPhones: formatPhones,
    normalizePhone: normalizePhone,
    messages: MESSAGES,
    // Hook into submit: fn(event) returns false to stop (no send, no Webflow submit)
    onBeforeSubmit: function (form, fn) { (form.__fhHooks = form.__fhHooks || []).push(fn); }
  };
  window.Webflow = window.Webflow || [];
  window.Webflow.push(initAll);
})();
