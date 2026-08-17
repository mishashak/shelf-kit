#!/usr/bin/env node
/**
 * 꽂이(shelf) 업로드 CLI — 개인 API 토큰으로 /api/upload를 호출한다(의존성 없음, Node 18+).
 *
 *   node upload.mjs --schema [--space <slug>]      ← 올리기 전에 규격·어휘를 받아 본다
 *   node upload.mjs <파일.html|.zip|.md|.pdf> --title "제목" [옵션]
 *
 *     --space <slug>       선반. 고를 수 있는 값은 --schema 로 확인한다.
 *     --lang <code>        언어(기본 ko). 값은 --schema 로 확인한다.
 *     --tags "a,b"         분류 태그. 있는 어휘를 먼저 쓴다(--schema 의 vocabulary.tags).
 *     --tag-custom "c"     어휘에 없는 태그를 새로 만들 때만.
 *     --visibility <v>     열람 범위. 안 주면 서버가 가장 좁게 잠근다(올린 사람과 관리자만).
 *     --viewers "a@x,b@y"  이 문서를 볼 사람. 좁은 범위로 올릴 때 실제로 열람을 정하는 값.
 *     --org <조직>         작성 부서·실
 *     --date <YYYY-MM-DD>  문서 일자(회의일·보고 주차)
 *     --people "이름,이름" 참석자/수신처
 *     --version <v>        기본 v0.1.0
 *     --slug <slug>        영문 소문자+숫자+하이픈 권장(비우면 제목에서 생성)
 *     --no-ai              AI 업로드 표기(🤖) 끄기
 *     --force              올리기 전 검사에서 경고가 나도 그대로 진행
 *     --new                같은 문서로 보여도 새 문서로 만든다(기본은 그 문서의 새 버전으로 교체)
 *
 * 필드 목록과 고를 수 있는 값을 이 파일에 박아 두지 않는다. 서버(/api/upload/schema)가 정본이고
 * 여기서는 올리기 직전에 그걸 받아 값이 맞는지만 본다. 그래서 선반이나 태그가 늘어도 손댈 데가 없다.
 *
 * 접속 정보(둘 중 하나):
 *   1) 환경변수 SHELF_URL, SHELF_TOKEN
 *   2) 사용자 홈의 .shelf-upload.json  { "url": "https://…", "token": "shelf_…" }
 *      계정 화면에서 내려받은 자격증명 JSON은 주소 키가 baseUrl이라 그 이름도 함께 받는다
 *      — 받은 파일을 이름만 바꿔 두면 되게 하는 것이 요점이다(키를 손으로 고치게 하면 그 단계에서 막힌다).
 */
import { readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const input = argv[0];
const opt = (n, d = "") => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes("--" + n);

const schemaOnly = flag("schema");
const title = opt("title");

// 접속 정보: 환경변수 우선, 없으면 홈의 .shelf-upload.json.
let url = process.env.SHELF_URL || "";
let token = process.env.SHELF_TOKEN || "";
const confPath = join(homedir(), ".shelf-upload.json");
if ((!url || !token) && existsSync(confPath)) {
  try {
    const conf = JSON.parse(readFileSync(confPath, "utf8"));
    url = url || conf.url || conf.baseUrl || "";
    token = token || conf.token || "";
  } catch {
    console.error("설정 파일을 읽지 못했습니다(JSON 오류): " + confPath);
    process.exit(1);
  }
}
if (!url || !token) {
  console.error("접속 정보가 없습니다. 환경변수 SHELF_URL, SHELF_TOKEN을 넣거나 " + confPath + ' 에 { "url": "...", "token": "shelf_..." } 를 만들어 주세요.');
  process.exit(1);
}
url = url.replace(/\/+$/, "");

/**
 * 보내는 자리 전용 fetch. 연결 자체가 안 되면(주소 오타, 사내망 밖, 서버 정지)
 * 날 예외가 스택 트레이스로 튀어나오는데, 처음 설치한 사람이 가장 자주 밟는 자리라
 * 무엇을 고쳐야 하는지 한 줄로 알려주고 끝낸다.
 */
async function send(target, init) {
  try {
    return await fetch(target, init);
  } catch (e) {
    console.error("꽂이에 연결하지 못했습니다: " + url);
    console.error("  " + (e?.message ?? e));
    console.error("  주소가 맞는지(뒤에 / 없이), 사내망에 있는지 확인해 주세요.");
    process.exit(1);
  }
}

/** 서버가 내주는 업로드 규격. */
async function fetchSchema(space) {
  const q = space ? "?space=" + encodeURIComponent(space) : "";
  const res = await fetch(url + "/api/upload/schema" + q, {
    headers: { Authorization: "Bearer " + token, Origin: url },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return await res.json();
}

// --schema: 규격만 받아 그대로 보여 준다. 무엇을 어떤 보기 중에 채울지 이걸 읽고 정한다.
if (schemaOnly) {
  try {
    console.log(JSON.stringify(await fetchSchema(opt("space")), null, 2));
  } catch (e) {
    console.error("규격을 받지 못했습니다: " + e.message);
    process.exit(1);
  }
  process.exit(0);
}

if (!input || input.startsWith("--") || !title) {
  console.error('사용법: node upload.mjs <파일.html|.zip|.md|.pdf> --title "제목" [--space deck] [--lang ko] [--tags "a,b"] [--visibility listed] [--org 조직] [--date YYYY-MM-DD] [--people "이름,이름"] [--version v0.1.0] [--slug english-slug] [--no-ai] [--new]');
  console.error("고를 수 있는 값(선반·태그·언어·열람범위)은: node upload.mjs --schema");
  process.exit(1);
}
if (!/\.(html?|zip|md|pdf)$/i.test(input)) {
  console.error("지원 형식은 .html / .zip(루트에 index.html) / .md / .pdf 입니다. 폴더는 zip으로 묶어 주세요.");
  process.exit(1);
}
if (!existsSync(input)) {
  console.error("파일이 없습니다: " + input);
  process.exit(1);
}

const wantSpace = opt("space", "deck");
const wantLang = opt("lang", "ko");
const tagList = opt("tags").split(",").map((s) => s.trim()).filter(Boolean);
const customTags = opt("tag-custom").split(",").map((s) => s.trim()).filter(Boolean);
const viewerList = opt("viewers").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// 올리기 전 검사. 서버 규격과 대조해 고칠 수 있을 때 알려 준다.
// 값이 틀린 것(모르는 선반·언어)은 멈추고, 빠진 것(태그·날짜)은 경고한다. 급하면 --force로 넘긴다.
let schema = null;
try {
  schema = await fetchSchema(wantSpace);
} catch (e) {
  console.warn("규격을 받지 못해 사전 검사를 건너뜁니다(" + e.message + "). 업로드는 그대로 진행합니다.");
}

if (schema) {
  const stop = [];
  const warn = [];
  const spaces = schema.vocabulary?.spaces ?? [];
  const space = spaces.find((s) => s.slug === wantSpace);
  if (!space) {
    stop.push(`모르는 선반입니다: ${wantSpace}\n  고를 수 있는 값: ${spaces.map((s) => `${s.slug}(${s.what})`).join(", ")}`);
  }
  const langs = schema.vocabulary?.langs ?? [];
  if (langs.length && !langs.some((l) => l.code === wantLang)) {
    stop.push(`모르는 언어입니다: ${wantLang}\n  고를 수 있는 값: ${langs.map((l) => `${l.code}(${l.label})`).join(", ")}`);
  }
  const visField = (schema.fields ?? []).find((f) => f.name === "visibility");
  const wantVis = opt("visibility");
  if (wantVis && Array.isArray(visField?.allowed) && !visField.allowed.some((v) => v.value === wantVis)) {
    stop.push(`모르는 열람 범위입니다: ${wantVis}\n  고를 수 있는 값: ${visField.allowed.map((v) => `${v.value}(${v.label})`).join(", ")}`);
  }

  // 태그: 어휘에 없는 것을 --tags로 보내면 조용히 새 태그가 생긴다. 그건 --tag-custom의 일이다.
  const vocab = new Set();
  for (const list of Object.values(schema.vocabulary?.tags ?? {})) for (const t of list) vocab.add(t.name);
  const unknown = tagList.filter((t) => !vocab.has(t));
  if (unknown.length) {
    warn.push(`어휘에 없는 태그입니다: ${unknown.join(", ")}\n  있는 것을 쓰거나, 정말 새로 만들 것이면 --tag-custom 으로 옮기십시오.`);
  }
  if (!tagList.length && !customTags.length) {
    const hint = Object.entries(schema.vocabulary?.tags ?? {})
      .map(([scope, list]) => `${scope}: ${list.slice(0, 8).map((t) => t.name).join(", ")}`)
      .join("\n    ");
    warn.push(`태그가 비었습니다. 나중에 이 문서를 찾기 어려워집니다.\n    ${hint}`);
  }
  if (space?.wantsDate && !opt("date")) warn.push(`${space.name}에서는 문서 일자가 중요합니다. --date YYYY-MM-DD 를 주십시오.`);
  if (space?.wantsPeople && !opt("people")) warn.push(`${space.name}에서는 ${space.peopleLabel}가 검색 키입니다. --people 을 주십시오.`);
  if (!opt("slug") && /[^\x00-\x7F]/.test(title)) {
    warn.push("제목이 한글인데 --slug 가 없습니다. 한글 슬러그가 만들어져 저장소 도구에서 깨집니다. 영문 슬러그를 주십시오.");
  }
  // 열람: 모르는 이메일은 서버가 버리니 여기서 먼저 잡는다. 아무도 못 보는 상태로 올라가는 것도 경고한다.
  const roster = new Map((schema.vocabulary?.people ?? []).map((p) => [p.email.toLowerCase(), p]));
  const strangers = roster.size ? viewerList.filter((e) => !roster.has(e)) : [];
  if (strangers.length) {
    stop.push(`등록되지 않은 계정입니다: ${strangers.join(", ")}\n  vocabulary.people 에 있는 이메일만 지정할 수 있습니다(node upload.mjs --schema 로 확인).`);
  }
  if (wantVis !== "internal" && !viewerList.length) {
    warn.push("이대로 올리면 올린 사람과 관리자만 봅니다. 팀이 봐야 하는 문서면 --viewers 로 볼 사람을 지정하거나 --visibility internal 로 넓히십시오.");
  }
  const externals = viewerList.map((e) => roster.get(e)).filter((p) => p?.isExternal);
  if (externals.length) {
    warn.push(`외부(협력사) 계정이 열람자에 들어 있습니다: ${externals.map((p) => `${p.name}(${p.email})`).join(", ")}`);
  }

  if (stop.length) {
    console.error("올릴 수 없습니다:\n- " + stop.join("\n- "));
    process.exit(1);
  }
  if (warn.length) {
    console.warn("확인이 필요합니다:\n- " + warn.join("\n- "));
    if (!flag("force")) {
      console.error("\n그대로 올리려면 --force 를 붙이십시오. 값을 채워 다시 실행하는 쪽을 권합니다.");
      process.exit(1);
    }
  }
}

const fd = new FormData();
fd.set("title", title);
fd.set("space", wantSpace);
fd.append("lang", wantLang);
const bytes = readFileSync(input);
fd.append("file", new Blob([bytes]), basename(input));
for (const t of tagList) fd.append("tags", t);
if (customTags.length) fd.set("tagCustom", customTags.join(","));
for (const v of viewerList) fd.append("viewer", v);
if (opt("visibility")) fd.set("visibility", opt("visibility"));
if (opt("org")) fd.set("org", opt("org"));
if (opt("date")) fd.set("docDate", opt("date"));
if (opt("people")) fd.set("people", opt("people"));
if (opt("version")) fd.set("version", opt("version"));
if (opt("slug")) fd.set("slug", opt("slug"));
if (!flag("no-ai")) fd.set("viaAi", "1");

const res = await send(url + "/api/upload", {
  method: "POST",
  // Origin은 Astro의 CSRF 방어(checkOrigin) 통과용 — 없으면 폼 POST가 403으로 막힌다.
  headers: { Authorization: "Bearer " + token, Origin: url },
  body: fd,
});

let text = await res.text();
let res2 = res;

// 409 = 같은 문서가 이미 있다. 새로 만들지 말고 **그 문서에 얹는다**(버전은 서버가 올린다).
// 새 판을 새 문서로 올리면 요약·열람자·조회 기록이 옛 문서에 남고 새 문서는 빈 채로 출발한다.
// 정말 별개 문서면 --new 로 강제한다.
if (res.status === 409) {
  let dup = null;
  try { dup = JSON.parse(text); } catch {}
  const top = dup?.candidates?.[0];
  if (!top) { console.error(text); process.exit(1); }

  if (flag("new")) {
    fd.set("allowDuplicate", "1");
    console.warn(`같은 문서로 보이는 것이 있지만 --new 라서 새로 만듭니다: "${top.title}"`);
    res2 = await send(url + "/api/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, Origin: url },
      body: fd,
    });
    text = await res2.text();
  } else {
    console.log(`같은 문서가 이미 있습니다: "${top.title}" (${top.version ?? "버전 미상"})`);
    console.log(`→ 새로 만들지 않고 그 문서의 새 버전으로 올립니다: ${url}/d/${top.slug}`);
    const put = new FormData();
    put.set("title", fd.get("title"));
    // 교체는 문서 한 벌의 메타를 다시 받는다 — 안 보내면 지워지므로 보낸 것만 그대로 넘긴다.
    for (const k of ["docDate", "org", "people", "summary"]) if (fd.get(k)) put.set(k, fd.get(k));
    for (const t of fd.getAll("tags")) put.append("tags", t);
    if (fd.get("tagCustom")) put.set("tagCustom", fd.get("tagCustom"));
    const one = fd.getAll("file")[0];
    if (!one) { console.error("교체할 파일이 없습니다."); process.exit(1); }
    put.append("file", one, one.name);
    put.set("lang", (fd.getAll("lang")[0] ?? "ko"));
    res2 = await send(url + "/api/doc/" + encodeURIComponent(top.slug), {
      method: "PUT",
      headers: { Authorization: "Bearer " + token, Origin: url },
      body: put,
    });
    text = await res2.text();
    if (!res2.ok) { console.error(`교체 실패 (HTTP ${res2.status})`); console.error(text); process.exit(1); }
    const done = JSON.parse(text);
    console.log(`교체 완료: ${url}/d/${done.slug}` + (done.version ? `  (${done.version})` : ""));
    if (done.warning) console.warn("주의: " + done.warning);
    process.exit(0);
  }
}

if (!res2.ok) {
  console.error(`업로드 실패 (HTTP ${res2.status})`);
  console.error(text);
  process.exit(1);
}
const data = JSON.parse(text);
console.log("업로드 완료: " + url + "/d/" + data.slug + (data.version ? "  (" + data.version + ")" : ""));
if (data.warning) console.warn("주의: " + data.warning);
// 서버가 판정한 실제 열람 범위를 그대로 보여 준다(내가 보낸 값이 아니라 반영된 결과).
if (data.whoCanSee) console.log("볼 수 있는 사람: " + data.whoCanSee);
if (data.viewersDropped?.length) {
  console.warn("등록되지 않아 무시된 열람자: " + data.viewersDropped.join(", "));
}
