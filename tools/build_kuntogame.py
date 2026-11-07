#!/usr/bin/env python3
"""KuntoGame/ 엔진 전체를 kuntogame.js 하나로 묶는다. 순서는 KuntoGame/init.js의 ENGINE_FILES를 따른다.
엔진 코드를 고친 뒤 `python3 tools/build_kuntogame.py`를 다시 실행한다."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
base = root / "KuntoGame"
files = re.findall(r"'([^']+\.js)'", re.search(r"ENGINE_FILES = \[(.*?)\];", (base / "init.js").read_text(encoding="utf-8"), re.S).group(1))
order = ["core/Load.js", "config.js"] + files
out = ["// KuntoGame 묶음 파일 (자동 생성: tools/build_kuntogame.py). 직접 고치지 말고 KuntoGame/ 원본을 고친 뒤 다시 빌드한다.\n"]
for f in order:
    out.append(f"\n/* ---- {f} ---- */\n" + (base / f).read_text(encoding="utf-8") + "\n")
(root / "kuntogame.js").write_text("".join(out), encoding="utf-8")
print(f"kuntogame.js: {len(order)}개 파일, {(root / 'kuntogame.js').stat().st_size // 1024}KB")
