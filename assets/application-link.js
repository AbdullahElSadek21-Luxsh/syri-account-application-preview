/* Syri Ltd. — application links.
   Shared by the staff request page (syri-requests.html), the customer checklist (application.html)
   and every form page.

   A request made by Syri staff becomes a personal link:
     application.html?ref=APP-261006-K7Q2&co=<company>&cn=<contact>&f=supplier,q-wda&by=<staff>[&msg=<note>]
   The link opens the customer's checklist; each form opens with the same query plus &form=<key>.

   Preview build: requests, mailboxes and progress are kept in this browser (localStorage).
   The live platform keeps them on the server and the link carries a private token instead. */
(function (global) {
  'use strict';

  var FORMS = {
    uk:               { title: 'UK customer account application', number: 'F/SALE/0015/004', page: 'syri-account-application-form.html', group: 'account' },
    hospital:         { title: 'Hospital account application', number: 'F/SALE/0015/003', page: 'form-hospital.html', group: 'account' },
    export:           { title: 'International customer account application', number: 'F/SALE/0015/006 and 005', page: 'form-export.html', group: 'account' },
    supplier:         { title: 'Supplier account opening form', number: 'F/SALE/0017/003', page: 'form-supplier.html', group: 'account' },
    'q-wda':          { title: 'Supplier questionnaire (WDA)', number: 'F/SALE/0017/004', page: 'questionnaire-wda.html', group: 'questionnaire' },
    'q-manufacturer': { title: 'Manufacturer assessment questionnaire', number: 'F/QA/0014/008', page: 'questionnaire-manufacturer.html', group: 'questionnaire' },
    'q-supplier':     { title: 'Supplier assessment questionnaire', number: 'F/QA/0014/005', page: 'questionnaire-supplier.html', group: 'questionnaire' }
  };
  var ORDER = ['uk', 'hospital', 'export', 'supplier', 'q-wda', 'q-manufacturer', 'q-supplier'];
  var REF_RE = /^APP-\d{6}-[A-Z0-9]{4}$/;

  /* ---------- storage (fails quietly in private windows) ---------- */
  function load(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  /* ---------- the application carried by a personal link ---------- */
  function readApp(search) {
    var p = new URLSearchParams(search || '');
    var ref = (p.get('ref') || '').toUpperCase();
    var forms = (p.get('f') || '').split(',').filter(function (k, i, all) {
      return FORMS[k] && all.indexOf(k) === i;
    });
    var company = (p.get('co') || '').trim();
    if (!REF_RE.test(ref) || !forms.length || !company) { return null; }
    forms.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
    return {
      ref: ref,
      company: company.slice(0, 160),
      contact: (p.get('cn') || '').trim().slice(0, 120),
      forms: forms,
      by: (p.get('by') || '').trim().slice(0, 120),
      msg: (p.get('msg') || '').trim().slice(0, 600)
    };
  }

  function appQuery(app) {
    var q = new URLSearchParams();
    q.set('ref', app.ref);
    q.set('co', app.company);
    if (app.contact) { q.set('cn', app.contact); }
    q.set('f', app.forms.join(','));
    if (app.by) { q.set('by', app.by); }
    if (app.msg) { q.set('msg', app.msg); }
    return q.toString();
  }

  function formLink(app, key) {
    var q = new URLSearchParams(appQuery(app));
    q.set('form', key);
    q.set('sentBy', (app.by ? app.by + ', ' : '') + 'application ' + app.ref);
    return FORMS[key].page + '?' + q.toString();
  }

  function newRef() {
    var d = new Date();
    var ymd = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', tail = '';
    var rnd = new Uint32Array(4);
    (global.crypto || global.msCrypto).getRandomValues(rnd);
    for (var i = 0; i < 4; i++) { tail += chars.charAt(rnd[i] % chars.length); }
    return 'APP-' + ymd + '-' + tail;
  }

  /* ---------- progress of one application ---------- */
  function progress(ref) { return load('syri.app.' + ref, { forms: {}, submittedAt: null }); }
  function markComplete(ref, key) {
    var pr = progress(ref);
    pr.forms[key] = { completedAt: new Date().toISOString() };
    save('syri.app.' + ref, pr);
    return pr;
  }
  function markSubmitted(ref) {
    var pr = progress(ref);
    pr.submittedAt = new Date().toISOString();
    save('syri.app.' + ref, pr);
    return pr;
  }
  function status(app) {
    var pr = progress(app.ref);
    var done = app.forms.filter(function (k) { return pr.forms[k]; }).length;
    var label = pr.submittedAt ? 'Submitted' : (done ? 'In progress' : 'Sent');
    return { label: label, done: done, total: app.forms.length, submittedAt: pr.submittedAt, forms: pr.forms };
  }

  function ukTime(iso) {
    if (!iso) { return ''; }
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  global.SyriApp = {
    FORMS: FORMS, ORDER: ORDER, load: load, save: save, readApp: readApp, appQuery: appQuery,
    formLink: formLink, newRef: newRef, progress: progress, markComplete: markComplete,
    markSubmitted: markSubmitted, status: status, ukTime: ukTime
  };

  /* ---------- on a form page opened from a personal link ---------- */
  var doneBox = document.getElementById('done');
  if (!doneBox) { return; }
  var params = new URLSearchParams(global.location.search);
  var app = readApp(global.location.search);
  var key = params.get('form');
  if (!app || !FORMS[key] || app.forms.indexOf(key) < 0) { return; }

  var back = 'application.html?' + appQuery(app);
  document.querySelectorAll('a[href^="select.html"]').forEach(function (a) {
    a.href = back;
    a.innerHTML = '&larr; Back to your application';
  });

  if (progress(app.ref).submittedAt) {
    var form = document.querySelector('form');
    var note = document.createElement('p');
    note.setAttribute('role', 'status');
    note.style.cssText = 'margin:0 0 14px;padding:10px 14px;border:1px solid #E7C979;border-radius:6px;background:#FFF8E6;font-size:14px';
    note.textContent = 'This application has already been submitted to Syri Ltd. Contact Syri if you need to change it.';
    if (form && form.parentNode) { form.parentNode.insertBefore(note, form); }
  }

  var marked = false;
  new MutationObserver(function () {
    if (marked || !doneBox.classList.contains('show')) { return; }
    marked = true;
    markComplete(app.ref, key);
    var wrap = document.createElement('div');
    wrap.style.marginTop = '18px';
    wrap.innerHTML = '<p>This form is now ticked off in your application. Submit the application once every form is complete.</p>';
    var link = document.createElement('a');
    link.className = 'btn';
    link.href = back;
    link.textContent = 'Back to your application';
    link.style.cssText = 'display:inline-block;text-decoration:none';
    wrap.appendChild(link);
    var dl = document.getElementById('downloadPdf');
    var anchor = dl ? dl.parentNode : doneBox;
    if (dl && dl.nextSibling) { anchor.insertBefore(wrap, dl.nextSibling); } else { anchor.appendChild(wrap); }
  }).observe(doneBox, { attributes: true, attributeFilter: ['class'] });
}(window));
