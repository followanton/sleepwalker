import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TECHNICAL_CAPS,
  extractJsonLd,
  extractTechnical,
  fence,
  maskInertHtml,
  parseAttrs,
  renderTechnicalBody,
  technicalDescription,
  technicalTitle,
} from "../src/okf-technical.js";

const FORBIDDEN_RE = /[\x00-\x08\x0B-\x1F\x7F-\x9F؜‎‏‪-‮⁦-⁩]/;

const PAGE = `<!doctype html><html><head>
<title>Acme Pricing</title>
<meta charset="utf-8">
<meta name="description" content="It's simple &amp; fair.">
<meta name="robots" content="index, follow">
<meta property="og:title" content="Acme Pricing">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="/pricing">
<link rel="alternate" hreflang="en" href="https://acme.example/pricing">
<link rel="alternate" hreflang="de" href="https://acme.example/de/preise">
<base href="https://acme.example/section/">
<script src="/app.js" defer></script>
<script type="application/ld+json">{"@type":"Product","name":"Acme"}</script>
</head><body>
<h1>Pricing</h1>
<h2>Plans</h2>
<a href="plans" rel="nofollow">Plans</a>
<a href="https://other.example/x">Elsewhere</a>
<img src="/a.png" alt="A diagram">
<img src="/b.png">
<div itemscope itemtype="https://schema.org/Product"><span role="button">Buy</span></div>
</body></html>`;

function extract(html, overrides = {}) {
  return extractTechnical(html, {
    url: "https://acme.example/pricing",
    headers: { "content-type": "text/html; charset=utf-8", server: "acme-edge" },
    redirectChain: [{ url: "https://acme.example/pricing", status: 200 }],
    ...overrides,
  });
}

test("parseAttrs pairs quotes correctly and decodes entities", () => {
  const attrs = parseAttrs(`<meta name="description" content="It's simple &amp; fair.">`);
  assert.equal(attrs.find((a) => a.name === "content").value, "It's simple & fair.");
  const single = parseAttrs(`<meta name='keywords' content='a, "b", c'>`);
  assert.equal(single.find((a) => a.name === "content").value, 'a, "b", c');
  const bare = parseAttrs(`<script src=/app.js defer>`);
  assert.equal(bare.find((a) => a.name === "src").value, "/app.js");
  assert.equal(bare.find((a) => a.name === "defer").value, true);
});

test("quote-aware tag scan survives '>' inside attribute values", () => {
  const data = extract(
    `<html><head><meta name="description" content="Home > Products > Detail"></head><body></body></html>`,
  );
  const description = data.metas.find((m) => m.key === "description");
  assert.equal(description.content, "Home > Products > Detail");
});

test("masking: commented-out and script-embedded tags are never reported as live", () => {
  const html = `<html><head>
  <!-- <meta name="robots" content="noindex"> -->
  <script>document.write('<meta name="robots" content="noindex">');</script>
  <template><h1>Template heading</h1></template>
  <meta name="robots" content="index">
  </head><body><h1>Real heading</h1>
  <svg><title>SVG title</title><a href="/svg-link">svg</a></svg>
  </body></html>`;
  const data = extract(html);
  const robots = data.metas.filter((m) => (m.key || "").toLowerCase() === "robots");
  assert.equal(robots.length, 1);
  assert.equal(robots[0].content, "index");
  assert.deepEqual(
    data.headings.map((h) => h.text),
    ["Real heading"],
  );
  assert.equal(data.titles.length, 0); // the only <title> is inside <svg>
  assert.equal(data.links.total, 0); // the only <a> is inside <svg>
});

test("masking: an unclosed script hides the rest of the document", () => {
  const masked = maskInertHtml(`<p>before</p><script>var x = "<h1>fake</h1>"`);
  assert.match(masked, /before/);
  assert.doesNotMatch(masked, /fake/);
});

test("noscript content stays visible", () => {
  const data = extract(
    `<html><body><noscript><img src="/tracking.gif" alt="pixel"></noscript></body></html>`,
  );
  assert.equal(data.images.total, 1);
});

test("duplicates are preserved in document order", () => {
  const html = `<html><head>
  <title>First</title><title>Second</title>
  <link rel="canonical" href="https://a.example/one">
  <link rel="canonical" href="https://a.example/two">
  <meta name="description" content="one">
  <meta name="description" content="two">
  </head><body></body></html>`;
  const data = extract(html);
  assert.deepEqual(data.titles, ["First", "Second"]);
  assert.deepEqual(
    data.canonicals.map((c) => c.href),
    ["https://a.example/one", "https://a.example/two"],
  );
  assert.deepEqual(
    data.metas.filter((m) => m.key === "description").map((m) => m.content),
    ["one", "two"],
  );
  const body = renderTechnicalBody(data);
  assert.match(body, /Duplicates present: 2 title tags, 2 canonical links\./);
  assert.match(body, /<title>First<\/title>\n<title>Second<\/title>/);
});

