import {
  AcademicYearRecord,
  AppState,
  CapaianPembelajaran,
  ClassDef,
  GradeEntry,
  Jenjang,
  P5Dimension,
  RaporPrintFilter,
  SchoolSettings,
  Student,
  Subject,
  TujuanPembelajaran,
  UserAccount,
} from '../types';

export const EIGHT_PROFIL_LULUSAN: readonly string[] = [
  'Keimanan dan Ketakwaan terhadap Tuhan YME',
  'Kewargaan',
  'Penalaran Kritis',
  'Kreativitas',
  'Kolaborasi',
  'Kemandirian',
  'Kesehatan',
  'Komunikasi',
] as const;

export function createDefaultProfilLulusanDimensions(): P5Dimension[] {
  return EIGHT_PROFIL_LULUSAN.map((profil) => ({
    profil,
    capaian: 'BSH',
    isCustom: false,
  }));
}

export const DEFAULT_RAPOR_PRINT_FILTER: RaporPrintFilter = {
  cover: true,
  schoolIdentity: true,
  studentIdentity: true,
  grades: true,
  profilLulusan: true,
  ekskul: true,
  absensi: true,
  catatan: true,
  pengesahan: true,
  validasiPortfolio: true,
};

export const PKBM_KATEGORI_LIST = [
  'Umum / Wajib',
  'Pemberdayaan',
  'Keterampilan',
  'Muatan Lokal',
  'Peminatan / Pilihan',
] as const;

export const PREDIKAT_LABELS: Record<string, string> = {
  MB: 'Mulai Berkembang',
  SB: 'Sedang Berkembang',
  BSH: 'Berkembang Sesuai Harapan',
  SAB: 'Sangat Berkembang',
};

export function gradeKey(studentId: string, subjectId: string, semester: string): string {
  return `${studentId}::${subjectId}::${semester}`;
}

export function metaKey(studentId: string, semester: string): string {
  return `${studentId}::${semester}`;
}

