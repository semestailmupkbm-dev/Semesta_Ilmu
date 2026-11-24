import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile, { type Cell, type Row, type Sheet } from 'write-excel-file/browser';
import {
  CapaianPembelajaran,
  ClassDef,
  DiagnosticCategory,
  DiagnosticOption,
  DiagnosticQuestion,
  DiagnosticQuestionType,
  GradeEntry,
  SchoolSettings,
  Student,
  Subject,
  TendikCompetency,
  TendikQuestion,
  TendikQuestionOption,
  TendikQuestionPair,
  TendikQuestionType,
  TujuanPembelajaran,
} from '../types';
import {
  calculateClassLeger,
  clampScore,
  getClassTingkat,
  getPredikat,
  getSubjectCPsForClass,
  getSubjectTPsForClass,
  getSubjectsForClass,
  gradeKey,
  syncSubjectFromCPs,
} from './academic';

type BrowserSheet = Sheet<never>;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB safety limit
const MAX_IMPORT_ROWS = 5000;

/**
 * Neutralize spreadsheet formula injection characters when exporting user text to Excel/CSV.
 */
function safeExportText(val: unknown): string {
  const s = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

function makeHeaderRow(headers: string[]): Row {
  return headers.map((h) => ({
    value: h,
    type: String,
    fontWeight: 'bold',
    backgroundColor: '#ECFDF5',
    color: '#064E3B',
  }));
}

function makeDataRow(values: Array<string | number | null | undefined>, allowRawStrings = false): Row {
  return values.map((v): Cell => {
    if (v === null || v === undefined || v === '') {
      return { value: '', type: String };
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      return { value: v, type: Number };
    }
    return {
      value: allowRawStrings ? String(v) : safeExportText(v),
      type: String,
    };
  });
}

function makeSheet(
  name: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  colWidths: number[],
  allowRawStrings = false
): BrowserSheet {
  return {
    sheet: name.slice(0, 31),
    columns: colWidths.map((width) => ({ width })),
    data: [makeHeaderRow(headers), ...rows.map((r) => makeDataRow(r, allowRawStrings))],
  };
}

function triggerDownloadSheets(sheets: BrowserSheet[], fileName: string): void {
  void writeXlsxFile(sheets).toFile(fileName);
}

/**
 * RFC-4180 compliant CSV parser for .csv fallback uploads.
 */
function parseCsvMatrix(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      // Support both comma and semicolon (common in Indonesian Excel locales)
      row.push(field);
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function matrixToRecords(matrix: unknown[][]): Record<string, unknown>[] {
  if (!matrix || matrix.length < 2) return [];
  const headers = (matrix[0] || []).map((cell) => String(cell ?? '').trim());
  const records: Record<string, unknown>[] = [];
  const limit = Math.min(matrix.length, MAX_IMPORT_ROWS + 1);

  for (let r = 1; r < limit; r++) {
    const row = matrix[r] || [];
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const rawVal = row[c];
      let val: unknown = '';
      if (rawVal instanceof Date) {
        val = rawVal.toISOString().slice(0, 10);
      } else if (rawVal !== null && rawVal !== undefined) {
        val = rawVal;
      }
      if (String(val).trim() !== '') hasValue = true;
      obj[key] = val;
    }
    if (hasValue) records.push(obj);
  }
  return records;
}

async function readSpreadsheetToRecords(file: File): Promise<Record<string, unknown>[]> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Ukuran berkas melebihi batas maksimal 10 MB.');
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = await file.text();
    return matrixToRecords(parseCsvMatrix(text));
  }
  const sheets = await readXlsxFile(file);
  if (!sheets || sheets.length === 0) return [];
  const dataSheet =
    sheets.find((s) => s.sheet.toLowerCase() !== 'panduan') || sheets[0];
  return matrixToRecords(dataSheet.data as unknown[][]);
}

export function downloadGradeTemplate(
  students: Student[],
  subject: Subject,
  _settings: SchoolSettings,
  semester: string,
  kelas: string,
  grades: Record<string, GradeEntry>,
  classDefs?: ClassDef[]
) {
  const classStudents = students.filter((s) => s.kelas === kelas && s.status === 'Aktif');
  const activeTPs = getSubjectTPsForClass(subject, kelas, classDefs);

  const headers = [
    'NIS',
    'Nama Siswa',
    'Tugas',
    'Kuis / Formatif',
    'Ujian / Sumatif',
    ...activeTPs.map((tp) => `${tp.kode} (${tp.deskripsi.slice(0, 40)})`),
  ];

  const rows = classStudents.map((stu) => {
    const entry = grades[gradeKey(stu.id, subject.id, semester)];
    return [
      stu.nis,
      stu.nama,
      entry?.tugas ?? '',
      entry?.kuis ?? '',
      entry?.ujian ?? '',
      ...activeTPs.map((tp) => {
        const score = entry?.tpScores?.[tp.id];
        return score !== null && score !== undefined ? score : '';
      }),
    ];
  });

  const widths = [14, 30, 10, 15, 15, ...activeTPs.map(() => 24)];
  const sheet = makeSheet('Template Nilai', headers, rows, widths);
  const safeName = `${subject.kode}_${kelas.replace(/\s+/g, '_')}_Sem${semester}`;
  triggerDownloadSheets([sheet], `Template_Nilai_${safeName}.xlsx`);
}

export async function importGradesExcel(
  file: File,
  students: Student[],
  subject: Subject,
  semester: string,
  existingGrades: Record<string, GradeEntry>,
  kelas: string,
  classDefs?: ClassDef[]
): Promise<{
  updatedGrades: Record<string, GradeEntry>;
  matchedCount: number;
  unmatchedNames: string[];
}> {
  const rows = await readSpreadsheetToRecords(file);
  const classStudents = students.filter((s) => s.kelas === kelas);
  const activeTPs = getSubjectTPsForClass(subject, kelas, classDefs);

  const updatedGrades = { ...existingGrades };
  let matchedCount = 0;
  const unmatchedNames: string[] = [];

  for (const row of rows) {
    const nisVal = String(row['NIS'] ?? row['nis'] ?? '').trim();
    const namaVal = String(row['Nama Siswa'] ?? row['Nama'] ?? row['nama'] ?? '').trim();
    if (!nisVal && !namaVal) continue;

    const student = classStudents.find(
      (s) =>
        (nisVal && s.nis.trim().toLowerCase() === nisVal.toLowerCase()) ||
        (namaVal && s.nama.trim().toLowerCase() === namaVal.toLowerCase())
    );

    if (!student) {
      unmatchedNames.push(namaVal || nisVal);
      continue;
    }

    const key = gradeKey(student.id, subject.id, semester);
    const prev = updatedGrades[key] || {
      tugas: null,
      kuis: null,
      ujian: null,
      tpScores: {},
    };

    const tugas = clampScore(row['Tugas'] ?? row['tugas']);
    const kuis = clampScore(row['Kuis / Formatif'] ?? row['Kuis'] ?? row['kuis']);
    const ujian = clampScore(row['Ujian / Sumatif'] ?? row['Ujian'] ?? row['ujian']);

    const tpScores = { ...prev.tpScores };
    const rowKeys = Object.keys(row);
    activeTPs.forEach((tp) => {
      const colKey = rowKeys.find(
        (k) => k.trim().toUpperCase().startsWith(tp.kode.toUpperCase())
      );
      if (colKey) {
        const val = clampScore(row[colKey]);
        if (val !== null) tpScores[tp.id] = val;
      }
    });

    updatedGrades[key] = {
      ...prev,
      tugas: tugas !== null ? tugas : prev.tugas,
      kuis: kuis !== null ? kuis : prev.kuis,
      ujian: ujian !== null ? ujian : prev.ujian,
      tpScores,
    };
    matchedCount++;
  }

  return { updatedGrades, matchedCount, unmatchedNames };
}

