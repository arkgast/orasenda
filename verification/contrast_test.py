"""Self test for contrast.py. Run: python3 -m unittest discover -s verification -p "contrast_test.py"."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "contrast.py"
sys.path.insert(0, str(HERE))

WALLPAPERS = ["#EDEDED", "#808080", "#1C1C1E"]

TOKENS = {
    "color": {
        "tokens": [
            {"name": "white", "value": {"light": "#ffffff", "dark": "#ffffff"}},
            {"name": "black", "value": {"light": "#000000", "dark": "#000000"}},
            {"name": "grey-777", "value": {"light": "#777777", "dark": "#777777"}},
            {"name": "grey-949494", "value": {"light": "#949494", "dark": "#949494"}},
            {"name": "ink", "value": {"light": "#111111", "dark": "#eeeeee"}},
            {"name": "ink-alias", "value": {"light": "{ink}", "dark": "{ink}"}},
            {"name": "scrim", "value": {"light": "rgba(0, 0, 0, 0.5)", "dark": "rgba(0, 0, 0, 0.5)"}},
        ]
    }
}


def run(pairs, tokens=TOKENS):
    with tempfile.TemporaryDirectory() as d:
        t = Path(d) / "tokens.json"
        p = Path(d) / "pairs.json"
        t.write_text(json.dumps(tokens))
        p.write_text(json.dumps(pairs))
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--tokens", str(t), "--pairs", str(p)],
            capture_output=True,
            text=True,
        )


def pair(fg, bg, kind="text"):
    return {"fg": fg, "bg": bg, "kind": kind, "where": "test"}


def floater(fill, edge, kind="mark"):
    return {
        "fill": fill,
        "edge": edge,
        "wallpaper": WALLPAPERS,
        "kind": kind,
        "where": "test",
        "rule": "fill-or-edge",
    }


class ContrastTest(unittest.TestCase):
    def test_text_pair_at_4_5_passes(self):
        import contrast

        self.assertTrue(contrast.meets(4.5, "text"))
        self.assertFalse(contrast.meets(4.4999, "text"))
        # black on white is 21:1, well above the line
        self.assertEqual(run([pair("black", "white")]).returncode, 0)

    def test_seeded_text_pair_under_4_5_fails(self):
        # #777777 on white is about 4.48:1
        result = run([pair("grey-777", "white")])
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

    def test_mark_pair_uses_3_to_1(self):
        # #949494 on white is about 3.03:1
        self.assertEqual(run([pair("grey-949494", "white", "mark")]).returncode, 0)
        self.assertEqual(run([pair("grey-949494", "white", "text")]).returncode, 1)

    def test_floater_fails_when_fill_and_edge_both_under_3(self):
        # white fill and edge on the light wallpaper are both near 1.2:1
        result = run([floater("white", "white")])
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)

    def test_floater_passes_when_edge_holds_on_every_wallpaper(self):
        # White fill fails on #EDEDED (1.17) but holds on the other two; the black edge
        # holds there (17.9), so every wallpaper has one of the two at 3:1 or more.
        tokens = {
            "color": {
                "tokens": [
                    {"name": "fill", "value": {"light": "#ffffff", "dark": "#ffffff"}},
                    {"name": "edge", "value": {"light": "#000000", "dark": "#000000"}},
                ]
            }
        }
        result = run([floater("fill", "edge")], tokens)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_token_reference_resolves(self):
        import contrast

        light, dark = contrast.resolve(TOKENS, "ink-alias")
        self.assertEqual(light, "#111111")
        self.assertEqual(dark, "#eeeeee")
        real = json.loads((HERE.parent / "packages" / "tokens" / "tokens.json").read_text())
        self.assertEqual(contrast.resolve(real, "focus-ring"), contrast.resolve(real, "focus"))
        self.assertEqual(contrast.resolve(real, "selection"), contrast.resolve(real, "focus-soft"))

    def test_unknown_token_exits_2(self):
        self.assertEqual(run([pair("nope", "white")]).returncode, 2)
        self.assertEqual(run([{"fg": "black"}]).returncode, 2)
        self.assertEqual(run([pair("scrim", "white")]).returncode, 2)
        self.assertEqual(run([pair("black", "white", "icon")]).returncode, 2)


if __name__ == "__main__":
    unittest.main()