export function clampScore(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (Number.isNaN(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function getPredikat(score: number | null, kktp: number): string {
  if (score === null) return '-';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= kktp) return 'C';
  return 'D';
}

export function lcFirstSentence(text: string): string {
  if (!text) return '';
  const trimmed = text.trim().replace(/\.$/, '');
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

export function getClassTingkat(kelas: string, classDefs?: ClassDef[]): number | null {
  const found = classDefs?.find((c) => c.nama === kelas);
  if (found) return found.tingkat;
  const numMatch = kelas.match(/\b(1[0-2]|[1-9])\b/);
  if (numMatch) return Number(numMatch[1]);
  if (/\bXII\b/i.test(kelas)) return 12;
  if (/\bXI\b/i.test(kelas)) return 11;
  if (/\bX\b/i.test(kelas)) return 10;
  if (/\bIX\b/i.test(kelas)) return 9;
  if (/\bVIII\b/i.test(kelas)) return 8;
  if (/\bVII\b/i.test(kelas)) return 7;
  if (/\bVI\b/i.test(kelas)) return 6;
  if (/\bV\b/i.test(kelas)) return 5;
  if (/\bIV\b/i.test(kelas)) return 4;
  if (/\bIII\b/i.test(kelas)) return 3;
  if (/\bII\b/i.test(kelas)) return 2;
  if (/\bI\b/i.test(kelas)) return 1;
  return null;
}

export function getJenjangFromTingkat(tingkat: number): Jenjang {
  if (tingkat <= 6) return 'SD';
  if (tingkat <= 9) return 'SMP';
  return 'SMA';
}

export function getClassJenjang(kelas: string, classDefs?: ClassDef[]): Jenjang {
  const found = classDefs?.find((c) => c.nama === kelas);
  if (found) return found.jenjang;
  const tingkat = getClassTingkat(kelas, classDefs) ?? 7;
  return getJenjangFromTingkat(tingkat);
}

export function getFaseFromTingkat(tingkat: number): string {
  if (tingkat <= 2) return 'Fase A';
  if (tingkat <= 4) return 'Fase B';
  if (tingkat <= 6) return 'Fase C';
  if (tingkat <= 9) return 'Fase D';
  if (tingkat === 10) return 'Fase E';
  return 'Fase F';
}

export function getTingkatOptionsForJenjang(jenjang: Jenjang): number[] {
  if (jenjang === 'SD') return [1, 2, 3, 4, 5, 6];
  if (jenjang === 'SMP') return [7, 8, 9];
  return [10, 11, 12];
}

/**
 * Returns the list of CPs for a subject matching a given class or tingkat.
 * Supports per-class and per-tingkat CP customization, with graceful fallback to flat CP/TPs.
 */
export function getSubjectCPsForClass(
  subject: Subject,
  kelas?: string,
  classDefs?: ClassDef[]
): CapaianPembelajaran[] {
  const cps = Array.isArray(subject.cps) ? subject.cps : [];
  if (cps.length === 0) {
    if (subject.capaianPembelajaran || (subject.tps && subject.tps.length > 0)) {
      return [
        {
          id: `${subject.id}-cp-default`,
          kode: 'CP 1',
          deskripsi: subject.capaianPembelajaran || `Capaian pembelajaran ${subject.nama}`,
          tingkatList: subject.tingkatList || [],
          kelasList: subject.kelasList || [],
          tps: subject.tps || [],
        },
      ];
    }
    return [];
  }

  if (!kelas) return cps;
  const tingkat = getClassTingkat(kelas, classDefs);

  const matched = cps.filter((cp) => {
    const hasKelas = Array.isArray(cp.kelasList) && cp.kelasList.length > 0;
    const hasTingkat = Array.isArray(cp.tingkatList) && cp.tingkatList.length > 0;
    if (hasKelas && cp.kelasList!.includes(kelas)) return true;
    if (hasTingkat && tingkat !== null && cp.tingkatList!.includes(tingkat)) return true;
    if (!hasKelas && !hasTingkat) return true;
    return false;
  });

  return matched;
}

/**
 * Flattens all TPs belonging to the matched CPs for a class.
 */
export function getSubjectTPsForClass(
  subject: Subject,
  kelas?: string,
  classDefs?: ClassDef[]
): TujuanPembelajaran[] {
  const matchedCps = getSubjectCPsForClass(subject, kelas, classDefs);
  if (matchedCps.length > 0) {
    const tps = matchedCps.flatMap((cp) => cp.tps || []);
    if (tps.length > 0) return tps;
  }
  return Array.isArray(subject.tps) ? subject.tps : [];
}

/**
 * Syncs subject.tps and subject.capaianPembelajaran from subject.cps so legacy helpers stay consistent.
 */
export function syncSubjectFromCPs(subject: Subject): Subject {
  const cps = Array.isArray(subject.cps) ? subject.cps : [];
  const allTps = cps.flatMap((cp) => cp.tps || []);
  const primaryCpText = cps[0]?.deskripsi || subject.capaianPembelajaran || '';
  return {
    ...subject,
    cps,
    tps: allTps.length > 0 ? allTps : subject.tps || [],
    capaianPembelajaran: primaryCpText,
  };
}

export function getSubjectsForClass(
  subjects: Subject[],
  kelas: string,
  classDefs?: ClassDef[],
  jurusan?: string
): Subject[] {
  const tingkat = getClassTingkat(kelas, classDefs);
  return [...subjects]
    .filter((s) => {
      if (s.aktif === false) return false;
      const inKelas = Array.isArray(s.kelasList) && s.kelasList.length > 0 && s.kelasList.includes(kelas);
      const inTingkat =
        tingkat !== null && Array.isArray(s.tingkatList) && s.tingkatList.length > 0 && s.tingkatList.includes(tingkat);
      const isGlobal =
        (!s.kelasList || s.kelasList.length === 0) && (!s.tingkatList || s.tingkatList.length === 0);
      if (!inKelas && !inTingkat && !isGlobal) return false;

      if (
        tingkat !== null &&
        tingkat >= 11 &&
        jurusan &&
        jurusan !== 'ALL' &&
        Array.isArray(s.jurusanList) &&
        s.jurusanList.length > 0
      ) {
        return s.jurusanList.includes(jurusan);
      }
      return true;
    })
    .sort((a, b) =>
      a.kelompok === b.kelompok ? a.urutan - b.urutan : a.kelompok.localeCompare(b.kelompok)
    );
}

/**
 * Checks whether a user (admin/walikelas/guru) is assigned to a given class.
 */
export function isUserAssignedToClass(
  user: UserAccount | null | undefined,
  kelas: string
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'walikelas') {
    if (user.waliKelasTarget === kelas) return true;
    return (user.teachingAssignments || []).some((a) => a.kelas === kelas && a.subjectIds.length > 0);
  }
  if (user.role === 'guru') {
    return (user.teachingAssignments || []).some((a) => a.kelas === kelas && a.subjectIds.length > 0);
  }
  return false;
}

export function getAccessibleClassesForUser(
  orderedClasses: string[],
  user: UserAccount | null | undefined
): string[] {
  if (!user) return [];
  if (user.role === 'admin') return orderedClasses;
  if (user.role === 'ortu') return [];
  const allowed = new Set<string>();
  if (user.role === 'walikelas' && user.waliKelasTarget) {
    allowed.add(user.waliKelasTarget);
  }
  (user.teachingAssignments || []).forEach((a) => {
    if (a.kelas && a.subjectIds.length > 0) allowed.add(a.kelas);
  });
  return orderedClasses.filter((c) => allowed.has(c));
}

/**
 * Enforces Improvement #4 & Requirement #8:
 * Both guru and walikelas are strictly scoped to their teachingAssignments when accessing/inputting subjects & grades.
 */
export function isTeacherSubjectRestricted(user: UserAccount | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'guru' || user.role === 'walikelas';
}

export function getAllowedSubjectIdsForUser(
  user: UserAccount | null | undefined,
  kelas?: string,
  options?: { includeWaliClassView?: boolean }
): Set<string> | null {
  if (!user) return null;
  if (user.role === 'admin') return null;

  if (user.role === 'walikelas') {
    if (options?.includeWaliClassView && kelas && user.waliKelasTarget === kelas) {
      return null;
    }
    const ids = new Set<string>();
    (user.teachingAssignments || [])
      .filter((a) => !kelas || a.kelas === kelas)
      .forEach((a) => a.subjectIds.forEach((id) => ids.add(id)));
    return ids;
  }

  if (user.role === 'guru') {
    const ids = new Set<string>();
    (user.teachingAssignments || [])
      .filter((a) => !kelas || a.kelas === kelas)
      .forEach((a) => a.subjectIds.forEach((id) => ids.add(id)));
    return ids;
  }

  return new Set<string>();
}

export function filterSubjectsForUser(
  subjects: Subject[],
  user: UserAccount | null | undefined,
  kelas?: string,
  options?: { includeWaliClassView?: boolean }
): Subject[] {
  const allowedIds = getAllowedSubjectIdsForUser(user, kelas, options);
  if (!allowedIds) return subjects;
  return subjects.filter((s) => allowedIds.has(s.id));
}

/**
 * Multi-Year Activation & Teacher/Wali Kelas Lock Status
 */
export function isInputLockedForUser(
  settings: SchoolSettings,
  academicYears: AcademicYearRecord[] | undefined,
  user: UserAccount | null | undefined
): { locked: boolean; reason: string } {
  if (!user || user.role === 'admin') {
    return { locked: false, reason: '' };
  }
  const activeYearRec = (academicYears || []).find(
    (y) => y.tahunAjaran === settings.tahunAjaran && y.semester === settings.semester
  ) || (academicYears || []).find((y) => y.tahunAjaran === settings.tahunAjaran);

  const isYearActive =
    settings.tahunAjaranAktif !== false && (activeYearRec ? activeYearRec.aktif : true);
  if (!isYearActive) {
    return {
      locked: true,
      reason: `Tahun Ajaran ${settings.tahunAjaran} berstatus Nonaktif oleh Pengurus PKBM.`,
    };
  }
  const guruLocked = Boolean(settings.lockedForGuru || activeYearRec?.lockedForGuru);
  const waliLocked = Boolean(settings.lockedForWaliKelas || activeYearRec?.lockedForWaliKelas);

  if (user.role === 'guru' && guruLocked) {
    return {
      locked: true,
      reason: 'Pengisian nilai & CP/TP untuk Guru sedang dikunci oleh Pengurus PKBM.',
    };
  }
  if (user.role === 'walikelas' && waliLocked) {
    return {
      locked: true,
      reason: 'Pengisian rapor, Profil Lulusan, Ekskul & BK Wali Kelas sedang dikunci oleh Pengurus PKBM.',
    };
  }
  return { locked: false, reason: '' };
}

export interface CalculatedGrade {
  tugas: number | null;
  kuis: number | null;
  ujian: number | null;
  rataKomponen: number | null;
  rataLM: number | null;
  sts: number | null;
  sas: number | null;
  nilaiAkhir: number | null;
  nilaiStsOnly: number | null;
  predikat: string;
  tuntas: boolean | null;
  autoDeskripsi: string;
  deskripsiFinal: string;
  isManualNilai: boolean;
  isManualDeskripsi: boolean;
  filledCount: number;
}

export function calculateStudentSubjectGrade(
  entry: GradeEntry | undefined,
  subject: Subject,
  settings: SchoolSettings,
  kelas?: string,
  classDefs?: ClassDef[]
): CalculatedGrade {
  const tugas = typeof entry?.tugas === 'number' && !Number.isNaN(entry.tugas) ? entry.tugas : null;
  const kuis = typeof entry?.kuis === 'number' && !Number.isNaN(entry.kuis) ? entry.kuis : null;
  const ujian = typeof entry?.ujian === 'number' && !Number.isNaN(entry.ujian) ? entry.ujian : null;

  const activeTps = getSubjectTPsForClass(subject, kelas, classDefs);

  const tpList: Array<{ id: string; kode: string; deskripsi: string; score: number }> = [];
  for (const tp of activeTps) {
    const score = entry?.tpScores?.[tp.id];
    if (typeof score === 'number' && !Number.isNaN(score)) {
      tpList.push({
        id: tp.id,
        kode: tp.kode,
        deskripsi: tp.deskripsi,
        score: Math.max(0, Math.min(100, score)),
      });
    }
  }

  const rataLM =
    tpList.length > 0
      ? Math.round((tpList.reduce((acc, item) => acc + item.score, 0) / tpList.length) * 10) / 10
      : null;

  const sts = typeof entry?.sts === 'number' && !Number.isNaN(entry.sts) ? entry.sts : null;
  const sas = typeof entry?.sas === 'number' && !Number.isNaN(entry.sas) ? entry.sas : null;

  const compVals = [tugas, kuis, ujian].filter((v): v is number => v !== null);
  const rataKomponen =
    compVals.length > 0
      ? Math.round((compVals.reduce((acc, v) => acc + v, 0) / compVals.length) * 10) / 10
      : null;

  let computedFinal: number | null = null;
  if (compVals.length > 0) {
    if (settings.calculationMode === 'average') {
      computedFinal = Math.round(compVals.reduce((acc, v) => acc + v, 0) / compVals.length);
    } else {
      const { tugas: bt, kuis: bk, ujian: bu } = settings.bobot;
      let sum = 0;
      let weightSum = 0;
      if (tugas !== null && bt > 0) {
        sum += tugas * bt;
        weightSum += bt;
      }
      if (kuis !== null && bk > 0) {
        sum += kuis * bk;
        weightSum += bk;
      }
      if (ujian !== null && bu > 0) {
        sum += ujian * bu;
        weightSum += bu;
      }
      computedFinal = Math.round(weightSum > 0 ? sum / weightSum : (rataKomponen ?? 0));
    }
  } else if (rataLM !== null || sts !== null || sas !== null) {
    const fallbackVals = [rataLM, sts, sas].filter((v): v is number => v !== null);
    computedFinal =
      fallbackVals.length > 0
        ? Math.round(fallbackVals.reduce((acc, v) => acc + v, 0) / fallbackVals.length)
        : null;
  }

  const isManualNilai =
    typeof entry?.manualNilaiAkhir === 'number' && !Number.isNaN(entry.manualNilaiAkhir);
  const nilaiAkhir = isManualNilai ? Math.round(entry!.manualNilaiAkhir!) : computedFinal;

  const stsCompVals = [tugas, kuis, sts].filter((v): v is number => v !== null);
  const nilaiStsOnly =
    stsCompVals.length > 0
      ? Math.round(stsCompVals.reduce((acc, v) => acc + v, 0) / stsCompVals.length)
      : nilaiAkhir;

  let autoDeskripsi = '';
  if (tpList.length > 0) {
    const sorted = [...tpList].sort((a, b) => b.score - a.score);
    const highest = sorted[0];
    const second = sorted.length > 1 && sorted[1].score >= settings.kktp ? sorted[1] : null;
    const lowest = sorted[sorted.length - 1];

    const parts: string[] = [];
    if (highest.score >= 90) {
      parts.push(`Menunjukkan penguasaan yang sangat baik dalam ${lcFirstSentence(highest.deskripsi)}`);
    } else if (highest.score >= settings.kktp) {
      parts.push(`Menunjukkan penguasaan yang baik dalam ${lcFirstSentence(highest.deskripsi)}`);
    } else {
      parts.push(`Mulai menunjukkan perkembangan dalam ${lcFirstSentence(highest.deskripsi)}`);
    }

    if (second && second.id !== highest.id && second.score >= 85) {
      parts[0] += ` serta mampu ${lcFirstSentence(second.deskripsi)}`;
    }
    parts[0] += '.';

    if (sorted.length > 1 && lowest.id !== highest.id) {
      if (lowest.score < settings.kktp) {
        parts.push(
          `Perlu pendampingan dan penguatan lebih lanjut dalam ${lcFirstSentence(lowest.deskripsi)}.`
        );
      } else if (highest.score - lowest.score >= 8 || lowest.score < 82) {
        parts.push(
          `Dapat ditingkatkan lagi ketelitian dan pendalamannya pada materi ${lcFirstSentence(lowest.deskripsi)}.`
        );
      }
    }
    autoDeskripsi = parts.join(' ');
  } else if (nilaiAkhir !== null) {
    const tp0 = activeTps[0]?.deskripsi
      ? lcFirstSentence(activeTps[0].deskripsi)
      : `kompetensi inti mata pelajaran ${subject.nama}`;
    const tp1 = activeTps[1]?.deskripsi ? lcFirstSentence(activeTps[1].deskripsi) : '';
    if (nilaiAkhir >= 90) {
      autoDeskripsi = `Menunjukkan penguasaan yang sangat baik dalam ${tp0}${tp1 ? ` serta konsisten dalam ${tp1}` : ''}.`;
    } else if (nilaiAkhir >= settings.kktp) {
      autoDeskripsi = `Menunjukkan penguasaan yang baik dalam ${tp0} sesuai tujuan pembelajaran yang ditetapkan.`;
    } else {
      autoDeskripsi = `Perlu bimbingan dan pendampingan bertahap dalam ${tp0} agar mencapai ketuntasan belajar minimal.`;
    }
  }

  const isManualDeskripsi = Boolean(entry?.manualDeskripsi && entry.manualDeskripsi.trim().length > 0);
  const deskripsiFinal = isManualDeskripsi ? entry!.manualDeskripsi!.trim() : autoDeskripsi;
  const predikat = getPredikat(nilaiAkhir, settings.kktp);
  const tuntas = nilaiAkhir === null ? null : nilaiAkhir >= settings.kktp;
  const filledCount =
    compVals.length + tpList.length + (sts === null ? 0 : 1) + (sas === null ? 0 : 1);

  return {
    tugas,
    kuis,
    ujian,
    rataKomponen,
    rataLM,
    sts,
    sas,
    nilaiAkhir,
    nilaiStsOnly,
    predikat,
    tuntas,
    autoDeskripsi,
    deskripsiFinal,
    isManualNilai,
    isManualDeskripsi,
    filledCount,
  };
}

export function calculateSubjectClassStats(
  students: Student[],
  subject: Subject,
  grades: Record<string, GradeEntry>,
  settings: SchoolSettings,
  classDefs?: ClassDef[]
) {
  const semester = settings.semester;
  const tList: number[] = [];
  const kList: number[] = [];
  const uList: number[] = [];
  const finalList: number[] = [];
  let tuntasCount = 0;

  for (const stu of students) {
    const entry = grades[gradeKey(stu.id, subject.id, semester)];
    const calc = calculateStudentSubjectGrade(entry, subject, settings, stu.kelas, classDefs);
    if (calc.tugas !== null) tList.push(calc.tugas);
    if (calc.kuis !== null) kList.push(calc.kuis);
    if (calc.ujian !== null) uList.push(calc.ujian);
    if (calc.nilaiAkhir !== null) {
      finalList.push(calc.nilaiAkhir);
      if (calc.tuntas) tuntasCount += 1;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;

  return {
    avgTugas: avg(tList),
    avgKuis: avg(kList),
    avgUjian: avg(uList),
    avgSubjectClass: avg(finalList),
    filledStudents: finalList.length,
    tuntasCount,
  };
}

export interface LegerRow {
  student: Student;
  scoresBySubject: Record<string, number | null>;
  totalNilai: number;
  rataRata: number;
  jumlahMapelTerisi: number;
  peringkat: number;
  tuntasSemua: boolean;
}

export function calculateClassLeger(
  students: Student[],
  subjects: Subject[],
  grades: Record<string, GradeEntry>,
  settings: SchoolSettings,
  semester: '1' | '2',
  kelas: string,
  mode: 'SAS' | 'STS' = 'SAS',
  classDefs?: ClassDef[],
  jurusanFilter: string = 'ALL'
): LegerRow[] {
  const classStudents = students
    .filter((s) => s.kelas === kelas && s.status === 'Aktif')
    .filter((s) => jurusanFilter === 'ALL' || s.jurusan === jurusanFilter)
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const classSubjects = getSubjectsForClass(subjects, kelas, classDefs, jurusanFilter);

  const rows: LegerRow[] = classStudents.map((stu) => {
    const stuSubjs = getSubjectsForClass(subjects, kelas, classDefs, stu.jurusan || 'Umum');
    const stuSubjIds = new Set(stuSubjs.map((s) => s.id));
    const scoresBySubject: Record<string, number | null> = {};
    let totalNilai = 0;
    let jumlahMapelTerisi = 0;
    let allTuntas = true;

    for (const subj of classSubjects) {
      if (!stuSubjIds.has(subj.id)) {
        scoresBySubject[subj.id] = null;
        continue;
      }
      const entry = grades[gradeKey(stu.id, subj.id, semester)];
      const calc = calculateStudentSubjectGrade(entry, subj, settings, stu.kelas, classDefs);
      const score = mode === 'STS' ? calc.nilaiStsOnly : calc.nilaiAkhir;
      scoresBySubject[subj.id] = score;
      if (score !== null) {
        totalNilai += score;
        jumlahMapelTerisi += 1;
        if (score < settings.kktp) allTuntas = false;
      }
    }

    const rataRata =
      jumlahMapelTerisi > 0 ? Math.round((totalNilai / jumlahMapelTerisi) * 100) / 100 : 0;

    return {
      student: stu,
      scoresBySubject,
      totalNilai,
      rataRata,
      jumlahMapelTerisi,
      peringkat: 0,
      tuntasSemua: jumlahMapelTerisi > 0 && allTuntas,
    };
  });

  const sortedForRank = [...rows].sort((a, b) =>
    b.rataRata === a.rataRata ? b.totalNilai - a.totalNilai : b.rataRata - a.rataRata
  );
  let currentRank = 1;
  sortedForRank.forEach((row, idx) => {
    if (
      idx > 0 &&
      row.rataRata === sortedForRank[idx - 1].rataRata &&
      row.totalNilai === sortedForRank[idx - 1].totalNilai
    ) {
      row.peringkat = sortedForRank[idx - 1].peringkat;
    } else {
      row.peringkat = currentRank;
    }
    currentRank += 1;
  });

  return rows.map((row) => {
    const ranked = sortedForRank.find((r) => r.student.id === row.student.id);
    return { ...row, peringkat: ranked ? ranked.peringkat : 0 };
  });
}

export function formatTanggalID(dateStr?: string): string {
  if (!dateStr) return '-';
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11 || Number.isNaN(day)) return dateStr;
  return `${day} ${months[monthIdx]} ${year}`;
}

export function generateNIS(
  kelas: string,
  students: Student[],
  tahunAjaran: string,
  classDefs?: ClassDef[]
): string {
  const yearMatch = tahunAjaran.match(/\d{4}/);
  const yearPrefix = yearMatch ? yearMatch[0].slice(-2) : '26';
  const tingkat = getClassTingkat(kelas, classDefs) ?? 7;
  const base = `${yearPrefix}${String(tingkat).padStart(2, '0')}`;
  const existing = new Set(students.map((s) => s.nis));
  let seq = 1;
  while (existing.has(`${base}${String(seq).padStart(3, '0')}`)) {
    seq += 1;
  }
  return `${base}${String(seq).padStart(3, '0')}`;
}

export function computeValidationCode(
  student: Student,
  state: Pick<AppState, 'settings' | 'subjects' | 'grades' | 'classDefs'>,
  docType: 'SAS' | 'STS'
): string {
  const { settings, subjects, grades, classDefs } = state;
  const semester = settings.semester;
  const scoreSignature = getSubjectsForClass(subjects, student.kelas, classDefs, student.jurusan || 'Umum')
    .map((subj) => {
      const entry = grades[gradeKey(student.id, subj.id, semester)];
      const calc = calculateStudentSubjectGrade(entry, subj, settings, student.kelas, classDefs);
      const val = docType === 'STS' ? calc.nilaiStsOnly : calc.nilaiAkhir;
      return `${subj.kode}:${val ?? 'X'}`;
    })
    .join('|');

  const raw = `${settings.npsn}|${settings.tahunAjaran}|S${semester}|${docType}|${student.nis}|${student.nama}|${scoreSignature}`;
  let h1 = 2166136261;
  let h2 = 2654435769;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 2246822507);
  }
  const hex = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'))
    .slice(0, 8)
    .toUpperCase();
  const yr = (settings.tahunAjaran.match(/\d{4}/)?.[0] || '2026').slice(-2);
  return `VLD-${yr}S${semester}-${student.nis || '000'}-${hex}`;
}

export function verifyValidationCode(code: string, state: AppState) {
  const clean = code.trim().toUpperCase();
  if (!clean) return { valid: false, code: clean };

  for (const stu of state.students) {
    for (const docType of ['SAS', 'STS'] as const) {
      const expected = computeValidationCode(stu, state, docType);
      if (expected.toUpperCase() === clean) {
        const scores = getSubjectsForClass(
          state.subjects,
          stu.kelas,
          state.classDefs,
          stu.jurusan || 'Umum'
        )
          .map((subj) => {
            const entry = state.grades[gradeKey(stu.id, subj.id, state.settings.semester)];
            const calc = calculateStudentSubjectGrade(
              entry,
              subj,
              state.settings,
              stu.kelas,
              state.classDefs
            );
            return docType === 'STS' ? calc.nilaiStsOnly : calc.nilaiAkhir;
          })
          .filter((v): v is number => v !== null);

        const averageScore =
          scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
            : 0;
        return {
          valid: true,
          student: stu,
          docType,
          averageScore,
          code: expected,
        };
      }
    }
  }
  return { valid: false, code: clean };
}

export function resizeImageToDataUrl(
  file: File,
  maxWidth = 420,
  maxHeight = 420,
  preservePng = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia'));
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const mime = preservePng || file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mime, 0.88));
      };
      img.onerror = () => reject(new Error('File gambar tidak valid'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.readAsDataURL(file);
  });
}

