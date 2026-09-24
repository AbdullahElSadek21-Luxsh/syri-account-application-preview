# Syri Account Application Form — preview

Public preview build of the digitalised Syri Ltd. **New Customer Account Application**
(Form F/SALE/0015/004/V4, parent SOP SOP/SALE/0015): an on-screen replacement for the
print, sign and scan Word form.

**Live:** https://abdullahelsadek21-luxsh.github.io/syri-account-application-preview/

- `index.html`: entry page (name + email, front end only), which opens the form
- `syri-account-application-form.html`: the application form

- **Section A**: company details, business address, trade references, business type,
  account details and the signed declaration
- **Section B**: any number of additional delivery addresses
- **Electronic signature**: typed name, confirmed by the signer with a timestamp, after
  explicit consent to sign electronically, plus a signature record (UTC and UK timestamps, IP address, browser/device, SHA-256
  integrity hash) shown on submission
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
