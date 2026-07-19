// Technical snapshot for OKF bundles (okf export --technical) — local, dependency-free.
//
// This module holds the PURE transforms: raw HTML + response metadata ->
// markdown body for a "TechnicalSnapshot" concept. It reconstructs the page's
// technical layer (meta tags, canonical, robots directives, headings,
// hreflang, social tags, scripts, JSON-LD, links, images) plus the HTTP
// headers and redirect chain of the one page fetch. Strictly page extraction:
// no side requests, no network and no filesystem I/O here; the CLI handler
// fetches and buildBundle() assembles.
//
// Positioning: this is the page as a non-JS crawler sees it, which is how
// most AI crawlers read pages. Fidelity rules that shape everything here:
// - Document order everywhere, duplicates preserved verbatim. Duplicate
//   titles, canonicals, and descriptions are findings, not noise.
// - Facts are extracted from a masked document (script/style/template bodies
//   and comments blanked) so commented-out or script-embedded tags are never
//   reported as live. JSON-LD and script tags come from the raw source.

import { absoluteUrl, decodeEntities } from "./okf.js";
import { sanitizeTerminalText } from "./theme.js";

export const TECHNICAL_TYPE = "TechnicalSnapshot";

// Caps keep hostile or gigantic pages from exploding the bundle. Every cap
// that fires is reported in the section heading and as a note.
export const TECHNICAL_CAPS = {
  titles: 10,
  metas: 200,
  canonicals: 10,
  icons: 10,
  feeds: 10,
  headings: 200,
  hreflang: 100,
  headScripts: 50,
  jsonLdItems: 50,
  jsonLdItemBytes: 4096,
  jsonLdInvalidExcerpt: 600,
  links: 200,
  images: 100,
  attrValueChars: 2000,
  textChars: 300,
};

function san(value) {
  return sanitizeTerminalText(value);
}

function tidyText(value) {
  return san(decodeEntities(String(value ?? "")))
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// HTML scanning primitives
// ---------------------------------------------------------------------------

// Quote-aware tag body: never stops at a ">" inside a quoted attribute value
// (content="Home > Products" is common). Linear, no nested quantifiers.
const TAG_BODY = `(?:[^>"']|"[^"]*"|'[^']*')*`;

function tagRe(name) {
  return new RegExp(`<${name}\\b${TAG_BODY}>`, "gi");
}

function elementRe(name) {
  return new RegExp(`(<${name}\\b${TAG_BODY}>)([\\s\\S]*?)</${name}\\s*>`, "gi");
}

function findTags(html, name) {
  const out = [];
  const re = tagRe(name);
  let m;
  while ((m = re.exec(html))) out.push({ raw: m[0], index: m.index });
  return out;
}

function findElements(html, name) {
  const out = [];
  const re = elementRe(name);
  let m;
  while ((m = re.exec(html))) out.push({ open: m[1], inner: m[2], index: m.index });
  return out;
}

// Parse attributes with paired quote alternation so an apostrophe inside a
// double-quoted value (content="It's simple") never truncates the value.
export function parseAttrs(tag) {
  const inner = String(tag)
    .replace(/^<[a-zA-Z][a-zA-Z0-9-]*/, "")
    .replace(/\/?\s*>$/, "");
  const attrs = [];
  const re = /([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(inner))) {
    if (!m[1]) continue;
    const raw = m[2] ?? m[3] ?? m[4];
    attrs.push({
      name: m[1].toLowerCase(),
      value: raw === undefined ? true : san(decodeEntities(raw)),
    });
  }
  return attrs;
}

function attrValue(attrs, name) {
  const found = attrs.find((a) => a.name === name);
  if (!found) return undefined;
  return found.value === true ? "" : found.value;
}

function hasAttr(attrs, name) {
  return attrs.some((a) => a.name === name);
}

// ---------------------------------------------------------------------------
// Masking: blank inert content so scans only see live markup
// ---------------------------------------------------------------------------

function blank(match) {
  return " ".repeat(match.length);
}

// Space-fill (never delete) so match indexes keep document order.
export function maskInertHtml(html) {
  let out = String(html ?? "");
  // Comments first: a commented-out <meta name="robots" content="noindex">
  // reported as live would be a catastrophic false positive.
  out = out.replace(/<!--[\s\S]*?-->/g, blank);
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, blank);
  out = out.replace(/<style\b[\s\S]*?<\/style\s*>/gi, blank);
  out = out.replace(/<template\b[\s\S]*?<\/template\s*>/gi, blank);
  // An unclosed <script> makes the rest of the document script content per
  // HTML parsing rules; treat it the same way.
  const dangling = /<script\b/i.exec(out);
  if (dangling) out = out.slice(0, dangling.index) + " ".repeat(out.length - dangling.index);
  // <noscript> stays visible on purpose: non-JS crawlers parse it.
  return out;
}

