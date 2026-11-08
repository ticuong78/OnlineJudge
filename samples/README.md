# Sample files for manual testing and UAT

- `exams/`: exam documents and text for "Nhập đề" (Word, PDF with and without a text layer, paste text, a bad file).
- `code/`: submissions that produce each verdict, in every language, plus a near-copy pair for the plagiarism check
  (see `code/README.md`).

Expected results for every file are in [docs/testing/local-setup.md](../docs/testing/local-setup.md#5-sample-files-to-upload-and-submit).

Rebuild the exam files (no extra packages; PDFs use Playwright's Chromium):

```bash
node samples/make-samples.mjs
```
