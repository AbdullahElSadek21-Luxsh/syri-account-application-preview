# Syri Account Application Form — preview

Public preview build of the digitalised Syri Ltd. **New Customer Account Application**
(Form F/SALE/0015/004/V4, parent SOP SOP/SALE/0015): an on-screen replacement for the
print, sign and scan Word form.

**Live:** https://abdullahelsadek21-luxsh.github.io/syri-account-application-preview/

- **Section A**: company details, business address, trade references, business type,
  account details and the signed declaration
- **Section B**: any number of additional delivery addresses
- **Electronic signature**: drawn signature with explicit consent to sign electronically,
  plus a signature record (UTC and UK timestamps, IP address, browser/device, SHA-256
  integrity hash) shown on submission

Self-contained static page. No build step, no backend. Submission is not wired to a
destination yet; completed answers are logged to the browser console only. The IP address
is client-reported via api.ipify.org. Once a backend exists it should be captured
server-side. The controlled Word original is kept private.

> **Status: DRAFT — for review, not a released build.**

The page is served with `noindex` and excluded in `robots.txt`, so it should stay out of
search results. The URL is unlisted, not access-controlled — anyone holding the link can
open it.