function maskSvg(html) {
  return String(html ?? "").replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, blank);
}

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

function capList(list, cap, notes, label) {
  if (list.length <= cap) return { items: list, dropped: 0 };
  notes.push(`${label}: showing first ${cap} of ${list.length}`);
  return { items: list.slice(0, cap), dropped: list.length - cap };
}

function extractMetas(masked, notes) {
  const metas = [];
  for (const tag of findTags(masked, "meta")) {
    const attrs = parseAttrs(tag.raw);
    const charset = attrValue(attrs, "charset");
    let kind;
    let key;
    if (charset !== undefined) {
      kind = "charset";
      key = charset;
    } else {
      for (const candidate of ["name", "property", "http-equiv", "itemprop"]) {
        const value = attrValue(attrs, candidate);
        if (value !== undefined) {
          kind = candidate;
          key = value;
          break;
        }
      }
    }
    if (!kind) continue;
    metas.push({
      kind,
      key,
      content: attrValue(attrs, "content"),
      index: tag.index,
    });
  }
  return capList(metas, TECHNICAL_CAPS.metas, notes, "meta tags").items;
}

function isSocialMeta(meta) {
  const key = (meta.key || "").toLowerCase();
  return (
    key.startsWith("og:") ||
    key.startsWith("twitter:") ||
    key.startsWith("fb:") ||
    key.startsWith("article:")
  );
}

function extractLinkTags(masked, baseUrl, notes) {
  const canonicals = [];
  const hreflang = [];
  const icons = [];
  const feeds = [];
  for (const tag of findTags(masked, "link")) {
    const attrs = parseAttrs(tag.raw);
    const relRaw = attrValue(attrs, "rel") || "";
    const rel = relRaw.toLowerCase().split(/\s+/).filter(Boolean);
    const href = attrValue(attrs, "href");
    if (href === undefined) continue;
    if (rel.includes("canonical")) {
      canonicals.push({ href, resolved: absoluteUrl(href, baseUrl), index: tag.index });
    }
    const type = attrValue(attrs, "type");
    if (rel.includes("alternate")) {
      const lang = attrValue(attrs, "hreflang");
      if (lang !== undefined) hreflang.push({ hreflang: lang, href, index: tag.index });
      // Feed autodiscovery links (RSS, Atom, JSON feed).
      if (type !== undefined && /rss|atom|feed/i.test(type)) {
        feeds.push({ rel: relRaw, type, href, title: attrValue(attrs, "title"), index: tag.index });
      }
    }
    // Icons matter to AI answer engines too: citations render with favicons.
    if (rel.some((t) => t === "icon" || t.endsWith("-icon"))) {
      icons.push({
        rel: relRaw,
        href,
        sizes: attrValue(attrs, "sizes"),
        type,
        index: tag.index,
      });
    }
  }
  return {
    canonicals: capList(canonicals, TECHNICAL_CAPS.canonicals, notes, "canonical links").items,
    hreflang: capList(hreflang, TECHNICAL_CAPS.hreflang, notes, "hreflang links").items,
    icons: capList(icons, TECHNICAL_CAPS.icons, notes, "icon links").items,
    feeds: capList(feeds, TECHNICAL_CAPS.feeds, notes, "feed links").items,
  };
}

