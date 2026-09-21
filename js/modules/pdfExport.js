// Export PDF A4 via jsPDF vendorisé
const PDF_COLS = 2;
const PDF_MARGIN_MM = 12;

async function loadJsPdf() {
  const mod = await import('../vendor/jspdf.min.js');
  return mod.jsPDF || (mod.default && mod.default.jsPDF) || mod.default;
}

function layoutForPage(jsPDF, items) {
  // Calcule la grille pour A4 : 210x297mm
  const pageW = 210, pageH = 297;
  const margin = PDF_MARGIN_MM;
  const cellW = (pageW - margin * 2) / PDF_COLS;
  const cellH = cellW + 12; // image + légende
  const rowsPerPage = Math.floor((pageH - margin * 2) / cellH);
  const perPage = PDF_COLS * rowsPerPage;
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return { pageW, pageH, margin, cellW, cellH, pages };
}

async function blobToDataURL(blob) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportPdf({ jouets, profileName = 'Liste' }) {
  const jsPDF = await loadJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Couverture
  doc.setFontSize(20);
  doc.setTextColor(179, 0, 0);
  doc.text(`Lettre au Père Noël — ${profileName}`, PDF_MARGIN_MM, 24);
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text(new Date().toLocaleDateString('fr-FR'), PDF_MARGIN_MM, 32);

  const items = jouets.map((j, i) => ({ j, idx: i + 1 }));
  if (items.length === 0) {
    doc.setFontSize(13);
    doc.text('Aucun jouet dans la liste.', PDF_MARGIN_MM, 60);
    doc.save(`lettre-${slugify(profileName)}.pdf`);
    return;
  }

  const lay = layoutForPage(jsPDF, items);
  for (let p = 0; p < lay.pages.length; p++) {
    doc.addPage();
    const items = lay.pages[p];
    for (let i = 0; i < items.length; i++) {
      const { j, idx } = items[i];
      const col = i % PDF_COLS;
      const row = Math.floor(i / PDF_COLS);
      const x = lay.margin + col * lay.cellW;
      const y = lay.margin + row * lay.cellH;
      const imgW = lay.cellW;
      const imgH = lay.cellW;
      const dataUrl = await blobToDataURL(j.blobWebp);
      // letterbox : preserve aspect
      const props = doc.getImageProperties(dataUrl);
      const ratio = props && props.width ? props.width / props.height : 1;
      let drawW = imgW, drawH = imgH, offX = 0, offY = 0;
      if (ratio > 1) { drawH = imgW / ratio; offY = (imgH - drawH) / 2; }
      else { drawW = imgH * ratio; offX = (imgW - drawW) / 2; }
      doc.addImage(dataUrl, 'WEBP', x + offX, y + offY, drawW, drawH, undefined, 'FAST');
      // Légende
      let lY = y + imgH + 4;
      doc.setFontSize(9);
      doc.setTextColor(40);
      const label = `${idx}. ${j.nomJouet || 'Jouet'}`;
      const lines = doc.splitTextToSize(label, lay.cellW - 2);
      doc.text(lines, x + 1, lY);
      if (j.magasin) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(j.magasin, x + 1, lY + lines.length * 4);
      }
    }
  }
  doc.save(`lettre-${slugify(profileName)}.pdf`);
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'liste';
}