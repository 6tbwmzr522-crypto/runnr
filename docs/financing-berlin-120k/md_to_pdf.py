#!/usr/bin/env python3
"""Convert markdown files to PDF (Excel excluded)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

from fpdf import FPDF

FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
ROOT = Path(__file__).resolve().parent
PDF_DIR = ROOT / "pdf"


class MarkdownPDF(FPDF):
    def __init__(self, title: str = ""):
        super().__init__()
        self.doc_title = title
        self.add_font("Body", "", FONT)
        self.add_font("Body", "B", FONT)
        self.add_font("Body", "I", FONT)
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(18, 18, 18)

    def header(self):
        if self.page_no() > 1 and self.doc_title:
            self.set_font("Body", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 8, self.doc_title, align="R", new_x="LMARGIN", new_y="NEXT")
            self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-12)
        self.set_font("Body", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Seite {self.page_no()}", align="C")


def strip_md_inline(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.strip()


def parse_table_row(line: str) -> list[str]:
    parts = [p.strip() for p in line.strip().strip("|").split("|")]
    return [strip_md_inline(p) for p in parts]


def is_table_sep(line: str) -> bool:
    return bool(re.match(r"^\|?[\s\-:|]+\|?$", line.strip()))


def render_table(pdf: MarkdownPDF, rows: list[list[str]]):
    if not rows:
        return
    cols = max(len(r) for r in rows)
    rows = [r + [""] * (cols - len(r)) for r in rows]
    width = pdf.w - pdf.l_margin - pdf.r_margin
    col_w = width / cols
    pdf.set_x(pdf.l_margin)
    for i, row in enumerate(rows):
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Body", "B" if i == 0 else "", 9)
        line_h = 5
        heights = []
        for cell in row:
            heights.append(pdf.get_string_width(cell or " ") / col_w * line_h + line_h)
        row_h = max(heights + [line_h])
        for j, cell in enumerate(row):
            x = pdf.l_margin + j * col_w
            pdf.rect(x, pdf.get_y(), col_w, row_h)
            pdf.set_xy(x + 1, pdf.get_y() + 1)
            pdf.multi_cell(col_w - 2, line_h, cell or " ", align="L")
        pdf.set_xy(pdf.l_margin, pdf.get_y() + row_h - (pdf.get_y() % row_h if False else 0))
        # advance to next row
        y = pdf.get_y()
        pdf.set_xy(pdf.l_margin, y if y > pdf.get_y() else pdf.get_y())
    pdf.ln(4)
    pdf.set_x(pdf.l_margin)


def write_para(pdf: MarkdownPDF, text: str, size: int = 10, style: str = ""):
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Body", style, size)
    pdf.multi_cell(0, 5, text)


def md_to_pdf(md_path: Path, out_path: Path):
    text = md_path.read_text(encoding="utf-8")
    title = md_path.stem.replace("_", " ")
    pdf = MarkdownPDF(title=title)
    pdf.add_page()

    table_buf: list[list[str]] = []
    in_code = False

    def flush_table():
        nonlocal table_buf
        if table_buf:
            render_table(pdf, table_buf)
            table_buf = []

    for raw in text.splitlines():
        line = raw.rstrip()

        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            write_para(pdf, line, size=8)
            continue

        if line.strip().startswith("|") and "|" in line.strip()[1:]:
            if is_table_sep(line):
                continue
            table_buf.append(parse_table_row(line))
            continue

        flush_table()

        if not line.strip():
            pdf.ln(3)
            continue

        if line.startswith("# "):
            pdf.ln(2)
            write_para(pdf, strip_md_inline(line[2:]), size=16, style="B")
            pdf.ln(2)
        elif line.startswith("## "):
            pdf.ln(2)
            write_para(pdf, strip_md_inline(line[3:]), size=13, style="B")
            pdf.ln(1)
        elif line.startswith("### "):
            pdf.ln(1)
            write_para(pdf, strip_md_inline(line[4:]), size=11, style="B")
        elif line.strip() == "---":
            pdf.ln(2)
            y = pdf.get_y()
            pdf.set_draw_color(180, 180, 180)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(4)
        elif re.match(r"^[-*] ", line):
            write_para(pdf, "• " + strip_md_inline(line[2:]))
        elif re.match(r"^\d+\. ", line):
            write_para(pdf, strip_md_inline(line))
        elif line.startswith("> "):
            pdf.set_x(pdf.l_margin + 4)
            write_para(pdf, strip_md_inline(line[2:]), style="I")
        else:
            write_para(pdf, strip_md_inline(line))

    flush_table()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))
    print(f"OK  {out_path.name}  ({out_path.stat().st_size // 1024} KB)")


def main():
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    sources: list[Path] = list(sorted(ROOT.glob("*.md")))

    extra = Path(__file__).resolve().parents[1] / "glacifraga-institutional-metrics-addendum.md"
    if extra.exists():
        sources.append(extra)

    if not sources:
        print("No markdown files found.")
        sys.exit(1)

    for md in sources:
        md_to_pdf(md, PDF_DIR / (md.stem + ".pdf"))

    imports = [
        (Path.home() / "Downloads/CV18.06JANIS_BERZINS_2026.pdf", "CV_Janis_Berzins_2026.pdf"),
        (Path.home() / "Downloads/Selbstauskunft_Ausgefuellt.pdf", "Selbstauskunft_Ausgefuellt.pdf"),
    ]
    for src, dst in imports:
        if src.exists():
            dest = PDF_DIR / dst
            dest.write_bytes(src.read_bytes())
            print(f"CP  {dst}  ({dest.stat().st_size // 1024} KB)")
        else:
            print(f"SKIP (not found) {src.name}")


if __name__ == "__main__":
    main()
