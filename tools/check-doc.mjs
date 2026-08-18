#!/usr/bin/env node
/**
 * 문서 규약 검사기 (의존성 없음, Node 18+)
 *
 *   node tools/check-doc.mjs <파일 또는 폴더> [...]
 *   node tools/check-doc.mjs --list          ← 무엇을 검사하는지 보여준다
 *
 * 규칙은 docs/ 의 규약에서 **기계가 판정할 수 있는 것만** 골라 담았다.
 * 레지스터·서사·미감처럼 사람 눈이 봐야 하는 것은 검사하지 않는다 — 그래서
 * 이 도구가 통과했다는 것은 "규약을 지켰다"가 아니라 "기계가 잡는 하자가 없다"는 뜻이다.
 *
 * 종료코드: 오류(error)가 하나라도 있으면 1, 경고만 있으면 0.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const argv = process.argv.slice(2);

// ── 검사 대상 파일 모으기 ─────────────────────────────────────────
const EXT = new Set([".html", ".htm", ".md", ".mjs", ".js"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", ".astro", ".wrangler"]);

function collect(p, out = []) {
  const st = statSync(p);
  if (st.isDirectory()) {
    if (SKIP_DIR.has(basename(p))) return out;
    for (const name of readdirSync(p)) collect(join(p, name), out);
    return out;
  }
  if (EXT.has(extname(p).toLowerCase())) out.push(p);
  return out;
}

// ── 검사에서 제외할 구역 ──────────────────────────────────────────
/**
 * 인용은 우리 문장이 아니다. 원어 제목·코드·링크는 표기 규칙 대상이 아니므로
 * 표기 검사 전에 지운다. **무엇을 왜 뺐는지 세어 출력한다** — 조용히 빼면
 * 다음 사람이 규칙이 없는 줄 안다.
 */
