import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { AppState, DiagnosticSubmission, RaporPrintFilter, Student, Subject } from '../types';
import {
  buildStudentCardVerifyUrl,
  calculateClassLeger,
  calculateStudentSubjectGrade,
  collectTeacherSubjectNotes,
  computeValidationCode,
  DEFAULT_RAPOR_PRINT_FILTER,
  formatTanggalID,
  getSubjectsForClass,
  gradeKey,
  metaKey,
  PREDIKAT_LABELS,
} from './academic';

async function makeQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 150 });
}

function buildPortfolioQrPayload(student: Student): string {
  if (student.portfolioFolderUrl && student.portfolioFolderUrl.trim()) {
    return student.portfolioFolderUrl.trim();
  }
  return `SIM-RAPOR-PORTFOLIO|${student.nis}|${student.nama}|${student.kelas}`;
}

export async function generateRaporPDF(
  student: Student,
  state: AppState,
  docType: 'SAS' | 'STS' = 'SAS',
  existingDoc?: jsPDF,
  appendPage = false,
  filter: RaporPrintFilter = DEFAULT_RAPOR_PRINT_FILTER
): Promise<jsPDF> {
  const doc = existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { settings, subjects, grades, p5Projects, reportMeta, classDefs } = state;
  const semester = settings.semester;
  const semLabel = semester === '1' ? '1 (Ganjil)' : '2 (Genap)';
  const wali = settings.waliKelasMap[student.kelas] ?? { nama: 'Wali Kelas', nip: '-' };
  const vCode = computeValidationCode(student, state, docType);
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://sim-rapor.local';
  const verifyUrl = `${origin}/?verify=${encodeURIComponent(vCode)}`;
  const portfolioUrl = buildPortfolioQrPayload(student);

  const [verifyQr, portfolioQr] = await Promise.all([
    makeQrDataUrl(verifyUrl),
    makeQrDataUrl(portfolioUrl),
  ]);

  let needAddPage = appendPage;
  const nextPage = () => {
    if (needAddPage) doc.addPage();
    needAddPage = true;
  };

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const jurusanLabel =
    student.jurusan && student.jurusan !== 'Umum' ? ` (${student.jurusan})` : '';

  // 1. COVER RAPOR
  if (filter.cover) {
    nextPage();
    doc.setDrawColor(21, 128, 61);
    doc.setLineWidth(1.1);
    doc.rect(12, 12, pageWidth - 24, pageHeight - 24);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

    if (settings.logoDataUrl) {
      try {
        doc.addImage(settings.logoDataUrl, 'PNG', pageWidth / 2 - 17, 34, 34, 34);
      } catch {
        // ignore logo draw failure
      }
    } else {
      doc.setDrawColor(21, 128, 61);
      doc.circle(pageWidth / 2, 51, 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(21, 128, 61);
      doc.text('RAPOR', pageWidth / 2, 52.5, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text('LAPORAN HASIL BELAJAR PESERTA DIDIK', pageWidth / 2, 86, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(21, 128, 61);
    doc.text(
      docType === 'STS'
        ? 'PENILAIAN TENGAH SEMESTER · KURIKULUM MERDEKA'
        : 'KURIKULUM MERDEKA · PENDIDIKAN KESETARAAN / FORMAL',
      pageWidth / 2,
      94,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text(settings.namaSekolah.toUpperCase(), pageWidth / 2, 112, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`NPSN ${settings.npsn} · Akreditasi ${settings.akreditasi}`, pageWidth / 2, 119, {
      align: 'center',
    });

    // Student nameplate on cover
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(36, 145, pageWidth - 72, 46, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('NAMA PESERTA DIDIK', pageWidth / 2, 155, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(student.nama.toUpperCase(), pageWidth / 2, 164, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(`NIS: ${student.nis}   |   NISN: ${student.nisn || '-'}`, pageWidth / 2, 174, {
      align: 'center',
    });
    doc.text(`${student.kelas}${jurusanLabel} · ${student.fase}`, pageWidth / 2, 182, {
      align: 'center',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `TAHUN PELAJARAN ${settings.tahunAjaran} · SEMESTER ${semLabel.toUpperCase()}`,
      pageWidth / 2,
      250,
      { align: 'center' }
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${settings.kabupaten}, ${settings.provinsi}`, pageWidth / 2, 257, {
      align: 'center',
    });
  }

  // 2. IDENTITAS SATUAN PENDIDIKAN & IDENTITAS PESERTA DIDIK (+ FOTO)
  if (filter.schoolIdentity || filter.studentIdentity) {
    nextPage();
    let yId = 20;

    if (filter.schoolIdentity) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(15, 23, 42);
      doc.text('IDENTITAS SATUAN PENDIDIKAN', pageWidth / 2, yId, { align: 'center' });
      yId += 6;

      autoTable(doc, {
        startY: yId,
        margin: { left: 16, right: 16 },
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2.2, textColor: [30, 41, 59] },
        columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 6 }, 2: { cellWidth: 'auto' } },
        body: [
          ['Nama Satuan Pendidikan', ':', settings.namaSekolah],
          ['Jenis Lembaga / Status', ':', `${settings.jenisLembaga} · Akreditasi ${settings.akreditasi}`],
          ['NPSN / NSS', ':', `${settings.npsn} / ${settings.nss || '-'}`],
          ['Alamat Lembaga', ':', settings.alamat],
          ['Kelurahan / Kecamatan', ':', `${settings.kelurahan}, ${settings.kecamatan}`],
          ['Kabupaten / Provinsi', ':', `${settings.kabupaten}, ${settings.provinsi} (${settings.kodePos})`],
          ['Telepon / Email / Web', ':', `${settings.telepon} · ${settings.email} · ${settings.website}`],
          ['Kepala Lembaga', ':', `${settings.kepalaSekolah} (NIP. ${settings.nipKepalaSekolah || '-'})`],
        ],
      });
      yId = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yId + 55) + 12;
    }

    if (filter.studentIdentity) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(15, 23, 42);
      doc.text('IDENTITAS PESERTA DIDIK', pageWidth / 2, yId, { align: 'center' });
      yId += 7;

      // Student Photo box (top right of student identity)
      const photoX = pageWidth - 46;
      const photoY = yId;
      doc.setDrawColor(203, 213, 225);
      doc.rect(photoX, photoY, 30, 38);
      if (student.fotoDataUrl) {
        try {
          doc.addImage(student.fotoDataUrl, 'JPEG', photoX + 0.5, photoY + 0.5, 29, 37);
        } catch {
          doc.setFontSize(7);
          doc.text('FOTO 3x4', photoX + 15, photoY + 20, { align: 'center' });
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('FOTO 3x4', photoX + 15, photoY + 20, { align: 'center' });
      }

      autoTable(doc, {
        startY: yId,
        margin: { left: 16, right: 50 },
        theme: 'plain',
        styles: { fontSize: 8.8, cellPadding: 2, textColor: [30, 41, 59] },
        columnStyles: { 0: { cellWidth: 46, fontStyle: 'bold' }, 1: { cellWidth: 5 }, 2: { cellWidth: 'auto' } },
        body: [
          ['Nama Lengkap', ':', student.nama],
          ['NIS / NISN', ':', `${student.nis} / ${student.nisn || '-'}`],
          ['Tempat, Tanggal Lahir', ':', `${student.tempatLahir || '-'}, ${formatTanggalID(student.tanggalLahir)}`],
          ['Jenis Kelamin / Agama', ':', `${student.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'} / ${student.agama || '-'}`],
          ['Kelas / Fase / Jurusan', ':', `${student.kelas}${jurusanLabel} (${student.fase})`],
          ['Pendidikan Sebelumnya', ':', student.pendidikanSebelumnya || '-'],
          ['Alamat Peserta Didik', ':', student.alamat || '-'],
          ['Nama Ayah / Ibu', ':', `${student.namaAyah || '-'} / ${student.namaIbu || '-'}`],
          ['Nama & Telp Wali', ':', `${student.namaWali || '-'} (${student.noTelpWali || '-'})`],
        ],
      });
    }
  }

  // 3. LAPORAN HASIL BELAJAR (NILAI AKADEMIK)
  if (filter.grades) {
    nextPage();

    if (settings.logoDataUrl) {
      try {
        doc.addImage(settings.logoDataUrl, 'PNG', 14, 10, 18, 18);
      } catch {
        // ignore invalid image
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(settings.namaSekolah.toUpperCase(), settings.logoDataUrl ? 36 : 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${settings.alamat}, ${settings.kecamatan}, ${settings.kabupaten}, ${settings.provinsi} ${settings.kodePos}`,
      settings.logoDataUrl ? 36 : 14,
      20
    );
    doc.text(
      `NPSN: ${settings.npsn} · Akreditasi: ${settings.akreditasi} · Telp: ${settings.telepon}`,
      settings.logoDataUrl ? 36 : 14,
      24.5
    );

    doc.setDrawColor(21, 128, 61);
    doc.setLineWidth(0.7);
    doc.line(14, 30, pageWidth - 14, 30);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const title =
      docType === 'STS'
        ? 'LAPORAN HASIL BELAJAR TENGAH SEMESTER (STS)'
        : 'LAPORAN HASIL BELAJAR PESERTA DIDIK (KURIKULUM MERDEKA)';
    doc.text(title, pageWidth / 2, 37, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const leftMeta = [
      `Nama Peserta Didik : ${student.nama}`,
      `NIS / NISN         : ${student.nis} / ${student.nisn || '-'}`,
      `Satuan Pendidikan  : ${settings.namaSekolah}`,
    ];
    const rightMeta = [
      `Kelas / Fase      : ${student.kelas}${jurusanLabel} / ${student.fase}`,
      `Semester          : ${semLabel}`,
      `Tahun Pelajaran   : ${settings.tahunAjaran}`,
    ];
    leftMeta.forEach((line, i) => doc.text(line, 14, 44 + i * 4.5));
    rightMeta.forEach((line, i) => doc.text(line, 112, 44 + i * 4.5));

    const stuSubjects = getSubjectsForClass(
      subjects,
      student.kelas,
      classDefs,
      student.jurusan || 'Umum'
    );

    const tableBody = stuSubjects.map((subj, idx) => {
      const entry = grades[gradeKey(student.id, subj.id, semester)];
      const calc = calculateStudentSubjectGrade(entry, subj, settings, student.kelas, classDefs);
      const val = docType === 'STS' ? calc.nilaiStsOnly : calc.nilaiAkhir;
      return [
        String(idx + 1),
        subj.nama,
        val === null ? '-' : String(val),
        calc.predikat,
        calc.deskripsiFinal || 'Belum ada deskripsi capaian kompetensi.',
      ];
    });

    autoTable(doc, {
      startY: 60,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      headStyles: {
        fillColor: [21, 128, 61],
        textColor: [255, 255, 255],
        fontSize: 8.2,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        lineColor: [203, 213, 225],
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 44, fontStyle: 'bold' },
        2: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 'auto' },
      },
      head: [['No', 'Mata Pelajaran', 'Nilai', 'Pred', 'Capaian Kompetensi']],
      body:
        tableBody.length > 0
          ? tableBody
          : [['-', 'Belum ada mata pelajaran aktif.', '-', '-', '-']],
    });

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Kode Validasi Rapor: ${vCode}`, 14, pageHeight - 8);
  }

  // 4. PROFIL LULUSAN, EKSKUL, ABSENSI, CATATAN & PENGESAHAN
  const hasSecondaryPage =
    filter.profilLulusan ||
    filter.ekskul ||
    filter.absensi ||
    filter.catatan ||
    filter.pengesahan ||
    filter.validasiPortfolio;

  if (hasSecondaryPage) {
    nextPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${student.nama} (${student.kelas})`, 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Semester ${semLabel}  |  Tahun Pelajaran ${settings.tahunAjaran}`, 14, 20);

    let yPos = 26;

    if (filter.profilLulusan) {
      const stuP5 = p5Projects.filter(
        (p) => p.studentId === student.id && p.semester === semester
      );
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('A. Projek Penguatan Profil Lulusan (8 Dimensi Profil Lulusan)', 14, yPos);
      yPos += 3;

      if (stuP5.length > 0) {
        const p5Body: unknown[][] = [];
        stuP5.forEach((proj) => {
          p5Body.push([
            {
              content: `Tema: ${proj.tema} — ${proj.judulProjek}\n${proj.deskripsi}`,
              colSpan: 2,
              styles: { fillColor: [248, 250, 252], fontStyle: 'bold' },
            },
          ]);
          proj.dimensi.forEach((d) => {
            p5Body.push([d.profil, `${d.capaian} (${PREDIKAT_LABELS[d.capaian] || d.capaian})`]);
          });
        });
        autoTable(doc, {
          startY: yPos,
          margin: { left: 14, right: 14 },
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8.2 },
          styles: { fontSize: 7.8, cellPadding: 2, lineColor: [203, 213, 225] },
          columnStyles: { 0: { cellWidth: 112 }, 1: { cellWidth: 'auto', fontStyle: 'bold' } },
          head: [['Dimensi Profil Lulusan', 'Capaian Perkembangan']],
          body: p5Body as never,
        });
        yPos =
          ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
            yPos + 25) + 6;
      } else {
        autoTable(doc, {
          startY: yPos,
          margin: { left: 14, right: 14 },
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2.2 },
          body: [['Belum ada data Projek Penguatan Profil Lulusan pada semester ini.']],
        });
        yPos =
          ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
            yPos + 12) + 6;
      }
    }

    const meta = reportMeta[metaKey(student.id, semester)];

    if (filter.ekskul) {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('B. Kegiatan Ekstrakurikuler', 14, yPos);
      yPos += 3;

      const ekskulBody =
        meta && meta.ekskul.length > 0
          ? meta.ekskul.map((e, i) => [String(i + 1), e.nama, e.predikat, e.keterangan])
          : [['1', '-', '-', 'Tidak mengikuti kegiatan ekstrakurikuler tambahan.']];

      autoTable(doc, {
        startY: yPos,
        margin: { left: 14, right: 14 },
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8.2 },
        styles: { fontSize: 8, cellPadding: 2.1, lineColor: [203, 213, 225] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 48, fontStyle: 'bold' },
          2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 'auto' },
        },
        head: [['No', 'Kegiatan Ekstrakurikuler', 'Predikat', 'Keterangan']],
        body: ekskulBody,
      });
      yPos =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
          yPos + 20) + 6;
    }

    if (filter.absensi || filter.catatan) {
      if (yPos > pageHeight - 55) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('C. Ketidakhadiran & Catatan Wali Kelas / Guru Mapel', 14, yPos);
      yPos += 3;

      const abs = meta?.absensi ?? { sakit: 0, izin: 0, alpha: 0 };
      const teacherNotes = collectTeacherSubjectNotes(
        student,
        subjects,
        grades,
        semester,
        classDefs
      );
      let noteText =
        meta?.catatanWaliKelas?.trim() || 'Terus tingkatkan semangat belajar dan kedisiplinan.';
      if (teacherNotes.length > 0 && !noteText.includes('Catatan Guru Mata Pelajaran:')) {
        noteText += `\n\nCatatan Guru Mata Pelajaran:\n${teacherNotes
          .map((n) => `- ${n.subjectName} (${n.guruPengampu}): ${n.catatan}`)
          .join('\n')}`;
      }

      const rowCells: string[] = [];
      if (filter.absensi) {
        rowCells.push(
          `Ketidakhadiran\nSakit : ${abs.sakit} hari\nIzin : ${abs.izin} hari\nTanpa Keterangan : ${abs.alpha} hari`
        );
      }
      if (filter.catatan) {
        rowCells.push(`Catatan Wali Kelas & Guru Mapel:\n${noteText}`);
      }

      autoTable(doc, {
        startY: yPos,
        margin: { left: 14, right: 14 },
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.2, lineColor: [203, 213, 225] },
        columnStyles:
          rowCells.length === 2 ? { 0: { cellWidth: 52 }, 1: { cellWidth: 'auto' } } : undefined,
        body: [rowCells],
      });
      yPos =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
          yPos + 24) + 8;
    }

    if (filter.pengesahan) {
      if (yPos > pageHeight - 66) {
        doc.addPage();
        yPos = 20;
      }

      const sigY = yPos;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('Mengetahui,', 14, sigY);
      doc.text('Orang Tua / Wali', 14, sigY + 4.5);
      doc.text('__________________________', 14, sigY + 25);

      doc.text(`${settings.tempatRapor}, ${formatTanggalID(settings.tanggalRapor)}`, 132, sigY);
      doc.text('Wali Kelas', 132, sigY + 4.5);
      if (wali.ttdDataUrl) {
        try {
          doc.addImage(wali.ttdDataUrl, 'PNG', 134, sigY + 6, 26, 12);
        } catch {
          // ignore
        }
      }
      doc.setFont('helvetica', 'bold');
      doc.text(wali.nama || 'Wali Kelas', 132, sigY + 23);
      doc.setFont('helvetica', 'normal');
      doc.text(`NIP/NUPTK. ${wali.nip || '-'}`, 132, sigY + 27);

      const ksY = sigY + 33;
      doc.text('Mengetahui,', pageWidth / 2, ksY, { align: 'center' });
      doc.text(`Kepala ${settings.namaSekolah}`, pageWidth / 2, ksY + 4.5, { align: 'center' });
      if (settings.ttdKepalaDataUrl) {
        try {
          doc.addImage(settings.ttdKepalaDataUrl, 'PNG', pageWidth / 2 - 14, ksY + 6, 28, 12);
        } catch {
          // ignore
        }
      }
      doc.setFont('helvetica', 'bold');
      doc.text(settings.kepalaSekolah || '-', pageWidth / 2, ksY + 22, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(`NIP. ${settings.nipKepalaSekolah || '-'}`, pageWidth / 2, ksY + 26, {
        align: 'center',
      });
    }

    if (filter.validasiPortfolio) {
      try {
        doc.addImage(verifyQr, 'PNG', 14, pageHeight - 31, 18, 18);
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text('Verifikasi Rapor', 14, pageHeight - 10);
        doc.text(vCode, 14, pageHeight - 7);

        doc.addImage(portfolioQr, 'PNG', pageWidth - 32, pageHeight - 31, 18, 18);
        doc.text('Portofolio Karya', pageWidth - 32, pageHeight - 10);
      } catch {
        // ignore
      }
    }
  }

  return doc;
}

