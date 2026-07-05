// Open Knowledge Format (OKF v0.1) export — local, dependency-free.
//
// This module holds the PURE transforms: HTML string -> OKF bundle files.
// It performs no network and no filesystem I/O (except writeBundle, which is
// kept separate so the transforms stay unit-testable). The CLI handler fetches
// the page and calls buildBundle(); nothing here touches the Sleepwalker API,
// so `okf export` costs zero credits and needs no account.
//
// Fidelity is intentionally "good enough" for a free tier. A future upgrade can
// swap the local extractor for readability/turndown behind the same interface.

import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { sanitizeTerminalText } from "./theme.js";

// Bundles are "agent-ready markdown": hostile page bytes (control characters,
// ANSI escapes, bidi overrides — raw or entity-encoded) must never reach the
// emitted files, both so strict YAML consumers can parse the frontmatter and
// so cat-ing a bundle can't inject terminal escapes or Trojan-Source spoofing.
function sanitizeText(value) {
  return sanitizeTerminalText(value);
}

export const OKF_VERSION = "0.1";
export const OKF_USER_AGENT =
  "SleepwalkerCLI-OKF/0.1 (+https://github.com/followanton/sleepwalker)";

const RESERVED_FILENAMES = new Set(["index.md", "log.md"]);

// Blocks whose contents are never page content.
const NOISE_BLOCKS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "head",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  "iframe",
];

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  rarr: "→",
  larr: "←",
  uarr: "↑",
  darr: "↓",
  harr: "↔",
  times: "×",
  divide: "÷",
  deg: "°",
  plusmn: "±",
  middot: "·",
  bull: "•",
  laquo: "«",
  raquo: "»",
  euro: "€",
  pound: "£",
  cent: "¢",
  yen: "¥",
  sect: "§",
};

export function decodeEntities(input) {
  if (!input) return "";
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}

function removeBlock(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  return html.replace(re, " ");
}

function removeNoise(html) {
  let out = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of NOISE_BLOCKS) out = removeBlock(out, tag);
  // Drop any self-closing/dangling noise open tags left behind.
  return out;
}

