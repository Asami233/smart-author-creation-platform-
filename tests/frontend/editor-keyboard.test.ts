import assert from "node:assert/strict";
import { it } from "node:test";
import { canHandleEditorKey, getEditorShortcut } from "../../lib/client/editor-keyboard";

it("leaves IME candidate keys and modifier shortcuts to composition", () => {
  for (const state of [{ isComposing: true }, { isComposing: false, keyCode: 229 }]) {
    for (const key of ["Enter", "Escape", "f", "h", "j", "s"]) {
      const event = { key, ctrlKey: true, ...state };
      assert.equal(canHandleEditorKey(event), false, `${key} ${JSON.stringify(state)}`);
      assert.equal(getEditorShortcut(event), null);
    }
  }
  // The next normal Enter/Escape can navigate or close after composition ends.
  assert.equal(canHandleEditorKey({ key: "Enter", isComposing: false, keyCode: 13 }), true);
  assert.equal(getEditorShortcut({ key: "Escape", keyCode: 27 }), "escape");
});

it("resolves Ctrl/Cmd editor commands without stealing consumed or Alt keys", () => {
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    for (const [key, command] of [["F", "find"], ["h", "find"], ["j", "jump"], ["s", "save"]]) {
      assert.equal(getEditorShortcut({ key, ...modifier }), command);
      assert.equal(getEditorShortcut({ key, ...modifier, defaultPrevented: true }), null);
      assert.equal(getEditorShortcut({ key, ...modifier, altKey: true }), null);
      assert.equal(getEditorShortcut({ key }), null);
    }
  }
  assert.equal(getEditorShortcut({ key: "Escape", defaultPrevented: true }), null);
  assert.equal(getEditorShortcut({ key: "z", ctrlKey: true }), null);
});