export interface CardPrintOptions {
  sideMode?: 'both' | 'front' | 'back';
  validUntil?: string;
}

async function drawCardFront(
  doc: jsPDF,
  stu: Student,
  state: AppState,
  themeRgb: [number, number, number],
  x: number,
  y: number,
  cardW: number,
  cardH: number
) {
  const { settings } = state;

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, cardW, cardH, 3, 3, 'FD');

  doc.setFillColor(themeRgb[0], themeRgb[1], themeRgb[2]);
  doc.roundedRect(x, y, cardW, 13, 3, 3, 'F');
  doc.rect(x, y + 8, cardW, 5, 'F');

  if (settings.logoDataUrl) {
    try {
      doc.addImage(settings.logoDataUrl, 'PNG', x + 3, y + 2.2, 8.5, 8.5);
    } catch {
      // ignore
    }
  }
  const textX = settings.logoDataUrl ? x + 13.5 : x + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(255, 255, 255);
  doc.text('KARTU TANDA PESERTA DIDIK', textX, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.3);
  doc.text(settings.namaSekolah.toUpperCase(), textX, y + 10);

  if (stu.fotoDataUrl) {
    try {
      doc.addImage(stu.fotoDataUrl, 'JPEG', x + 4, y + 16, 17, 22);
    } catch {
      doc.setDrawColor(203, 213, 225);
      doc.rect(x + 4, y + 16, 17, 22);
    }
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.rect(x + 4, y + 16, 17, 22);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(6);
    doc.text('FOTO', x + 12.5, y + 28, { align: 'center' });
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(stu.nama, x + 24, y + 19.5, { maxWidth: 42 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`NIS / NISN : ${stu.nis} / ${stu.nisn || '-'}`, x + 24, y + 25);
  doc.text(`Kelas / Fase: ${stu.kelas} (${stu.fase})`, x + 24, y + 29);
  doc.text(`TTL        : ${stu.tempatLahir || '-'}, ${formatTanggalID(stu.tanggalLahir)}`, x + 24, y + 33);
  doc.text(`Tahun Ajar : ${settings.tahunAjaran}`, x + 24, y + 37);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  if (stu.status === 'Aktif') {
    doc.setTextColor(21, 128, 61);
    doc.text('STATUS: PESERTA DIDIK AKTIF', x + 24, y + 42.5);
  } else {
    doc.setTextColor(220, 38, 38);
    doc.text(`STATUS: NONAKTIF (${stu.status.toUpperCase()})`, x + 24, y + 42.5);
  }

  const verifyQr = await makeQrDataUrl(buildStudentCardVerifyUrl(stu.id, state.schoolId));
  try {
    doc.addImage(verifyQr, 'PNG', x + cardW - 17, y + cardH - 17, 13, 13);
  } catch {
    // ignore
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.4);
  doc.setTextColor(100, 116, 139);
  doc.text(`NPSN ${settings.npsn} · Pindai QR untuk cek keaktifan`, x + 4, y + cardH - 3.5);
}

async function drawCardBack(
  doc: jsPDF,
  stu: Student,
  state: AppState,
  themeRgb: [number, number, number],
  x: number,
  y: number,
  cardW: number,
  cardH: number,
  validUntil?: string
) {
  const { settings } = state;

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, cardW, cardH, 3, 3, 'FD');

  doc.setFillColor(themeRgb[0], themeRgb[1], themeRgb[2]);
  doc.roundedRect(x, y, cardW, 9, 3, 3, 'F');
  doc.rect(x, y + 5, cardW, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text('KETENTUAN & VERIFIKASI KEAKTIFAN KARTU', x + 4, y + 5.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.1);
  doc.setTextColor(51, 65, 85);
  const rules = [
    '1. Kartu ini resmi diterbitkan sebagai tanda pengenal peserta didik.',
    '2. Kartu otomatis nonaktif apabila siswa lulus atau mutasi keluar.',
    '3. Pindai QR di samping untuk mengecek profil & keaktifan real-time.',
  ];
  rules.forEach((line, idx) => {
    doc.text(line, x + 4, y + 14 + idx * 4.2, { maxWidth: 56 });
  });

  doc.setFontSize(5.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${settings.alamat}, ${settings.kabupaten}`,
    x + 4,
    y + 29,
    { maxWidth: 55 }
  );
  doc.text(`Berlaku s.d. ${validUntil || 'Selama Aktif'}`, x + 4, y + 34.5);

  doc.setFontSize(6);
  doc.setTextColor(15, 23, 42);
  doc.text(`Kepala ${settings.namaSekolah}`, x + 4, y + 40.5);
  if (settings.ttdKepalaDataUrl) {
    try {
      doc.addImage(settings.ttdKepalaDataUrl, 'PNG', x + 5, y + 41, 16, 6);
    } catch {
      // ignore
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.text(settings.kepalaSekolah || '-', x + 4, y + cardH - 3.5, { maxWidth: 52 });

  const verifyQr = await makeQrDataUrl(buildStudentCardVerifyUrl(stu.id, state.schoolId));
  try {
    doc.addImage(verifyQr, 'PNG', x + cardW - 22, y + 14, 18, 18);
  } catch {
    // ignore
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.4);
  doc.setTextColor(71, 85, 105);
  doc.text('SCAN KEAKTIFAN', x + cardW - 13, y + 35.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(`NIS ${stu.nis}`, x + cardW - 13, y + 39, { align: 'center' });
}

export async function generateKartuPelajarPDF(
  students: Student[],
  state: AppState,
  themeRgb: [number, number, number] = [21, 128, 61],
  options: CardPrintOptions = {}
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const sideMode = options.sideMode || 'both';
  const cardW = 86;
  const cardH = 54;

  if (sideMode === 'both') {
    // 2 students per page: Front (left) + Back (right)
    for (let i = 0; i < students.length; i++) {
      const stu = students[i];
      if (i > 0 && i % 3 === 0) doc.addPage();
      const row = i % 3;
      const y = 20 + row * (cardH + 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Tampak Depan — ${stu.nama}`, 14, y - 2);
      doc.text(`Tampak Belakang — ${stu.nama}`, 14 + cardW + 10, y - 2);
      await drawCardFront(doc, stu, state, themeRgb, 14, y, cardW, cardH);
      await drawCardBack(doc, stu, state, themeRgb, 14 + cardW + 10, y, cardW, cardH, options.validUntil);
    }
  } else {
    for (let i = 0; i < students.length; i++) {
      const stu = students[i];
      if (i > 0 && i % 4 === 0) doc.addPage();
      const slot = i % 4;
      const col = slot % 2;
      const row = Math.floor(slot / 2);
      const x = 14 + col * (cardW + 8);
      const y = 18 + row * (cardH + 10);
      if (sideMode === 'front') {
        await drawCardFront(doc, stu, state, themeRgb, x, y, cardW, cardH);
      } else {
        await drawCardBack(doc, stu, state, themeRgb, x, y, cardW, cardH, options.validUntil);
      }
    }
  }

  return doc;
}