// The <html> element's lang and dir attributes are the page's primary
// language signal; capture them from the first <html> tag.
function extractHtmlAttrs(masked) {
  const tag = findTags(masked, "html")[0];
  if (!tag) return {};
  const attrs = parseAttrs(tag.raw);
  const out = {};
  const lang = attrValue(attrs, "lang");
  const dir = attrValue(attrs, "dir");
  if (lang !== undefined) out.lang = lang;
  if (dir !== undefined) out.dir = dir;
  return out;
}

function extractTitles(maskedNoSvg, notes) {
  const titles = findElements(maskedNoSvg, "title").map((el) => tidyText(el.inner));
  return capList(titles, TECHNICAL_CAPS.titles, notes, "title tags").items;
}

function extractBase(masked) {
  const bases = [];
  for (const tag of findTags(masked, "base")) {
    const href = attrValue(parseAttrs(tag.raw), "href");
    if (href !== undefined) bases.push(href);
  }
  return bases;
}

function extractHeadings(maskedNoSvg, notes) {
  const headings = [];
  for (let level = 1; level <= 6; level += 1) {
    for (const el of findElements(maskedNoSvg, `h${level}`)) {
      const text = tidyText(el.inner.replace(/<[^>]+>/g, " "));
      headings.push({ level, text, index: el.index });
    }
  }
  headings.sort((a, b) => a.index - b.index);
  return capList(headings, TECHNICAL_CAPS.headings, notes, "headings").items;
}

const JSON_LD_TYPE_RE = /^\s*application\/ld\+json\s*(?:;.*)?$/i;

function extractScripts(rawHtml, notes) {
  const headEndMatch = /<\/head\s*>/i.exec(rawHtml);
  const headEnd = headEndMatch ? headEndMatch.index : rawHtml.length;
  const head = [];
  let bodyCount = 0;
  const jsonLdBlocks = [];
  const re = elementRe("script");
  let m;
  while ((m = re.exec(rawHtml))) {
    const attrs = parseAttrs(m[1]);
    const type = attrValue(attrs, "type");
    const isJsonLd = type !== undefined && JSON_LD_TYPE_RE.test(type);
    if (isJsonLd) jsonLdBlocks.push({ body: m[2], index: m.index });
    if (m.index < headEnd) {
      head.push({ attrs, inlineBytes: m[2].length, isJsonLd, index: m.index });
    } else if (!isJsonLd) {
      bodyCount += 1;
    }
  }
  const capped = capList(head, TECHNICAL_CAPS.headScripts, notes, "head scripts");
  return { head: capped.items, headTotal: head.length, bodyCount, jsonLdBlocks };
}

// Strip the legacy wrappers CMSes still emit around JSON-LD payloads.
function unwrapJsonLd(body) {
  let text = String(body ?? "").trim();
  text = text.replace(/^<!--/, "").replace(/-->$/, "").trim();
  text = text.replace(/^\/\/\s*<!\[CDATA\[/, "").replace(/\/\/\s*\]\]>$/, "").trim();
  text = text.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  return text;
}

function summarizeJsonLd(parsed) {
  const types = [];
  const collect = (node) => {
    if (!node || typeof node !== "object") return;
    const t = node["@type"];
    if (typeof t === "string") types.push(t);
    else if (Array.isArray(t)) for (const v of t) if (typeof v === "string") types.push(v);
  };
  collect(parsed);
  const graph = parsed && typeof parsed === "object" ? parsed["@graph"] : undefined;
  if (Array.isArray(graph)) for (const node of graph.slice(0, 20)) collect(node);
  else if (Array.isArray(parsed)) for (const node of parsed.slice(0, 20)) collect(node);
  const name =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed.name || parsed["@id"] || ""
      : "";
  const topKeys =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed).slice(0, 12)
      : [];
  return { types: [...new Set(types)].slice(0, 12), name: String(name).slice(0, 200), topKeys };
}

