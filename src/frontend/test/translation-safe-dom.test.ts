import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRANSLATION_SAFE_DOM } from '../src/lib/translation-safe-dom';

/**
 * The guard against browser translation (React issue #11538), run against a minimal DOM: a translator moved a node
 * away, so removing it or inserting before it would throw in a real browser.
 */
class FakeNode {
  parentNode: FakeNode | null = null;
  children: FakeNode[] = [];
  removeChild(child: FakeNode) {
    if (child.parentNode !== this) throw new Error('NotFoundError: not a child of this node');
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }
  insertBefore(node: FakeNode, reference: FakeNode | null) {
    if (reference && reference.parentNode !== this) throw new Error('NotFoundError: reference is not a child');
    const i = reference ? this.children.indexOf(reference) : this.children.length;
    this.children.splice(i, 0, node);
    node.parentNode = this;
    return node;
  }
  appendChild(node: FakeNode) {
    return this.insertBefore(node, null);
  }
}

function install() {
  (globalThis as { Node?: unknown }).Node = FakeNode;
  new Function(TRANSLATION_SAFE_DOM)();
}

test('a node already moved away by a translator is not removed twice, and nothing throws', () => {
  install();
  const parent = new FakeNode();
  const elsewhere = new FakeNode();
  const text = parent.appendChild(new FakeNode());
  elsewhere.appendChild(parent.removeChild(text)); // the translator moved it
  assert.equal(parent.removeChild(text), text);
  assert.equal(text.parentNode, elsewhere, 'left where the translator put it');
});

test('inserting before a moved reference appends instead of throwing; normal calls are unchanged', () => {
  install();
  const parent = new FakeNode();
  const a = parent.appendChild(new FakeNode());
  const moved = parent.appendChild(new FakeNode());
  new FakeNode().appendChild(parent.removeChild(moved));
  const node = new FakeNode();
  parent.insertBefore(node, moved);
  assert.deepEqual(parent.children, [a, node]);
  const first = new FakeNode();
  parent.insertBefore(first, a);
  assert.equal(parent.children[0], first, 'a valid reference still inserts in place');
});

test('installing twice does not wrap the methods twice', () => {
  install();
  const once = FakeNode.prototype.removeChild;
  new Function(TRANSLATION_SAFE_DOM)();
  assert.equal(FakeNode.prototype.removeChild, once);
});
