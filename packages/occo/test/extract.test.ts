import { expect, test } from "bun:test"
import { extract } from "../src/extract"

test("block structure, nested lists and quotes are visited once", () => {
  expect(
    extract(
      "# A heading. Another clause.\n\n- First **item**.\n  - Nested [label](https://hidden.example).\n\n> A quote. Next sentence!\n\n---\n\n[ref]: https://hidden.example",
    ),
  ).toEqual(["A heading. Another clause.", "First item.", "Nested label.", "A quote.", "Next sentence!"])
})

test("table headers and cells stay separate without display metadata", () => {
  expect(
    extract(
      "| Task | Advice |\n| --- | --- |\n| Save | **Disable** [Save](https://hidden). Test again! |\n| Empty | |",
    ),
  ).toEqual(["Task", "Advice", "Save", "Disable Save.", "Test again!", "Empty"])
})

test("inline structure decodes entities once, keeps escapes, code and HTML literal", () => {
  expect(
    extract(
      "**Bold** *italic* ~~gone~~ [label](https://hidden) ![alt](image.png) ![](empty.png) \\*escaped\\* &amp; &amp;amp; `&amp; a. B` <br> end.",
    ),
  ).toEqual(["Bold italic gone label alt *escaped* & &amp; &amp; a. B <br> end."])
  expect(extract("<div>Raw &amp;\n  body</div>\n")).toEqual(["<div>Raw &amp;\n  body</div>\n"])
  expect(extract("```ts\n  const x = '&amp;';\n\tuse(x)\n```")).toEqual(["  const x = '&amp;';\n\tuse(x)"])
})

test("hard Markdown breaks split, soft whitespace folds, HTML br remains literal", () => {
  expect(extract("![An **important** &amp; \\*literal\\* image](image.png)")).toEqual([
    "An important & *literal* image",
  ])
  expect(extract("soft\n  line  \nnext\\\nlast<br>same")).toEqual(["soft line", "next", "last<br>same"])
})

test("sentences preserve abbreviations, URLs, numbers, inline code and closing quotes", () => {
  expect(
    extract(
      "Dr. Smith met J. Doe. Try e.g. this case. Use `a. B` at https://example.com/a.b and 3.14. “Done!” Next.\n\n你好世界。继续测试！",
    ),
  ).toEqual([
    "Dr. Smith met J. Doe.",
    "Try e.g. this case.",
    "Use a. B at https://example.com/a.b and 3.14.",
    "“Done!”",
    "Next.",
    "你好世界。",
    "继续测试！",
  ])
})
