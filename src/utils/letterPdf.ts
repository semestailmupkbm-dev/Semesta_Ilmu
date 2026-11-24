import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SchoolLetter, SchoolSettings, Student } from '../types';
import { composeLetterDocument, getLetterTemplateById } from '../data/letterTemplates';

function detectPdfImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  const lower = dataUrl.slice(0, 40).toLowerCase();
  if (lower.includes('image/jpeg') || lower.includes('image/jpg')) return 'JPEG';
  if (lower.includes('image/webp')) return 'WEBP';
  return 'PNG';
}

function renderKopSurat(doc: jsPDF, settings: SchoolSettings): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const hasLogo = Boolean(settings.logoDataUrl && settings.logoDataUrl.startsWith('data:image/'));

  if (hasLogo && settings.logoDataUrl) {
    try {
      doc.addImage(settings.logoDataUrl, detectPdfImageFormat(settings.logoDataUrl), 16, 12, 22, 22);
    } catch {
      // ignore invalid image encoding
    }
  }

  const centerX = hasLogo ? (pageWidth + 24) / 2 : pageWidth / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    (settings.jenisLembaga === 'PKBM'
      ? 'PUSAT KEGIATAN BELAJAR MASYARAKAT (PKBM)'
      : 'SATUAN PENDIDIKAN FORMAL'
    ).toUpperCase(),
    centerX,
    15,
    { align: 'center' }
  );

  doc.setFontSize(13.5);
  doc.setTextColor(15, 23, 42);
  doc.text((settings.namaSekolah || 'NAMA SATUAN PENDIDIKAN').toUpperCase(), centerX, 21.5, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const addrLine = `${settings.alamat || '-'}, ${settings.kelurahan || ''}, ${settings.kecamatan || ''}, ${settings.kabupaten || ''}, ${settings.provinsi || ''} ${settings.kodePos || ''}`
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .trim();
  doc.text(addrLine, centerX, 27, { align: 'center', maxWidth: pageWidth - 56 });

  const contactLine = `NPSN: ${settings.npsn || '-'}  ·  Telp: ${settings.telepon || '-'}  ·  Email: ${settings.email || '-'}`;
  doc.text(contactLine, centerX, 32.5, { align: 'center' });

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.9);
  doc.line(16, 36.5, pageWidth - 16, 36.5);
  doc.setLineWidth(0.3);
  doc.line(16, 38, pageWidth - 16, 38);

  return 45;
}

function addWrappedParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5.1
): number {
  if (!text.trim()) return y;
  const pageHeight = doc.internal.pageSize.getHeight();
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  let currY = y;
  for (const line of lines) {
    if (currY > pageHeight - 24) {
      doc.addPage();
      currY = 20;
    }
    doc.text(line, x, currY);
    currY += lineHeight;
  }
  return currY;
}