/**
 * Download Excel template for CP (Capaian Pembelajaran) & TP (Tujuan Pembelajaran)
 */
export function downloadCPTP_Template(
  subjects: Subject[],
  selectedClass?: string,
  classDefs?: ClassDef[]
) {
  const headers = [
    'Kode_Mapel',
    'Nama_Mapel',
    'Kelas_Target',
    'Tingkat_Target',
    'Kode_CP',
    'Deskripsi_CP',
    'Kode_TP',
    'Deskripsi_TP',
  ];

  const rows: Array<Array<string | number>> = [];
  const filteredSubjects = selectedClass
    ? getSubjectsForClass(subjects, selectedClass, classDefs)
    : subjects;
  const list = filteredSubjects.length > 0 ? filteredSubjects : subjects;

  for (const subj of list) {
    const cps = selectedClass
      ? getSubjectCPsForClass(subj, selectedClass, classDefs)
      : subj.cps || [];
    if (cps.length === 0) {
      rows.push([
        subj.kode,
        subj.nama,
        selectedClass || (subj.kelasList || []).join('; '),
        selectedClass
          ? String(getClassTingkat(selectedClass, classDefs) ?? '')
          : (subj.tingkatList || []).join('; '),
        'CP 1',
        subj.capaianPembelajaran || `Capaian pembelajaran ${subj.nama}`,
        'TP-01',
        `Memahami dan menerapkan konsep dasar ${subj.nama} secara mandiri`,
      ]);
      continue;
    }

    for (const cp of cps) {
      const targetKelas =
        selectedClass || (cp.kelasList || []).join('; ');
      const targetTingkat = selectedClass
        ? String(getClassTingkat(selectedClass, classDefs) ?? '')
        : (cp.tingkatList || []).join('; ');
      if (!cp.tps || cp.tps.length === 0) {
        rows.push([
          subj.kode,
          subj.nama,
          targetKelas,
          targetTingkat,
          cp.kode,
          cp.deskripsi,
          'TP-01',
          '',
        ]);
      } else {
        for (const tp of cp.tps) {
          rows.push([
            subj.kode,
            subj.nama,
            targetKelas,
            targetTingkat,
            cp.kode,
            cp.deskripsi,
            tp.kode,
            tp.deskripsi,
          ]);
        }
      }
    }
  }

  const guideHeaders = ['Kolom', 'Wajib', 'Keterangan'];
  const guideRows: Array<Array<string>> = [
    ['Kode_Mapel', 'Ya', 'Kode mata pelajaran yang terdaftar (contoh: MTK, BIN, IPA).'],
    ['Nama_Mapel', 'Opsional', 'Nama mata pelajaran (digunakan jika Kode_Mapel kosong).'],
    ['Kelas_Target', 'Opsional', 'Pisahkan dengan titik koma (;) jika lebih dari 1 kelas (mis. Kelas 7 SMP; Kelas 8 SMP). Kosong = mengikuti tingkat/semua kelas mapel.'],
    ['Tingkat_Target', 'Opsional', 'Angka tingkat 1-12 dipisahkan titik koma (;), misal: 7; 8.'],
    ['Kode_CP', 'Ya', 'Kode CP untuk mengelompokkan beberapa TP dalam satu CP (mis. CP 1, CP 2).'],
    ['Deskripsi_CP', 'Ya', 'Rumusan lengkap Capaian Pembelajaran (CP).'],
    ['Kode_TP', 'Ya', 'Kode unik Tujuan Pembelajaran di bawah CP tersebut (mis. TP-01, TP-02).'],
    ['Deskripsi_TP', 'Ya', 'Rumusan lengkap Tujuan Pembelajaran (TP) sebagai dasar narasi deskripsi rapor.'],
  ];

  const mainSheet = makeSheet('Template CP TP', headers, rows, [14, 24, 24, 15, 10, 44, 10, 48]);
  const guideSheet = makeSheet('Panduan', guideHeaders, guideRows, [18, 10, 68], true);

  const label = selectedClass ? selectedClass.replace(/\s+/g, '_') : 'Semua_Mapel';
  triggerDownloadSheets([mainSheet, guideSheet], `Template_CP_TP_${label}.xlsx`);
}

/**
 * Import CP & TP from Excel / CSV.
 * Preserves CPs belonging to other classes when importing a class-scoped template!
 */