function collapseWhitespace(text) {
  return text
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstMatch(html, re) {
  const m = re.exec(html);
  return m ? decodeEntities(stripTags(m[1]).trim()) : "";
}

// Read the content="" of the first <meta> tag whose name/property matches.
function metaContent(html, nameValue) {
  const tagRe = /<meta\b[^>]*>/gi;
  let tag;
  while ((tag = tagRe.exec(html))) {
    const raw = tag[0];
    const nameM = /\b(?:name|property)\s*=\s*["']?([^"'>\s]+)/i.exec(raw);
    if (nameM && nameM[1].toLowerCase() === nameValue.toLowerCase()) {
      const contentM = /\bcontent\s*=\s*["']([\s\S]*?)["']/i.exec(raw);
      if (contentM) return decodeEntities(contentM[1].trim());
    }
  }
  return "";
}

function canonicalUrl(html) {
  const linkRe = /<link\b[^>]*>/gi;
  let tag;
  while ((tag = linkRe.exec(html))) {
    const raw = tag[0];
    if (/\brel\s*=\s*["']?canonical/i.test(raw)) {
      const hrefM = /\bhref\s*=\s*["']([^"']+)["']/i.exec(raw);
      if (hrefM) return hrefM[1].trim();
    }
  }
  return "";
}

// Pick the most content-ful region: prefer <main>/<article>, else <body>.
function mainRegion(html) {
  for (const tag of ["main", "article"]) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    let best = "";
    let m;
    while ((m = re.exec(html))) {
      if (m[1].length > best.length) best = m[1];
    }
    if (best.trim()) return best;
  }
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return body ? body[1] : html;
}

// Lightweight HTML -> markdown for the pieces that matter to a reader/agent:
// headings, paragraphs, list items, links. Everything else becomes plain text.
function htmlToMarkdown(fragment, baseUrl) {
  let out = fragment;
  out = out.replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const label = collapseWhitespace(decodeEntities(stripTags(text))).replace(/\n+/g, " ").trim();
    const resolved = absoluteUrl(href, baseUrl);
    if (!label) return "";
    return resolved ? `[${label}](${resolved})` : label;
  });
  out = out.replace(/<\/(h[1-6])\s*>/gi, "\n\n");
  out = out.replace(/<(h[1-6])\b[^>]*>/gi, (_m, tag) => `\n\n${"#".repeat(Number(tag[1]))} `);
  out = out.replace(/<li\b[^>]*>/gi, "\n- ");
  out = out.replace(/<\/(p|div|section|ul|ol|tr|table|blockquote)\s*>/gi, "\n\n");
  out = out.replace(/<br\s*\/?>(?=)/gi, "\n");
  out = stripTags(out);
  out = decodeEntities(out);
  // Drop empty heading markers left when a heading's text lived in nested blocks
  // that were stripped (avoids junk lines like a bare "#" or "##").
  out = out.replace(/^[ \t]*#{1,6}[ \t]*$/gm, "");
  return collapseWhitespace(out);
}

// renderConcept re-adds the title as the top H1, so drop a leading body heading
// that merely repeats it (avoids "# Title" appearing twice). A *different* first
// heading is kept — it's real page structure.
function stripLeadingDuplicateH1(body, title) {
  const m = /^#\s+(.+?)\s*\n+/.exec(body);
  if (!m) return body;
  const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();
  return norm(m[1]) === norm(title) ? body.slice(m[0].length) : body;
}

export function absoluteUrl(href, baseUrl) {
  const raw = (href || "").trim();
  if (!raw || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

// Collect same-host outbound links (for future cross-linking / phase 2).
export function collectLinks(fragment, baseUrl) {
  const links = [];
  const seen = new Set();
  let host = "";
  try {
    host = new URL(baseUrl).host;
  } catch {
    return links;
  }
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(fragment))) {
    const resolved = absoluteUrl(m[1], baseUrl);
    if (!resolved) continue;
    let u;
    try {
      u = new URL(resolved);
    } catch {
      continue;
    }
    if (u.host !== host) continue;
    const key = u.origin + u.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = collapseWhitespace(decodeEntities(stripTags(m[2]))).replace(/\n+/g, " ").trim();
    links.push({ url: u.toString(), path: u.pathname, text });
  }
  return links;
}

// url path -> concept slug/filename. Root -> "home". Avoids reserved names.
export function slugForUrl(url) {
  let pathname = "/";
  try {
    pathname = new URL(url).pathname || "/";
  } catch {
    pathname = "/";
  }
  let slug = pathname
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!slug) slug = "home";
  if (RESERVED_FILENAMES.has(`${slug}.md`)) slug = `${slug}-page`;
  return slug;
}

function humanizeFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = (u.pathname.replace(/^\/+|\/+$/g, "").split("/").pop() || u.hostname)
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    return seg ? seg.replace(/\b\w/g, (c) => c.toUpperCase()) : u.hostname;
  } catch {
    return url;
  }
}

