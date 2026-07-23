"""
Extrae los campos que necesita la calculadora de Coche (matrícula, marca,
modelo, potencia, código postal...) de un PDF que el cliente sube al
solicitar una tarificación real, para no tener que teclearlos a mano.

No es OCR de imágenes todavía (fotos escaneadas): esto lee el texto ya
embebido en el PDF. Si el documento es una foto/escaneo sin texto,
pdfplumber devuelve páginas vacías — el siguiente paso sería añadir OCR
(pytesseract + pdf2image, ver skill de PDF) solo para ese caso, no hace
falta para un PDF con texto real.

Uso:
    python3 extract_document.py ruta/al/documento.pdf

Salida: JSON con los campos encontrados, listo para guardarse en
rating_jobs.extracted_data.
"""
import sys
import json
import re
import pdfplumber

# Cada campo: la(s) etiqueta(s) tal y como suelen aparecer en el documento,
# y una función opcional de limpieza del valor capturado.
FIELD_PATTERNS = {
    'nombre_titular': r'Titular:?\s*(.+)',
    'dni': r'DNI:?\s*([0-9A-Z]{8,9})',
    'matricula': r'Matr[ií]cula:?\s*([A-Z0-9]{6,8})',
    'marca': r'Marca:?\s*(.+)',
    'modelo': r'Modelo:?\s*(.+)',
    'fecha_matriculacion': r'Fecha de matriculaci[oó]n:?\s*(\d{2}/\d{2}/\d{4})',
    'potencia_kw': r'Potencia \(?kW\)?:?\s*(\d+)',
    'uso': r'Uso:?\s*(.+)',
    'codigo_postal': r'C[oó]digo postal:?\s*(\d{5})',
}


def extract_text(pdf_path):
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"
    return text


def extract_fields(text):
    data = {}
    for field, pattern in FIELD_PATTERNS.items():
        match = re.search(pattern, text)
        if match:
            data[field] = match.group(1).strip()
    return data


def main():
    if len(sys.argv) < 2:
        print("Uso: python3 extract_document.py ruta/al/documento.pdf", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    text = extract_text(pdf_path)

    if not text.strip():
        print(json.dumps({
            "ok": False,
            "error": "El PDF no tiene texto extraíble (¿es una foto/escaneo? habría que añadir OCR)."
        }, ensure_ascii=False, indent=2))
        sys.exit(1)

    fields = extract_fields(text)
    missing = [f for f in FIELD_PATTERNS if f not in fields]

    print(json.dumps({
        "ok": True,
        "fields": fields,
        "missing_fields": missing
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
