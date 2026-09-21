# private-assets/

Files in this folder are **not** served by the website (only `public/` is).

`the-ecommerce-playbook.pdf` used to live in `public/uploads/`, which meant
anyone could download the paid ebook for free at
`https://your-site/uploads/the-ecommerce-playbook.pdf` — no payment, no
download limit. It now lives here as a local backup copy.

The real, protected copy belongs in the **private** Supabase bucket
(`SUPABASE_PDF_BUCKET`). Upload it through **/admin → Product Content**;
buyers only ever get it through `/api/download`, which checks payment, the
device claim, and the 3-download limit first.

Do not move it back into `public/`. If this repo is public, add this folder
to `.gitignore` too.