test("base href resolution applies to links, including a relative base", () => {
  const data = extract(PAGE);
  const internal = data.links.items.find((l) => l.href === "plans");
  assert.equal(internal.internal, true); // resolved against <base href="https://acme.example/section/">
  const relBase = extract(
    `<html><head><base href="/deep/"></head><body><a href="x">x</a></body></html>`,
  );
  assert.equal(relBase.links.items[0].internal, true);
  const multi = extract(
    `<html><head><base href="https://a.example/"><base href="https://b.example/"></head><body></body></html>`,
  );
  assert.ok(multi.notes.some((n) => /multiple <base> tags/.test(n)));
});

test("social metas are split out of the meta section, single parse", () => {
  const data = extract(PAGE);
  assert.ok(data.socials.some((m) => m.key === "og:title"));
  assert.ok(data.socials.some((m) => m.key === "twitter:card"));
  assert.ok(!data.metas.some((m) => (m.key || "").startsWith("og:")));
  const body = renderTechnicalBody(data);
  assert.match(body, /## Social \(2\)/);
});

test("JSON-LD: parsed and re-emitted compact from the parsed object", () => {
  const data = extract(PAGE);
  assert.equal(data.jsonLd.total, 1);
  const body = renderTechnicalBody(data);
  assert.match(body, /<script type="application\/ld\+json">\{"@type":"Product","name":"Acme"\}<\/script>/);
});

test("JSON-LD: comment and CDATA wrappers are stripped before parsing", () => {
  const html = `<html><head>
  <script type="application/ld+json"><!--{"@type":"A"}--></script>
  <script type="APPLICATION/LD+JSON; charset=utf-8"><![CDATA[{"@type":"B"}]]></script>
  <script type="application/ld+json">//<![CDATA[
  {"@type":"C"}
  //]]></script>
  </head><body></body></html>`;
  const notes = [];
  const { items, invalidCount } = extractJsonLd(html, notes);
  assert.equal(invalidCount, 0);
  assert.deepEqual(
    items.map((i) => JSON.parse(i.compact)["@type"]),
    ["A", "B", "C"],
  );
});

test("JSON-LD: invalid JSON is flagged with a capped excerpt, never re-emitted raw", () => {
  const html = `<html><head><script type="application/ld+json">{"broken": </script></head><body></body></html>`;
  const notes = [];
  const { items, invalidCount } = extractJsonLd(html, notes);
  assert.equal(invalidCount, 1);
  assert.equal(items[0].valid, false);
  assert.ok(items[0].excerpt.length <= TECHNICAL_CAPS.jsonLdInvalidExcerpt);
  assert.ok(notes.some((n) => /did not parse/.test(n)));
});

test("JSON-LD: pathologically deep nesting does not crash", () => {
  const depth = 200000;
  const deep = "[".repeat(depth) + "]".repeat(depth);
  const html = `<html><head><script type="application/ld+json">${deep}</script></head><body></body></html>`;
  const { items } = extractJsonLd(html, []);
  assert.equal(items.length, 1);
  // Depending on the runtime this lands in the invalid path (parse or
  // re-serialize failure) or parses fine; either way the CLI must survive.
  assert.ok(typeof items[0].valid === "boolean");
});

test("JSON-LD: oversized blocks become a summary line, never truncated JSON", () => {
  const big = { "@type": "Product", name: "Big", description: "x".repeat(TECHNICAL_CAPS.jsonLdItemBytes) };
  const html = `<html><head><script type="application/ld+json">${JSON.stringify(big)}</script></head><body></body></html>`;
  const data = extract(html);
  const body = renderTechnicalBody(data);
  assert.match(body, /too large to inline/);
  assert.match(body, /types: Product/);
  assert.doesNotMatch(body, /"description":"xxx/);
});

test("JSON-LD absence is called out as a finding", () => {
  const data = extract("<html><body><p>plain</p></body></html>");
  assert.match(renderTechnicalBody(data), /JSON-LD: none found/);
});

test("robots directives come from the page and response only", () => {
  const data = extract(PAGE);
  const body = renderTechnicalBody(data);
  assert.match(body, /## Robots directives/);
  assert.match(body, /Meta robots: index, follow/);
  assert.match(body, /X-Robots-Tag header: none\./);
  assert.doesNotMatch(body, /robots\.txt/);
  assert.doesNotMatch(body, /llms\.txt/);

  const withHeader = extract(PAGE, {
    headers: { "content-type": "text/html", "x-robots-tag": "noai" },
  });
  assert.match(renderTechnicalBody(withHeader), /X-Robots-Tag header: noai/);
});

test("oversized header values get a visible truncation marker and a note", () => {
  const longCsp = `default-src 'self'; ${"x".repeat(TECHNICAL_CAPS.attrValueChars)}`;
  const data = extract(PAGE, {
    headers: { "content-type": "text/html", "content-security-policy": longCsp },
  });
  const stored = data.headers.get("content-security-policy");
  assert.ok(stored.endsWith("..."), "truncated header value must end with a marker");
  assert.ok(stored.length <= TECHNICAL_CAPS.attrValueChars + 3);
  assert.ok(data.notes.some((n) => /1 header value\(s\) truncated/.test(n)));
  const body = renderTechnicalBody(data);
  assert.match(body, /content-security-policy: default-src 'self'; x+\.\.\./);
});

test("headers are curated, grouped, and name-sorted within groups", () => {
  const data = extract(PAGE, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noai",
      "strict-transport-security": "max-age=63072000",
      "content-security-policy": "default-src 'self'",
      "cache-control": "max-age=0",
      etag: 'W/"abc"',
      server: "acme-edge",
      "x-request-id": "not-curated",
    },
  });
  const body = renderTechnicalBody(data);
  assert.match(body, /## HTTP headers/);
  const csp = body.indexOf("content-security-policy");
  const hsts = body.indexOf("strict-transport-security");
  assert.ok(csp !== -1 && hsts !== -1 && csp < hsts); // sorted within Security group
  assert.match(body, /x-robots-tag: noai/);
  assert.doesNotMatch(body, /x-request-id/);
});

test("redirect chain renders hops and flags an https to http downgrade", () => {
  const data = extract(PAGE, {
    redirectChain: [
      { url: "https://acme.example/", status: 301 },
      { url: "http://legacy.acme.example/", status: 302 },
      { url: "https://acme.example/pricing", status: 200 },
    ],
  });
  const body = renderTechnicalBody(data);
  assert.match(body, /1\. HTTP 301 https:\/\/acme\.example\//);
  assert.match(body, /downgrades from https to http/);
});

test("charset mismatch is reported as a note, not fixed", () => {
  const data = extract(
    `<html><head><meta charset="windows-1251"></head><body></body></html>`,
  );
  assert.ok(data.notes.some((n) => /windows-1251/.test(n) && /decodes utf-8/.test(n)));
});

test("caps fire with notes: links capped and counted", () => {
  const anchors = Array.from(
    { length: TECHNICAL_CAPS.links + 25 },
    (_, i) => `<a href="/p${i}">p${i}</a>`,
  ).join("");
  const data = extract(`<html><body>${anchors}</body></html>`);
  assert.equal(data.links.items.length, TECHNICAL_CAPS.links);
  assert.equal(data.links.total, TECHNICAL_CAPS.links + 25);
  assert.ok(data.notes.some((n) => /links: showing first/.test(n)));
  const body = renderTechnicalBody(data);
  assert.match(body, /## Extraction notes/);
});

test("images: missing alt attribute is distinguished from empty alt", () => {
  const data = extract(
    `<html><body><img src="/a.png" alt=""><img src="/b.png"></body></html>`,
  );
  assert.equal(data.images.total, 2);
  assert.equal(data.images.missingAlt, 1);
  const body = renderTechnicalBody(data);
  assert.match(body, /1 without an alt attribute/);
  assert.match(body, /<img src="\/a\.png" alt="">/);
});

test("microdata and RDFa are summarized as counts only", () => {
  const data = extract(PAGE);
  assert.equal(data.micro.itemscope, 1);
  assert.deepEqual(data.micro.itemtypes, [["https://schema.org/Product", 1]]);
  assert.deepEqual(data.micro.roles, [["button", 1]]);
  const body = renderTechnicalBody(data);
  assert.match(body, /## Microdata and RDFa \(summary\)/);
});

test("dynamic fence length always exceeds the longest backtick run", () => {
  const fenced = fence("code with ````four```` backticks");
  assert.match(fenced, /^`````\n/);
  assert.match(fenced, /\n`````$/);
  const plain = fence("no backticks", "html");
  assert.match(plain, /^```html\n/);
});

test("fence content is never mutated to escape it", () => {
  const content = "keep ``` exactly";
  assert.ok(fence(content).includes(content));
});

test("double build is deterministic: identical bytes", () => {
  const opts = {
    headers: { "content-type": "text/html", server: "s" },
    redirectChain: [
      { url: "https://acme.example/", status: 301 },
      { url: "https://acme.example/pricing", status: 200 },
    ],
  };
  const a = renderTechnicalBody(extract(PAGE, opts));
  const b = renderTechnicalBody(extract(PAGE, opts));
  assert.equal(a, b);
});

test("hostile bytes in html, headers, and robots never reach the body", () => {
  const RLO = "‮";
  const html = `<html><head>
  <title>Sale${RLO}gpj.exe &#x202E;entity</title>
  <meta name="description" content="desc&#27;[2Jwiped">
  <script type="application/ld+json">{"name":"x\\u202Ey"}</script>
  </head><body><h1>H\x07one</h1><a href="/x">t\x1b[31mext</a></body></html>`;
  const data = extract(html, {
    headers: { server: "srv\x1b]0;owned\x07", "x-robots-tag": `no${RLO}ai` },
    redirectChain: [{ url: `https://acme.example/${RLO}path`, status: 200 }],
  });
  const body = renderTechnicalBody(data);
  assert.ok(!FORBIDDEN_RE.test(body), "technical body still contains a forbidden character");
});

test("attribute values are re-encoded and capped in reconstructed tags", () => {
  const long = "v".repeat(TECHNICAL_CAPS.attrValueChars + 50);
  const data = extract(
    `<html><head><meta name="description" content="a<b>&quot;c&quot; ${long}"></head><body></body></html>`,
  );
  const body = renderTechnicalBody(data);
  assert.match(body, /content="a&lt;b&gt;&quot;c&quot;/);
  assert.doesNotMatch(body, new RegExp(`v{${TECHNICAL_CAPS.attrValueChars + 10}}`));
});

test("technicalTitle and technicalDescription stay plain and bounded", () => {
  assert.equal(
    technicalTitle("Acme Pricing", "https://acme.example/pricing"),
    "Technical snapshot: Acme Pricing",
  );
  assert.equal(
    technicalTitle("", "https://acme.example/pricing"),
    "Technical snapshot: acme.example",
  );
  assert.equal(
    technicalDescription("https://acme.example/pricing"),
    "Meta tags, structured data, headers and robots directives as served for acme.example.",
  );
});

test("html lang and dir are captured and lead the meta section", () => {
  const data = extract(
    `<html lang="ar" dir="rtl"><head><title>T</title></head><body></body></html>`,
  );
  assert.deepEqual(data.htmlAttrs, { lang: "ar", dir: "rtl" });
  const body = renderTechnicalBody(data);
  assert.match(body, /<html lang="ar" dir="rtl">\n<title>T<\/title>/);
  const none = extract("<html><head></head><body></body></html>");
  assert.deepEqual(none.htmlAttrs, {});
  assert.doesNotMatch(renderTechnicalBody(none), /<html>/);
});

test("icon links are captured, including multi-token and prefixed rels", () => {
  const data = extract(
    `<html><head>
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    <link rel="stylesheet" href="/x.css">
    </head><body></body></html>`,
  );
  assert.equal(data.icons.length, 3);
  const body = renderTechnicalBody(data);
  assert.match(body, /<link rel="shortcut icon" href="\/favicon\.ico">/);
  assert.match(body, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple\.png">/);
  assert.match(body, /<link rel="icon" type="image\/svg\+xml" href="\/icon\.svg">/);
  assert.doesNotMatch(body, /stylesheet/);
});

test("feed links are captured; non-feed alternates are not", () => {
  const data = extract(
    `<html><head>
    <link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
    <link rel="alternate" type="application/atom+xml" href="/atom.xml">
    <link rel="alternate" type="text/html" href="/mobile">
    </head><body></body></html>`,
  );
  assert.equal(data.feeds.length, 2);
  const body = renderTechnicalBody(data);
  assert.match(body, /<link rel="alternate" type="application\/rss\+xml" title="Blog" href="\/feed\.xml">/);
  assert.doesNotMatch(body, /\/mobile/);
});

test("article: metas render in the social section", () => {
  const data = extract(
    `<html><head>
    <meta property="article:published_time" content="2026-06-29">
    <meta property="og:title" content="T">
    </head><body></body></html>`,
  );
  assert.ok(data.socials.some((m) => m.key === "article:published_time"));
  assert.ok(!data.metas.some((m) => (m.key || "").startsWith("article:")));
  const body = renderTechnicalBody(data);
  assert.match(body, /## Social \(2\)/);
});

test("fetch section reports the HTML size", () => {
  const data = extract(PAGE);
  assert.ok(data.htmlBytes > 0);
  const body = renderTechnicalBody(data);
  assert.match(body, /HTML size: \d+ KB \(\d+ bytes\)\./);
});