export async function importCPTP_Excel(
  file: File,
  existingSubjects: Subject[],
  allowedSubjectIds?: Set<string>,
  defaultClass?: string,
  classDefs?: ClassDef[]
): Promise<{
  updatedSubjects: Subject[];
  updatedCount: number;
  updatedSubjectCount: number;
  importedCpCount: number;
  importedTpCount: number;
  skippedRows: number;
}> {
  const rows = await readSpreadsheetToRecords(file);
  if (rows.length === 0) {
    return {
      updatedSubjects: existingSubjects,
      updatedCount: 0,
      updatedSubjectCount: 0,
      importedCpCount: 0,
      importedTpCount: 0,
      skippedRows: 0,
    };
  }

  type CpBucket = {
    kode: string;
    deskripsi: string;
    kelasList: Set<string>;
    tingkatList: Set<number>;
    tps: TujuanPembelajaran[];
  };

  const perSubject = new Map<string, Map<string, CpBucket>>();
  let skippedRows = 0;

  for (const row of rows) {
    const kodeMapel = String(row['Kode_Mapel'] ?? row['Kode Mapel'] ?? row['Kode'] ?? '').trim();
    const namaMapel = String(row['Nama_Mapel'] ?? row['Nama Mapel'] ?? row['Mapel'] ?? '').trim();
    const kodeCp = String(row['Kode_CP'] ?? row['Kode CP'] ?? 'CP 1').trim() || 'CP 1';
    const descCp = String(row['Deskripsi_CP'] ?? row['Deskripsi CP'] ?? '').trim();
    const kodeTp = String(row['Kode_TP'] ?? row['Kode TP'] ?? '').trim();
    const descTp = String(row['Deskripsi_TP'] ?? row['Deskripsi TP'] ?? '').trim();
    const rawKelas = String(row['Kelas_Target'] ?? row['Kelas'] ?? '').trim();
    const rawTingkat = String(row['Tingkat_Target'] ?? row['Tingkat'] ?? '').trim();

    if (!kodeMapel && !namaMapel) {
      skippedRows++;
      continue;
    }
    if (!descCp && !descTp) {
      skippedRows++;
      continue;
    }

    const subj = existingSubjects.find(
      (s) =>
        (kodeMapel && s.kode.trim().toLowerCase() === kodeMapel.toLowerCase()) ||
        (namaMapel && s.nama.trim().toLowerCase() === namaMapel.toLowerCase())
    );
    if (!subj) {
      skippedRows++;
      continue;
    }
    if (allowedSubjectIds && !allowedSubjectIds.has(subj.id)) {
      skippedRows++;
      continue;
    }

    const kelasTokens = rawKelas
      ? rawKelas.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
      : defaultClass
        ? [defaultClass]
        : [];
    const tingkatTokens = rawTingkat
      ? rawTingkat
          .split(/[;,]/)
          .map((x) => Number(x.trim()))
          .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 12)
      : kelasTokens
          .map((k) => getClassTingkat(k, classDefs))
          .filter((n): n is number => n !== null);

    let subjMap = perSubject.get(subj.id);
    if (!subjMap) {
      subjMap = new Map<string, CpBucket>();
      perSubject.set(subj.id, subjMap);
    }

    const cpScopeKey = `${kodeCp.toLowerCase()}::${[...kelasTokens].sort().join('|')}::${[...tingkatTokens].sort().join('|')}`;
    let bucket = subjMap.get(cpScopeKey);
    if (!bucket) {
      bucket = {
        kode: kodeCp,
        deskripsi: descCp || `Capaian pembelajaran ${subj.nama}`,
        kelasList: new Set(kelasTokens),
        tingkatList: new Set(tingkatTokens),
        tps: [],
      };
      subjMap.set(cpScopeKey, bucket);
    } else if (descCp && (!bucket.deskripsi || bucket.deskripsi.startsWith('Capaian pembelajaran'))) {
      bucket.deskripsi = descCp;
    }

    kelasTokens.forEach((k) => bucket!.kelasList.add(k));
    tingkatTokens.forEach((t) => bucket!.tingkatList.add(t));

    if (descTp) {
      const nextKode = kodeTp || `TP-${String(bucket.tps.length + 1).padStart(2, '0')}`;
      bucket.tps.push({
        id: `tp-imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kode: nextKode,
        deskripsi: descTp,
      });
    }
  }

  let updatedSubjectCount = 0;
  let importedCpCount = 0;
  let importedTpCount = 0;

  const updatedSubjects = existingSubjects.map((subj) => {
    const subjMap = perSubject.get(subj.id);
    if (!subjMap || subjMap.size === 0) return subj;

    updatedSubjectCount++;
    const importedCps: CapaianPembelajaran[] = Array.from(subjMap.values()).map((b, idx) => {
      importedCpCount++;
      importedTpCount += b.tps.length;
      return {
        id: `cp-imp-${subj.id}-${Date.now()}-${idx}`,
        kode: b.kode,
        deskripsi: b.deskripsi,
        kelasList: Array.from(b.kelasList),
        tingkatList: Array.from(b.tingkatList),
        tps: b.tps,
      };
    });

    // Preserve existing CPs for other classes if all imported CPs target specific classes
    const importedHasGlobalScope = importedCps.some(
      (cp) => (!cp.kelasList || cp.kelasList.length === 0) && (!cp.tingkatList || cp.tingkatList.length === 0)
    );
    const importedKelasSet = new Set(importedCps.flatMap((cp) => cp.kelasList || []));

    const preservedCps = importedHasGlobalScope
      ? []
      : (subj.cps || []).filter((existingCp) => {
          const exKelas = existingCp.kelasList || [];
          if (exKelas.length === 0) return false;
          // Keep existing CP if none of its classes overlap with the imported classes
          return !exKelas.some((k) => importedKelasSet.has(k));
        });

    const mergedCps = [...preservedCps, ...importedCps];

    return syncSubjectFromCPs({
      ...subj,
      cps: mergedCps,
    });
  });

  return {
    updatedSubjects,
    updatedCount: updatedSubjectCount,
    updatedSubjectCount,
    importedCpCount,
    importedTpCount,
    skippedRows,
  };
}

export function downloadStudentTemplate(kelas: string) {
  const headers = [
    'NIS (Opsional - Otomatis jika kosong)',
    'NISN',
    'Nama Lengkap',
    'Jenis Kelamin (L/P)',
    'Jurusan / Peminatan',
    'Tempat Lahir',
    'Tanggal Lahir (YYYY-MM-DD)',
    'Agama',
    'Pendidikan Sebelumnya',
    'Alamat',
    'Nama Ayah',
    'Nama Ibu',
    'Nama Wali',
    'No Telp Wali',
  ];
  const sample = [
    [
      '',
      '0099887766',
      'Contoh Siswa Baru',
      'L',
      'Umum',
      'Bandung',
      '2011-05-14',
      'Islam',
      'SDN 01 Bandung',
      'Jl. Merdeka No. 10',
      'Budi Santoso',
      'Siti Aminah',
      'Budi Santoso',
      '081234567890',
    ],
  ];
  const sheet = makeSheet(
    'Template Siswa',
    headers,
    sample,
    [22, 14, 28, 16, 18, 16, 20, 12, 22, 28, 20, 20, 20, 16],
    true
  );
  triggerDownloadSheets([sheet], `Template_Siswa_${kelas.replace(/\s+/g, '_')}.xlsx`);
}

export async function importStudentsExcel(
  file: File,
  kelas: string,
  _classDefs?: ClassDef[]
): Promise<Partial<Student>[]> {
  const rows = await readSpreadsheetToRecords(file);
  return rows
    .map((r) => {
      const nama = String(r['Nama Lengkap'] ?? r['Nama'] ?? '').trim();
      if (!nama) return null;
      const jkRaw = String(r['Jenis Kelamin (L/P)'] ?? r['JK'] ?? 'L')
        .trim()
        .toUpperCase();
      return {
        nis: String(
          r['NIS (Opsional - Otomatis jika kosong)'] ?? r['NIS'] ?? ''
        ).trim(),
        nisn: String(r['NISN'] ?? '').trim(),
        nama,
        kelas,
        jurusan: String(r['Jurusan / Peminatan'] ?? r['Jurusan'] ?? 'Umum').trim() || 'Umum',
        jenisKelamin: (jkRaw === 'P' ? 'P' : 'L') as 'L' | 'P',
        tempatLahir: String(r['Tempat Lahir'] ?? '').trim(),
        tanggalLahir: String(r['Tanggal Lahir (YYYY-MM-DD)'] ?? r['Tanggal Lahir'] ?? '').trim(),
        agama: String(r['Agama'] ?? 'Islam').trim() || 'Islam',
        pendidikanSebelumnya: String(r['Pendidikan Sebelumnya'] ?? '').trim(),
        alamat: String(r['Alamat'] ?? '').trim(),
        namaAyah: String(r['Nama Ayah'] ?? '').trim(),
        namaIbu: String(r['Nama Ibu'] ?? '').trim(),
        namaWali: String(r['Nama Wali'] ?? '').trim(),
        noTelpWali: String(r['No Telp Wali'] ?? '').trim(),
      };
    })
    .filter(Boolean) as Partial<Student>[];
}

export function downloadAllClassesStudentTemplate(classes: string[]) {
  const headers = [
    'Kelas',
    'NIS (Opsional - Otomatis jika kosong)',
    'NISN',
    'Nama Lengkap',
    'Jenis Kelamin (L/P)',
    'Jurusan / Peminatan',
    'Tempat Lahir',
    'Tanggal Lahir (YYYY-MM-DD)',
    'Agama',
    'Pendidikan Sebelumnya',
    'Alamat',
    'Nama Ayah',
    'Nama Ibu',
    'Nama Wali',
    'No Telp Wali',
  ];

  const sampleClasses = classes.length > 0 ? classes.slice(0, 3) : ['Kelas 7 SMP'];
  const sample = sampleClasses.map((cls, idx) => [
    cls,
    '',
    `009988776${idx + 1}`,
    `Contoh Siswa ${cls}`,
    idx % 2 === 0 ? 'L' : 'P',
    'Umum',
    'Bandung',
    '2011-05-14',
    'Islam',
    'SDN 01 Bandung',
    'Jl. Merdeka No. 10',
    'Budi Santoso',
    'Siti Aminah',
    'Budi Santoso',
    '081234567890',
  ]);

  const guideHeaders = ['Daftar Kelas Valid di Sekolah Ini'];
  const guideRows = classes.map((c) => [c]);

  const mainSheet = makeSheet(
    'Template Semua Kelas',
    headers,
    sample,
    [22, 22, 14, 28, 16, 18, 16, 20, 12, 22, 28, 20, 20, 20, 16],
    true
  );
  const guideSheet = makeSheet('Panduan', guideHeaders, guideRows, [32], true);

  triggerDownloadSheets([mainSheet, guideSheet], 'Template_Siswa_Semua_Kelas.xlsx');
}

export async function importStudentsAllClassesExcel(
  file: File,
  validClasses: string[],
  _classDefs?: ClassDef[]
): Promise<{
  matchedRows: Partial<Student>[];
  unmatchedRows: Array<{ rowNumber: number; nama: string; kelasInput: string }>;
  summaryByClass: Record<string, number>;
}> {
  const rows = await readSpreadsheetToRecords(file);
  const classLookup = new Map(validClasses.map((c) => [c.trim().toLowerCase(), c]));
  const matchedRows: Partial<Student>[] = [];
  const unmatchedRows: Array<{ rowNumber: number; nama: string; kelasInput: string }> = [];
  const summaryByClass: Record<string, number> = {};

  rows.forEach((r, idx) => {
    const nama = String(r['Nama Lengkap'] ?? r['Nama'] ?? '').trim();
    if (!nama) return;

    const rawKelas = String(r['Kelas'] ?? r['kelas'] ?? '').trim();
    const exact = rawKelas ? classLookup.get(rawKelas.toLowerCase()) : undefined;
    if (!exact) {
      unmatchedRows.push({
        rowNumber: idx + 2,
        nama,
        kelasInput: rawKelas || '(Kosong)',
      });
      return;
    }

    const jkRaw = String(r['Jenis Kelamin (L/P)'] ?? r['JK'] ?? 'L')
      .trim()
      .toUpperCase();

    matchedRows.push({
      nis: String(r['NIS (Opsional - Otomatis jika kosong)'] ?? r['NIS'] ?? '').trim(),
      nisn: String(r['NISN'] ?? '').trim(),
      nama,
      kelas: exact,
      jurusan: String(r['Jurusan / Peminatan'] ?? r['Jurusan'] ?? 'Umum').trim() || 'Umum',
      jenisKelamin: (jkRaw === 'P' ? 'P' : 'L') as 'L' | 'P',
      tempatLahir: String(r['Tempat Lahir'] ?? '').trim(),
      tanggalLahir: String(r['Tanggal Lahir (YYYY-MM-DD)'] ?? r['Tanggal Lahir'] ?? '').trim(),
      agama: String(r['Agama'] ?? 'Islam').trim() || 'Islam',
      pendidikanSebelumnya: String(r['Pendidikan Sebelumnya'] ?? '').trim(),
      alamat: String(r['Alamat'] ?? '').trim(),
      namaAyah: String(r['Nama Ayah'] ?? '').trim(),
      namaIbu: String(r['Nama Ibu'] ?? '').trim(),
      namaWali: String(r['Nama Wali'] ?? '').trim(),
      noTelpWali: String(r['No Telp Wali'] ?? '').trim(),
    });
    summaryByClass[exact] = (summaryByClass[exact] || 0) + 1;
  });

  return { matchedRows, unmatchedRows, summaryByClass };
}

export function exportLegerExcel(
  students: Student[],
  subjects: Subject[],
  grades: Record<string, GradeEntry>,
  settings: SchoolSettings,
  semester: '1' | '2',
  kelas: string,
  mode: 'SAS' | 'STS' = 'SAS',
  classDefs?: ClassDef[],
  jurusanFilter: 'ALL' | 'IPA' | 'IPS' = 'ALL'
) {
  const activeSubjects = getSubjectsForClass(
    subjects,
    kelas,
    classDefs,
    jurusanFilter === 'ALL' ? undefined : jurusanFilter
  );

  const computed = calculateClassLeger(
    students,
    activeSubjects,
    grades,
    settings,
    semester,
    kelas,
    mode,
    classDefs,
    jurusanFilter
  ).sort((a, b) => a.peringkat - b.peringkat);

  const headers = [
    'Peringkat',
    'NIS',
    'NISN',
    'Nama Siswa',
    'L/P',
    ...activeSubjects.map((s) => s.kode),
    'Jumlah',
    'Rata-rata',
    'Predikat',
  ];

  const rows = computed.map((item) => [
    item.peringkat,
    item.student.nis,
    item.student.nisn,
    item.student.nama,
    item.student.jenisKelamin,
    ...activeSubjects.map((s) => item.scoresBySubject[s.id] ?? '-'),
    item.totalNilai,
    item.rataRata,
    getPredikat(item.rataRata || null, settings.kktp),
  ]);

  const widths = [11, 14, 14, 28, 6, ...activeSubjects.map(() => 10), 10, 11, 10];
  const sheet = makeSheet(`Leger ${mode} ${kelas}`.slice(0, 31), headers, rows, widths);
  triggerDownloadSheets(
    [sheet],
    `Leger_${mode}_${kelas.replace(/\s+/g, '_')}_Sem${semester}_${settings.tahunAjaran.replace('/', '-')}.xlsx`
  );
}

export function exportAnalyticsExcel(params: {
  classScope: string;
  semScope: string;
  stats: {
    count: number;
    mean: number;
    median: number;
    mode: number | null;
    stdDev: number;
    variance: number;
    min: number;
    max: number;
    range: number;
    q1: number;
    q3: number;
    iqr: number;
  };
  tuntasPct: number;
  perSubjectSummary: Array<{
    subject: Subject;
    count: number;
    mean: number;
    min: number;
    max: number;
    stdDev: number;
    tuntasPct: number;
    remedialCount: number;
  }>;
  studentAverages: Array<{
    student: Student;
    avgSemActive: number | null;
    absensiTotal: number;
    remedialSubjects: string[];
  }>;
}) {
  const { classScope, semScope, stats, tuntasPct, perSubjectSummary, studentAverages } = params;

  const statSheet = makeSheet(
    'Statistika Deskriptif',
    ['Metrik', 'Nilai'],
    [
      ['Jumlah Data Nilai', stats.count],
      ['Mean (Rata-rata)', stats.mean],
      ['Median (Nilai Tengah)', stats.median],
      ['Modus', stats.mode ?? '-'],
      ['Standar Deviasi', stats.stdDev],
      ['Varians', stats.variance],
      ['Minimum', stats.min],
      ['Maksimum', stats.max],
      ['Rentang (Range)', stats.range],
      ['Kuartil 1 (Q1)', stats.q1],
      ['Kuartil 3 (Q3)', stats.q3],
      ['IQR', stats.iqr],
      ['Ketuntasan KKTP (%)', tuntasPct],
    ],
    [28, 16]
  );

  const mapelSheet = makeSheet(
    'Per Mata Pelajaran',
    [
      'Kode',
      'Mata Pelajaran',
      'Jumlah Siswa',
      'Rata-rata',
      'Minimum',
      'Maksimum',
      'Std Dev',
      'Tuntas (%)',
      'Perlu Remedial',
    ],
    perSubjectSummary.map((r) => [
      r.subject.kode,
      r.subject.nama,
      r.count,
      r.mean,
      r.min,
      r.max,
      r.stdDev,
      r.tuntasPct,
      r.remedialCount,
    ]),
    [12, 28, 14, 12, 11, 11, 11, 12, 15]
  );

  const stuSheet = makeSheet(
    'Siswa & Remedial',
    [
      'NIS',
      'Nama',
      'Kelas',
      `Rata-rata S${semScope}`,
      'Total Ketidakhadiran',
      'Mapel Remedial',
    ],
    studentAverages.map((r) => [
      r.student.nis,
      r.student.nama,
      r.student.kelas,
      r.avgSemActive ?? '-',
      r.absensiTotal,
      r.remedialSubjects.join(', ') || 'Tuntas Semua',
    ]),
    [14, 28, 18, 16, 20, 42]
  );

  triggerDownloadSheets(
    [statSheet, mapelSheet, stuSheet],
    `Analisis_Statistika_${classScope.replace(/\s+/g, '_')}_S${semScope}.xlsx`
  );
}

// =====================================================================
// ASESMEN DIAGNOSTIK — UNDUH TEMPLATE & IMPOR SOAL EXCEL (7 TIPE SOAL)
// =====================================================================

const VALID_DIAG_TYPES: DiagnosticQuestionType[] = [
  'pilihan_ganda',
  'pg_kompleks',
  'menjodohkan',
  'skala_likert',
  'input_gambar',
  'isian_singkat',
  'studi_kasus',
];

function normalizeQuestionType(raw: unknown): DiagnosticQuestionType {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (VALID_DIAG_TYPES.includes(s as DiagnosticQuestionType)) {
    return s as DiagnosticQuestionType;
  }
  if (s === 'pg' || s === 'pilihan' || s === 'multiple_choice') return 'pilihan_ganda';
  if (s === 'pgk' || s === 'pg_komplek' || s === 'kompleks' || s === 'multi_jawaban')
    return 'pg_kompleks';
  if (s === 'jodoh' || s === 'matching' || s === 'pasangan') return 'menjodohkan';
  if (s === 'likert' || s === 'skala') return 'skala_likert';
  if (s === 'gambar' || s === 'unggah_gambar' || s === 'foto' || s === 'bukti_gambar')
    return 'input_gambar';
  if (s === 'isian' || s === 'uraian' || s === 'esai' || s === 'essay') return 'isian_singkat';
  if (s === 'kasus' || s === 'case_study' || s === 'studi') return 'studi_kasus';
  return 'pilihan_ganda';
}

function parseMatchingPairsCell(raw: string, idPrefix: string): TendikQuestionPair[] {
  const cleaned = raw.trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s*[;\n]\s*/)
    .map((entry, idx) => {
      const parts = entry.split(/\s*(?:=>|->|=|\|)\s*/);
      if (parts.length < 2) return null;
      const kiri = parts[0].trim();
      const kanan = parts.slice(1).join(' ').trim();
      if (!kiri || !kanan) return null;
      return { id: `${idPrefix}-p${idx + 1}`, kiri, kanan };
    })
    .filter((p): p is TendikQuestionPair => Boolean(p));
}

function formatMatchingPairsCell(pairs?: TendikQuestionPair[]): string {
  if (!pairs || pairs.length === 0) return '';
  return pairs.map((p) => `${p.kiri} => ${p.kanan}`).join('; ');
}

function normalizeLetterKeys(raw: string): Set<string> {
  const set = new Set<string>();
  raw
    .toUpperCase()
    .split(/[;,|\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((t) => {
      if (['A', 'B', 'C', 'D', 'E'].includes(t)) set.add(t);
    });
  return set;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export function downloadDiagnostikTemplate(
  existingQuestions?: DiagnosticQuestion[],
  kategori: DiagnosticCategory = 'Akademik',
  packageTitle?: string
) {
  const headers = [
    'No',
    'Domain',
    'Sub_Dimensi',
    'Tipe_Soal',
    'Pertanyaan',
    'Bobot_Poin',
    'Opsi_A',
    'Opsi_B',
    'Opsi_C',
    'Opsi_D',
    'Opsi_E',
    'Kunci_Benar',
    'Skor_Opsi',
    'Tag_Karakter',
    'Pasangan_Menjodohkan',
    'Gambar_URL',
  ];

  const sampleRows: Array<Array<string | number>> =
    existingQuestions && existingQuestions.length > 0
      ? existingQuestions.map((q, idx) => {
          const letters: string[] = [];
          const scores: string[] = [];
          const tags: string[] = [];
          q.opsi.slice(0, 5).forEach((o, oi) => {
            if (o.isCorrect) letters.push(OPTION_LETTERS[oi]);
            if (typeof o.nilaiSkor === 'number') scores.push(String(o.nilaiSkor));
            if (o.traitTag) tags.push(o.traitTag);
          });
          return [
            idx + 1,
            q.domain,
            q.subDimensi || '',
            q.tipe,
            q.pertanyaan,
            q.bobotPoin ?? 10,
            q.opsi[0]?.label || '',
            q.opsi[1]?.label || '',
            q.opsi[2]?.label || '',
            q.opsi[3]?.label || '',
            q.opsi[4]?.label || '',
            letters.join(','),
            scores.join(','),
            tags.join(','),
            formatMatchingPairsCell(q.pasanganMenjodohkan),
            q.gambarUrl && !q.gambarUrl.startsWith('data:') ? q.gambarUrl : '',
          ];
        })
      : [
          [
            1,
            kategori === 'Akademik' ? 'Numerasi & Aljabar' : 'Kesiapan Belajar',
            'Konsep Dasar',
            'pilihan_ganda',
            'Hasil dari 3/4 + 2/8 adalah...',
            10,
            '1',
            '5/12',
            '3/8',
            '6/4',
            '',
            'A',
            '10,0,0,0',
            '',
            '',
            '',
          ],
          [
            2,
            kategori === 'Akademik' ? 'Literasi Membaca' : 'Strategi Belajar',
            'Analisis Multi-Fakta',
            'pg_kompleks',
            'Pilih SEMUA pernyataan yang benar mengenai ciri teks eksposisi:',
            15,
            'Menyampaikan informasi faktual secara objektif',
            'Dilengkapi argumen dan data pendukung',
            'Selalu berbentuk puisi berima',
            'Memiliki struktur tesis, argumentasi, dan penegasan ulang',
            '',
            'A,B,D',
            '',
            '',
            '',
            '',
          ],
          [
            3,
            kategori === 'Akademik' ? 'Sains / IPA' : 'Pemetaan Diri',
            'Klasifikasi',
            'menjodohkan',
            'Pasangkan besaran fisika berikut dengan satuan SI yang tepat:',
            15,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            'Panjang => Meter (m); Massa => Kilogram (kg); Waktu => Sekon (s)',
            '',
          ],
          [
            4,
            kategori === 'Pemelajar Mandiri' ? 'Regulasi Emosi & Fokus' : 'Kesiapan Psikologis',
            'Refleksi Diri',
            'skala_likert',
            'Saya membuat catatan ringkasan sendiri setelah menyelesaikan satu topik pelajaran.',
            10,
            '1 · Tidak Pernah',
            '2 · Jarang',
            '3 · Kadang-kadang',
            '4 · Sering',
            '5 · Selalu',
            '',
            '1,2,3,4,5',
            '',
            '',
            '',
          ],
          [
            5,
            kategori === 'Akademik' ? 'Proyek / Karya' : 'Bukti Lingkungan Belajar',
            'Dokumentasi Visual',
            'input_gambar',
            'Unggah foto catatan belajar, peta konsep, atau hasil penyelesaian soal di buku tulismu.',
            15,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
          ],
          [
            6,
            kategori === 'Akademik' ? 'Pemahaman Konsep' : 'Refleksi Terbuka',
            'Isian Singkat',
            'isian_singkat',
            'Tuliskan ibu kota negara Indonesia saat ini (atau tuliskan 1 target belajarmu semester ini).',
            10,
            'Jakarta|DKI Jakarta',
            '',
            '',
            '',
            '',
            'A',
            '',
            '',
            '',
            '',
          ],
          [
            7,
            kategori === 'Akademik' ? 'Penalaran Kontekstual' : 'Pemecahan Masalah',
            'Studi Kasus',
            'studi_kasus',
            'Rina memiliki waktu 2 jam belajar sebelum asesmen, namun masih bingung pada 2 topik sulit. Langkah terbaik yang sebaiknya dilakukan Rina adalah...',
            15,
            'Membuat daftar 2 topik sulit, mempelajarinya 40 menit per topik lalu latihan soal singkat',
            'Membaca ulang seluruh buku dari halaman pertama tanpa fokus',
            'Menunda belajar hingga pagi hari saat ujian',
            '',
            '',
            'A',
            '5,2,1',
            '',
            '',
            '',
          ],
        ];

  const guideHeaders = ['Kolom', 'Keterangan & Nilai Valid'];
  const guideRows: Array<Array<string>> = [
    ['Tipe_Soal', 'Isi salah satu dari 7 tipe: pilihan_ganda | pg_kompleks | menjodohkan | skala_likert | input_gambar | isian_singkat | studi_kasus'],
    ['Opsi_A .. Opsi_E', 'Label pilihan jawaban (untuk pilihan_ganda, pg_kompleks, skala_likert, atau studi_kasus beropsi). Untuk isian_singkat, Opsi_A dapat diisi kunci jawaban singkat (opsional, pisahkan alternatif dengan |).'],
    ['Kunci_Benar', 'Huruf opsi benar: "A" untuk PG/Studi Kasus, atau "A,B,D" (pisahkan koma) untuk PG Kompleks.'],
    ['Skor_Opsi', 'Skor numerik tiap opsi dipisahkan koma (misal "1,2,3,4,5" untuk Skala Likert). Opsional.'],
    ['Tag_Karakter', 'Opsional untuk Gaya Belajar/Minat (misal: Visual,Auditori,Kinestetik).'],
    ['Pasangan_Menjodohkan', 'Khusus tipe menjodohkan. Format: "Pernyataan Kiri => Pasangan Kanan; Kiri 2 => Kanan 2".'],
    ['Gambar_URL', 'Opsional tautan HTTPS gambar ilustrasi soal.'],
  ];

  const mainSheet = makeSheet(
    'Template Diagnostik',
    headers,
    sampleRows,
    [6, 22, 18, 16, 46, 11, 24, 24, 24, 24, 20, 13, 14, 20, 42, 24],
    true
  );
  const guideSheet = makeSheet('Panduan', guideHeaders, guideRows, [24, 78], true);

  const suffix = packageTitle
    ? packageTitle.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 32)
    : kategori.replace(/\s+/g, '_');
  triggerDownloadSheets([mainSheet, guideSheet], `Template_Asesmen_Diagnostik_${suffix}.xlsx`);
}

export async function importDiagnostikExcel(
  file: File,
  defaultDomain = 'Umum'
): Promise<{ questions: DiagnosticQuestion[]; skippedCount: number }> {
  const rows = await readSpreadsheetToRecords(file);
  const questions: DiagnosticQuestion[] = [];
  let skippedCount = 0;

  rows.forEach((row, idx) => {
    const pertanyaan = String(row['Pertanyaan'] ?? row['Soal'] ?? row['pertanyaan'] ?? '').trim();
    if (!pertanyaan) {
      skippedCount++;
      return;
    }

    const tipe = normalizeQuestionType(row['Tipe_Soal'] ?? row['Tipe'] ?? row['tipe']);
    const domain = String(row['Domain'] ?? row['Kompetensi'] ?? defaultDomain).trim() || defaultDomain;
    const subDimensi = String(row['Sub_Dimensi'] ?? row['Sub Dimensi'] ?? '').trim() || undefined;
    const bobotPoin = Math.max(1, Number(row['Bobot_Poin'] ?? row['Bobot'] ?? 10) || 10);
    const gambarRaw = String(row['Gambar_URL'] ?? row['Gambar'] ?? '').trim();
    const gambarUrl = /^https?:\/\//i.test(gambarRaw) ? gambarRaw : undefined;

    const correctSet = normalizeLetterKeys(
      String(row['Kunci_Benar'] ?? row['Kunci'] ?? row['Jawaban'] ?? '')
    );
    const rawScores = String(row['Skor_Opsi'] ?? '')
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s));
    const rawTags = String(row['Tag_Karakter'] ?? '')
      .split(/[;,]/)
      .map((s) => s.trim());

    const opsi: DiagnosticOption[] = [];
    OPTION_LETTERS.forEach((letter, oi) => {
      const label = String(row[`Opsi_${letter}`] ?? row[`Opsi ${letter}`] ?? '').trim();
      if (!label) return;
      const nilaiSkor =
        typeof rawScores[oi] === 'number' && !Number.isNaN(rawScores[oi])
          ? rawScores[oi]
          : tipe === 'skala_likert'
            ? oi + 1
            : undefined;
      opsi.push({
        id: letter.toLowerCase(),
        label,
        isCorrect:
          tipe === 'skala_likert'
            ? undefined
            : correctSet.size > 0
              ? correctSet.has(letter)
              : oi === 0 && (tipe === 'pilihan_ganda' || tipe === 'studi_kasus'),
        nilaiSkor,
        traitTag: rawTags[oi] || undefined,
      });
    });

    if (tipe === 'skala_likert' && opsi.length === 0) {
      opsi.push(
        { id: '1', label: '1 · Tidak Pernah / Sangat Tidak Setuju', nilaiSkor: 1 },
        { id: '2', label: '2 · Jarang / Tidak Setuju', nilaiSkor: 2 },
        { id: '3', label: '3 · Kadang-kadang / Netral', nilaiSkor: 3 },
        { id: '4', label: '4 · Sering / Setuju', nilaiSkor: 4 },
        { id: '5', label: '5 · Selalu / Sangat Setuju', nilaiSkor: 5 }
      );
    }

    const pasanganMenjodohkan =
      tipe === 'menjodohkan'
        ? parseMatchingPairsCell(
            String(row['Pasangan_Menjodohkan'] ?? row['Pasangan'] ?? ''),
            `dq-imp-${idx + 1}`
          )
        : undefined;

    if (
      (tipe === 'pilihan_ganda' || tipe === 'pg_kompleks') &&
      opsi.length < 2
    ) {
      skippedCount++;
      return;
    }
    if (tipe === 'menjodohkan' && (!pasanganMenjodohkan || pasanganMenjodohkan.length === 0)) {
      skippedCount++;
      return;
    }

    questions.push({
      id: `dq-imp-${Date.now()}-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
      domain,
      subDimensi,
      tipe,
      pertanyaan,
      gambarUrl,
      opsi: tipe === 'menjodohkan' || tipe === 'input_gambar' ? [] : opsi,
      pasanganMenjodohkan,
      bobotPoin,
      wajib: true,
    });
  });

  return { questions, skippedCount };
}

