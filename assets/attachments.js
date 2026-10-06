/* Syri Ltd. — "Attachments" section shared by the application forms.

   Usage (see each form):
     var att = SyriAttachments.mount(containerEl, [
       { id: 'wda', label: 'Copy of WDA licence', hint: '…', required: true },
       { id: 'orgChart', label: 'Organisation chart', required: function () { return …; } },
       { id: 'depot1Gdp', label: '…', showIf: function () { return …; } }
     ], { hideWhenEmpty: true });
     att.validate()          -> first invalid row (or null); marks rows invalid
     att.summary()           -> Promise [{ label, name, size, type, sha256 }]
     att.appendToPdf(pdf, PDFLib, font, bold) -> Promise [failed file names]
     att.getFiles(id) / att.setFiles(id, files) -> move files between rows

   Limits (all forms): up to 5 documents per application, 3 MB each.
   Photos over 3 MB are resized automatically; larger PDFs are refused.

   Prototype: files stay in the applicant's browser. They are listed in the
   signature record (name, size, SHA-256) and appended to the completed PDF
   after the form pages. Sending them to Syri needs the Phase 1 mail service. */
(function () {
  'use strict';

  var ACCEPT = '.pdf,.jpg,.jpeg,.png';
  var TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
  var BY_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  var MAX_FILE = 3 * 1024 * 1024;
  var MAX_FILES = 5;
  var MAX_SIDE = 2200;            /* longest side of a resized photo, in pixels */
  var A4 = [595.28, 841.89];

  var CSS =
    '.att-intro{margin:0 0 18px;font-size:13.5px;color:#636A7E}' +
    '.att-item{padding:14px 16px;border:1px solid #D9DDE7;border-radius:8px;margin-bottom:14px}' +
    '.att-item[hidden]{display:none}' +
    '.att-pick{position:relative;display:inline-flex;align-items:center;gap:8px;margin-top:4px;padding:8px 14px;' +
      'border:1px solid #D9DDE7;border-radius:6px;background:#fff;color:#26358C;font-size:13.5px;font-weight:600;cursor:pointer}' +
    '.att-pick:hover{border-color:#26358C}' +
    '.att-pick input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}' +
    '.att-pick:focus-within{outline:2px solid #26358C;outline-offset:2px}' +
    '.att-list{list-style:none;margin:10px 0 0;padding:0}' +
    '.att-list li{display:flex;align-items:center;gap:10px;padding:6px 10px;margin-top:6px;' +
      'background:#F5F6FA;border-radius:6px;font-size:13px}' +
    '.att-list li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.att-list li small{color:#636A7E}' +
    '.att-list button{background:none;border:0;padding:0;font:inherit;font-size:12.5px;color:#B42318;' +
      'text-decoration:underline;cursor:pointer}' +
    '.att-item.invalid{border-color:#B42318}' +
    '.att-item .error{display:none;margin-top:6px;font-size:13px;color:#B42318}' +
    '.att-item.invalid .error{display:block}' +
    '.att-count{margin:0 0 14px;font-size:13px;font-weight:600;color:#26358C}' +
    '.att-count.full{color:#B42318}' +
    '.att-pick.disabled{opacity:.45;cursor:not-allowed}' +
    '@media print{.att-pick,.att-list button{display:none!important}}';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }

  function size(n) {
    return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  }

  function isOn(v) { return typeof v === 'function' ? !!v() : !!v; }

  /* Browser-reported type, or the extension when the browser reports none */
  function typeOf(f) {
    if (f.type) { return f.type; }
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    return BY_EXT[ext] || '';
  }

  /* Re-encode a photo as JPEG, scaled down, until it is under MAX_FILE.
     Resolves to the smaller File, or null if it cannot be made small enough. */
  function shrinkImage(f) {
    if (!window.createImageBitmap) { return Promise.resolve(null); }
    return createImageBitmap(f).then(function (bmp) {
      var scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      var g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bmp, 0, 0, c.width, c.height);
      function attempt(q) {
        return new Promise(function (res) { c.toBlob(res, 'image/jpeg', q); }).then(function (blob) {
          if (blob && blob.size <= MAX_FILE) {
            var name = f.name.replace(/\.(png|jpe?g)$/i, '') + '.jpg';
            return new File([blob], name, { type: 'image/jpeg', lastModified: f.lastModified });
          }
          return q > 0.5 ? attempt(q - 0.15) : null;
        });
      }
      return attempt(0.85);
    }).catch(function () { return null; });
  }

  /* PNGs go into the PDF as JPEG, decoded by the browser: pdf-lib decodes PNGs
     in JavaScript, which takes minutes for a large image. Resolves to JPEG
     bytes, or null so the caller can fall back to the original PNG. */
  function pngToJpeg(buf) {
    if (!window.createImageBitmap) { return Promise.resolve(null); }
    return createImageBitmap(new Blob([buf], { type: 'image/png' })).then(function (bmp) {
      var scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      var g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.9); });
    }).then(function (blob) { return blob ? blob.arrayBuffer() : null; }).catch(function () { return null; });
  }

  function sha256(buf) {
    if (!(window.crypto && crypto.subtle)) { return Promise.resolve('unavailable'); }
    return crypto.subtle.digest('SHA-256', buf).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    }).catch(function () { return 'unavailable'; });
  }

  function mount(container, items, opts) {
    opts = opts || {};
    if (!document.getElementById('att-css')) {
      var st = el('style'); st.id = 'att-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }

    var rows = {};
    var files = {};
    var counter = el('p', 'att-count');
    counter.setAttribute('aria-live', 'polite');
    container.appendChild(counter);
    var list = el('div');
    container.appendChild(list);

    /* Documents counted towards the limit: files in rows currently shown */
    function total() {
      return items.reduce(function (n, item) { return n + (visible(item) ? files[item.id].length : 0); }, 0);
    }

    function updateCount() {
      var n = total();
      counter.textContent = n + ' of ' + MAX_FILES + ' documents attached' + (n >= MAX_FILES ? ' (limit reached)' : '');
      counter.classList.toggle('full', n >= MAX_FILES);
      items.forEach(function (item) {
        var r = rows[item.id];
        r.input.disabled = n >= MAX_FILES;
        r.pick.classList.toggle('disabled', n >= MAX_FILES);
      });
    }

    items.forEach(function (item) {
      files[item.id] = [];
      /* Not a ".field": host forms re-check .field rows on change and would clear our errors */
      var row = el('div', 'att-item');
      var inputId = 'att-' + item.id;
      var label = el('span', 'label', item.label + ' ');
      var star = el('span', 'req', '*');
      label.appendChild(star);
      row.appendChild(label);
      if (item.hint) { row.appendChild(el('span', 'hint', item.hint)); }

      var pick = el('label', 'att-pick');
      pick.setAttribute('for', inputId);
      pick.appendChild(document.createTextNode('+ Choose file'));
      var input = el('input');
      input.type = 'file';
      input.id = inputId;
      input.accept = ACCEPT;
      input.multiple = true;
      input.setAttribute('aria-label', item.label);
      pick.appendChild(input);
      row.appendChild(pick);

      var ul = el('ul', 'att-list');
      row.appendChild(ul);
      var err = el('div', 'error');
      row.appendChild(err);

      input.addEventListener('change', function () {
        var problems = [];
        var picked = Array.prototype.slice.call(input.files);
        input.value = '';
        /* One file at a time: photos may need resizing, and the 5-document limit applies */
        var chain = Promise.resolve();
        picked.forEach(function (f) {
          chain = chain.then(function () {
            var type = typeOf(f);
            if (TYPES.indexOf(type) === -1) { problems.push(f.name + ' is not a PDF, JPG or PNG'); return; }
            if (total() >= MAX_FILES) {
              problems.push(f.name + ' was not added: you can attach up to ' + MAX_FILES + ' documents in total');
              return;
            }
            var dup = files[item.id].some(function (g) {
              return g.name === f.name && g.lastModified === f.lastModified;
            });
            if (dup) { return; }
            if (f.size <= MAX_FILE) { files[item.id].push(f); return; }
            if (type === 'application/pdf') {
              problems.push(f.name + ' is larger than 3 MB. Please reduce the PDF size and try again');
              return;
            }
            return shrinkImage(f).then(function (small) {
              if (small) { files[item.id].push(small); }
              else { problems.push(f.name + ' is larger than 3 MB and could not be resized'); }
            });
          });
        });
        chain.then(function () {
          draw(item);
          if (problems.length) { mark(item, false, problems.join('. ') + '.'); }
          else if (files[item.id].length) { mark(item, true); }
          if (item.onChange) { item.onChange(files[item.id].length); }
        });
      });

      rows[item.id] = { row: row, star: star, ul: ul, err: err, input: input, pick: pick };
      list.appendChild(row);
    });

    function draw(item) {
      var r = rows[item.id];
      r.ul.innerHTML = '';
      files[item.id].forEach(function (f, i) {
        var li = el('li');
        li.appendChild(el('span', null, f.name));
        li.appendChild(el('small', null, size(f.size)));
        var rm = el('button', null, 'Remove');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove ' + f.name);
        rm.addEventListener('click', function () {
          files[item.id].splice(i, 1);
          draw(item);
          if (item.onChange) { item.onChange(files[item.id].length); }
          /* Flag straight away if a required row is now empty */
          if (isOn(item.required) && !files[item.id].length && visible(item)) { mark(item, false); }
        });
        li.appendChild(rm);
        r.ul.appendChild(li);
      });
      updateCount();
    }

    function mark(item, ok, msg) {
      var r = rows[item.id];
      r.row.classList.toggle('invalid', !ok);
      r.err.textContent = ok ? '' : (msg || 'Please attach this document');
      r.input.setAttribute('aria-invalid', ok ? 'false' : 'true');
    }

    function visible(item) { return item.showIf ? !!item.showIf() : true; }

    /* Show/hide conditional rows and required markers */
    function refresh() {
      var any = false;
      items.forEach(function (item) {
        var r = rows[item.id];
        var show = visible(item);
        r.row.hidden = !show;
        r.star.style.display = isOn(item.required) ? '' : 'none';
        if (!show) { mark(item, true); }
        any = any || show;
      });
      if (opts.hideWhenEmpty) { container.hidden = !any; }
      updateCount();
      return any;
    }

    function validate() {
      refresh();
      var first = null;
      items.forEach(function (item) {
        if (!visible(item)) { return; }
        var ok = !isOn(item.required) || files[item.id].length > 0;
        mark(item, ok);
        if (!ok && !first) { first = rows[item.id].row; }
      });
      /* Files can only exceed the limit if hidden rows came back into view */
      if (!first && total() > MAX_FILES) {
        var last = items.filter(function (i) { return visible(i) && files[i.id].length; }).pop();
        mark(last, false, 'You can attach up to ' + MAX_FILES + ' documents in total. Please remove ' +
          (total() - MAX_FILES) + '.');
        first = rows[last.id].row;
      }
      return first;
    }

    function active() {
      var out = [];
      items.forEach(function (item) {
        if (!visible(item)) { return; }
        files[item.id].forEach(function (f) { out.push({ item: item, file: f }); });
      });
      return out;
    }

    function summary() {
      return Promise.all(active().map(function (a) {
        return a.file.arrayBuffer().then(sha256).then(function (hash) {
          return { label: a.item.label, name: a.file.name, size: a.file.size, type: typeOf(a.file), sha256: hash };
        });
      }));
    }

    /* Adds the attachments to the completed PDF:
         - an "Attachments" index page listing every document;
         - every document on its own page(s), titled with the uploaded file name
           (photos fitted to one page; PDF pages placed on A4, one per page).
       The attachment pages always end up LAST: the host page adds its
       signature record afterwards, so pdf.save() is wrapped once to move the
       attachment block behind it. Returns the names of files that failed. */
    function appendToPdf(pdf, L, font, bold) {
      var all = active();
      if (!all.length) { return Promise.resolve([]); }
      var ink = L.rgb(0.1, 0.11, 0.16);
      var navy = L.rgb(0.149, 0.208, 0.549);
      var grey = L.rgb(0.39, 0.42, 0.49);
      var failed = [];
      var firstIndex = pdf.getPageCount();
      var safe = function (s) {
        return Array.from(String(s)).map(function (ch) {
          try { font.encodeText(ch); return ch; } catch (e) { return '?'; }
        }).join('');
      };
      var WIDTH = A4[0] - 100;
      function wrap(text, f, sz) {
        var out = [], line = '';
        text.split(' ').forEach(function (w) {
          var t = line ? line + ' ' + w : w;
          if (f.widthOfTextAtSize(t, sz) <= WIDTH || !line) { line = t; } else { out.push(line); line = w; }
        });
        out.push(line);
        return out.map(function (l) {
          while (f.widthOfTextAtSize(l, sz) > WIDTH && l.length > 1) { l = l.slice(0, -2) + '…'; }
          return l;
        });
      }

      /* Index: lines wrap to the page width and continue onto further pages */
      var entries = all.map(function (a, n) {
        return wrap(safe((n + 1) + '.  ' + a.file.name + '  (' + size(a.file.size) + ')  –  ' + a.item.label), font, 9.5);
      });
      var indexCount = 0;
      var slots = [];
      var index, y;
      function newIndexPage() {
        index = pdf.addPage(A4);
        indexCount += 1;
        index.drawText(indexCount === 1 ? 'Attachments' : 'Attachments (continued)',
          { x: 50, y: A4[1] - 70, size: 16, font: bold, color: navy });
        y = A4[1] - 100;
      }
      newIndexPage();
      entries.forEach(function (lines) {
        if (y - lines.length * 13 - 16 < 50) { newIndexPage(); }
        lines.forEach(function (ln) {
          index.drawText(ln, { x: 50, y: y, size: 9.5, font: font, color: ink });
          y -= 13;
        });
        slots.push({ page: index, y: y });   /* where a "could not be added" note goes */
        y -= 14;
      });

      /* A titled A4 page; returns the page and the box left for the content */
      function titledPage(a, n, part) {
        var page = pdf.addPage(A4);
        page.drawText(wrap(safe(a.file.name), bold, 13)[0], { x: 50, y: A4[1] - 50, size: 13, font: bold, color: navy });
        var sub = 'Attachment ' + (n + 1) + ' of ' + all.length + '  ·  ' + a.item.label + (part ? '  ·  ' + part : '');
        page.drawText(wrap(safe(sub), font, 8.5)[0], { x: 50, y: A4[1] - 66, size: 8.5, font: font, color: grey });
        page.drawLine({ start: { x: 50, y: A4[1] - 76 }, end: { x: A4[0] - 50, y: A4[1] - 76 }, thickness: 0.5, color: L.rgb(0.85, 0.87, 0.91) });
        return { page: page, box: { x: 50, y: 40, w: A4[0] - 100, h: A4[1] - 130 } };
      }
      function fit(w, h, box) {
        var s = Math.min(box.w / w, box.h / h, 1);
        return { x: box.x + (box.w - w * s) / 2, y: box.y + (box.h - h * s), width: w * s, height: h * s };
      }

      var chain = Promise.resolve();
      all.forEach(function (a, n) {
        chain = chain.then(function () {
          return a.file.arrayBuffer().then(function (buf) {
            if (typeOf(a.file) === 'application/pdf') {
              return L.PDFDocument.load(buf).then(function (src) {
                /* pdf-lib only embeds pages when the final PDF is saved, so a page it cannot embed
                   (for example a blank page with no content stream) would break the whole PDF.
                   Embed into a scratch document first: a failure here is caught for this file only. */
                var idx = src.getPageIndices();
                return L.PDFDocument.create().then(function (probe) {
                  return probe.embedPdf(src, idx);
                }).then(function (eps) {
                  return Promise.all(eps.map(function (ep) { return ep.embed(); }));
                }).then(function () {
                  return pdf.embedPdf(src, idx);
                });
              }).then(function (embedded) {
                embedded.forEach(function (ep, i) {
                  var t = titledPage(a, n, embedded.length > 1 ? 'page ' + (i + 1) + ' of ' + embedded.length : '');
                  t.page.drawPage(ep, fit(ep.width, ep.height, t.box));
                });
              });
            }
            var isPng = typeOf(a.file) === 'image/png';
            var embed = (isPng ? pngToJpeg(buf) : Promise.resolve(null)).then(function (jpg) {
              if (jpg) { return pdf.embedJpg(jpg); }
              return isPng ? pdf.embedPng(buf) : pdf.embedJpg(buf);
            });
            return embed.then(function (img) {
              var t = titledPage(a, n, '');
              t.page.drawImage(img, fit(img.width, img.height, t.box));
            });
          }).catch(function () {
            failed.push(a.file.name);
            slots[n].page.drawText('     (could not be added: protected or unreadable file)',
              { x: 50, y: slots[n].y + 2, size: 8.5, font: font, color: L.rgb(0.7, 0.14, 0.09) });
          });
        });
      });

      return chain.then(function () {
        var lastIndex = pdf.getPageCount();       /* attachment block = [firstIndex, lastIndex) */
        var save = pdf.save;
        pdf.save = function (options) {
          pdf.save = save;
          var n = pdf.getPageCount();
          if (lastIndex < n) {
            var block = [];
            for (var i = firstIndex; i < lastIndex; i++) { block.push(pdf.getPage(i)); }
            for (var j = lastIndex - 1; j >= firstIndex; j--) { pdf.removePage(j); }
            block.forEach(function (p) { pdf.addPage(p); });
          }
          return save.call(pdf, options);
        };
        return failed;
      });
    }

    document.addEventListener('change', function () { setTimeout(refresh, 0); });
    document.addEventListener('click', function () { setTimeout(refresh, 0); });
    refresh();

    /* Read or replace one row's files (e.g. when a repeatable section is removed) */
    function getFiles(id) { return files[id].slice(); }
    function setFiles(id, list) {
      var item = items.filter(function (i) { return i.id === id; })[0];
      files[id] = (list || []).slice();
      draw(item);
      if (item.onChange) { item.onChange(files[id].length); }
    }

    return {
      refresh: refresh, validate: validate, summary: summary, appendToPdf: appendToPdf,
      active: active, getFiles: getFiles, setFiles: setFiles
    };
  }

  window.SyriAttachments = { mount: mount };
}());
