"""Checks the declared colour pairs against design/system/tokens.json in both themes.

Standard library only. Usage: python3 verification/contrast.py [--tokens <path>] [--pairs <path>]
Exit 0 when every pair holds, 1 when a pair fails, 2 on bad input (unknown token, bad entry).
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES = ("light", "dark")
THRESHOLD = {"text": 4.5, "mark": 3.0}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class BadInput(Exception):
    pass


def luminance(hex_color):
    channels = []
    for i in (1, 3, 5):
        c = int(hex_color[i : i + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def meets(value, kind):
    # Compare the exact ratio; rounding is for display only.
    return value >= THRESHOLD[kind]


def _index(tokens):
    found = {}
    for tok in tokens.get("color", {}).get("tokens", []):
        found[tok["name"]] = tok["value"]
    return found


def _follow(index, name, theme, seen=()):
    if name in seen:
        raise BadInput(f'token "{name}" refers to itself')
    if name not in index:
        raise BadInput(f'unknown token "{name}"')
    value = index[name]
    value = value[theme] if isinstance(value, dict) else value
    m = re.fullmatch(r"\{([^{}]+)\}", str(value))
    if m:
        return _follow(index, m.group(1), theme, seen + (name,))
    if not HEX.match(str(value)):
        raise BadInput(f'token "{name}" is "{value}", not a #rrggbb colour')
    return str(value).lower()


def resolve(tokens, name):
    """Returns (light, dark) hex values for a colour token, following {ref} values."""
    index = _index(tokens)
    return tuple(_follow(index, name, theme) for theme in THEMES)


def _hex(value, where):
    if not isinstance(value, str) or not HEX.match(value):
        raise BadInput(f"{where}: wallpaper {value!r} is not #rrggbb")
    return value.lower()


def _need(entry, keys, n):
    if not isinstance(entry, dict):
        raise BadInput(f"entry {n} is not an object")
    for key in keys:
        if not isinstance(entry.get(key), str) or not entry[key]:
            raise BadInput(f'entry {n} has no string "{key}"')
    if entry.get("kind") not in THRESHOLD:
        raise BadInput(f'entry {n} kind must be "text" or "mark"')


def check(tokens, pairs):
    """Returns (lines, failed). Raises BadInput."""
    lines, failed = [], False
    for n, entry in enumerate(pairs):
        if isinstance(entry, dict) and "fill" in entry:
            _need(entry, ["fill", "edge", "where"], n)
            if entry.get("rule") != "fill-or-edge":
                raise BadInput(f'entry {n}: floater rule must be "fill-or-edge"')
            walls = entry.get("wallpaper")
            if not isinstance(walls, list) or not walls:
                raise BadInput(f'entry {n} has no "wallpaper" list')
            fill, edge = resolve(tokens, entry["fill"]), resolve(tokens, entry["edge"])
            for wall in walls:
                w = _hex(wall, f"entry {n}")
                for i, theme in enumerate(THEMES):
                    rf, re_ = ratio(fill[i], w), ratio(edge[i], w)
                    ok = meets(rf, entry["kind"]) or meets(re_, entry["kind"])
                    failed |= not ok
                    lines.append(
                        f"{'ok  ' if ok else 'FAIL'} {entry['where']} on {wall} ({theme}): "
                        f"fill {rf:.2f} / edge {re_:.2f} (one needs {THRESHOLD[entry['kind']]}:1)"
                    )
        else:
            _need(entry, ["fg", "bg", "where"], n)
            fg, bg = resolve(tokens, entry["fg"]), resolve(tokens, entry["bg"])
            need = THRESHOLD[entry["kind"]]
            vals = [ratio(fg[i], bg[i]) for i in range(2)]
            ok = all(meets(v, entry["kind"]) for v in vals)
            failed |= not ok
            lines.append(
                f"{'ok  ' if ok else 'FAIL'} {entry['fg']} on {entry['bg']} "
                f"[{entry['kind']} {need}:1] light {vals[0]:.2f}, dark {vals[1]:.2f}: {entry['where']}"
            )
    return lines, failed


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--tokens", default=str(ROOT / "design" / "system" / "tokens.json"))
    parser.add_argument("--pairs", default=str(ROOT / "verification" / "contrast-pairs.json"))
    args = parser.parse_args(argv)
    try:
        tokens = json.loads(Path(args.tokens).read_text(encoding="utf8"))
        pairs = json.loads(Path(args.pairs).read_text(encoding="utf8"))
        if not isinstance(pairs, list):
            raise BadInput("the pairs file must hold a list")
        lines, failed = check(tokens, pairs)
    except (BadInput, OSError, ValueError, KeyError, TypeError) as e:
        print(f"contrast: bad input: {e}", file=sys.stderr)
        return 2
    print("\n".join(lines))
    if failed:
        print("contrast: at least one pair is under its threshold", file=sys.stderr)
        return 1
    print(f"contrast: {len(lines)} checks hold")
    return 0


if __name__ == "__main__":
    sys.exit(main())