export async function generateRekamDidikPDF(student: Student, state: AppState): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { settings, subjects, grades, p5Projects, counselingNotes, mutations, archives, logbookEntries, classDefs } = state;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Kop
  if (settings.logoDataUrl) {
    try {
      doc.addImage(settings.logoDataUrl, 'PNG', 14, 10, 16, 16);
    } catch {
      // ignore
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('DOKUMEN REKAM DIDIK & PORTOFOLIO TERPADU', settings.logoDataUrl ? 34 : 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${settings.namaSekolah} · NPSN ${settings.npsn} · Tahun Ajaran ${settings.tahunAjaran}`, settings.logoDataUrl ? 34 : 14, 20.5);
  doc.setDrawColor(21, 128, 61);
  doc.setLineWidth(0.6);
  doc.line(14, 28, pageWidth - 14, 28);

  // Biodata + Foto + QR Keaktifan
  if (student.fotoDataUrl) {
    try {
      doc.addImage(student.fotoDataUrl, 'JPEG', 14, 32, 24, 30);
    } catch {
      doc.rect(14, 32, 24, 30);
    }
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, 32, 24, 30);
  }

  const verifyQr = await makeQrDataUrl(buildStudentCardVerifyUrl(student.id, state.schoolId));
  try {
    doc.addImage(verifyQr, 'PNG', pageWidth - 36, 32, 22, 22);
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Cek Status', pageWidth - 25, 57, { align: 'center' });
  } catch {
    // ignore
  }

  autoTable(doc, {
    startY: 32,
    margin: { left: 42, right: 40 },
    theme: 'plain',
    styles: { fontSize: 8.2, cellPadding: 1.4 },
    columnStyles: { 0: { cellWidth: 36, fontStyle: 'bold' }, 1: { cellWidth: 4 }, 2: { cellWidth: 'auto' } },
    body: [
      ['Nama Lengkap', ':', student.nama],
      ['NIS / NISN', ':', `${student.nis} / ${student.nisn || '-'}`],
      ['Kelas / Status', ':', `${student.kelas} (${student.fase}) · Status: ${student.status}`],
      ['TTL / L-P', ':', `${student.tempatLahir || '-'}, ${formatTanggalID(student.tanggalLahir)} (${student.jenisKelamin})`],
      ['Orang Tua / Wali', ':', `${student.namaAyah || '-'} / ${student.namaIbu || '-'} · Telp ${student.noTelpWali || '-'}`],
      ['Alamat', ':', student.alamat || '-'],
    ],
  });

  let yPos = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 68) + 6;

  // Linimasa & Mutasi
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Linimasa Pendidikan & Riwayat Mutasi', 14, yPos);
  yPos += 3;

  const stuMutations = mutations.filter((m) => m.studentId === student.id);
  const timelineRows: string[][] = [
    [formatTanggalID(student.createdAt?.slice(0, 10)), 'Pendaftaran Awal', student.awalMasukNote || `Terdaftar di ${student.kelas}`],
    ...stuMutations.map((m) => [
      formatTanggalID(m.tanggal),
      `Mutasi ${m.jenis}`,
      `${m.sekolahAsalTujuan} (No. ${m.nomorSurat}) — ${m.alasan}`,
    ]),
  ];
  archives.forEach((arc) => {
    const past = arc.students.find((s) => s.id === student.id);
    if (past) {
      timelineRows.push([arc.tahunAjaran, `Arsip TA ${arc.tahunAjaran}`, `Tercatat di ${past.kelas} (${past.status})`]);
    }
  });

  autoTable(doc, {
    startY: yPos,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 1.8 },
    head: [['Tanggal / TA', 'Peristiwa', 'Keterangan']],
    body: timelineRows,
  });
  yPos = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPos + 20) + 6;

  // Nilai Lintas Semester
  if (yPos > pageHeight - 50) {
    doc.addPage();
    yPos = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('2. Rekap Nilai Lintas Semester (Semester 1 & Semester 2)', 14, yPos);
  yPos += 3;

  const stuSubjects = getSubjectsForClass(subjects, student.kelas, classDefs, student.jurusan || 'Umum');
  const gradeRows = stuSubjects.map((subj) => {
    const g1 = calculateStudentSubjectGrade(grades[gradeKey(student.id, subj.id, '1')], subj, settings, student.kelas, classDefs);
    const g2 = calculateStudentSubjectGrade(grades[gradeKey(student.id, subj.id, '2')], subj, settings, student.kelas, classDefs);
    return [
      subj.kode,
      subj.nama,
      g1.nilaiAkhir !== null ? `${g1.nilaiAkhir} (${g1.predikat})` : '-',
      g2.nilaiAkhir !== null ? `${g2.nilaiAkhir} (${g2.predikat})` : '-',
    ];
  });

  autoTable(doc, {
    startY: yPos,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    headStyles: { fillColor: [21, 128, 61], textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 1.8 },
    head: [['Kode', 'Mata Pelajaran', 'Semester 1 (Ganjil)', 'Semester 2 (Genap)']],
    body: gradeRows.length > 0 ? gradeRows : [['-', 'Belum ada data nilai.', '-', '-']],
  });
  yPos = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPos + 20) + 6;

  // Profil Lulusan & Catatan BK
  if (yPos > pageHeight - 50) {
    doc.addPage();
    yPos = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('3. Catatan Bimbingan Konseling (BK) & Projek Profil Lulusan', 14, yPos);
  yPos += 3;

  const stuBk = counselingNotes.filter((n) => n.studentId === student.id);
  const stuProjs = p5Projects.filter((p) => p.studentId === student.id);
  const combinedRows: string[][] = [
    ...stuProjs.map((p) => [`Profil Lulusan (S${p.semester})`, `${p.tema} — ${p.judulProjek}`, p.dimensi.map((d) => `${d.profil}: ${d.capaian}`).join('; ')]),
    ...stuBk.map((b) => [`BK (${b.tanggal})`, b.topik, `${b.uraianMasalah} | Tindak lanjut: ${b.layananTindakLanjut || '-'}`]),
  ];

  autoTable(doc, {
    startY: yPos,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.6, cellPadding: 1.8 },
    head: [['Jenis', 'Topik / Tema', 'Detail & Capaian']],
    body: combinedRows.length > 0 ? combinedRows : [['-', 'Belum ada catatan BK atau Profil Lulusan.', '-']],
  });
  yPos = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPos + 20) + 6;

  // Portofolio & Buku Penghubung
  if (yPos > pageHeight - 45) {
    doc.addPage();
    yPos = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('4. Portofolio Karya & Log Buku Penghubung', 14, yPos);
  yPos += 3;

  const stuLogs = logbookEntries.filter((l) => l.studentId === student.id);
  const pfAndLogs: string[][] = [
    ...(student.portfolioItems || []).map((pf) => [`Karya (${pf.tanggal})`, pf.judul, `${pf.kategori} — ${pf.catatan || pf.url || '-'}`]),
    ...stuLogs.map((l) => [`Penghubung (${l.status})`, l.judul, `${l.authorName}: ${l.pesan}`]),
  ];

  autoTable(doc, {
    startY: yPos,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.6, cellPadding: 1.8 },
    head: [['Kategori', 'Judul', 'Uraian / Tautan']],
    body: pfAndLogs.length > 0 ? pfAndLogs : [['-', 'Belum ada catatan portofolio atau buku penghubung.', '-']],
  });

  return doc;
}

export function generateLegerPDF(
  students: Student[],
  subjects: Subject[],
  state: AppState,
  kelas: string,
  mode: 'SAS' | 'STS',
  jurusanFilter = 'ALL'
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { settings, grades, classDefs } = state;
  const classSubjects = getSubjectsForClass(subjects, kelas, classDefs, jurusanFilter);
  const rows = calculateClassLeger(
    students,
    subjects,
    grades,
    settings,
    settings.semester,
    kelas,
    mode,
    classDefs,
    jurusanFilter
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`LEGER NILAI ${mode} — ${kelas.toUpperCase()}`, 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `${settings.namaSekolah} · Semester ${settings.semester === '1' ? '1 (Ganjil)' : '2 (Genap)'} · Tahun Pelajaran ${settings.tahunAjaran}`,
    14,
    20
  );

  const head = [
    ['No', 'NIS', 'Nama Peserta Didik', ...classSubjects.map((s) => s.kode), 'Jml', 'Rata', 'Rank'],
  ];
  const body = rows.map((r, idx) => [
    String(idx + 1),
    r.student.nis,
    r.student.nama,
    ...classSubjects.map((s) => {
      const v = r.scoresBySubject[s.id];
      return v === null ? '-' : String(v);
    }),
    String(r.totalNilai),
    r.rataRata.toFixed(1),
    String(r.peringkat),
  ]);

  autoTable(doc, {
    startY: 25,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    headStyles: { fillColor: [21, 128, 61], textColor: [255, 255, 255], fontSize: 7.5 },
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    head,
    body,
  });

  return doc;
}

export function generateDiagnostikReportPDF(
  state: AppState,
  submissions: DiagnosticSubmission[],
  filterLabel = 'Semua Kategori'
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { settings } = state;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('LAPORAN OLAH HASIL ASESMEN DIAGNOSTIK AKADEMIK & NON-AKADEMIK', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `${settings.namaSekolah} (NPSN ${settings.npsn || '-'}) · TA ${settings.tahunAjaran} Sem. ${settings.semester} · Filter: ${filterLabel}`,
    14,
    20
  );

  const head = [
    [
      'No',
      'NIS',
      'Nama Siswa',
      'Kelas',
      'Kategori & Mapel',
      'Skor / Gaya VAK',
      'Minat / Penguasaan',
      'Indikator Perhatian',
      'Keputusan & Catatan Pengurus',
      'Pengesahan',
    ],
  ];

  const body = submissions.map((s, idx) => {
    const avgNonAk =
      s.skorDomainNonAkademik && s.skorDomainNonAkademik.length > 0
        ? Math.round(
            s.skorDomainNonAkademik.reduce((a, b) => a + b.persen, 0) /
              s.skorDomainNonAkademik.length
          )
        : 0;
    const scoreOrVak =
      s.kategori === 'Akademik'
        ? `${s.skorAkademik ?? 0}% (${s.jumlahBenar ?? 0}/${s.jumlahSoal ?? 0})`
        : s.profilGayaBelajar
          ? `${s.profilGayaBelajar.dominan} (${avgNonAk}%)`
          : `${avgNonAk}%`;
    const penguasaan =
      s.kategori === 'Akademik' ? s.levelPenguasaan || '-' : s.minatDominan || '-';
    const flags =
      (s.indikatorPerluPerhatian || []).join(', ') ||
      (s.levelPenguasaan === 'Perlu Intervensi Dasar' ? 'Intervensi Dasar' : 'Aman');
    const keputusan = [s.keputusanTindakLanjut, s.catatanAnalisisPengurus]
      .filter(Boolean)
      .join(' — ');
    return [
      String(idx + 1),
      s.nis,
      s.studentName,
      s.kelas,
      s.subjectName ? `${s.kategori} (${s.subjectName})` : s.kategori,
      scoreOrVak,
      penguasaan,
      flags,
      keputusan || s.rekomendasiTindakLanjut,
      s.verifiedByName ? `${s.verifiedByName}` : 'Belum Sah',
    ];
  });

  autoTable(doc, {
    startY: 25,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255], fontSize: 7.5 },
    styles: { fontSize: 7.2, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 18 },
      2: { cellWidth: 32 },
      3: { cellWidth: 22 },
      4: { cellWidth: 28 },
      5: { cellWidth: 24 },
      6: { cellWidth: 28 },
      7: { cellWidth: 30 },
      8: { cellWidth: 58 },
      9: { cellWidth: 21 },
    },
    head,
    body,
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 150) + 10;
  if (finalY < 185) {
    doc.setFontSize(8.5);
    doc.text(
      `${settings.tempatRapor || settings.kabupaten || 'Indonesia'}, ${formatTanggalID(settings.tanggalRapor || new Date().toISOString().slice(0, 10))}`,
      215,
      finalY
    );
    doc.text('Pengurus / Kepala Lembaga,', 215, finalY + 5);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.kepalaSekolah || 'Pengurus Lembaga', 215, finalY + 18);
  }

  return doc;
}