export function generateLetterPDF(
  letter: SchoolLetter,
  settings: SchoolSettings,
  student?: Student
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const contentWidth = pageWidth - marginX * 2;

  const tpl = getLetterTemplateById(letter.templateId);
  const composed = composeLetterDocument(letter, settings, student);
  let y = renderKopSurat(doc, settings);

  if (letter.status !== 'Terbit') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9);
    doc.text(`[STATUS: ${letter.status.toUpperCase()}]`, pageWidth - marginX, y - 2, {
      align: 'right',
    });
  }

  if (tpl?.formatLayout === 'surat_resmi' || tpl?.formatLayout === 'surat_izin') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(composed.tanggalText, pageWidth - marginX, y + 2, { align: 'right' });

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: 85 },
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 0.9, textColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: 'bold' },
        1: { cellWidth: 4 },
        2: { cellWidth: 'auto' },
      },
      body: [
        ['Nomor', ':', composed.nomorSurat],
        ['Lampiran', ':', composed.lampiranText || '-'],
        ['Perihal', ':', composed.perihalText || letter.perihal || tpl?.defaultPerihal || ''],
      ],
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 18) + 6;

    if (composed.tujuanBlok && composed.tujuanBlok.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      for (const line of composed.tujuanBlok) {
        doc.text(line, marginX, y);
        y += 5;
      }
      y += 4;
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(15, 23, 42);
    doc.text(composed.judulDokumen, pageWidth / 2, y + 2, { align: 'center', maxWidth: contentWidth });
    const titleWidth = Math.min(contentWidth - 16, doc.getTextWidth(composed.judulDokumen) + 4);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line((pageWidth - titleWidth) / 2, y + 3.8, (pageWidth + titleWidth) / 2, y + 3.8);

    y += 9;
    if (composed.subJudul) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const subLines = doc.splitTextToSize(composed.subJudul, contentWidth) as string[];
      for (const sLine of subLines) {
        doc.text(sLine, pageWidth / 2, y, { align: 'center' });
        y += 4.8;
      }
      y += 1;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nomor: ${composed.nomorSurat}`, pageWidth / 2, y, { align: 'center' });
    y += 8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);

  for (const sec of composed.sections) {
    if (y > pageHeight - 36) {
      doc.addPage();
      y = 20;
    }
    if (sec.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(sec.title, marginX, y);
      y += 5;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    if (sec.type === 'paragraph' && sec.text) {
      y = addWrappedParagraph(doc, sec.text, marginX, y, contentWidth, 5.1);
      y += 2.5;
    } else if (sec.type === 'keyvalue' && sec.rows && sec.rows.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX + 2, right: marginX },
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 1.2, textColor: [15, 23, 42] },
        columnStyles: {
          0: { cellWidth: 52, fontStyle: 'bold' },
          1: { cellWidth: 5 },
          2: { cellWidth: 'auto' },
        },
        body: sec.rows.map((r) => [r.label, ':', r.value]),
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10) + 4;
    } else if ((sec.type === 'bullets' || sec.type === 'numbered' || sec.type === 'diktum') && sec.items) {
      for (let i = 0; i < sec.items.length; i++) {
        const prefix = sec.type === 'bullets' ? '• ' : `${i + 1}. `;
        y = addWrappedParagraph(doc, `${prefix}${sec.items[i]}`, marginX + 3, y, contentWidth - 3, 5.0);
        y += 1.2;
      }
      y += 2;
    }
  }

  if (composed.penutup) {
    y = addWrappedParagraph(doc, composed.penutup, marginX, y + 1, contentWidth, 5.1);
  }

  if (y > pageHeight - 54) {
    doc.addPage();
    y = 24;
  }
  y += 7;

  const drawMainSign = (signX: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(composed.tanggalText, signX, y);
    doc.text(composed.jabatanPenandatangan, signX, y + 5, { maxWidth: 66 });

    if (
      settings.ttdKepalaDataUrl &&
      settings.ttdKepalaDataUrl.startsWith('data:image/') &&
      (composed.jabatanPenandatangan.toLowerCase().includes('kepala') ||
        composed.jabatanPenandatangan.toLowerCase().includes('ketua'))
    ) {
      try {
        doc.addImage(
          settings.ttdKepalaDataUrl,
          detectPdfImageFormat(settings.ttdKepalaDataUrl),
          signX + 4,
          y + 8,
          36,
          15
        );
      } catch {
        // ignore invalid signature image
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.text(composed.namaPenandatangan, signX, y + 27);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (composed.nipPenandatangan && composed.nipPenandatangan !== '-') {
      doc.text(`NIP/NUPTK: ${composed.nipPenandatangan}`, signX, y + 32);
    }
  };

  if (composed.pemohonBlok) {
    const leftX = marginX + 4;
    const rightX = pageWidth - marginX - 66;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(composed.pemohonBlok.label, leftX, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.text(composed.pemohonBlok.nama, leftX, y + 27);
    if (composed.pemohonBlok.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(composed.pemohonBlok.sub, leftX, y + 32);
    }
    drawMainSign(rightX);
  } else {
    drawMainSign(pageWidth - marginX - 66);
  }

  return doc;
}
