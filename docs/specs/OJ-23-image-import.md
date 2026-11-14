# OJ-23: Import a problem from a photo (VIP)

Status: done (approved by the user 2026-11-13: "Make everything you can now", after the plan that listed image import)
Owner: Htet Oo Naing
Risky area: yes (an uploaded file goes to a Claude adapter; a new AI allowance)

## Outcome

A teacher can upload a photo of a problem (a printed exam, a whiteboard, a textbook page). The AI reads it into the same
drafts as a document, for review before anything is saved. Only the AI can read a photo, so this is a VIP feature: VIP
teachers and organizations with AI get 100 a month (`IMAGE_IMPORT`), free teachers none.

## Scope

In:
- **`POST /imports/parse`** accepts `.png`, `.jpg`/`.jpeg` and `.webp` up to 5 MB (Claude's limit per image), checked
  by signature like documents.
- **The image goes to the existing exam reader** as an image block, with the same system prompt (standard I/O, no
  links or promotion), and the reader is asked to note anything it could not read clearly.
- **Allowance:** one `IMAGE_IMPORT` use per photo, reserved first and given back if the AI cannot read it. There is
  no template reader for photos, so:
  - with no allowance the upload is refused (`ai.vip_required` or `ai.quota_exceeded`);
  - with no key it is refused with `import.image_needs_ai`.
- **Frontend:**
  - The drop zone accepts photos.
  - A line explains that photos are read by AI and, for teachers without the feature, that it is for VIP accounts.
  - The usage card shows the new feature.
- **Docs:** `docs/API.md` and `.env.example` (`AI_LIMIT_FREE_IMAGE_IMPORT`, `AI_LIMIT_PLUS_IMAGE_IMPORT`).

Out: several photos at once (one file per upload, as for documents), handwriting recognition guarantees.

## Done when

- [x] A VIP teacher's PNG/JPEG/WebP photo is read by AI into drafts and counts one `IMAGE_IMPORT` use.
- [x] A free teacher gets `ai.vip_required`. Without a key the answer is `import.image_needs_ai`. A renamed or
      oversized file is refused before any reader. A failed reading gives the use back.
- [x] `test/image-import.test.ts`, `document-signature.test.ts` and `exam-parser.test.ts` pass, and so does the gate.

## AI

- Model: `CLAUDE_MODEL` (exam reader).
- Schema: the reader's existing zod drafts schema; on failure, a `DomainError` (`import.image_unreadable`).
- Cost: one vision call per photo, about the size of a short PDF page.

## Not covered

A real photo read by Claude (no key on the test system). The image block follows the SDK's documented shape and is
typechecked.
