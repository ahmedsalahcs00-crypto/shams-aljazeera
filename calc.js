(function () {
  'use strict';

  var K = { redirect: 'sj_redirect', service: 'sj_service', last: 'sj_last_inputs', load: 'sj_auto_load', list: 'sj_appliances' };
  var SESSION_KEYS = ['isLoggedIn', 'user_fullName', 'user_username', 'user_email', 'user_residence', 'user_phone'];
  var PROTECTED = ['calculator.html', 'appliance-calc.html', 'results.html'];
  var GENERIC_SERVICE = 'حاسبة الأحمال الهندسية';
  var COMPANY_WA = '249912345678';

  function $(id) { return document.getElementById(id); }
  function read(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function currentPage() { var p = location.pathname.split('/').pop(); return p || 'index.html'; }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 0 : d }); }
  function showMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'msg--ok' : 'msg--error') + ' is-visible';
  }
  function hideMsg(el) { if (el) { el.className = 'msg'; el.textContent = ''; } }
  function L(t) { return '\u2066' + t + '\u2069'; }
  function icon(paths) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>'; }
  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.setAttribute('data-label', btn.textContent); btn.textContent = label || 'جارٍ المعالجة...'; btn.disabled = true; }
    else { btn.textContent = btn.getAttribute('data-label') || btn.textContent; btn.disabled = false; }
  }

  function session() {
    if (raw('isLoggedIn') !== 'true') return null;
    var u = raw('user_username');
    if (!u) return null;
    return { username: u, fullName: raw('user_fullName') || u, email: raw('user_email') || '', residence: raw('user_residence') || '', phone: raw('user_phone') || '' };
  }
  function startSession(u) {
    try {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('user_fullName', u.fullName);
      localStorage.setItem('user_username', u.username);
      localStorage.setItem('user_email', u.email);
      localStorage.setItem('user_residence', u.residence);
      localStorage.setItem('user_phone', u.phone);
      return true;
    } catch (e) { return false; }
  }
  function endSession() {
    SESSION_KEYS.concat([K.list, K.load, K.last]).forEach(function (k) { del(k); });
  }

  function api(action, opts) {
    var o = opts || {}, init = { method: o.body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'sj-fetch' } };
    if (o.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(o.body); }
    return fetch('api.php?action=' + action + (o.query || ''), init).then(function (r) {
      return r.json().then(function (j) { j.status = r.status; return j; }, function () {
        return { ok: false, status: r.status, error: 'bad_response', message: 'تعذر قراءة استجابة الخادم. تأكد من تشغيل الموقع على خادم يدعم PHP.' };
      });
    }, function () {
      return { ok: false, status: 0, error: 'network', message: 'تعذر الاتصال بالخادم. تحقق من الاتصال بالشبكة وحاول مجدداً.' };
    });
  }

  function toLogin(target) {
    write(K.redirect, target || currentPage());
    if (!read(K.service, null)) write(K.service, GENERIC_SERVICE);
    location.replace('login.html');
  }

  if (PROTECTED.indexOf(currentPage()) !== -1 && !session()) { toLogin(currentPage() + location.search); return; }

  var meCache = null;
  function checkMe() {
    if (meCache) return meCache;
    if (!session()) { meCache = Promise.resolve(null); return meCache; }
    meCache = api('me').then(function (res) {
      if (res.ok) { startSession(res.user); return res.user; }
      if (res.status === 401) { endSession(); return null; }
      var s = session();
      return s ? { fullName: s.fullName, username: s.username, isAdmin: false } : null;
    });
    return meCache;
  }

  /* اعتراض أي رابط لصفحة محمية أو زر خدمة: غير المسجل يُحفظ طلبه ثم يُحوَّل إلى بوابة الدخول */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var el = e.target.closest ? e.target.closest('a[href], [data-service]') : null;
    if (!el || el.getAttribute('target') === '_blank') return;
    var isService = el.hasAttribute('data-service');
    var full = (el.getAttribute('data-target') || el.getAttribute('href') || '').split('#')[0];
    var dest = full.split('?')[0];
    if (!isService && PROTECTED.indexOf(dest) === -1) return;
    if (!isService && session()) return;

    e.preventDefault();
    var target = isService ? (el.getAttribute('data-target') || 'calculator.html') : full;
    if (isService) write(K.service, el.getAttribute('data-service'));
    else if (PROTECTED.indexOf(currentPage()) === -1) write(K.service, GENERIC_SERVICE);

    if (session()) { location.href = target; }
    else { write(K.redirect, target); location.href = 'login.html'; }
  });

  document.addEventListener('DOMContentLoaded', function () {
    initHeader();
    initPasswordToggles();
    initAuthPage();
    initCalculator();
    initResults();
    initAppliances();
    initDemoPanel();
  });

  function initHeader() {
    var header = $('siteHeader'), toggle = $('navToggle');
    if (header && toggle) {
      toggle.addEventListener('click', function () {
        var open = header.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    var s = session();
    if (!s) return;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-actions'), function (bar) {
      Array.prototype.forEach.call(bar.querySelectorAll('a[href="login.html"]'), function (a) { a.remove(); });
      var chip = document.createElement('span');
      chip.className = 'user-chip';
      chip.innerHTML = icon('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>');
      var nameEl = document.createElement('span');
      nameEl.textContent = s.fullName;
      chip.appendChild(nameEl);
      var out = document.createElement('button');
      out.type = 'button'; out.className = 'btn btn-secondary btn-sm'; out.textContent = 'تسجيل الخروج';
      out.addEventListener('click', function () {
        out.disabled = true;
        api('logout', { body: {} }).then(function () { endSession(); del(K.redirect); location.href = 'index.html'; });
      });
      bar.insertBefore(out, bar.firstChild);
      bar.insertBefore(chip, bar.firstChild);
    });
    checkMe().then(function (u) {
      if (!u) { if (PROTECTED.indexOf(currentPage()) === -1) location.reload(); return; }
      if (u.isAdmin) {
        Array.prototype.forEach.call(document.querySelectorAll('.nav-actions'), function (bar) {
          var a = document.createElement('a');
          a.href = 'admin.php'; a.className = 'btn btn-outline btn-sm'; a.textContent = 'لوحة الإدارة';
          bar.insertBefore(a, bar.firstChild);
        });
      }
    });
  }

  function initPasswordToggles() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-pass]'), function (btn) {
      var input = $(btn.getAttribute('data-toggle-pass'));
      if (!input) return;
      btn.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.classList.toggle('is-on', show);
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
      });
    });
  }

  function normalizePhone(v) {
    var s = String(v).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }).replace(/[\s\-().]/g, '');
    if (s.charAt(0) === '+') s = s.slice(1);
    if (s.indexOf('00') === 0) s = s.slice(2);
    if (s.indexOf('249') === 0) s = s.slice(3);
    if (s.charAt(0) === '0') s = s.slice(1);
    return /^[19]\d{8}$/.test(s) ? '+249' + s : null;
  }
  function prettyPhone(p) { return p.slice(4, 6) + ' ' + p.slice(6, 9) + ' ' + p.slice(9); }

  function initAuthPage() {
    var scene = $('authScene');
    if (!scene) return;
    var flagged = session();
    if (flagged) {
      checkMe().then(function (u) {
        if (u) { var r0 = read(K.redirect, null); del(K.redirect); location.replace(r0 || 'calculator.html'); }
        else bootAuth(scene);
      });
    } else bootAuth(scene);
  }

  function bootAuth(scene) {
    var front = $('faceFront'), back = $('faceBack');
    var wanted = read(K.redirect, null), svc = read(K.service, null), notice = $('authNotice');
    if (notice && wanted) {
      $('authNoticeText').textContent = 'للمتابعة إلى «' + (svc || GENERIC_SERVICE) + '» يلزم تسجيل الدخول أو إنشاء حساب عميل جديد.';
      notice.hidden = false;
    }

    /* آلية الانقلاب: يدور الصندوق 180 درجة بـ rotateY، وعند منتصف الدوران (الوجهان متعامدان على خط النظر) يُبدَّل
       position بين relative و absolute فيتبع ارتفاع البطاقة الوجه الظاهر وحده دون تداخل ارتفاعي الوجهين */
    function setFlip(toBack, instant) {
      scene.classList.toggle('is-flipped', toBack);
      front.inert = toBack; back.inert = !toBack;
      front.setAttribute('aria-hidden', toBack ? 'true' : 'false');
      back.setAttribute('aria-hidden', toBack ? 'false' : 'true');
      hideMsg($('loginError')); hideMsg($('registerError'));
      setTimeout(function () {
        front.classList.toggle('is-flow', !toBack);
        back.classList.toggle('is-flow', toBack);
      }, instant ? 0 : 380);
      if (!instant) setTimeout(function () { var f = $(toBack ? 'regFullName' : 'loginId'); if (f) f.focus(); }, 520);
    }
    setFlip(false, true);
    $('flipToRegister').addEventListener('click', function () { setFlip(true); });
    $('flipToLogin').addEventListener('click', function () { setFlip(false); });

    function finish(user, err) {
      if (!startSession(user)) { showMsg(err, 'تعذر حفظ الجلسة. تأكد من أن المتصفح يسمح بالتخزين المحلي.'); return; }
      var r = read(K.redirect, null); del(K.redirect);
      location.href = r || 'calculator.html';
    }

    var phoneEl = $('regPhone');
    phoneEl.addEventListener('blur', function () {
      var p = normalizePhone(phoneEl.value);
      if (p) phoneEl.value = prettyPhone(p);
    });

    $('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var id = $('loginId').value.trim(), pass = $('loginPassword').value, err = $('loginError'), btn = $('loginForm').querySelector('button[type="submit"]');
      if (!id || !pass) { showMsg(err, 'أدخل اسم المستخدم أو البريد الإلكتروني وكلمة المرور.'); return; }
      hideMsg(err); setBusy(btn, true, 'جارٍ التحقق...');
      api('login', { body: { identifier: id, password: pass } }).then(function (res) {
        if (res.ok) { finish(res.user, err); return; }
        setBusy(btn, false); showMsg(err, res.message);
      });
    });

    $('registerForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('registerError'), btn = $('registerForm').querySelector('button[type="submit"]');
      var u = { fullName: $('regFullName').value.trim(), username: $('regUsername').value.trim(), email: $('regEmail').value.trim(),
                residence: $('regResidence').value.trim(), phone: normalizePhone($('regPhone').value), password: $('regPassword').value };
      if (u.fullName.length < 3) { showMsg(err, 'أدخل الاسم الكامل (3 أحرف على الأقل).'); return; }
      if (!/^[A-Za-z0-9_.؀-ۿ-]{3,40}$/.test(u.username)) { showMsg(err, 'اسم المستخدم من 3 إلى 40 حرفاً بدون مسافات.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) { showMsg(err, 'صيغة البريد الإلكتروني غير صحيحة.'); return; }
      if (!u.phone) { showMsg(err, 'أدخل رقم هاتف سوداني صحيحاً بمفتاح الدولة +249، مثال: 91 234 5678.'); return; }
      if (!u.residence) { showMsg(err, 'أدخل السكن أو المدينة.'); return; }
      if (u.password.length < 8 || !/\d/.test(u.password) || !/[A-Za-z؀-ۿ]/.test(u.password)) { showMsg(err, 'كلمة المرور 8 أحرف على الأقل وتتضمن حروفاً وأرقاماً.'); return; }
      hideMsg(err); setBusy(btn, true, 'جارٍ إنشاء الحساب...');
      api('register', { body: u }).then(function (res) {
        if (res.ok) { finish(res.user, err); return; }
        setBusy(btn, false); showMsg(err, res.message);
      });
    });
  }

  var INVERTER_SIZES = [1, 1.5, 2, 3, 3.5, 4, 5.5, 8, 11, 15, 20, 30];
  var MAX_INV = 30;
  var DOD = { lithium: 0.8, tubular: 0.5, gel: 0.4 };
  var BATT_NAME = { lithium: 'ليثيوم (LiFePO4)', tubular: 'أنبوبية سائلة (Tubular)', gel: 'جل (Gel)' };
  var INV_EFF = 0.9, PSH = 5.5, PV_LOSS = 1.25, PANEL_W = 550, PF = 0.8, SAFETY = 1.25;

  function compute(i) {
    var notes = [], V = i.voltage, load = i.load, k;

    /* القدرة الظاهرية: P / cosφ مضروبة بهامش 1.25 لتيارات إقلاع المحركات */
    var rawVA = (load / PF) * SAFETY, rawKVA = rawVA / 1000;
    var invSize = MAX_INV, invQty = 1;
    for (k = 0; k < INVERTER_SIZES.length; k++) { if (INVERTER_SIZES[k] >= rawKVA) { invSize = INVERTER_SIZES[k]; break; } }
    if (rawKVA > MAX_INV) { invQty = Math.ceil(rawKVA / MAX_INV); invSize = MAX_INV; }

    /* ترقية الجهد: تيار الجهة المستمرة I = P / V؛ رفع V يخفض I بنفس النسبة ويقلل الفقد I²R في الكابلات */
    if (V === 12 && load > 1200) {
      V = 24;
      notes.push('رُفع جهد النظام من 12 إلى 24 فولت لأن الحمل (' + fmt(load) + ' واط) يتجاوز 1200 واط؛ عند 12 فولت يتجاوز تيار الجهة المستمرة الحدود الآمنة للكابلات والقواطع.');
    }
    if (V === 24 && load > 2800) {
      var from = i.voltage === 12 ? 'ثم إلى 48' : 'إلى 48';
      V = 48;
      notes.push('رُفع جهد النظام ' + from + ' فولت لأن الحمل (' + fmt(load) + ' واط) يتجاوز 2800 واط؛ رفع الجهد يخفض تيار الجهة المستمرة ويقلل الفاقد في الكابلات.');
    }
    var minV = invSize <= 1.5 ? 12 : (invSize <= 4 ? 24 : 48);
    if (V < minV) {
      notes.push('رُفع جهد النظام من ' + V + ' إلى ' + minV + ' فولت لأن الإنفرتر القياسي المختار (' + invSize + ' kVA) يتوفر في السوق بهذا الجهد.');
      V = minV;
    }

    /* سعة البطاريات: Ah = (P × h) / (V × DoD × η) */
    var dod = DOD[i.battType];
    var energyNight = load * i.hours;
    var reqAh = energyNight / (V * dod * INV_EFF);
    var unit = i.battType === 'lithium'
      ? (V === 48 ? { v: 51.2, ah: 100, label: 'بطارية ليثيوم 51.2 فولت / ' + L('100 Ah') } : { v: 12.8, ah: 100, label: 'بطارية ليثيوم 12.8 فولت / ' + L('100 Ah') })
      : { v: 12, ah: 200, label: 'بطارية 12 فولت / ' + L('200 Ah') };
    var series = (i.battType === 'lithium' && V === 48) ? 1 : Math.round(V / unit.v);
    var parallel = Math.max(1, Math.ceil(reqAh / unit.ah));
    var totalAh = parallel * unit.ah, units = series * parallel;
    var bankV = series * unit.v;
    var kWhNominal = totalAh * bankV / 1000, kWhUsable = kWhNominal * dod;
    var parLimit = i.battType === 'lithium' ? 6 : 4;
    if (parallel > parLimit) {
      notes.push('عدد الفروع المتوازية (' + parallel + ') يتجاوز الحد العملي الموصى به (' + parLimit + ') لتجنب اختلال توزيع التيار؛ يُنصح بوحدات ذات سعة أكبر أو رفع الجهد.');
    }

    /* الألواح: الطاقة اليومية = شحن البنك (طاقة الليل ÷ η) + الحمل النهاري؛ القدرة = الطاقة ÷ PSH × معامل الفقد الحراري */
    var chargeWh = energyNight / INV_EFF, dayWh = load * i.dayHours, dailyWh = chargeWh + dayWh;
    var pvWatts = (dailyWh / PSH) * PV_LOSS;
    var panels = Math.max(1, Math.ceil(pvWatts / PANEL_W)), pvWp = panels * PANEL_W;

    /* قاطع الجهة المستمرة: تيار التشغيل × 1.25 مقرّباً إلى أعلى مضاعف للعشرة */
    var idc = load / (V * INV_EFF), breaker = Math.ceil((idc * 1.25) / 10) * 10;

    return { notes: notes, V: V, inputV: i.voltage, rawKVA: rawKVA, invSize: invSize, invQty: invQty, dod: dod,
             reqAh: reqAh, unit: unit, series: series, parallel: parallel, totalAh: totalAh, units: units, bankV: bankV,
             kWhNominal: kWhNominal, kWhUsable: kWhUsable, chargeWh: chargeWh, dayWh: dayWh, dailyWh: dailyWh,
             pvWatts: pvWatts, panels: panels, pvWp: pvWp, idc: idc, breaker: breaker };
  }

  function initCalculator() {
    var form = $('calcForm');
    if (!form) return;
    var svc = read(K.service, null), chip = $('serviceChip');
    if (chip && svc) { $('serviceChipText').textContent = svc; chip.hidden = false; }

    var saved = read(K.last, null), auto = read(K.load, null);
    if (auto) { $('loadInput').value = auto; del(K.load); }
    else if (saved) { $('loadInput').value = saved.load; }
    if (saved) {
      $('hoursInput').value = saved.hours; $('dayHoursInput').value = saved.dayHours; $('voltageInput').value = saved.voltage;
      var r = document.querySelector('input[name="battType"][value="' + saved.battType + '"]'); if (r) r.checked = true;
    }

    api('calculations').then(function (res) {
      if (res.status === 401) { endSession(); toLogin('calculator.html'); return; }
      if (!res.ok || !res.items.length) return;
      var body = $('historyBody');
      res.items.forEach(function (c) {
        var tr = document.createElement('tr');
        var a = document.createElement('a');
        a.href = 'results.html?ref=' + encodeURIComponent(c.ref); a.className = 'link-btn'; a.textContent = c.ref;
        var tdRef = document.createElement('td'); tdRef.className = 'num'; tdRef.appendChild(a); tr.appendChild(tdRef);
        [new Date(c.createdAt).toLocaleDateString('en-GB'), fmt(c.load) + ' W',
         (c.summary.invQty > 1 ? c.summary.invQty + ' x ' : '') + c.summary.invKva + ' kVA', c.summary.voltage + ' V', String(c.summary.panels)].forEach(function (t) {
          var td = document.createElement('td'); td.className = 'num'; td.textContent = t; tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      $('historyBox').hidden = false;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('calcError'), btn = form.querySelector('button[type="submit"]'), load = parseFloat($('loadInput').value), hours = parseFloat($('hoursInput').value),
          dayHours = parseFloat($('dayHoursInput').value), voltage = parseInt($('voltageInput').value, 10),
          bt = document.querySelector('input[name="battType"]:checked');
      if (isNaN(dayHours)) dayHours = 5;
      if (!(load >= 100) || !(hours >= 1 && hours <= 24) || !(dayHours >= 0 && dayHours <= 12) || !voltage || !bt) {
        showMsg(err, 'تحقق من المدخلات: الحمل 100 واط فأكثر، ساعات الليل من 1 إلى 24، وساعات النهار من 0 إلى 12.'); return;
      }
      hideMsg(err); setBusy(btn, true, 'جارٍ حساب النظام...');
      var payload = { load: load, hours: hours, dayHours: dayHours, voltage: voltage, battType: bt.value, service: read(K.service, null) || GENERIC_SERVICE };
      api('save_calculation', { body: payload }).then(function (res) {
        if (res.ok) {
          write(K.last, { load: load, hours: hours, dayHours: dayHours, voltage: voltage, battType: bt.value });
          location.href = 'results.html?ref=' + encodeURIComponent(res.ref);
          return;
        }
        if (res.status === 401) { endSession(); toLogin('calculator.html'); return; }
        setBusy(btn, false); showMsg(err, res.message);
      });
    });
  }

  function setText(id, t) { var el = $(id); if (el) el.textContent = t; }
  function addRow(tbody, cells) {
    var tr = document.createElement('tr');
    cells.forEach(function (c, idx) {
      var td = document.createElement('td'); td.textContent = c;
      if (c && /^[\d.,\s]+$/.test(c) && idx > 0) td.className = 'num';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  function initResults() {
    if (!$('r-inv')) return;
    var ref = new URLSearchParams(location.search).get('ref');

    function reportError(msg) {
      $('report').hidden = true; $('reportActions').hidden = true;
      showMsg($('reportError'), msg);
      $('reportError').insertAdjacentHTML('afterend', '<a class="btn btn-primary" href="calculator.html">العودة إلى الحاسبة</a>');
    }

    if (!ref) {
      api('calculations').then(function (res) {
        if (res.status === 401) { endSession(); toLogin('results.html'); return; }
        if (res.ok && res.items.length) { location.replace('results.html?ref=' + encodeURIComponent(res.items[0].ref)); }
        else location.replace('calculator.html');
      });
      return;
    }

    api('calculation', { query: '&ref=' + encodeURIComponent(ref) }).then(function (res) {
      if (res.status === 401) { endSession(); toLogin('results.html?ref=' + encodeURIComponent(ref)); return; }
      if (!res.ok) { reportError(res.message); return; }
      render(res);
    });

    function render(data) {
      var c = data.calculation, o = data.owner;
      var r = compute(c), invText = (r.invQty > 1 ? r.invQty + ' × ' : '') + r.invSize + ' kVA';
      document.title = 'مقايسة ' + c.ref + ' | شمس الجزيرة';

      setText('m-name', o.fullName);
      setText('m-res', o.residence || '-');
      setText('m-phone', o.phone || '-');
      setText('m-email', o.email || '-');
      setText('m-service', c.service || GENERIC_SERVICE);
      setText('m-load', fmt(c.load) + ' واط، ' + c.hours + ' ساعة ليلاً، ' + c.dayHours + ' ساعة نهاراً');
      setText('m-date', new Date(c.createdAt).toLocaleDateString('en-GB'));
      setText('m-ref', c.ref);

      setText('r-inv', invText);
      setText('r-inv-sub', 'قدرة ظاهرية مطلوبة ' + L(fmt(r.rawKVA, 2) + ' kVA') + '، بمعامل قدرة 0.8 وهامش أمان 25%');
      setText('r-bat-ah', fmt(r.totalAh) + ' Ah');
      setText('r-bat-sub', L(fmt(r.kWhNominal, 1) + ' kWh') + ' اسمي، المتاح فعلياً ' + L(fmt(r.kWhUsable, 1) + ' kWh'));
      setText('r-pv-qty', r.panels + ' ألواح');
      setText('r-pv-sub', 'قدرة إجمالية ' + L(fmt(r.pvWp / 1000, 2) + ' kWp') + '، لوح ' + L(PANEL_W + ' W') + ' نوع N-Type');
      setText('r-volt', r.V + ' V');
      setText('r-volt-sub', r.V !== r.inputV ? 'مرفوع من ' + L(r.inputV + ' V') + ' إلى ' + L(r.V + ' V') : 'مطابق للجهد المختار');

      var vn = $('voltNotice');
      if (vn && r.notes.length) { setText('voltNoticeText', r.notes.join(' ')); vn.hidden = false; }

      var basis = $('basisBody');
      addRow(basis, ['إجمالي الأحمال الفعلية', L(fmt(c.load) + ' W')]);
      addRow(basis, ['ساعات التشغيل ليلاً على البطاريات', c.hours + ' ساعة']);
      addRow(basis, ['ساعات الحمل النهاري المباشر', c.dayHours + ' ساعة']);
      addRow(basis, ['نوع البطاريات / عمق التفريغ الآمن', BATT_NAME[c.battType] + ' / ' + L(Math.round(r.dod * 100) + '%')]);
      addRow(basis, ['كفاءة الإنفرتر والكابلات', '0.90']);
      addRow(basis, ['ساعات الذروة الشمسية (السودان)', PSH + ' ساعة/يوم']);
      addRow(basis, ['معامل الفقد الحراري والكفاءة للألواح', PV_LOSS.toFixed(2)]);
      addRow(basis, ['الطاقة اليومية المطلوبة من الألواح', L(fmt(r.dailyWh / 1000, 1) + ' kWh')]);
      addRow(basis, ['تيار الجهة المستمرة التقديري', L(fmt(r.idc, 0) + ' A')]);

      var bom = $('bomBody');
      addRow(bom, ['إنفرتر / شاحن هجين أو مستقل', 'قدرة ' + L(r.invSize + ' kVA') + '، جهد دخل ' + L(r.V + ' V DC'), String(r.invQty)]);
      addRow(bom, ['بنك البطاريات', r.unit.label, String(r.units)]);
      addRow(bom, ['تكوين التوصيل', r.series + ' على التوالي × ' + r.parallel + ' على التوازي = ' + L(fmt(r.totalAh) + ' Ah') + ' عند ' + L(r.V + ' V'), '-']);
      addRow(bom, ['ألواح شمسية أحادية البلورة N-Type', L(PANEL_W + ' W') + ' للوح', String(r.panels)]);
      addRow(bom, ['قاطع حماية للجهة المستمرة (بين البطارية والإنفرتر)', 'لا يقل عن ' + L(r.breaker + ' A DC'), '1']);

      var recs = [];
      recs.push('<b>الإنفرتر:</b> القدرة الظاهرية المطلوبة ' + L(fmt(r.rawKVA, 2) + ' kVA') + '، واختير أقرب مقاس تجاري ' + L(invText) + '. يغطي الهامش 25% تيارات الإقلاع للمحركات والضواغط.');
      recs.push('<b>البطاريات:</b> السعة المحسوبة ' + L(fmt(r.reqAh) + ' Ah') + ' وفق المعادلة (الحمل × الساعات) ÷ (الجهد × عمق التفريغ × 0.90)، وإجمالي الطاقة المخزنة ' + L(fmt(r.kWhNominal, 1) + ' kWh') + '. التكوين العملي: ' + r.units + ' بطارية من نوع ' + r.unit.label + '، موصولة ' + r.series + ' على التوالي و' + r.parallel + ' على التوازي.');
      if (c.battType === 'lithium') recs.push('<b>بطاريات الليثيوم:</b> يلزم وصل كابل اتصال نظام إدارة البطارية (BMS) مع الإنفرتر بالبروتوكول المتوافق، وضبط جهود القطع والشحن وفق مواصفات المصنّع.');
      if (c.battType === 'tubular') recs.push('<b>البطاريات الأنبوبية:</b> تتطلب فحص مستوى الماء المقطر كل شهرين تقريباً وتهوية جيدة لمكان التركيب، مع الحفاظ على تساوي أطوال الكابلات بين الفروع المتوازية.');
      if (c.battType === 'gel') recs.push('<b>بطاريات الجل:</b> حساسة للحرارة المرتفعة وللشحن الزائد؛ يُراعى تركيبها في مكان مظلل جيد التهوية وضبط جهد الشحن على نمط الجل.');
      recs.push('<b>الألواح الشمسية:</b> المصفوفة مصممة لتغطية الحمل النهاري المباشر وإعادة شحن البنك خلال ' + PSH + ' ساعات ذروة، بقدرة إجمالية ' + L(fmt(r.pvWp / 1000, 2) + ' kWp') + '. يُتحقق من توافق جهد الدارة المفتوحة للمصفوفة مع حدود منظم الشحن MPPT قبل تحديد توزيع السلاسل.');
      recs.push('<b>الكابلات والحماية:</b> تيار الجهة المستمرة التقديري ' + L(fmt(r.idc, 0) + ' A') + '. يُحدد مقطع الكابل بحسب الطول الفعلي بحيث لا يتجاوز هبوط الجهد 2%، مع تركيب قاطع DC لا يقل عن ' + L(r.breaker + ' A') + ' ونظام تأريض مطابق.');
      recs.push('<b>التركيب:</b> تُترك فراغات تهوية حول الإنفرتر والبطاريات، وتُوجَّه الألواح نحو الجنوب بميل قريب من خط عرض الموقع، مع تنظيف دوري لتفادي فقد الغبار.');
      var list = $('recList');
      recs.forEach(function (h) { var li = document.createElement('li'); li.innerHTML = h; list.appendChild(li); });

      var btn = $('quoteBtn'), st = $('quoteStatus');
      function markRequested() { btn.disabled = true; btn.textContent = 'تم تسجيل طلب عرض السعر'; }
      if (data.quoteStatus) { markRequested(); showMsg(st, 'سُجّل طلب عرض السعر لهذا التقرير مسبقاً، وسيتواصل معك الفريق الهندسي.', true); }
      btn.addEventListener('click', function () {
        btn.disabled = true;
        api('request_quote', { body: { ref: c.ref } }).then(function (res) {
          if (res.ok) { markRequested(); showMsg(st, 'سُجّل طلب عرض السعر برقم المرجع ' + c.ref + '. سيتواصل معك الفريق الهندسي على رقمك ' + (o.phone || '') + '.', true); return; }
          if (res.status === 401) { endSession(); toLogin('results.html?ref=' + encodeURIComponent(c.ref)); return; }
          btn.disabled = false; showMsg(st, res.message);
        });
      });

      var wa = $('waBtn');
      if (wa) {
        var msg = 'السلام عليكم، أرغب بعرض سعر للنظام الشمسي. المرجع: ' + c.ref + '، الحمل: ' + fmt(c.load) + ' واط، إنفرتر ' + invText + ' / ' + r.V + ' فولت، عدد الألواح: ' + r.panels + '.';
        wa.href = 'https://wa.me/' + COMPANY_WA + '?text=' + encodeURIComponent(msg);
      }
      var pb = $('printBtn');
      if (pb) pb.addEventListener('click', function () { window.print(); });
    }
  }

  function initAppliances() {
    var sel = $('applianceSelect');
    if (!sel) return;
    var wattsEl = $('applianceWatts'), qtyEl = $('applianceQty'), body = $('appliancesTableBody'),
        totalEl = $('grandTotalWatts'), err = $('addError');
    var list = read(K.list, []), seq = 0;
    list.forEach(function (a) { if (a.id > seq) seq = a.id; });

    function total() { return list.reduce(function (t, a) { return t + a.watts * a.qty; }, 0); }
    function render() {
      body.innerHTML = '';
      if (!list.length) {
        var tr0 = document.createElement('tr'); tr0.className = 'empty-row';
        tr0.innerHTML = '<td colspan="5">لم تضف أي جهاز بعد. اختر جهازاً من القائمة أعلاه ثم اضغط إضافة.</td>';
        body.appendChild(tr0);
      }
      list.forEach(function (a) {
        var tr = document.createElement('tr'), cells = [a.name, fmt(a.watts), fmt(a.qty), fmt(a.watts * a.qty)];
        cells.forEach(function (t, idx) { var td = document.createElement('td'); td.textContent = t; if (idx > 0) td.className = 'num'; tr.appendChild(td); });
        var td = document.createElement('td'), b = document.createElement('button');
        b.type = 'button'; b.className = 'btn btn-danger-ghost'; b.setAttribute('data-del', a.id);
        b.setAttribute('aria-label', 'حذف ' + a.name); b.textContent = 'حذف';
        td.appendChild(b); tr.appendChild(td); body.appendChild(tr);
      });
      totalEl.textContent = fmt(total());
      write(K.list, list);
    }

    sel.addEventListener('change', function () {
      var opt = sel.options[sel.selectedIndex], w = opt.getAttribute('data-watts');
      if (sel.value === 'custom') { wattsEl.value = ''; wattsEl.focus(); } else { wattsEl.value = w || ''; }
    });
    $('addApplianceBtn').addEventListener('click', function () {
      var watts = parseFloat(wattsEl.value), qty = parseInt(qtyEl.value, 10);
      if (!sel.value) { showMsg(err, 'اختر الجهاز من القائمة أولاً.'); return; }
      if (!(watts > 0 && watts <= 20000)) { showMsg(err, 'أدخل قدرة صحيحة بالواط (من 1 إلى 20000).'); return; }
      if (!(qty >= 1 && qty <= 999)) { showMsg(err, 'أدخل عدداً صحيحاً من 1 إلى 999.'); return; }
      hideMsg(err);
      var name = sel.value === 'custom' ? 'جهاز مخصص' : sel.options[sel.selectedIndex].text;
      list.push({ id: ++seq, name: name, watts: watts, qty: qty });
      sel.selectedIndex = 0; wattsEl.value = ''; qtyEl.value = 1;
      render();
    });
    body.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-del]') : null;
      if (!b) return;
      var id = parseInt(b.getAttribute('data-del'), 10);
      list = list.filter(function (a) { return a.id !== id; });
      render();
    });
    $('exportLoadBtn').addEventListener('click', function () {
      var t = total();
      if (t <= 0) { showMsg(err, 'أضف جهازاً واحداً على الأقل قبل اعتماد الأحمال.'); return; }
      write(K.load, t);
      location.href = 'calculator.html';
    });
    render();
  }

  function initDemoPanel() {
    var items = document.querySelectorAll('[data-demo]');
    if (!items.length) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    function tick() {
      Array.prototype.forEach.call(items, function (el) {
        var base = parseFloat(el.getAttribute('data-base')), span = parseFloat(el.getAttribute('data-span')),
            dec = parseInt(el.getAttribute('data-dec') || '0', 10), max = parseFloat(el.getAttribute('data-max')),
            v = base + (Math.random() * 2 - 1) * span;
        el.textContent = v.toFixed(dec);
        var g = document.getElementById(el.getAttribute('data-gauge'));
        if (g) g.style.setProperty('--v', Math.max(0, Math.min(100, v / max * 100)).toFixed(0) + '%');
      });
    }
    setInterval(tick, 2500);
  }
})();
