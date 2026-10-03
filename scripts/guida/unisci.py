# Unisce le pagine-immagine in un PDF A4 (vedi topdf3.mjs).
import sys, glob, pymupdf
out = sys.argv[1]
doc = pymupdf.open()
for f in sorted(glob.glob(sys.argv[2] + "/pages/*.jpg")):
    page = doc.new_page(width=595.28, height=841.89)
    page.insert_image(page.rect, filename=f)
doc.set_metadata({"title": "Il menù digitale · L'Angolo del Vino · Guida", "author": "L'Angolo del Vino"})
doc.save(out, deflate=True, garbage=3)
print(out, len(doc), "pagine")