export function collectTeacherSubjectNotes(
  student: Student,
  subjects: Subject[],
  grades: Record<string, GradeEntry>,
  semester: '1' | '2',
  classDefs?: ClassDef[]
) {
  const list = getSubjectsForClass(subjects, student.kelas, classDefs, student.jurusan || 'Umum');
  const notes: Array<{
    subjectId: string;
    subjectName: string;
    guruPengampu: string;
    catatan: string;
  }> = [];

  for (const subj of list) {
    const note = grades[gradeKey(student.id, subj.id, semester)]?.catatanGuru?.trim();
    if (note) {
      notes.push({
        subjectId: subj.id,
        subjectName: subj.nama,
        guruPengampu: subj.guruPengampu || 'Guru Mapel',
        catatan: note,
      });
    }
  }
  return notes;
}

export function mergeTeacherNotesIntoWaliNote(
  waliNote: string,
  teacherNotes: Array<{ subjectName: string; guruPengampu: string; catatan: string }>
): string {
  const marker = 'Catatan Guru Mata Pelajaran:';
  const base = waliNote.includes(marker) ? waliNote.split(marker)[0].trim() : waliNote.trim();
  if (teacherNotes.length === 0) return base;
  const block = `${marker}\n${teacherNotes
    .map((n) => `- ${n.subjectName} (${n.guruPengampu}): ${n.catatan}`)
    .join('\n')}`;
  return base ? `${base}\n\n${block}` : block;
}