export function extractJsonLd(rawHtml, notes) {
  const { jsonLdBlocks } = extractScripts(rawHtml, []);
  const items = [];
  let invalidCount = 0;
  for (const block of jsonLdBlocks) {
    const text = unwrapJsonLd(block.body);
    if (!text) continue;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      invalidCount += 1;
      items.push({
        valid: false,
        excerpt: san(text).slice(0, TECHNICAL_CAPS.jsonLdInvalidExcerpt),
        bytes: text.length,
        index: block.index,
      });
      continue;
    }
    // Re-serialize from the parsed object only; raw script bodies never reach
    // the bundle. Pathologically deep values can blow the stringify stack, so
    // fall back to the flagged path instead of crashing the CLI.
    let compact;
    try {
      compact = JSON.stringify(parsed);
    } catch {
      invalidCount += 1;
      items.push({
        valid: false,
        excerpt: san(text).slice(0, TECHNICAL_CAPS.jsonLdInvalidExcerpt),
        bytes: text.length,
        note: "could not re-serialize (too deep)",
        index: block.index,
      });
      continue;
    }
    if (compact.length > TECHNICAL_CAPS.jsonLdItemBytes) {
      items.push({
        valid: true,
        oversize: true,
        bytes: compact.length,
        summary: summarizeJsonLd(parsed),
        index: block.index,
      });
    } else {
      items.push({ valid: true, compact: san(compact), bytes: compact.length, index: block.index });
    }
  }
  const capped = capList(items, TECHNICAL_CAPS.jsonLdItems, notes, "JSON-LD items");
  if (invalidCount) notes.push(`JSON-LD: ${invalidCount} block(s) did not parse as JSON`);
  return { items: capped.items, total: items.length, invalidCount };
}

