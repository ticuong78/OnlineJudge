/**
 * Keeps the app working while the browser translates the page (e.g. Chrome's "Translate to English" on this
 * Vietnamese UI).
 *
 * A translator replaces the page's text nodes with its own elements without React knowing. When React later
 * removes such a node, or inserts next to it, the DOM call fails ("removeChild"/"insertBefore": not a child of this
 * node) and the page crashes. This is React's long-standing issue #11538; the workaround below is the one the React
 * team suggested there. A remove of a node that is no longer here is skipped (it is gone from view already), and an
 * insert before a node that moved is appended instead. Everything else goes to the real DOM methods unchanged.
 *
 * It must run before React starts, so it is inlined into the page head (see app/layout.tsx).
 */
export const TRANSLATION_SAFE_DOM = `(function () {
  if (typeof Node !== 'function' || !Node.prototype || Node.prototype.__ojTranslationSafe) return;
  var removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) return child;
    return removeChild.apply(this, arguments);
  };
  var insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, reference) {
    if (reference && reference.parentNode !== this) return this.appendChild(node);
    return insertBefore.apply(this, arguments);
  };
  Node.prototype.__ojTranslationSafe = true;
})();`;
