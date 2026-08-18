# 꽂이 업로드 스킬: 설치 가이드 (팀원용)

Claude Code에서 "이 덱 꽂이에 올려줘"라고 말하면 업로드까지 되게 하는 스킬입니다.
설치는 3단계, 5분이면 끝납니다. Node.js 18 이상만 있으면 됩니다(Claude Code가 깔려 있으면 이미 있습니다).

## 1. API 토큰 발급

1. 꽂이에 로그인 → 우측 상단 **계정 설정**(/account)
2. **API 토큰** 섹션에서 용도 메모(예: "내 노트북 Claude")를 적고 **발급**
3. 토큰이 나온 그 자리에서 **둘 다 받기**를 누릅니다. 자격증명과 업로드 규약 두 파일이 내려옵니다.
   토큰 문자열은 **이 화면을 벗어나면 다시 볼 수 없습니다.** 놓쳤으면 지우고 새로 발급하면 됩니다.

## 2. 접속 정보 저장

내려받은 `shelf-credential-<날짜>.json`을 내 홈 폴더(`C:\Users\<이름>\`)로 옮기고
이름을 `.shelf-upload.json`으로 바꿉니다(맨 앞에 점). 내용은 손대지 않아도 됩니다.

손으로 만들어도 됩니다.

```json
{
  "url": "<꽂이 주소>",
  "token": "shelf_여기에_복사한_토큰"
}
```

`<꽂이 주소>`는 브라우저로 꽂이에 들어갈 때 주소 그대로입니다(뒤에 / 없이).

같이 내려온 `shelf-upload-contract-<날짜>.json`은 저장할 필요가 없습니다. 스킬이 올릴 때마다
서버에서 최신 규격을 직접 받아옵니다. 사람이 미리 읽어보고 싶을 때만 여는 파일입니다.

## 3. 스킬 설치

**클론해서 복사하십시오.** 파일만 받아 두면 나중에 고쳐진 것을 받을 길이 없습니다.
클론해 두면 갱신이 두 줄입니다(4절).

**Windows (PowerShell)**

```powershell
git clone https://github.com/mishashak/shelf-kit.git $HOME\shelf-kit
Copy-Item $HOME\shelf-kit\skills\shelf-upload $HOME\.claude\skills\ -Recurse -Force
```

**macOS / Linux**

```bash
git clone https://github.com/mishashak/shelf-kit.git ~/shelf-kit
mkdir -p ~/.claude/skills && cp -R ~/shelf-kit/skills/shelf-upload ~/.claude/skills/
```

이렇게 놓이면 됩니다.

```
~/.claude/skills/shelf-upload/
  ├─ SKILL.md          ← Claude가 읽는 절차
  ├─ README.md         ← 이 안내문(같이 따라옵니다)
  └─ scripts/upload.mjs
```

끝입니다. Claude Code를 새로 열고 이렇게 말해 보세요.

> 이 폴더의 발표자료 꽂이 덱꽂이에 올려줘. 제목은 "OO 소개덱"으로.

## 4. 갱신: 고쳐진 것을 받아오기

스킬은 **내 홈 폴더로 복사된 사본**이라, 원본이 고쳐져도 내 것은 그대로입니다.
그래서 갱신은 손으로 한 번 당겨 옵니다.

**Windows (PowerShell)**

```powershell
cd $HOME\shelf-kit; git pull; Copy-Item $HOME\shelf-kit\skills\shelf-upload $HOME\.claude\skills\ -Recurse -Force
```

**macOS / Linux**

```bash
cd ~/shelf-kit && git pull && cp -R skills/shelf-upload ~/.claude/skills/
```

무엇이 바뀌었는지 보려면 `cd ~/shelf-kit && git log --oneline -5`.

세 가지는 갱신하지 않아도 늘 최신입니다.

| 무엇 | 왜 |
|---|---|
| 선반, 태그, 언어, 열람범위 목록 | 스킬이 올릴 때마다 서버에서 규격을 받아옵니다 |
| 사용법과 규약 문서 | 저장소 링크로 읽으면 그 자리가 최신입니다 |
| 계정 권한과 토큰 | 서버가 판정합니다 |

> 심볼릭 링크나 정션으로 걸어 두면 `git pull`만으로 끝나지만, Claude Code가 링크된 스킬 폴더를
> 따라가는지는 환경에 따라 다를 수 있습니다. 확실한 쪽은 위의 복사 갱신입니다.

## 문제가 생기면

- **"접속 정보가 없습니다"** → `.shelf-upload.json` 위치와 철자 확인(홈 폴더 바로 아래, 맨 앞에 점).
- **HTTP 401** → 토큰이 틀렸거나 삭제됨. 계정 설정에서 새로 발급.
- **HTTP 403** → 계정이 아직 승인 대기이거나 잠긴 상태. 활성 계정이면 등급과 무관하게 올릴 수 있으니, 관리자에게 계정 상태를 확인하세요.
- **"상대참조" 거부** → HTML 안에서 이미지와 CSS를 파일로 참조하고 있음. 통째로 zip으로 묶어 올리면 됩니다(zip 루트에 index.html).
- **pdf를 올리는데 "지원 형식은 .html / .zip / .md"라고 나옴** → 옛 판을 쓰고 있습니다. 4절로 갱신하세요.
- **주소를 맞게 넣었는데 Node 오류가 길게 쏟아짐** → 옛 판입니다. 지금 판은 무엇을 고쳐야 하는지 한 줄로 알려줍니다.

토큰은 비밀번호와 같습니다. 채팅방과 문서에 붙여넣지 말고, 유출이 의심되면 계정 설정에서 삭제하세요.
