import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBundle,
  decodeEntities,
  defaultOutDir,
  extractConcept,
  renderConcept,
  renderIndex,
  slugForUrl,
} from "../src/okf.js";

const SAMPLE = `<!doctype html><html><head>
<title>Acme &mdash; Pricing</title>
<meta name="description" content="Simple &amp; fair pricing.">
<link rel="canonical" href="https://acme.example/pricing">
<style>.x{color:red}</style><script>var a=1;</script>
</head><body>
<nav><a href="/">Home</a></nav>
<main><h1>Pricing</h1><p>Plans start at $9. See <a href="/features">features</a>.</p>
<ul><li>Basic</li><li>Pro</li></ul></main>
<footer><a href="/legal">Legal</a></footer>
</body></html>`;

test("decodeEntities handles named, decimal, and hex entities", () => {
  assert.equal(decodeEntities("a &amp; b"), "a & b");
  assert.equal(decodeEntities("&#39;x&#39;"), "'x'");
  assert.equal(decodeEntities("&#x27;y&#x27;"), "'y'");
  assert.equal(decodeEntities("A &mdash; B"), "A — B");
});

test("slugForUrl maps paths and avoids reserved names", () => {
  assert.equal(slugForUrl("https://x.com/"), "home");
  assert.equal(slugForUrl("https://x.com/pricing"), "pricing");
  assert.equal(slugForUrl("https://x.com/docs/getting-started.html"), "docs-getting-started");
  assert.equal(slugForUrl("https://x.com/index"), "index-page");
  assert.equal(slugForUrl("https://x.com/log"), "log-page");
});

