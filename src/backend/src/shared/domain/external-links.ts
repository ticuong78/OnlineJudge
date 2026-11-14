/**
 * Imported exams often carry links to other places: the original problem on another judge
 * ("Link problem : https://leetcode.com/..."), group invitations (Zalo, Facebook, Telegram, Discord),
 * short links. None of it belongs in a statement students read, so links are removed, and a line that
 * was only there to carry a link ("Link problem :", "Tham gia nhóm Zalo: ...") goes with it.
 */

// A closing parenthesis ends a link: "(https://...)" in a sentence leaves "()" behind, which is then dropped.
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"'`)]+|\b(?:t\.me|zalo\.me|discord\.gg|discord\.com\/invite|fb\.com|fb\.me|m\.me|facebook\.com|bit\.ly|tinyurl\.com|forms\.gle)\/[^\s<>"'`)]*/gi;
// The URL stops at whitespace and an optional title follows after it, so the two never compete for the same text; the
// label and title are bounded. `\(([^)\s]+)[^)]*\)` was quadratic on an unclosed "[a](…" and on many of them (OJ-15
// F4). A longer label or title is not read as a Markdown link, but its bare URL is still removed by URL below.
const MARKDOWN_LINK = /!?\[([^\]]{0,500})\]\(([^)\s]{1,2048})(?:\s[^)]{0,500})?\)/g;
// Bounded like MARKDOWN_LINK: an unclosed "<www.…" repeated was quadratic (OJ-15 F4). A longer one keeps its bare URL
// removed by URL below.
const AUTOLINK = /<(?:https?:\/\/|www\.)[^>]{1,2048}>/gi;
// \b does not know Vietnamese letters, so words are bounded by "not a letter or digit".
const word = (alternatives: string, flags = 'giu') => new RegExp(`(?<![\\p{L}\\d])(?:${alternatives})(?![\\p{L}\\d])`, flags);
/** Words of a line whose only job was to point somewhere else. */
const LINK_LABEL = word('link|links|url|nguồn|source|tham khảo|xem thêm|đề gốc|problem|bài gốc|website|web|tại|ở|đây|here');
/** A line with a link and one of these is an invitation to another channel: it goes entirely. */
const INVITATION = word(
  'tham gia|join|vào nhóm|nhóm|group|zalo|facebook|fb|fanpage|telegram|discord|kênh|channel|inbox|liên hệ|đăng ký|subscribe',
  'iu',
);
const isUrl = (s: string) => new RegExp(URL.source, 'i').test(s);

// Trailing punctuation is stripped from the end backwards: `/[…]+$/` is quadratic on a long run of it that is not at the
// end, and pasted text is untrusted (OJ-15 F4).
const trimUrl = (url: string) => {
  let end = url.length;
  while (end > 0 && '.,;:!?)]'.includes(url[end - 1])) end--;
  return url.slice(0, end);
};
const hostOf = (url: string) => {
  try {
    return new globalThis.URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Removes external links from a section; returns the hosts that were removed (for a warning). */
export function stripExternalLinks(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const note = (url: string) => removed.push(hostOf(trimUrl(url)));

  const lines = text.split('\n').flatMap((line) => {
    let hadLink = false;
    let out = line
      // [text](url): keep the words unless they are the link itself
      .replace(MARKDOWN_LINK, (_, label: string, url: string) => {
        hadLink = true;
        note(url);
        return isUrl(label) ? '' : label;
      })
      .replace(AUTOLINK, (m) => {
        hadLink = true;
        note(m.slice(1, -1));
        return '';
      })
      .replace(URL, (m) => {
        hadLink = true;
        note(m);
        return '';
      });
    URL.lastIndex = 0;
    if (!hadLink) return [line];
    if (INVITATION.test(line)) return [];
    // Each space run is matched once, whole, with what may follow it ("()" left by a removed link, or punctuation):
    // `/[ \t]+([:.,;])/` and `/[ \t]*\(…\)/` restarted at every position of a long run, quadratic on pasted text
    // (OJ-15 F4). Same result: "  ()" goes, " :" becomes ":", other runs are kept and then collapsed.
    out = out
      .replace(/[ \t]*(\([ \t]*\))?/g, (run, emptyParens?: string) => (emptyParens ? '' : run))
      .replace(/[ \t]+([:.,;])?/g, (run, punctuation?: string) => punctuation ?? run)
      .replace(/[ \t]{2,}/g, ' ')
      .trimEnd();
    // What is left once the label words are gone: nothing worth keeping means the line only carried the link.
    const rest = out.replace(LINK_LABEL, '').replace(/[\s:.,;\-–—*_#>()[\]|!?"']+/g, '');
    return rest.length <= 2 ? [] : [out];
  });

  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed: [...new Set(removed)] };
}