// =====================================================================
// PELATIHAN & VIDEO TENDIK — UNDUH TEMPLATE & IMPOR SOAL EXCEL (7 TIPE)
// =====================================================================

const VALID_TENDIK_COMPS: TendikCompetency[] = [
  'Profesional',
  'Pedagogik',
  'Kepribadian',
  'Digital',
  'Sosial',
];

function normalizeTendikCompetency(raw: unknown): TendikCompetency {
  const s = String(raw ?? '').trim().toLowerCase();
  const found = VALID_TENDIK_COMPS.find((c) => c.toLowerCase() === s);
  if (found) return found;
  if (s.includes('pedag')) return 'Pedagogik';
  if (s.includes('pribad') || s.includes('karak')) return 'Kepribadian';
  if (s.includes('digit') || s.includes('tik') || s.includes('lms')) return 'Digital';
  if (s.includes('sosi') || s.includes('komun')) return 'Sosial';
  return 'Profesional';
}

export function downloadTendikTemplate(
  existingQuestions?: TendikQuestion[],
  packageTitle?: string
) {
  const headers = [
    'No',
    'Kompetensi',
    'Indikator_Kinerja',
    'Tipe_Soal',
    'Pertanyaan',
    'Bobot_Poin',
    'Opsi_A',
    'Opsi_B',
    'Opsi_C',
    'Opsi_D',
    'Opsi_E',
    'Kunci_Benar',
    'Skor_Opsi',
    'Pasangan_Menjodohkan',
    'Gambar_URL',
  ];

  const sampleRows: Array<Array<string | number>> =
    existingQuestions && existingQuestions.length > 0
      ? existingQuestions.map((q, idx) => {
          const letters: string[] = [];
          const scores: string[] = [];
          q.opsi.slice(0, 5).forEach((o, oi) => {
            if (o.isCorrect) letters.push(OPTION_LETTERS[oi]);
            scores.push(String(o.nilaiSkor ?? 0));
          });
          return [
            idx + 1,
            q.kompetensi,
            q.indikatorKinerja,
            q.tipe,
            q.pertanyaan,
            q.bobotPoin ?? 20,
            q.opsi[0]?.label || '',
            q.opsi[1]?.label || '',
            q.opsi[2]?.label || '',
            q.opsi[3]?.label || '',
            q.opsi[4]?.label || '',
            letters.join(','),
            scores.join(','),
            formatMatchingPairsCell(q.pasanganMenjodohkan),
            q.gambarUrl && !q.gambarUrl.startsWith('data:') ? q.gambarUrl : '',
          ];
        })
      : [
          [
            1,
            'Profesional',
            'Penguasaan struktur CP & TP',
            'pilihan_ganda',
            'Pendekatan paling tepat saat menurunkan CP ke TP bagi peserta didik heterogen adalah...',
            20,
            'Menyesuaikan urutan TP dengan kesiapan siswa dan konteks lokal tanpa mengurangi esensi CP',
            'Menyalin isi buku teks tanpa asesmen awal',
            'Mengurangi target CP untuk semua siswa',
            '',
            '',
            'A',
            '100,30,20',
            '',
            '',
          ],
          [
            2,
            'Pedagogik',
            'Strategi diferensiasi multi-aspek',
            'pg_kompleks',
            'Pilih SEMUA komponen utama dalam merancang pembelajaran berdiferensiasi:',
            20,
            'Pemetaan kesiapan belajar melalui asesmen diagnostik',
            'Penyesuaian proses dan produk berdasarkan minat/gaya belajar',
            'Menyeragamkan satu bentuk tugas tanpa pilihan',
            'Pemberian umpan balik formatif yang spesifik',
            '',
            'A,B,D',
            '34,33,0,33',
            '',
            '',
          ],
          [
            3,
            'Profesional',
            'Kesesuaian instrumen evaluasi',
            'menjodohkan',
            'Pasangkan kebutuhan asesmen kelas dengan instrumen yang paling sesuai:',
            20,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            'Pemetaan prasyarat awal => Asesmen Diagnostik Akademik; Penilaian karakter & proyek => Projek Profil Lulusan; Refleksi komunikasi => Buku Penghubung',
            '',
          ],
          [
            4,
            'Pedagogik',
            'Konsistensi umpan balik formatif',
            'skala_likert',
            'Saya rutin memberikan umpan balik formatif spesifik agar siswa memahami langkah perbaikannya.',
            20,
            '1 · Belum Dilakukan',
            '2 · Jarang',
            '3 · Cukup Sering',
            '4 · Rutin',
            '5 · Sangat Konsisten & Terdokumentasi',
            '',
            '20,40,60,80,100',
            '',
            '',
          ],
          [
            5,
            'Digital',
            'Dokumentasi media ajar digital',
            'input_gambar',
            'Unggah tangkapan layar/foto rancangan media ajar LMS atau papan refleksi kelas Anda.',
            20,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
          ],
          [
            6,
            'Sosial',
            'Refleksi kolaborasi orang tua',
            'isian_singkat',
            'Tuliskan satu praktik komunikasi kolaboratif paling efektif yang pernah Anda lakukan bersama orang tua siswa.',
            20,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
          ],
          [
            7,
            'Kepribadian',
            'Kematangan emosi pendidik',
            'studi_kasus',
            'Ketika siswa berulang kali terlambat dan kurang fokus di kelas, sikap pendidik yang paling tepat adalah...',
            20,
            'Menegur dengan nada tinggi di depan kelas',
            'Tetap tenang, berdialog empat mata usai sesi untuk memahami kendala dan menyepakati komitmen',
            'Membiarkan tanpa tindak lanjut',
            '',
            '',
            'B',
            '20,100,30',
            '',
            '',
          ],
        ];

  const guideHeaders = ['Kolom', 'Keterangan & Nilai Valid'];
  const guideRows: Array<Array<string>> = [
    ['Kompetensi', 'Pilih salah satu dari 5 pilar Tendik: Profesional | Pedagogik | Kepribadian | Digital | Sosial'],
    ['Tipe_Soal', 'Pilih salah satu dari 7 tipe: pilihan_ganda | pg_kompleks | menjodohkan | skala_likert | input_gambar | isian_singkat | studi_kasus'],
    ['Opsi_A .. Opsi_E', 'Pilihan jawaban untuk PG, PG Kompleks, Skala Likert, atau Studi Kasus. Untuk isian_singkat, Opsi_A boleh diisi kunci jawaban opsional (pisahkan alternatif dengan |).'],
    ['Kunci_Benar', 'Huruf opsi benar: "A" atau "A,B,D" (untuk PG Kompleks).'],
    ['Skor_Opsi', 'Skor tiap opsi (0-100) dipisahkan koma, contoh: "20,40,60,80,100".'],
    ['Pasangan_Menjodohkan', 'Khusus tipe menjodohkan. Format: "Kiri 1 => Kanan 1; Kiri 2 => Kanan 2".'],
    ['Gambar_URL', 'Opsional tautan HTTPS gambar ilustrasi soal.'],
  ];

  const mainSheet = makeSheet(
    'Template Tendik',
    headers,
    sampleRows,
    [6, 15, 28, 16, 48, 11, 26, 26, 26, 24, 20, 13, 16, 44, 24],
    true
  );
  const guideSheet = makeSheet('Panduan', guideHeaders, guideRows, [24, 78], true);

  const suffix = packageTitle
    ? packageTitle.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30)
    : '5Kompetensi';
  triggerDownloadSheets([mainSheet, guideSheet], `Template_Pelatihan_Tendik_${suffix}.xlsx`);
}