test("extractConcept pulls title/description/canonical, cleans body, drops chrome", () => {
  const c = extractConcept(SAMPLE, "https://acme.example/pricing?utm=x");
  assert.equal(c.type, "WebPage");
  assert.equal(c.title, "Acme — Pricing");
  assert.equal(c.description, "Simple & fair pricing.");
  assert.equal(c.resource, "https://acme.example/pricing"); // canonical wins
  assert.match(c.body, /# Pricing/);
  assert.match(c.body, /Plans start at \$9/);
  assert.match(c.body, /\[features\]\(https:\/\/acme\.example\/features\)/);
  assert.match(c.body, /- Basic/);
  assert.match(c.body, /- Pro/);
  // nav/footer content is stripped as noise
  assert.doesNotMatch(c.body, /Legal/);
  // only same-host links from the main region are collected
  assert.deepEqual(c.links.map((l) => l.path).sort(), ["/features"]);
});

test("extractConcept drops a leading H1 that duplicates the title, keeps distinct ones", () => {
  const dup = extractConcept(
    "<html><head><title>Docs</title></head><body><main><h1>Docs</h1><p>Body.</p></main></body></html>",
    "https://x.com/docs",
  );
  // "# Docs" (title heading) is added by renderConcept, so the body must not repeat it.
  assert.doesNotMatch(dup.body, /#\s*Docs/);
  assert.match(dup.body, /Body\./);

  // The SAMPLE page's <h1>Pricing</h1> differs from its <title> ("Acme — Pricing"),
  // so it is preserved as real structure.
  const distinct = extractConcept(SAMPLE, "https://acme.example/pricing");
  assert.match(distinct.body, /# Pricing/);
});

test("htmlToMarkdown drops empty heading markers and decodes common named entities", () => {
  const c = extractConcept(
    "<html><body><main><h2><span></span></h2><p>Go &rarr; now &mdash; fast &euro;5</p></main></body></html>",
    "https://x.com/e",
  );
  assert.doesNotMatch(c.body, /^\s*#{1,6}\s*$/m); // no bare heading lines
  assert.match(c.body, /Go → now — fast €5/);
});

test("renderConcept emits conformant frontmatter with a non-empty type", () => {
  const md = renderConcept({
    type: "WebPage",
    title: 'Weird: "quoted" title',
    description: "d",
    resource: "https://x.com/a",
    timestamp: "2026-07-04T00:00:00Z",
    body: "hello",
  });
  assert.match(md, /^---\n/);
  assert.match(md, /\ntype: "WebPage"\n/);
  assert.match(md, /title: "Weird: \\"quoted\\" title"/); // colon + quotes escaped, not broken
  assert.match(md, /\nresource: "https:\/\/x\.com\/a"\n/); // quoted so hostile canonicals cannot corrupt YAML
  assert.match(md, /\n# Weird: "quoted" title\n/);
  assert.ok(md.endsWith("\n"));
});

test("renderIndex declares okf_version and lists concepts, no other frontmatter", () => {
  const idx = renderIndex([{ slug: "home", title: "Home", description: "the home page" }], { title: "Site" });
  assert.match(idx, /^---\nokf_version: "0.1"\n---\n/);
  assert.match(idx, /\* \[Home\]\(\/home\.md\) - the home page/);
  // index.md carries no type/title/etc. frontmatter beyond okf_version
  assert.doesNotMatch(idx, /\ntype:/);
});

test("buildBundle produces a conformant single-page bundle at 0 credits", () => {
  const { files, summary } = buildBundle({
    url: "https://acme.example/pricing",
    html: SAMPLE,
    now: "2026-07-04T00:00:00Z",
    cliVersion: "0.1.0",
  });
  assert.equal(summary.credits, 0);
  assert.equal(summary.conceptCount, 1);
  assert.deepEqual(Object.keys(files).sort(), ["index.md", "log.md", "pricing.md"]);

  // Conformance: every non-reserved .md has frontmatter with a non-empty type.
  for (const [name, content] of Object.entries(files)) {
    if (name === "index.md" || name === "log.md") continue;
    assert.ok(content.startsWith("---\n"), `${name} starts with frontmatter`);
    assert.match(content, /\ntype: "[^"]+"\n/, `${name} needs a non-empty type`);
  }
  assert.match(files["index.md"], /okf_version: "0.1"/);
  assert.match(files["log.md"], /extractor: local/);
});

test("buildBundle degrades gracefully on empty/garbage HTML", () => {
  const { files, summary } = buildBundle({
    url: "https://empty.example/",
    html: "<html><body></body></html>",
    now: "2026-07-04T00:00:00Z",
    cliVersion: "0.1.0",
  });
  assert.equal(summary.conceptCount, 1);
  assert.ok(summary.notes.some((n) => /no readable content/.test(n)));
  assert.match(files["home.md"], /\ntype: "WebPage"\n/); // still conformant
  assert.match(files["index.md"], /okf_version: "0.1"/);
});

test("defaultOutDir derives a clean directory name", () => {
  assert.equal(defaultOutDir("https://www.sleepwalker.ai/pricing"), "./sleepwalker.ai-okf");
});

// Control chars (except tab/newline/CR), DEL/C1, and bidi + isolate format
// chars that must never survive into an agent-ready bundle.
const FORBIDDEN_RE = /[\x00-\x08\x0B-\x1F\x7F-\x9F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

test("hostile control, ANSI, and bidi characters never reach the bundle", () => {
  const RLO = "\u202E", BEL = "\x07", ESC = "\x1B";
  const html = [
    "<html><head>",
    "<title>Sale&#x202E;gpj.exe &#7;now &#27;[31mred&#27;[0m</title>",
    '<meta name="description" content="desc&#27;[2Jwiped &#x202A;embed&#x202C;">',
    '<link rel="canonical" href="https://x.com/a: b #frag">',
    `</head><body><main><h1>Sale${RLO}gpj.exe</h1><p>Body ${BEL}bell and ${ESC}]0;titleosc.</p></main></body></html>`,
  ].join("");
  const { files } = buildBundle({ url: "https://x.com/a", html, now: "2026-07-05T00:00:00Z", cliVersion: "t" });
  for (const [name, content] of Object.entries(files)) {
    assert.ok(!FORBIDDEN_RE.test(content), `${name} still contains a forbidden character`);
  }
  const concept = Object.entries(files).find(([n]) => n !== "index.md" && n !== "log.md")[1];
  const fm = concept.split("---")[1];
  assert.match(fm, /\ntitle: "[^\n]*"\n/);
  assert.match(fm, /\nresource: "[^\n]*"\n/);
  assert.match(concept, /Salegpj\.exe/);
});

test("control chars between blocks do not leave orphaned blank-line runs", () => {
  // Regression: control chars (here \x1E) interleaved with newlines used to
  // break up whitespace runs so collapse missed them; stripping the control
  // chars afterward then left long runs of blank lines. Sanitize-before-collapse
  // must leave at most one blank line (\n\n) anywhere in the body.
  const sep = "\x1E".repeat(6);
  const html =
    `<html><head><title>T</title></head><body><main>` +
    `<h1>Heading</h1>` +
    `<p>First paragraph.</p>${sep}${sep}` +
    `<p>Second paragraph.</p>` +
    `</main></body></html>`;
  const { files } = buildBundle({ url: "https://x.com/", html, now: "2026-07-05T00:00:00Z", cliVersion: "t" });
  const concept = Object.entries(files).find(([n]) => n !== "index.md" && n !== "log.md")[1];
  let longest = 0, cur = 0;
  for (const ch of concept) { if (ch === "\n") { cur++; if (cur > longest) longest = cur; } else cur = 0; }
  assert.ok(longest <= 2, `expected no blank-line run > 1, saw ${longest} consecutive newlines`);
  assert.match(concept, /First paragraph\.\n\nSecond paragraph\./);
});

test("buildBundle with technical input emits a conformant, cross-linked second concept", () => {
  const { files, summary } = buildBundle({
    url: "https://acme.example/pricing",
    html: SAMPLE,
    now: "2026-07-18T00:00:00Z",
    cliVersion: "0.4.0",
    technical: {
      headers: { "content-type": "text/html; charset=utf-8", server: "acme-edge" },
      redirectChain: [{ url: "https://acme.example/pricing", status: 200 }],
    },
  });
  assert.equal(summary.conceptCount, 2);
  assert.equal(summary.technical, true);
  assert.equal(summary.credits, 0);
  assert.deepEqual(
    Object.keys(files).sort(),
    ["index.md", "log.md", "pricing-technical.md", "pricing.md"],
  );

  // Conformance: every non-reserved .md still has a non-empty type.
  for (const [name, content] of Object.entries(files)) {
    if (name === "index.md" || name === "log.md") continue;
    assert.match(content, /\ntype: "[^"]+"\n/, `${name} needs a non-empty type`);
  }
  assert.match(files["pricing-technical.md"], /\ntype: "TechnicalSnapshot"\n/);
  assert.match(files["pricing-technical.md"], /\ntags: \["technical"\]\n/);
  assert.match(files["pricing-technical.md"], /\ntimestamp: 2026-07-18T00:00:00Z\n/);

  // Cross-links run in both directions; index lists the content concept first.
  assert.match(files["pricing.md"], /## See also\n- \[Technical snapshot: Acme — Pricing\]\(\/pricing-technical\.md\)/);
  assert.match(files["pricing-technical.md"], /## See also\n- \[Acme — Pricing\]\(\/pricing\.md\)/);
  const contentPos = files["index.md"].indexOf("(/pricing.md)");
  const technicalPos = files["index.md"].indexOf("(/pricing-technical.md)");
  assert.ok(contentPos !== -1 && technicalPos !== -1 && contentPos < technicalPos);

  // The technical body made it through: headers and robots surfaces present.
  assert.match(files["pricing-technical.md"], /server: acme-edge/);
  assert.match(files["pricing-technical.md"], /Meta robots: none\./);
  assert.match(files["log.md"], /- concepts: 2/);
});

test("buildBundle without technical input is unchanged", () => {
  const plain = buildBundle({
    url: "https://acme.example/pricing",
    html: SAMPLE,
    now: "2026-07-04T00:00:00Z",
    cliVersion: "0.1.0",
  });
  assert.equal(plain.summary.content, true);
  assert.equal(plain.summary.technical, false);
  assert.deepEqual(Object.keys(plain.files).sort(), ["index.md", "log.md", "pricing.md"]);
  assert.doesNotMatch(plain.files["pricing.md"], /## See also/);
});

test("buildBundle can emit a technical-only bundle", () => {
  const { files, summary } = buildBundle({
    url: "https://acme.example/pricing",
    html: SAMPLE,
    now: "2026-07-18T00:00:00Z",
    cliVersion: "0.4.0",
    includeContent: false,
    technical: {
      headers: { "content-type": "text/html" },
      redirectChain: [{ url: "https://acme.example/pricing", status: 200 }],
    },
  });
  assert.equal(summary.content, false);
  assert.equal(summary.technical, true);
  assert.equal(summary.conceptCount, 1);
  assert.deepEqual(Object.keys(files).sort(), ["index.md", "log.md", "pricing-technical.md"]);
  assert.match(files["pricing-technical.md"], /\ntype: "TechnicalSnapshot"\n/);
  // No content sibling, so no See also and a single index entry.
  assert.doesNotMatch(files["pricing-technical.md"], /## See also/);
  assert.doesNotMatch(files["index.md"], /\(\/pricing\.md\)/);
  assert.match(files["index.md"], /\(\/pricing-technical\.md\)/);
  assert.match(files["log.md"], /- concepts: 1/);
});

test("buildBundle never emits an empty bundle: content wins when both are off", () => {
  const { files, summary } = buildBundle({
    url: "https://acme.example/pricing",
    html: SAMPLE,
    now: "2026-07-18T00:00:00Z",
    cliVersion: "0.4.0",
    includeContent: false,
  });
  assert.equal(summary.content, true);
  assert.deepEqual(Object.keys(files).sort(), ["index.md", "log.md", "pricing.md"]);
});

test("hostile titles cannot inject links into index.md or See also labels", () => {
  const html =
    '<html><head><title>a](http://evil.example/x) [b</title></head>' +
    "<body><main><p>Body.</p></main></body></html>";
  const { files } = buildBundle({
    url: "https://x.com/a",
    html,
    now: "2026-07-18T00:00:00Z",
    cliVersion: "t",
    technical: { headers: {}, redirectChain: [{ url: "https://x.com/a", status: 200 }] },
  });
  // Nav and See also link lines must only ever target bundle concepts; the
  // hostile title's brackets are stripped from every link label. (The H1
  // heading may carry the raw title, like any page-derived body text.)
  const linkLines = [files["index.md"], files["a.md"], files["a-technical.md"]]
    .flatMap((content) => content.split("\n"))
    .filter((line) => /^[*-] \[/.test(line));
  assert.ok(linkLines.length >= 4, "expected nav and See also link lines");
  for (const line of linkLines) {
    assert.doesNotMatch(line, /\]\(http/, `link line escapes the bundle: ${line}`);
    assert.match(line, /\]\(\/[a-z0-9-]+\.md\)/, `link line has no bundle target: ${line}`);
  }
  assert.match(files["index.md"], /\(\/a\.md\)/);
  assert.match(files["index.md"], /\(\/a-technical\.md\)/);
});

test("buildBundle surfaces extraNotes in log.md and sanitizes them", () => {
  const noisyNote = `page truncated \x1B[31mmid-way\x1B[0m`;
  const { files, summary } = buildBundle({
    url: "https://x.com/",
    html: "<html><body><main><p>hi</p></main></body></html>",
    now: "2026-07-05T00:00:00Z",
    cliVersion: "t",
    extraNotes: [noisyNote, ""],
  });
  assert.match(files["log.md"], /- note: page truncated \[31mmid-way\[0m/);
  assert.ok(!FORBIDDEN_RE.test(files["log.md"]));
  assert.equal(summary.notes.length, 1);
});