export function validatePortfolioUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function buildStudentCardVerifyUrl(studentId: string, schoolId?: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://sim-rapor.local';
  const base = `${origin}/?verifyCard=${encodeURIComponent(studentId)}`;
  return schoolId ? `${base}&schoolId=${encodeURIComponent(schoolId)}` : base;
}

export function formatRupiah(amount: number): string {
  const num = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

export interface DescriptiveStatsResult {
  count: number;
  mean: number;
  median: number;
  mode: number | null;
  min: number;
  max: number;
  range: number;
  variance: number;
  stdDev: number;
  q1: number;
  q3: number;
  iqr: number;
  histogram: Array<{ bucket: string; count: number; pct: number }>;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function computeDescriptiveStats(values: number[]): DescriptiveStatsResult {
  const valid = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  const count = valid.length;
  if (count === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      mode: null,
      min: 0,
      max: 0,
      range: 0,
      variance: 0,
      stdDev: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      histogram: [
        { bucket: '<60', count: 0, pct: 0 },
        { bucket: '60–69', count: 0, pct: 0 },
        { bucket: '70–79', count: 0, pct: 0 },
        { bucket: '80–89', count: 0, pct: 0 },
        { bucket: '90–100', count: 0, pct: 0 },
      ],
    };
  }
  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);

  const freq = new Map<number, number>();
  let modeVal: number | null = sorted[0];
  let bestFreq = 0;
  sorted.forEach((v) => {
    const rounded = Math.round(v);
    const f = (freq.get(rounded) || 0) + 1;
    freq.set(rounded, f);
    if (f > bestFreq) {
      bestFreq = f;
      modeVal = rounded;
    }
  });
  if (bestFreq <= 1) modeVal = null;

  const variance = valid.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);
  const min = sorted[0];
  const max = sorted[count - 1];

  const buckets = [
    { bucket: '<60', test: (v: number) => v < 60 },
    { bucket: '60–69', test: (v: number) => v >= 60 && v < 70 },
    { bucket: '70–79', test: (v: number) => v >= 70 && v < 80 },
    { bucket: '80–89', test: (v: number) => v >= 80 && v < 90 },
    { bucket: '90–100', test: (v: number) => v >= 90 },
  ];
  const histogram = buckets.map((b) => {
    const c = valid.filter(b.test).length;
    return {
      bucket: b.bucket,
      count: c,
      pct: Math.round((c / count) * 1000) / 10,
    };
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    count,
    mean: round2(mean),
    median: round2(median),
    mode: modeVal,
    min: round2(min),
    max: round2(max),
    range: round2(max - min),
    variance: round2(variance),
    stdDev: round2(stdDev),
    q1: round2(q1),
    q3: round2(q3),
    iqr: round2(q3 - q1),
    histogram,
  };
}

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const xMean = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const yMean = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return Math.round((num / den) * 1000) / 1000;
}