function extractMicrodataSummary(masked) {
  const count = (re) => {
    const matches = masked.match(re);
    return matches ? matches.length : 0;
  };
  const values = (re) => {
    const counter = new Map();
    let m;
    while ((m = re.exec(masked))) {
      const value = tidyText(m[1] ?? m[2] ?? m[3] ?? "");
      if (!value) continue;
      counter.set(value, (counter.get(value) || 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  };
  return {
    itemscope: count(/\bitemscope\b/gi),
    itemtypes: values(/\bitemtype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi),
    roles: values(/\brole\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi),
  };
}

function extractLinks(maskedNoSvg, baseUrl, pageHost, notes) {
  const all = [];
  for (const el of findElements(maskedNoSvg, "a")) {
    const attrs = parseAttrs(el.open);
    const href = attrValue(attrs, "href");
    if (href === undefined || !href || href.startsWith("#")) continue;
    const resolved = absoluteUrl(href, baseUrl);
    let internal = false;
    if (resolved) {
      try {
        internal = new URL(resolved).host === pageHost;
      } catch {
        internal = false;
      }
    }
    all.push({
      href,
      rel: attrValue(attrs, "rel"),
      text: tidyText(el.inner.replace(/<[^>]+>/g, " ")).slice(0, 200),
      internal,
      index: el.index,
    });
  }
  const capped = capList(all, TECHNICAL_CAPS.links, notes, "links");
  return {
    items: capped.items,
    total: all.length,
    internalTotal: all.filter((l) => l.internal).length,
    externalTotal: all.filter((l) => !l.internal).length,
  };
}

function extractImages(maskedNoSvg, notes) {
  const all = [];
  for (const tag of findTags(maskedNoSvg, "img")) {
    const attrs = parseAttrs(tag.raw);
    const src = attrValue(attrs, "src") ?? attrValue(attrs, "data-src");
    if (src === undefined) continue;
    all.push({
      src,
      alt: hasAttr(attrs, "alt") ? attrValue(attrs, "alt") : undefined,
      index: tag.index,
    });
  }
  const capped = capList(all, TECHNICAL_CAPS.images, notes, "images");
  return {
    items: capped.items,
    total: all.length,
    missingAlt: all.filter((img) => img.alt === undefined).length,
  };
}

// ---------------------------------------------------------------------------
// extractTechnical: everything above, assembled
// ---------------------------------------------------------------------------

// Pure. `headers` is a plain lowercase-keyed object captured from the final
// response; `redirectChain` is [{url, status}, ...] ending with the final
// response.
export function extractTechnical(html, options = {}) {
  const { url = "", headers = {}, redirectChain = [], extraNotes = [] } = options;
  const notes = [];
  const raw = String(html ?? "");
  const masked = maskInertHtml(raw);
  const maskedNoSvg = maskSvg(masked);

  let pageHost = "";
  try {
    pageHost = new URL(url).host;
  } catch {
    pageHost = "";
  }

  const baseHrefs = extractBase(masked);
  const effectiveBase = (baseHrefs.length && absoluteUrl(baseHrefs[0], url)) || url;
  if (baseHrefs.length > 1) notes.push(`multiple <base> tags (${baseHrefs.length}); first one applies`);

  const metasAll = extractMetas(masked, notes);
  const metas = metasAll.filter((m) => !isSocialMeta(m));
  const socials = metasAll.filter(isSocialMeta);
  const { canonicals, hreflang, icons, feeds } = extractLinkTags(masked, effectiveBase, notes);
  const htmlAttrs = extractHtmlAttrs(masked);
  const titles = extractTitles(maskedNoSvg, notes);
  const headings = extractHeadings(maskedNoSvg, notes);
  const scripts = extractScripts(raw, notes);
  const jsonLd = extractJsonLd(raw, notes);
  const micro = extractMicrodataSummary(masked);
  const links = extractLinks(maskedNoSvg, effectiveBase, pageHost, notes);
  const images = extractImages(maskedNoSvg, notes);

  // Header values get the same visible "..." truncation marker as attribute
  // values; a bare slice would make a long CSP look like corrupted output.
  let truncatedHeaderCount = 0;
  const headerEntries = Object.entries(headers || {}).map(([name, value]) => {
    const clean = san(String(value));
    const overCap = clean.length > TECHNICAL_CAPS.attrValueChars;
    if (overCap) truncatedHeaderCount += 1;
    return [
      san(String(name)).toLowerCase(),
      overCap ? `${clean.slice(0, TECHNICAL_CAPS.attrValueChars)}...` : clean,
    ];
  });
  if (truncatedHeaderCount) {
    notes.push(
      `${truncatedHeaderCount} header value(s) truncated to ${TECHNICAL_CAPS.attrValueChars} characters`,
    );
  }
  const headerMap = new Map(headerEntries);

  const contentType = headerMap.get("content-type") || "";
  const headerCharset = /charset=([^;\s]+)/i.exec(contentType)?.[1] || "";
  const metaCharsetEntry = metasAll.find((m) => m.kind === "charset");
  const httpEquivType = metasAll.find(
    (m) => m.kind === "http-equiv" && (m.key || "").toLowerCase() === "content-type",
  );
  const declaredCharset =
    metaCharsetEntry?.key || /charset=([^;\s]+)/i.exec(httpEquivType?.content || "")?.[1] || "";
  const charset = { header: headerCharset, declared: declaredCharset };
  const effective = (declaredCharset || headerCharset || "").toLowerCase();
  if (effective && effective !== "utf-8" && effective !== "utf8") {
    notes.push(`declared charset is ${effective}; exporter decodes utf-8, text may be mis-decoded`);
  }

  for (const note of extraNotes) if (note) notes.push(san(String(note)));

  return {
    url: san(String(url)),
    htmlBytes: Buffer.byteLength(raw, "utf8"),
    redirectChain: (redirectChain || []).map((hop) => ({
      url: san(String(hop.url || "")),
      status: hop.status,
    })),
    headers: headerMap,
    charset,
    htmlAttrs,
    titles,
    baseHrefs: baseHrefs.map((h) => san(h)),
    metas,
    socials,
    canonicals,
    icons,
    feeds,
    hreflang,
    headings,
    scripts,
    jsonLd,
    micro,
    links,
    images,
    contentWordCount: options.contentWordCount || 0,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Lossless fence: one backtick longer than the longest run in the content, so
// page bytes can never terminate the block early. Never mutate content.
export function fence(content, lang = "") {
  const text = String(content ?? "");
  const runs = text.match(/`+/g);
  const size = Math.max(3, (runs ? Math.max(...runs.map((r) => r.length)) : 0) + 1);
  const marks = "`".repeat(size);
  return `${marks}${lang}\n${text}\n${marks}`;
}

// Attribute values inside reconstructed tags are re-encoded minimally so the
// reconstruction stays well-formed HTML.
function encodeAttr(value) {
  const text = String(value ?? "");
  const capped =
    text.length > TECHNICAL_CAPS.attrValueChars
      ? `${text.slice(0, TECHNICAL_CAPS.attrValueChars)}...`
      : text;
  return capped.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function metaTag(meta) {
  if (meta.kind === "charset") return `<meta charset="${encodeAttr(meta.key)}">`;
  const content = meta.content === undefined ? "" : ` content="${encodeAttr(meta.content)}"`;
  return `<meta ${meta.kind}="${encodeAttr(meta.key)}"${content}>`;
}

function scriptTag(script) {
  const attrs = [];
  const get = (name) => attrValue(script.attrs, name);
  const type = get("type");
  if (type !== undefined) attrs.push(`type="${encodeAttr(type)}"`);
  for (const flag of ["async", "defer", "nomodule"]) {
    if (hasAttr(script.attrs, flag)) attrs.push(flag);
  }
  const src = get("src");
  if (src !== undefined) attrs.push(`src="${encodeAttr(src)}"`);
  for (const name of ["crossorigin", "integrity", "referrerpolicy"]) {
    const value = get(name);
    if (value !== undefined) attrs.push(`${name}="${encodeAttr(value)}"`);
  }
  const attrText = attrs.length ? ` ${attrs.join(" ")}` : "";
  if (script.isJsonLd) return `<script${attrText}>/* see Structured data */</script>`;
  if (!src && script.inlineBytes) return `<script${attrText}>/* inline, ${script.inlineBytes} bytes */</script>`;
  return `<script${attrText}></script>`;
}

const HEADER_GROUPS = [
  ["Content", ["content-type", "content-language"]],
  ["Robots", ["x-robots-tag"]],
  [
    "Security",
    [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
    ],
  ],
  ["Cache", ["cache-control", "etag", "expires", "age", "vary", "last-modified"]],
  ["Server", ["server", "x-powered-by"]],
];

export function renderTechnicalBody(data) {
  const parts = [];
  const section = (title) => {
    parts.push(`## ${title}`, "");
  };
  const push = (...lines) => parts.push(...lines);

  // 1. Fetch
  section("Fetch");
  if (data.redirectChain.length > 1) {
    push("Redirect chain:");
    let downgraded = false;
    data.redirectChain.forEach((hop, i) => {
      const status = hop.status ? `HTTP ${hop.status}` : "";
      push(`${i + 1}. ${status} ${hop.url}`.trim());
      const prev = data.redirectChain[i - 1];
      if (prev && prev.url.startsWith("https:") && hop.url.startsWith("http:")) downgraded = true;
    });
    if (downgraded) push("", "Note: the chain downgrades from https to http.");
  } else {
    const final = data.redirectChain[0];
    push(
      final && final.status
        ? `Fetched ${data.url} (HTTP ${final.status}, no redirects).`
        : `Fetched ${data.url}.`,
    );
  }
  if (data.htmlBytes) {
    push("", `HTML size: ${Math.round(data.htmlBytes / 1024)} KB (${data.htmlBytes} bytes).`);
  }
  push("");

  // 2. HTTP headers
  const headerLines = [];
  for (const [group, names] of HEADER_GROUPS) {
    const present = names
      .filter((name) => data.headers.has(name))
      .sort()
      .map((name) => `${name}: ${data.headers.get(name)}`);
    if (present.length) headerLines.push(`# ${group}`, ...present);
  }
  if (headerLines.length) {
    section("HTTP headers");
    push(fence(headerLines.join("\n"), "http"), "");
  }

  // 3. Meta tags
  const metaLines = [];
  if (data.htmlAttrs && (data.htmlAttrs.lang !== undefined || data.htmlAttrs.dir !== undefined)) {
    const langAttr = data.htmlAttrs.lang !== undefined ? ` lang="${encodeAttr(data.htmlAttrs.lang)}"` : "";
    const dirAttr = data.htmlAttrs.dir !== undefined ? ` dir="${encodeAttr(data.htmlAttrs.dir)}"` : "";
    metaLines.push(`<html${langAttr}${dirAttr}>`);
  }
  for (const title of data.titles) metaLines.push(`<title>${encodeAttr(title)}</title>`);
  for (const base of data.baseHrefs) metaLines.push(`<base href="${encodeAttr(base)}">`);
  for (const meta of data.metas) metaLines.push(metaTag(meta));
  for (const canonical of data.canonicals)
    metaLines.push(`<link rel="canonical" href="${encodeAttr(canonical.href)}">`);
  for (const icon of data.icons) {
    const sizes = icon.sizes !== undefined ? ` sizes="${encodeAttr(icon.sizes)}"` : "";
    const type = icon.type !== undefined ? ` type="${encodeAttr(icon.type)}"` : "";
    metaLines.push(`<link rel="${encodeAttr(icon.rel)}"${type}${sizes} href="${encodeAttr(icon.href)}">`);
  }
  for (const feed of data.feeds) {
    const title = feed.title !== undefined ? ` title="${encodeAttr(feed.title)}"` : "";
    metaLines.push(
      `<link rel="${encodeAttr(feed.rel)}" type="${encodeAttr(feed.type)}"${title} href="${encodeAttr(feed.href)}">`,
    );
  }
  if (metaLines.length) {
    const dupNote = [];
    if (data.titles.length > 1) dupNote.push(`${data.titles.length} title tags`);
    if (data.canonicals.length > 1) dupNote.push(`${data.canonicals.length} canonical links`);
    section("Meta tags");
    if (dupNote.length) push(`Duplicates present: ${dupNote.join(", ")}.`, "");
    push(fence(metaLines.join("\n"), "html"), "");
  }

  // 4. Headings
  if (data.headings.length) {
    section(`Headings (${data.headings.length})`);
    push(
      fence(
        data.headings.map((h) => `<h${h.level}>${encodeAttr(h.text)}</h${h.level}>`).join("\n"),
        "html",
      ),
      "",
    );
  }

  // 5. Hreflang
  if (data.hreflang.length) {
    section(`Hreflang (${data.hreflang.length})`);
    push(
      fence(
        data.hreflang
          .map(
            (hl) =>
              `<link rel="alternate" hreflang="${encodeAttr(hl.hreflang)}" href="${encodeAttr(hl.href)}">`,
          )
          .join("\n"),
        "html",
      ),
      "",
    );
  }

  // 6. Social
  if (data.socials.length) {
    section(`Social (${data.socials.length})`);
    push(fence(data.socials.map(metaTag).join("\n"), "html"), "");
  }

  // 7. Scripts
  if (data.scripts.head.length || data.scripts.bodyCount) {
    const shown = data.scripts.head.length;
    const suffix =
      data.scripts.headTotal > shown ? `, showing first ${shown} of ${data.scripts.headTotal}` : "";
    section(`Scripts (${data.scripts.headTotal} in head${suffix})`);
    if (shown) push(fence(data.scripts.head.map(scriptTag).join("\n"), "html"), "");
    if (data.scripts.bodyCount)
      push(`Plus ${data.scripts.bodyCount} script tag(s) in the body (not shown).`, "");
  }

  // 8. Structured data
  section("Structured data");
  if (!data.jsonLd.items.length) {
    push("JSON-LD: none found. AI crawlers get no schema.org data from this page as served.", "");
  } else {
    const shown = data.jsonLd.items.length;
    const suffix = data.jsonLd.total > shown ? ` (showing first ${shown} of ${data.jsonLd.total})` : "";
    push(`JSON-LD: ${data.jsonLd.total} block(s)${suffix}.`, "");
    for (const item of data.jsonLd.items) {
      if (item.valid && !item.oversize) {
        push(fence(`<script type="application/ld+json">${item.compact}</script>`, "html"), "");
      } else if (item.valid && item.oversize) {
        const s = item.summary;
        const label = [
          s.types.length ? `types: ${s.types.join(", ")}` : "",
          s.name ? `name: ${s.name}` : "",
          s.topKeys.length ? `keys: ${s.topKeys.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        push(`- JSON-LD block of ${item.bytes} bytes (too large to inline). ${label}`, "");
      } else {
        const why = item.note ? ` (${item.note})` : "";
        push(`Invalid JSON-LD block of ${item.bytes} bytes${why}, excerpt:`, "");
        push(fence(item.excerpt), "");
      }
    }
  }

  // 9. Microdata and RDFa
  if (data.micro.itemscope || data.micro.itemtypes.length || data.micro.roles.length) {
    section("Microdata and RDFa (summary)");
    if (data.micro.itemscope) push(`- itemscope attributes: ${data.micro.itemscope}`);
    if (data.micro.itemtypes.length)
      push(`- itemtype values: ${data.micro.itemtypes.map(([v, n]) => `${v} (${n})`).join(", ")}`);
    if (data.micro.roles.length)
      push(`- role values: ${data.micro.roles.map(([v, n]) => `${v} (${n})`).join(", ")}`);
    push("");
  }

  // 10. Links
  if (data.links.items.length) {
    const shown = data.links.items.length;
    const suffix = data.links.total > shown ? `, showing first ${shown}` : "";
    section(
      `Links (${data.links.total} total: ${data.links.internalTotal} internal, ${data.links.externalTotal} external${suffix})`,
    );
    const renderLink = (link) => {
      const rel = link.rel ? ` rel="${encodeAttr(link.rel)}"` : "";
      return `<a href="${encodeAttr(link.href)}"${rel}>${encodeAttr(link.text)}</a>`;
    };
    const internal = data.links.items.filter((l) => l.internal);
    const external = data.links.items.filter((l) => !l.internal);
    if (internal.length) push("Internal:", fence(internal.map(renderLink).join("\n"), "html"), "");
    if (external.length) push("External:", fence(external.map(renderLink).join("\n"), "html"), "");
  }

  // 11. Images
  if (data.images.items.length) {
    const shown = data.images.items.length;
    const suffix = data.images.total > shown ? `, showing first ${shown}` : "";
    section(
      `Images (${data.images.total} total, ${data.images.missingAlt} without an alt attribute${suffix})`,
    );
    push(
      fence(
        data.images.items
          .map((img) => {
            const alt = img.alt === undefined ? "" : ` alt="${encodeAttr(img.alt)}"`;
            return `<img src="${encodeAttr(img.src)}"${alt}>`;
          })
          .join("\n"),
        "html",
      ),
      "",
    );
  }

  // 12. Robots directives, from the page and its response only
  section("Robots directives");
  const metaRobots = data.metas.filter(
    (m) => m.kind === "name" && (m.key || "").toLowerCase() === "robots",
  );
  push(
    metaRobots.length
      ? `Meta robots: ${metaRobots.map((m) => m.content || "").join(" | ")}`
      : "Meta robots: none.",
  );
  push(
    data.headers.has("x-robots-tag")
      ? `X-Robots-Tag header: ${data.headers.get("x-robots-tag")}`
      : "X-Robots-Tag header: none.",
  );
  push("");

  // 13. Content stats
  if (data.contentWordCount) {
    section("Content stats");
    push(`- extracted content: ${data.contentWordCount} words`, "");
  }

  if (data.notes.length) {
    section("Extraction notes");
    for (const note of data.notes) push(`- ${note}`);
    push("");
  }

  // Defense in depth: one final sweep, matching the content path's pattern.
  return san(parts.join("\n").trimEnd());
}

export function technicalTitle(pageTitle, url) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const subject = (pageTitle || host || url || "page").slice(0, 260);
  return `Technical snapshot: ${subject}`;
}

export function technicalDescription(url) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = String(url || "");
  }
  return `Meta tags, structured data, headers and robots directives as served for ${host}.`;
}