export async function importTendikExcel(
  file: File
): Promise<{ questions: TendikQuestion[]; skippedCount: number }> {
  const rows = await readSpreadsheetToRecords(file);
  const questions: TendikQuestion[] = [];
  let skippedCount = 0;

  rows.forEach((row, idx) => {
    const pertanyaan = String(row['Pertanyaan'] ?? row['Soal'] ?? row['pertanyaan'] ?? '').trim();
    if (!pertanyaan) {
      skippedCount++;
      return;
    }

    const tipe = normalizeQuestionType(row['Tipe_Soal'] ?? row['Tipe'] ?? row['tipe']) as TendikQuestionType;
    const kompetensi = normalizeTendikCompetency(row['Kompetensi'] ?? row['Domain']);
    const indikatorKinerja =
      String(row['Indikator_Kinerja'] ?? row['Indikator'] ?? 'Indikator Kinerja Tendik').trim() ||
      'Indikator Kinerja Tendik';
    const bobotPoin = Math.max(1, Number(row['Bobot_Poin'] ?? row['Bobot'] ?? 20) || 20);
    const gambarRaw = String(row['Gambar_URL'] ?? row['Gambar'] ?? '').trim();
    const gambarUrl = /^https?:\/\//i.test(gambarRaw) ? gambarRaw : undefined;

    const correctSet = normalizeLetterKeys(
      String(row['Kunci_Benar'] ?? row['Kunci'] ?? row['Jawaban'] ?? '')
    );
    const rawScores = String(row['Skor_Opsi'] ?? '')
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s));

    const opsi: TendikQuestionOption[] = [];
    OPTION_LETTERS.forEach((letter, oi) => {
      const label = String(row[`Opsi_${letter}`] ?? row[`Opsi ${letter}`] ?? '').trim();
      if (!label) return;
      const isCorrect =
        tipe === 'skala_likert'
          ? undefined
          : correctSet.size > 0
            ? correctSet.has(letter)
            : oi === 0 && (tipe === 'pilihan_ganda' || tipe === 'studi_kasus');
      const fallbackScore =
        tipe === 'skala_likert'
          ? Math.min(100, (oi + 1) * 20)
          : isCorrect
            ? 100
            : 30;
      const nilaiSkor =
        typeof rawScores[oi] === 'number' && !Number.isNaN(rawScores[oi])
          ? Math.min(100, Math.max(0, rawScores[oi]))
          : fallbackScore;

      opsi.push({
        id: letter.toLowerCase(),
        label,
        nilaiSkor,
        isCorrect,
      });
    });

    if (tipe === 'skala_likert' && opsi.length === 0) {
      opsi.push(
        { id: '1', label: '1 · Belum Dilakukan', nilaiSkor: 20 },
        { id: '2', label: '2 · Jarang', nilaiSkor: 40 },
        { id: '3', label: '3 · Cukup Sering', nilaiSkor: 60 },
        { id: '4', label: '4 · Rutin', nilaiSkor: 80 },
        { id: '5', label: '5 · Sangat Konsisten & Terdokumentasi', nilaiSkor: 100 }
      );
    }

    const pasanganMenjodohkan: TendikQuestionPair[] | undefined =
      tipe === 'menjodohkan'
        ? parseMatchingPairsCell(
            String(row['Pasangan_Menjodohkan'] ?? row['Pasangan'] ?? ''),
            `tdk-imp-${idx + 1}`
          )
        : undefined;

    if ((tipe === 'pilihan_ganda' || tipe === 'pg_kompleks') && opsi.length < 2) {
      skippedCount++;
      return;
    }
    if (tipe === 'menjodohkan' && (!pasanganMenjodohkan || pasanganMenjodohkan.length === 0)) {
      skippedCount++;
      return;
    }

    questions.push({
      id: `tdk-imp-${Date.now()}-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
      kompetensi,
      indikatorKinerja,
      tipe,
      pertanyaan,
      gambarUrl,
      opsi: tipe === 'menjodohkan' || tipe === 'input_gambar' ? [] : opsi,
      pasanganMenjodohkan,
      bobotPoin,
    });
  });

  return { questions, skippedCount };
}