function maskQuoted(text) {
  const removed = { 코드블록: 0, 인라인코드: 0, URL: 0, HTML주석: 0 };
  let t = text;
  t = t.replace(/```[\s\S]*?```/g, (m) => { removed.코드블록++; return " ".repeat(m.length); });
  t = t.replace(/`[^`\n]*`/g, (m) => { removed.인라인코드++; return " ".repeat(m.length); });
  t = t.replace(/https?:\/\/[^\s)"'<>]+/g, (m) => { removed.URL++; return " ".repeat(m.length); });
  t = t.replace(/<!--[\s\S]*?-->/g, (m) => { removed.HTML주석++; return " ".repeat(m.length); });
  return { text: t, removed };
}

/** 줄 번호 계산(원문 기준). */
const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;

// ── 규칙 ─────────────────────────────────────────────────────────
const RULES = [];
const rule = (id, what, applies, run) => RULES.push({ id, what, applies, run });

const isHtml = (f) => /\.html?$/i.test(f);
const isMd = (f) => /\.md$/i.test(f);
const isText = (f) => isHtml(f) || isMd(f);

/** 도구 문서(설치 안내, 에이전트 절차서, 저장소 문서). 표기는 지키되 말투 규칙은 빼는 자리. */
const isToolDoc = (f) =>
  /(^|[\\/])(README|SKILL|CHANGELOG|LICENSE|CONTRIBUTING)\.md$/i.test(f)
  || /[\\/](tools|scripts|skills)[\\/]/.test(f);

// 표기 ------------------------------------------------------------
/**
 * 글리프를 **이름으로 부르는** 자리는 위반이 아니다("엠대시(—)를 쓰지 않습니다").
 * 규칙을 적어 둔 문장까지 위반으로 세면 검사기가 무시당한다.
 */
const namedGlyph = (masked, idx) => /(?:엠대시|em ?dash|가운뎃점|중간점|middot)\s*\($/i.test(masked.slice(Math.max(0, idx - 12), idx));

rule("glyph-emdash", "엠대시(—)를 쓰지 않는다", isText, (raw, masked, add) => {
  for (const m of masked.matchAll(/—/g)) {
    if (namedGlyph(masked, m.index)) continue;
    add("error", lineOf(masked, m.index), "엠대시. 쉼표, 슬래시, 괄호, 문장 분리로 대신합니다");
  }
});

rule("glyph-middot", "가운뎃점(·)을 쓰지 않는다", isText, (raw, masked, add) => {
  for (const m of masked.matchAll(/·/g)) {
    if (namedGlyph(masked, m.index)) continue;
    add("error", lineOf(masked, m.index), "가운뎃점. 쉼표나 슬래시로 대신합니다");
  }
});

rule("glyph-roman", "로마숫자 소제목을 쓰지 않는다", isText, (raw, masked, add) => {
  for (const m of masked.matchAll(/^\s{0,3}#{0,6}\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\s*[.．)]?\s/gm)) {
    add("error", lineOf(masked, m.index), "로마숫자 소제목. 숫자는 1부터 아라비아로 씁니다");
  }
});

rule("plain-ending", "완결 문장은 합니다체로 쓴다", isText, (raw, masked, add) => {
  // 평서체 종결만 좁게 잡는다. '~한다/~된다/~이다/~였다/~있다/~없다'가 문장 끝에 온 경우.
  // 목록 라벨(명사 종결)과 인용은 대상이 아니므로, 마침표나 줄끝이 뒤따를 때만 센다.
  const re = /(?:[가-힣])(?:한다|된다|이다|였다|았다|었다|많다|없다|있다|같다|아니다)(?=[.!?]|\s*$)/gm;
  // **말투 규칙은 보고 문서 대상이다.** 도구 문서(설치 안내, 에이전트 절차서, 저장소 README)는
  // 평서체가 관용이라 대상에서 뺀다.
  if (isToolDoc(currentFile)) return;
  const hits = [...masked.matchAll(re)];
  // 규약 문서 자신은 규칙을 인용하느라 평서체 예시를 담을 수 있어 경고로 낮춘다.
  const level = /docs[\\/]/.test(currentFile) ? "warn" : "error";
  for (const m of hits) {
    add(level, lineOf(masked, m.index), `평서체 종결 "${m[0].slice(-3)}". 합니다체로 씁니다`);
  }
});

// 덱 --------------------------------------------------------------
rule("deck-reveal", "HTML 덱은 Reveal 골격이어야 한다", isHtml, (raw, masked, add) => {
  const looksDeck = /class="[^"]*\bslides?\b|\bsection\b[^>]*class="[^"]*slide/i.test(raw)
    || /Reveal\.initialize/.test(raw)
    || /class="[^"]*reveal/i.test(raw);
  if (!looksDeck) return; // 덱이 아니면 대상 아님
  const hasReveal = /class="[^"]*reveal/i.test(raw) && /Reveal\.initialize/.test(raw);
  if (!hasReveal) {
    add("error", 1,
      "덱으로 보이는데 Reveal 골격이 아닙니다. PDF로 내보내면 한 장만 인쇄됩니다 (docs/DECK.md 2절)");
  }
});

// 자기완결 --------------------------------------------------------
rule("self-contained", "단일 HTML은 밖의 파일을 참조하지 않는다", isHtml, (raw, masked, add) => {
  const re = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const m of raw.matchAll(re)) {
    const url = m[1].trim();
    if (!url) continue;
    if (/^(#|data:|mailto:|tel:|javascript:)/i.test(url)) continue;
    if (/^https?:\/\//i.test(url)) {
      // 외부 링크는 본문 링크일 수 있으니, 자원으로 불리는 자리만 오류로 본다.
      const tag = raw.slice(Math.max(0, m.index - 200), m.index).match(/<\s*([a-zA-Z-]+)[^<>]*$/);
      const name = tag ? tag[1].toLowerCase() : "";
      if (name === "script" || name === "link" || name === "img" || name === "source") {
        add("error", lineOf(raw, m.index),
          `외부 자원 참조(<${name}>): ${url.slice(0, 60)}. 인라인하거나 zip으로 올립니다`);
      }
      continue;
    }
    add("error", lineOf(raw, m.index),
      `상대참조: ${url.slice(0, 60)}. 인라인하거나 루트에 index.html을 둔 zip으로 올립니다`);
  }
});

// 접기 ------------------------------------------------------------
rule("details-print", "접힌 내용은 인쇄에서 펼쳐져야 한다", isHtml, (raw, masked, add) => {
  if (!/<details/i.test(raw)) return;
  const hasHook = /beforeprint/.test(raw) || /matchMedia\(\s*["']print/.test(raw);
  if (!hasHook) {
    add("error", 1,
      "<details>가 있는데 beforeprint 처방이 없습니다. PDF에서 근거가 통째로 빠집니다 (docs/WEB-REPORT.md 밀도 관리)");
  }
});

rule("details-label", "접기 라벨은 내용 예고형으로 쓴다", isHtml, (raw, masked, add) => {
  for (const m of raw.matchAll(/<summary[^>]*>([\s\S]{0,80}?)<\/summary>/gi)) {
    const label = m[1].replace(/<[^>]+>/g, "").trim();
    if (/^(더\s*보기|자세히|자세히\s*보기|보기|열기|more)\.?$/i.test(label)) {
      add("warn", lineOf(raw, m.index),
        `접기 라벨 "${label}"은 열 이유를 만들지 못합니다. 무엇이 나올지 적습니다`);
    }
  }
});

// 뷰어 함정 -------------------------------------------------------
rule("anchor-base-guard", "문서 내 앵커는 뷰어의 base href를 견뎌야 한다", isHtml, (raw, masked, add) => {
  const hasInnerAnchor = /href\s*=\s*["']#[^"']+["']/.test(raw);
  if (!hasInnerAnchor) return;
  const guarded = /preventDefault\s*\(\s*\)/.test(raw) && /scrollIntoView/.test(raw);
  if (!guarded) {
    add("warn", 1,
      "문서 내 앵커가 있는데 클릭 가로채기가 없습니다. 뷰어가 <base href>를 주입하면 404로 나갑니다 (docs/HTML-DOCS.md 3절)");
  }
});

rule("fit-guard", "자동 화면맞춤을 피하는 transform은 translateZ가 아니다", isHtml, (raw, masked, add) => {
  if (/transform\s*:\s*translateZ\(\s*0\s*\)/i.test(raw)) {
    add("warn", 1,
      "translateZ(0)은 크롬이 단위행렬로 평탄화해 뷰어 판정을 통과하지 못합니다. perspective(1000px)를 씁니다");
  }
});

// 폰트 ------------------------------------------------------------
rule("font-abs-path", "웹폰트는 절대경로로 참조한다", isHtml, (raw, masked, add) => {
  for (const m of raw.matchAll(/@font-face[\s\S]{0,400}?\}/gi)) {
    const block = m[0];
    const src = block.match(/url\(\s*["']?([^"')]+)["']?\s*\)/i);
    if (!src) continue;
    const url = src[1].trim();
    if (/^data:/i.test(url)) continue;               // 임베드는 대상 아님
    if (/^https?:\/\//i.test(url)) continue;         // 절대 URL
    if (url.startsWith("/")) continue;               // 절대경로
    add("error", lineOf(raw, m.index + src.index),
      `@font-face 상대경로(${url.slice(0, 40)}). 뷰어의 base href 때문에 조용히 404로 폴백합니다 (docs/WEB-REPORT.md 폰트)`);
  }
});

// 한국어 조판 -----------------------------------------------------
rule("keep-all-minwidth", "keep-all을 걸면 값 칸에 min-width:0을 함께 준다", isHtml, (raw, masked, add) => {
  if (!/word-break\s*:\s*keep-all/i.test(raw)) return;
  const usesFlexGrid = /display\s*:\s*(flex|grid)/i.test(raw);
  if (usesFlexGrid && !/min-width\s*:\s*0/i.test(raw)) {
    add("warn", 1,
      "keep-all과 flex/grid를 함께 쓰는데 min-width:0이 없습니다. 좁은 화면에서 칸이 화면 밖으로 밀립니다 (docs/HTML-DOCS.md 5절)");
  }
});

// 색 --------------------------------------------------------------
rule("color-name-in-copy", "색 이름을 문구에 박지 않는다", isText, (raw, masked, add) => {
  const re = /(빨간|파란|초록|노란|주황|보라)\s*(막대|칸|점|배지|박스|글씨|표시)/g;
  for (const m of masked.matchAll(re)) {
    // 따옴표 안은 나쁜 예를 인용한 자리다.
    const around = masked.slice(Math.max(0, m.index - 2), m.index + m[0].length + 2);
    if (/^["'“‘].*["'”’]$/s.test(around.trim())) continue;
    if (masked.slice(Math.max(0, m.index - 40), m.index).includes('"')) continue;
    add("warn", lineOf(masked, m.index),
      `"${m[0]}". 키컬러가 다른 인스턴스에서 거짓말이 됩니다. "진한 막대"처럼 색에 의존하지 않는 표현을 씁니다`);
  }
});

// 남은 자리표시자 -------------------------------------------------
rule("placeholder", "플레이스홀더를 남기지 않는다", isText, (raw, masked, add) => {
  // 실제 표식만 잡는다. "빈 placeholder 박스"처럼 낱말을 언급한 산문은 대상이 아니다.
  const re = /(\bTODO\b|\bFIXME\b|\bTBD\b|\bXXX\b|여기에\s*(?:내용|입력|채우)|LOREM IPSUM|\{\{[^}]*\}\}|＿＿＿)/g;
  for (const m of masked.matchAll(re)) {
    add("error", lineOf(masked, m.index), `플레이스홀더 "${m[0]}"가 남아 있습니다`);
  }
});

// 파일명 ----------------------------------------------------------
rule("filename", "파일명은 스네이크케이스에 semver를 붙인다", isText, (raw, masked, add) => {
  const name = basename(currentFile).replace(/\.[^.]+$/, "");
  if (/(최종|final|진짜|찐|real|reveal|new|copy|사본)(\b|_|$)/i.test(name)) {
    add("warn", 1,
      `파일명에 즉흥 접미사("${name}")가 있습니다. 프로젝트_문서성격_YYMMDD_v0.0.0 으로 씁니다 (docs/CONVENTIONS.md 1절)`);
  }
});

// ── 실행 ─────────────────────────────────────────────────────────
let currentFile = "";

if (argv.includes("--list") || argv.length === 0) {
  console.log("문서 규약 검사기 — 기계가 판정할 수 있는 규칙만 검사합니다.\n");
  console.log("사용법: node tools/check-doc.mjs <파일 또는 폴더> [...]\n");
  console.log("규칙:");
  for (const r of RULES) console.log(`  ${r.id.padEnd(22)} ${r.what}`);
  console.log("\n검사하지 않는 것: 독자 레지스터, 서사 아크, 미감, 사실 정확성.");
  console.log("이 도구가 통과했다는 것은 규약을 지켰다는 뜻이 아니라 기계가 잡는 하자가 없다는 뜻입니다.");
  process.exit(0);
}

const targets = [];
for (const a of argv) {
  try { collect(a, targets); }
  catch { console.error(`읽을 수 없습니다: ${a}`); process.exit(1); }
}

if (!targets.length) {
  console.error("검사할 파일이 없습니다(.html .md .mjs .js 만 봅니다).");
  process.exit(1);
}

let errors = 0, warns = 0, filesWithFindings = 0;

for (const file of targets) {
  currentFile = file;
  const raw = readFileSync(file, "utf8");
  const { text: masked, removed } = maskQuoted(raw);

  const findings = [];
  const add = (level, line, message) => findings.push({ level, line, message });

  for (const r of RULES) {
    if (!r.applies(file)) continue;
    try { r.run(raw, masked, add); }
    catch (e) { add("warn", 1, `규칙 ${r.id} 실행 실패: ${e.message}`); }
  }

  if (!findings.length) continue;
  filesWithFindings++;

  findings.sort((a, b) => a.line - b.line);
  console.log(`\n${file}`);
  const excluded = Object.entries(removed).filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`).join(", ");
  if (excluded) console.log(`  (표기 검사 제외 구역: ${excluded})`);
  for (const f of findings) {
    const tag = f.level === "error" ? "오류" : "주의";
    console.log(`  ${tag}  ${String(f.line).padStart(5)}  ${f.message}`);
    if (f.level === "error") errors++; else warns++;
  }
}

console.log(`\n검사한 파일 ${targets.length}개 / 지적 있는 파일 ${filesWithFindings}개`);
console.log(`오류 ${errors}건, 주의 ${warns}건`);
if (!errors && !warns) console.log("기계가 잡는 하자는 없습니다. 사람 눈이 볼 것은 각 규약의 체크리스트로 봅니다.");
process.exit(errors ? 1 : 0);