// Extract one page into an OKF concept (pure). No timestamp — caller adds it.
export function extractConcept(html, url) {
  const source = String(html || "");
  const title =
    firstMatch(source, /<title\b[^>]*>([\s\S]*?)<\/title>/i) ||
    firstMatch(source, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
    humanizeFromUrl(url);
  const description = metaContent(source, "description") || metaContent(source, "og:description");
  const resource = absoluteUrl(canonicalUrl(source), url) || url;
  const region = mainRegion(removeNoise(source));
  const body = stripLeadingDuplicateH1(htmlToMarkdown(region, url), title);
  const links = collectLinks(region, url);
  let firstSentence = description;
  if (!firstSentence && body) {
    const firstPara = body.split("\n").find((line) => line && !line.startsWith("#"));
    if (firstPara) firstSentence = firstPara.split(/(?<=[.!?])\s/)[0].slice(0, 300);
  }
  return {
    type: "WebPage",
    title: sanitizeText(title).slice(0, 300),
    description: sanitizeText(firstSentence || "").slice(0, 300),
    resource,
    body: sanitizeText(body),
    links: links.map((link) => ({ ...link, text: sanitizeText(link.text) })),
  };
}

function yamlScalar(value) {
  const s = sanitizeText(String(value == null ? "" : value))
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ");
  return `"${s}"`;
}

export function renderConcept({ type, title, description, resource, tags, timestamp, body, seeAlso }) {
  const lines = ["---", `type: ${yamlScalar(type || "WebPage")}`];
  if (title) lines.push(`title: ${yamlScalar(title)}`);
  if (description) lines.push(`description: ${yamlScalar(description)}`);
  // Quoted: a hostile <link rel=canonical> could otherwise smuggle "#" or ": "
  // into the plain scalar and corrupt or truncate the frontmatter.
  if (resource) lines.push(`resource: ${yamlScalar(resource)}`);
  if (Array.isArray(tags) && tags.length) lines.push(`tags: [${tags.map(yamlScalar).join(", ")}]`);
  if (timestamp) lines.push(`timestamp: ${timestamp}`);
  lines.push("---", "");
  if (title) lines.push(`# ${title}`, "");
  lines.push(body || "");
  if (Array.isArray(seeAlso) && seeAlso.length) {
    lines.push("", "## See also");
    for (const item of seeAlso) lines.push(`- [${item.title}](/${item.slug}.md)`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderIndex(concepts, { title } = {}) {
  const lines = ["---", `okf_version: "${OKF_VERSION}"`, "---", "", `# ${title || "Knowledge Bundle"}`, ""];
  for (const c of concepts) {
    const desc = c.description ? ` - ${c.description}` : "";
    lines.push(`* [${c.title || c.slug}](/${c.slug}.md)${desc}`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderLog({ url, timestamp, cliVersion, conceptCount, notes }) {
  const lines = [
    "# Generation log",
    "",
    `- generator: @sleepwalkerai/cli okf export`,
    `- cli_version: ${cliVersion || "unknown"}`,
    `- extractor: local (dependency-free)`,
    `- source_url: ${url}`,
    `- generated_at: ${timestamp}`,
    `- concepts: ${conceptCount}`,
    `- okf_version: ${OKF_VERSION}`,
  ];
  for (const note of notes || []) lines.push(`- note: ${note}`);
  return `${lines.join("\n")}\n`;
}

// Assemble a full single-page bundle (pure). Returns { files, summary }.
export function buildBundle({ url, html, now, cliVersion, extraNotes }) {
  const timestamp = now || new Date().toISOString();
  const concept = extractConcept(html, url);
  const slug = slugForUrl(concept.resource || url);
  const notes = Array.isArray(extraNotes) ? extraNotes.filter(Boolean).map(sanitizeText) : [];
  if (!concept.body) notes.push("no readable content extracted from the page");

  const files = {};
  files[`${slug}.md`] = renderConcept({ ...concept, timestamp });
  files["index.md"] = renderIndex([{ slug, title: concept.title, description: concept.description }], {
    title: concept.title,
  });
  files["log.md"] = renderLog({ url, timestamp, cliVersion, conceptCount: 1, notes });

  return {
    files,
    summary: {
      url,
      resource: concept.resource,
      conceptCount: 1,
      files: Object.keys(files),
      credits: 0,
      title: concept.title,
      notes,
    },
  };
}

export function defaultOutDir(url) {
  let host = "okf";
  try {
    host = new URL(url).hostname.replace(/^www\./, "") || "okf";
  } catch {
    host = "okf";
  }
  return `./${host}-okf`;
}

// The one I/O function; kept out of the pure path so tests don't need disk.
export async function writeBundle(outDir, files, { force = false } = {}) {
  const dir = path.resolve(outDir);
  let existing = [];
  try {
    existing = await readdir(dir);
  } catch {
    existing = [];
  }
  if (existing.length && !force) {
    const err = new Error(`Output directory ${outDir} is not empty. Use --force to overwrite.`);
    err.exitCode = 1;
    throw err;
  }
  await mkdir(dir, { recursive: true });
  const written = [];
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    written.push(name);
  }
  return { dir, written };
}
