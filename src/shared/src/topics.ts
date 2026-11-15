/**
 * Standard topics (OJ-20). Problems keep one `tags` list: a tag is either one of these stable ids, shown with its
 * vi/en label by the frontend (`topics` dictionary), or a teacher's own free-text tag, shown as written.
 * Adding a topic: add it here, to an alias if useful, and to both frontend dictionaries.
 */
export const TopicGroups = ['basics', 'arrays', 'methods', 'structures', 'graphs', 'other'] as const;
export type TopicGroup = (typeof TopicGroups)[number];

export const Topics = [
  { id: 'implementation', group: 'basics' },
  { id: 'math', group: 'basics' },
  { id: 'number-theory', group: 'basics' },
  { id: 'strings', group: 'basics' },
  { id: 'arrays', group: 'arrays' },
  { id: 'prefix-sums', group: 'arrays' },
  { id: 'two-pointers', group: 'arrays' },
  { id: 'sorting', group: 'arrays' },
  { id: 'binary-search', group: 'arrays' },
  { id: 'greedy', group: 'methods' },
  { id: 'recursion', group: 'methods' },
  { id: 'brute-force', group: 'methods' },
  { id: 'dp', group: 'methods' },
  { id: 'stack-queue', group: 'structures' },
  { id: 'hashing', group: 'structures' },
  { id: 'data-structures', group: 'structures' },
  { id: 'graphs', group: 'graphs' },
  { id: 'bfs-dfs', group: 'graphs' },
  { id: 'shortest-paths', group: 'graphs' },
  { id: 'trees', group: 'graphs' },
  { id: 'geometry', group: 'other' },
  { id: 'combinatorics', group: 'other' },
  { id: 'bit-manipulation', group: 'other' },
] as const satisfies readonly { id: string; group: TopicGroup }[];

export type TopicId = (typeof Topics)[number]['id'];
export const TopicIds: readonly TopicId[] = Topics.map((t) => t.id);

export function isTopicId(tag: string): tag is TopicId {
  return (TopicIds as readonly string[]).includes(tag);
}

/** Longest tag a problem may carry (characters). */
export const MAX_TAG_LENGTH = 40;

/**
 * Common spellings of the standard topics, in the folded form of `foldTag` (lowercase, no diacritics, single spaces).
 * Vietnamese school terms first, then English ones.
 */
export const TOPIC_ALIASES: Readonly<Record<string, TopicId>> = {
  'cai dat': 'implementation', 'mo phong': 'implementation', 'co ban': 'implementation', 'nhap xuat': 'implementation',
  'vong lap': 'implementation', 'simulation': 'implementation',
  'toan': 'math', 'toan hoc': 'math', 'so hoc': 'math', 'mathematics': 'math',
  'ly thuyet so': 'number-theory', 'so nguyen to': 'number-theory', 'uoc so': 'number-theory', 'nt': 'number-theory',
  'primes': 'number-theory', 'gcd': 'number-theory',
  'xau': 'strings', 'chuoi': 'strings', 'xau ky tu': 'strings', 'xu ly xau': 'strings', 'xu ly chuoi': 'strings',
  'string': 'strings',
  'mang': 'arrays', 'mang mot chieu': 'arrays', 'day so': 'arrays', 'array': 'arrays',
  'tong tien to': 'prefix-sums', 'mang cong don': 'prefix-sums', 'cong don': 'prefix-sums', 'mang con': 'prefix-sums',
  'prefix sum': 'prefix-sums', 'subarray': 'prefix-sums', 'subarrays': 'prefix-sums',
  'hai con tro': 'two-pointers', 'cua so truot': 'two-pointers', 'two pointer': 'two-pointers',
  'sliding window': 'two-pointers',
  'sap xep': 'sorting', 'sort': 'sorting',
  'tim kiem nhi phan': 'binary-search', 'chat nhi phan': 'binary-search', 'chia nhi phan': 'binary-search',
  'tham lam': 'greedy',
  'de quy': 'recursion', 'quay lui': 'recursion', 'backtracking': 'recursion',
  'vet can': 'brute-force', 'duyet': 'brute-force', 'duyet trau': 'brute-force',
  'quy hoach dong': 'dp', 'qhd': 'dp', 'dynamic programming': 'dp',
  'ngan xep': 'stack-queue', 'hang doi': 'stack-queue', 'stack': 'stack-queue', 'queue': 'stack-queue',
  'bam': 'hashing', 'bang bam': 'hashing', 'hash': 'hashing',
  'cau truc du lieu': 'data-structures', 'ctdl': 'data-structures', 'cay phan doan': 'data-structures',
  'segment tree': 'data-structures', 'fenwick': 'data-structures',
  'do thi': 'graphs', 'ly thuyet do thi': 'graphs', 'graph': 'graphs',
  'bfs': 'bfs-dfs', 'dfs': 'bfs-dfs', 'loang': 'bfs-dfs', 'duyet do thi': 'bfs-dfs',
  'duong di ngan nhat': 'shortest-paths', 'dijkstra': 'shortest-paths', 'shortest path': 'shortest-paths',
  'floyd': 'shortest-paths',
  'cay': 'trees', 'tree': 'trees',
  'hinh hoc': 'geometry',
  'to hop': 'combinatorics',
  'xu ly bit': 'bit-manipulation', 'phep toan bit': 'bit-manipulation', 'bitmask': 'bit-manipulation',
  'bitwise': 'bit-manipulation',
};

/** Lowercase, no Vietnamese diacritics (đ becomes d), hyphens and runs of spaces become one space. */
export function foldTag(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

/**
 * The stored form of a tag: a standard topic id when the tag is one (in any spelling, or a known alias), otherwise the
 * teacher's text trimmed, lowercased and with single spaces. Used on save, on import and in filters.
 */
export function normalizeTag(raw: string): string {
  const folded = foldTag(raw);
  const asId = folded.replace(/ /g, '-');
  if (isTopicId(asId)) return asId;
  const alias = TOPIC_ALIASES[folded];
  if (alias) return alias;
  // NFC: the same Vietnamese word typed with combining marks (Unikey "Unicode tổ hợp", text pasted from macOS) and with
  // precomposed letters must be one tag.
  return raw.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** A tag cut to the stored limit (tags saved before the limit existed may be longer). */
export function clipTag(tag: string): string {
  return tag.length <= MAX_TAG_LENGTH ? tag : tag.slice(0, MAX_TAG_LENGTH).trim();
}
