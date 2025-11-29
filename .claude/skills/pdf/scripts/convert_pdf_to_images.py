# /// script
# requires-python = ">=3.12"
# dependencies = ["pypdfium2>=4.30", "pillow>=10.0"]
# ///

import os
import sys

import pypdfium2 as pdfium


# Converts each page of a PDF to a PNG image.
# Uses pypdfium2 which bundles PDFium binaries - no system dependencies required.


def convert(pdf_path, output_dir, max_dim=1000):
    pdf = pdfium.PdfDocument(pdf_path)

    for i, page in enumerate(pdf):
        # Render at 200 DPI (scale factor = target DPI / 72 base DPI)
        bitmap = page.render(scale=200 / 72)
        image = bitmap.to_pil()

        # Scale image if needed to keep width/height under `max_dim`
        width, height = image.size
        if width > max_dim or height > max_dim:
            scale_factor = min(max_dim / width, max_dim / height)
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            image = image.resize((new_width, new_height))

        image_path = os.path.join(output_dir, f"page_{i+1}.png")
        image.save(image_path)
        print(f"Saved page {i+1} as {image_path} (size: {image.size})")

    print(f"Converted {len(pdf)} pages to PNG images")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: convert_pdf_to_images.py [input pdf] [output directory]")
        sys.exit(1)
    pdf_path = sys.argv[1]
    output_directory = sys.argv[2]
    convert(pdf_path, output_directory)
