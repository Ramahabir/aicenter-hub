from pathlib import Path

from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "ai-center-printer-test-page.pdf"


def draw_corner_marks(pdf, width, height, margin):
    mark = 16
    pdf.setStrokeColor(HexColor("#ED8B00"))
    pdf.setLineWidth(1.5)
    for x, y, sx, sy in (
        (margin, margin, 1, 1),
        (width - margin, margin, -1, 1),
        (margin, height - margin, 1, -1),
        (width - margin, height - margin, -1, -1),
    ):
        pdf.line(x, y, x + sx * mark, y)
        pdf.line(x, y, x, y + sy * mark)


def build_test_page():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    width, height = A4
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4)
    pdf.setTitle("AI Center Service Hub - Printer Test Page")
    pdf.setAuthor("AI Center Universitas Brawijaya")

    blue = HexColor("#003153")
    orange = HexColor("#ED8B00")
    pale = HexColor("#F2F5F7")
    ink = HexColor("#183043")
    muted = HexColor("#687786")
    margin = 38

    pdf.setFillColor(blue)
    pdf.rect(0, height - 155, width, 155, fill=1, stroke=0)
    pdf.setFillColor(orange)
    pdf.rect(0, height - 162, width, 7, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(margin, height - 48, "AI CENTER - UNIVERSITAS BRAWIJAYA")
    pdf.setFont("Helvetica-Bold", 30)
    pdf.drawString(margin, height - 92, "PRINTER TEST PAGE")
    pdf.setFont("Helvetica", 11)
    pdf.setFillColor(HexColor("#CAD6DE"))
    pdf.drawString(margin, height - 119, "Service Hub diagnostic sheet - A4 portrait - 100% scale")

    top = height - 205
    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(margin, top, "1. Connection check")
    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(muted)
    pdf.drawString(margin, top - 20, "If this page printed, the Service Hub can reach the Windows printer queue.")

    pdf.setFillColor(pale)
    pdf.roundRect(margin, top - 85, width - 2 * margin, 45, 4, fill=1, stroke=0)
    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(margin + 14, top - 58, "TARGET DEVICE")
    pdf.setFont("Helvetica", 11)
    pdf.drawRightString(width - margin - 14, top - 58, "EPSON L3110")
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(margin + 14, top - 75, "SOURCE")
    pdf.setFont("Helvetica", 11)
    pdf.drawRightString(width - margin - 14, top - 75, "AI Center Service Hub")

    section_y = top - 125
    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(margin, section_y, "2. Color and grayscale")
    bar_y = section_y - 52
    bar_width = (width - 2 * margin) / 6
    colors = [
        ("CYAN", HexColor("#00AEEF")),
        ("MAGENTA", HexColor("#EC008C")),
        ("YELLOW", HexColor("#FFF200")),
        ("ORANGE", orange),
        ("UB BLUE", blue),
        ("BLACK", black),
    ]
    for index, (label, color) in enumerate(colors):
        x = margin + index * bar_width
        pdf.setFillColor(color)
        pdf.rect(x, bar_y, bar_width, 34, fill=1, stroke=0)
        pdf.setFillColor(ink)
        pdf.setFont("Helvetica-Bold", 6.5)
        pdf.drawCentredString(x + bar_width / 2, bar_y - 12, label)

    gray_y = bar_y - 48
    gray_width = (width - 2 * margin) / 10
    for index in range(10):
        level = index / 9
        pdf.setFillColor(Color(level, level, level))
        pdf.rect(margin + index * gray_width, gray_y, gray_width, 24, fill=1, stroke=0)
        pdf.setFillColor(muted)
        pdf.setFont("Helvetica", 6)
        pdf.drawCentredString(margin + (index + 0.5) * gray_width, gray_y - 10, f"{100 - index * 10}%")

    text_y = gray_y - 58
    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(margin, text_y, "3. Text clarity")
    samples = [(16, "16 pt - AI Center Service Hub"), (12, "12 pt - Remote printing is ready"), (9, "9 pt - ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789"), (7, "7 pt - The quick brown fox jumps over the lazy dog.")]
    cursor = text_y - 28
    for size, sample in samples:
        pdf.setFont("Helvetica", size)
        pdf.drawString(margin, cursor, sample)
        cursor -= size + 9

    line_y = cursor - 12
    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(margin, line_y, "4. Line and alignment check")
    line_y -= 24
    for thickness in (0.25, 0.5, 1, 2, 3):
        pdf.setStrokeColor(ink)
        pdf.setLineWidth(thickness)
        pdf.line(margin, line_y, width - margin - 62, line_y)
        pdf.setFillColor(muted)
        pdf.setFont("Helvetica", 7)
        pdf.drawRightString(width - margin, line_y - 2, f"{thickness:g} pt")
        line_y -= 15

    pdf.setStrokeColor(HexColor("#C9D3DA"))
    pdf.setLineWidth(0.5)
    pdf.rect(margin, margin, width - 2 * margin, height - 2 * margin, fill=0, stroke=1)
    draw_corner_marks(pdf, width, height, margin)

    pdf.setFillColor(muted)
    pdf.setFont("Helvetica", 7.5)
    pdf.drawString(margin + 22, margin + 12, "Expected: complete border, clean text, distinct colors, and smooth grayscale steps.")
    pdf.drawRightString(width - margin - 22, margin + 12, "AI CENTER SERVICE HUB")

    pdf.showPage()
    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    build_test_page()
