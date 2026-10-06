# Syri Account Application Form — preview

Public preview build of the digitalised Syri Ltd. **New Customer Account Application**
(Form F/SALE/0015/004/V4, parent SOP SOP/SALE/0015): an on-screen replacement for the
print, sign and scan Word form.

**Live:** https://abdullahelsadek21-luxsh.github.io/syri-account-application-preview/

**Access rule:** customer and supplier forms open **only from the personal link** that Syri staff send. There is no
public sign-up and no name/email page. Opened without a valid link for that exact form, a form shows only a
"This form opens only from your personal link" notice.

- `index.html`: start page. **Internal** opens the staff area. **External** explains link-only access (no button).
- `syri-requests.html` (internal): staff request an application. They enter the company, contact and email, tick the
  forms (account type pre-ticks its form; questionnaires optional) and the mailboxes that receive the completed
  application. A personal link and an email are generated. The Mailboxes tab adds, edits or removes Syri mailboxes
  and sets a default per form. A tracker exists in the code but is hidden (not in V.1).
- `application.html` (external): the checklist opened by the personal link. Each requested form is ticked off when
  submitted, and "Submit application" sends them together.
- `assets/application-link.js`: shared logic for the personal link and the checklist. It is loaded by every form, blocks
  a form opened without a valid link, and points each form's back link to the checklist.
- `syri-account-application-form.html`: UK customer (F/SALE/0015/004)
- `form-hospital.html`: Hospital (F/SALE/0015/003)
- `form-export.html`: International customer, 6 steps (F/SALE/0015/006 + 005 in one PDF)
- `form-supplier.html`: Supplier Account Opening (F/SALE/0017/003)
- `questionnaire-wda.html`: WDA supplier questionnaire (F/SALE/0017/004)
- `questionnaire-manufacturer.html`: Manufacturer assessment questionnaire (F/QA/0014/008)
- `questionnaire-supplier.html`: Supplier assessment questionnaire (F/QA/0014/005)

- **Section A**: company details, business address, trade references, business type,
  account details and the signed declaration
- **Section B**: any number of additional delivery addresses
- **Electronic signature**: typed name, confirmed by the signer with a timestamp, after
  explicit consent to sign electronically, plus a signature record (UTC and UK timestamps, IP address, browser/device, SHA-256
  integrity hash) shown on submission
- **Attachments**: an Attachments section on every form that asks for documents (max 5 documents,
  3 MB each; large photos resized automatically), appended after the form and signature record,
  one titled page per document
- **Completed PDF**: on submission the answers are written into the real Word form
  (exported to PDF) and downloaded, with the signature record appended as a final page

Static page. No build step, no backend. `assets/` holds pdf-lib 1.17.1 (MIT) and the
PDF export of the Word form used as the background for the completed PDF. Submission is not wired to a
destination yet; completed answers are logged to the browser console only. The IP address
is client-reported via api.ipify.org. Once a backend exists it should be captured
server-side. The controlled Word original is kept private.

> **Status: DRAFT — for review, not a released build.**

The page is served with `noindex` and excluded in `robots.txt`, so it should stay out of
search results. The URL is unlisted, not access-controlled — anyone holding the link can
open it.
