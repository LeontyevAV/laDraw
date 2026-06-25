import json
import io
import math
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas
from app.models import PlotProject


def generate_pdf(project: PlotProject) -> bytes:
    buf = io.BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 20 * mm

    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, height - margin, "Схема земельного участка")

    c.setFont("Helvetica", 11)
    y = height - margin - 20

    if project.cadastral_number:
        c.drawString(margin, y, f"Кадастровый номер: {project.cadastral_number}")
        y -= 15
    if project.address:
        c.drawString(margin, y, f"Адрес: {project.address}")
        y -= 20

    all_polygons = []
    vertices_raw = json.loads(project.vertices)
    if len(vertices_raw) >= 3:
        all_polygons.append(vertices_raw)
    polys_raw = json.loads(project.polygons) if project.polygons else []
    for poly in polys_raw:
        if len(poly) >= 3:
            all_polygons.append(poly)

    if not all_polygons:
        c.drawString(margin, y, "Недостаточно точек для отображения")
        c.save()
        return buf.getvalue()

    all_pts = [pt for poly in all_polygons for pt in poly]
    xs = [v["x"] for v in all_pts]
    ys = [v["y"] for v in all_pts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    range_x = max_x - min_x or 1
    range_y = max_y - min_y or 1

    scale = 0.05
    draw_area_x = margin
    draw_area_y = margin + 20
    draw_w = width - 2 * margin
    draw_h = y - margin - 20

    scale_x = draw_w / (range_x * 1.2)
    scale_y = draw_h / (range_y * 1.2)
    draw_scale = min(scale_x, scale_y)
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2

    def to_pdf(px: float, py: float) -> tuple[float, float]:
        dx = (px - cx) * draw_scale + draw_w / 2
        dy = (py - cy) * draw_scale + draw_h / 2
        return draw_area_x + dx, draw_area_y + dy

    palette = [
        colors.HexColor("#0066cc"),
        colors.HexColor("#cc6600"),
        colors.HexColor("#33aa33"),
        colors.HexColor("#aa33aa"),
        colors.HexColor("#cc3333"),
        colors.HexColor("#3399cc"),
    ]

    total_area = 0
    offset = 0

    for pi, poly in enumerate(all_polygons):
        col = palette[pi % len(palette)]
        pts = [to_pdf(v["x"], v["y"]) for v in poly]

        path = c.beginPath()
        path.moveTo(pts[0][0], pts[0][1])
        for pt in pts[1:]:
            path.lineTo(pt[0], pt[1])
        path.close()
        c.setFillColor(col)
        c.setFillAlpha(0.1)
        c.setStrokeColor(col)
        c.setLineWidth(1.5)
        c.drawPath(path, fill=1, stroke=1)

        c.setFillAlpha(1)
        for i, (px, py) in enumerate(pts):
            c.setFillColor(colors.HexColor("#e74c3c") if (i == 0 or i == len(pts) - 1) else col)
            c.circle(px, py, 3)
            c.fill()

        c.setFillColor(colors.HexColor("#333333"))
        c.setFont("Helvetica", 8)
        for i, (px, py) in enumerate(pts):
            c.drawString(px + 4, py - 3, str(offset + i + 1))

        c.setFont("Helvetica", 8)
        for i in range(len(poly)):
            mx = (pts[i][0] + pts[(i + 1) % len(pts)][0]) / 2
            my = (pts[i][1] + pts[(i + 1) % len(pts)][1]) / 2
            a = poly[i]
            b = poly[(i + 1) % len(poly)]
            d_px = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
            d_m = d_px * scale
            c.drawString(mx - 10, my - 3, f"{d_m:.1f}м")

        if pi > 0:
            cx_pt = (min(px for px, _ in pts) + max(px for px, _ in pts)) / 2
            cy_pt = max(py for _, py in pts) + 10
            c.setFont("Helvetica", 7)
            c.setFillColor(col)
            c.drawString(cx_pt - 10, cy_pt, f"Участок {pi + 1}")

        area_px = 0
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            area_px += poly[i]["x"] * poly[j]["y"]
            area_px -= poly[j]["x"] * poly[i]["y"]
        total_area += abs(area_px) / 2 * scale * scale

        offset += len(poly)

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#222222"))
    c.drawString(margin, margin, f"Общая площадь: {total_area:.2f} м²")

    c.save()
    return buf.getvalue()
