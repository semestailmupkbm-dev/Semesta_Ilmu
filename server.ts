import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import { createDefaultState, normalizeClassDef } from './src/data/seed';
import {
  evaluateDiagnosticSubmission,
  evaluateSurveyResponse,
  evaluateTendikSubmission,
  TENDIK_COMPETENCIES,
} from './src/data/templates';
import {
  formatNomorSurat,
  getLetterTemplateById,
  getNextLetterSequence,
} from './src/data/letterTemplates';
import {
  AppState,
  DiagnosticAnswer,
  DiagnosticCategory,
  DiagnosticPackage,
  DiagnosticQuestion,
  DiagnosticQuestionType,
  DiagnosticSubmission,
  LetterStatus,
  LmsAssignment,
  LmsDiscussion,
  LmsMaterial,
  LmsSubmission,
  LogbookEntry,
  ParentFeedback,
  ProcurementKategori,
  ProcurementRequest,
  ProcurementStatus,
  SchoolLetter,
  SchoolTenant,
  StudentEditEditableFields,
  StudentEditRequest,
  Subject,
  SurveyPackage,
  SurveyQuestion,
  SurveyResponse,
  TeachingAssignment,
  TendikCompetency,
  TendikQuestion,
  TendikSubmission,
  TendikTrainingPackage,
  TendikVideoReflectionSegment,
  TutoringRecommendation,
  TutoringRequest,
  TutoringRequestStatus,
  UserAccount,
  UserRole,
} from './src/types';
import {
  getSubjectsForClass,
  isInputLockedForUser,
  isUserAssignedToClass,
  syncSubjectFromCPs,
  verifyValidationCode,
} from './src/utils/academic';

interface StoredUser extends UserAccount {
  passwordHash: string;
  passwordSalt: string;
}

interface StoreFile {
  schools: SchoolTenant[];
  users: StoredUser[];
  states: Record<string, AppState>;
  sessionSecret?: string;
  gasDbUrl?: string;
  spreadsheetUrl?: string;
  lastSpreadsheetSyncAt?: string;
  updatedAt?: string;
}

const DEFAULT_SCHOOL_ID = 'sch-utama';
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const UPLOADS_TENDIK_DIR = path.join(DATA_DIR, 'uploads', 'tendik');

// Session signing secret from env, persisted store, or secure per-process fallback
const FALLBACK_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
function getSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || store.sessionSecret || FALLBACK_SESSION_SECRET;
}

function ensureStoreDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash: derived, salt: usedSalt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function sanitizeUser(u: StoredUser, schoolMap?: Map<string, SchoolTenant>): UserAccount {
  const sch = schoolMap?.get(u.schoolId);
  return {
    id: u.id,
    schoolId: u.schoolId,
    schoolName: sch?.nama || u.schoolName,
    username: u.username,
    nama: u.nama,
    nip: u.nip || '',
    role: u.role,
    aktif: u.aktif,
    verified: u.verified ?? u.aktif,
    verificationNote: u.verificationNote || '',
    waliKelasTarget: u.waliKelasTarget,
    teachingAssignments: Array.isArray(u.teachingAssignments) ? u.teachingAssignments : [],
    linkedStudentIds: Array.isArray(u.linkedStudentIds) ? u.linkedStudentIds : [],
    createdAt: u.createdAt,
  };
}

function normalizeAppState(raw: AppState, schoolId: string): AppState {
  const base = createDefaultState({ schoolId });
  const classDefs =
    Array.isArray(raw.classDefs) && raw.classDefs.length > 0
      ? raw.classDefs.map((c, idx) => normalizeClassDef(c, idx))
      : base.classDefs;

  const sortedClassDefs = [...classDefs].sort((a, b) => a.urutan - b.urutan);
  const classes =
    sortedClassDefs.length > 0
      ? sortedClassDefs.map((c) => c.nama)
      : Array.isArray(raw.classes) && raw.classes.length > 0
        ? raw.classes
        : base.classes;

  const subjects: Subject[] = (Array.isArray(raw.subjects) ? raw.subjects : base.subjects).map(
    (s) => {
      if (Array.isArray(s.cps) && s.cps.length > 0) {
        return syncSubjectFromCPs(s);
      }
      return syncSubjectFromCPs({
        ...s,
        cps: [
          {
            id: `${s.id}-cp-1`,
            kode: 'CP 1',
            deskripsi: s.capaianPembelajaran || `Capaian Pembelajaran ${s.nama}`,
            tingkatList: s.tingkatList || [],
            kelasList: s.kelasList || [],
            tps: Array.isArray(s.tps) ? s.tps : [],
          },
        ],
      });
    }
  );

  return {
    ...base,
    ...raw,
    schoolId,
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      tahunAjaranAktif: raw.settings?.tahunAjaranAktif ?? true,
      lockedForGuru: raw.settings?.lockedForGuru ?? false,
      lockedForWaliKelas: raw.settings?.lockedForWaliKelas ?? false,
      bobot: {
        ...base.settings.bobot,
        ...(raw.settings?.bobot || {}),
      },
      waliKelasMap: {
        ...base.settings.waliKelasMap,
        ...(raw.settings?.waliKelasMap || {}),
      },
    },
    academicYears:
      Array.isArray(raw.academicYears) && raw.academicYears.length > 0
        ? raw.academicYears
        : base.academicYears,
    classDefs: sortedClassDefs,
    classes,
    subjects,
    students: Array.isArray(raw.students) ? raw.students : base.students,
    grades: raw.grades || {},
    p5Projects: Array.isArray(raw.p5Projects) ? raw.p5Projects : [],
    reportMeta: raw.reportMeta || {},
    counselingNotes: Array.isArray(raw.counselingNotes) ? raw.counselingNotes : [],
    mutations: Array.isArray(raw.mutations) ? raw.mutations : [],
    archives: Array.isArray(raw.archives) ? raw.archives : [],
    logbookEntries: Array.isArray(raw.logbookEntries) ? raw.logbookEntries : [],
    parentFeedbacks: Array.isArray(raw.parentFeedbacks) ? raw.parentFeedbacks : [],
    tutoringRecommendations: Array.isArray(raw.tutoringRecommendations)
      ? raw.tutoringRecommendations
      : [],
    tutoringRequests: Array.isArray(raw.tutoringRequests) ? raw.tutoringRequests : [],
    procurementRequests: Array.isArray(raw.procurementRequests) ? raw.procurementRequests : [],
    diagnosticPackages: Array.isArray(raw.diagnosticPackages)
      ? raw.diagnosticPackages
      : base.diagnosticPackages,
    diagnosticSubmissions: Array.isArray(raw.diagnosticSubmissions)
      ? raw.diagnosticSubmissions
      : [],
    lmsMaterials: Array.isArray(raw.lmsMaterials) ? raw.lmsMaterials : [],
    lmsAssignments: Array.isArray(raw.lmsAssignments) ? raw.lmsAssignments : [],
    lmsSubmissions: Array.isArray(raw.lmsSubmissions) ? raw.lmsSubmissions : [],
    lmsDiscussions: Array.isArray(raw.lmsDiscussions) ? raw.lmsDiscussions : [],
    tendikPackages: Array.isArray(raw.tendikPackages) ? raw.tendikPackages : base.tendikPackages,
    tendikSubmissions: Array.isArray(raw.tendikSubmissions) ? raw.tendikSubmissions : [],
    surveyPackages: Array.isArray(raw.surveyPackages) ? raw.surveyPackages : base.surveyPackages,
    surveyResponses: Array.isArray(raw.surveyResponses) ? raw.surveyResponses : [],
    studentEditRequests: Array.isArray(raw.studentEditRequests) ? raw.studentEditRequests : [],
    letters: Array.isArray(raw.letters) ? raw.letters : [],
  };
}

function createInitialStore(): StoreFile {
  const defaultState = createDefaultState({ schoolId: DEFAULT_SCHOOL_ID });
  const defaultSchool: SchoolTenant = {
    id: DEFAULT_SCHOOL_ID,
    kodeSekolah: 'PKBM-01',
    nama: defaultState.settings.namaSekolah,
    npsn: defaultState.settings.npsn,
    jenisLembaga: defaultState.settings.jenisLembaga,
    aktif: true,
    createdAt: new Date().toISOString(),
  };
  return {
    schools: [defaultSchool],
    users: [],
    states: {
      [DEFAULT_SCHOOL_ID]: defaultState,
    },
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    gasDbUrl: process.env.GAS_DB_URL?.trim() || '',
    updatedAt: new Date().toISOString(),
  };
}

function loadStore(): StoreFile {
  ensureStoreDir();
  if (!fs.existsSync(STORE_PATH)) {
    const initial = createInitialStore();
    saveStore(initial);
    return initial;
  }
  try {
    const content = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(content) as Partial<StoreFile> & { state?: AppState };

    // Handle migration from legacy single-school store format if present
    if (!parsed.schools || !parsed.states) {
      const legacyState = normalizeAppState(
        parsed.state || createDefaultState({ schoolId: DEFAULT_SCHOOL_ID }),
        DEFAULT_SCHOOL_ID
      );
      const migrated: StoreFile = {
        schools: [
          {
            id: DEFAULT_SCHOOL_ID,
            kodeSekolah: 'PKBM-01',
            nama: legacyState.settings.namaSekolah,
            npsn: legacyState.settings.npsn,
            jenisLembaga: legacyState.settings.jenisLembaga,
            aktif: true,
            createdAt: new Date().toISOString(),
          },
        ],
        users: (Array.isArray(parsed.users) ? parsed.users : []).map((u) => ({
          ...u,
          schoolId: u.schoolId || DEFAULT_SCHOOL_ID,
        })),
        states: {
          [DEFAULT_SCHOOL_ID]: legacyState,
        },
      };
      saveStore(migrated);
      return migrated;
    }

    const schools: SchoolTenant[] =
      Array.isArray(parsed.schools) && parsed.schools.length > 0
        ? parsed.schools
        : createInitialStore().schools;

    const states: Record<string, AppState> = {};
    for (const sch of schools) {
      const rawSt = parsed.states[sch.id];
      states[sch.id] = rawSt
        ? normalizeAppState(rawSt, sch.id)
        : createDefaultState({
            schoolId: sch.id,
            namaSekolah: sch.nama,
            npsn: sch.npsn,
            jenisLembaga: sch.jenisLembaga,
            emptyStudents: sch.id !== DEFAULT_SCHOOL_ID,
          });
    }

    const users: StoredUser[] = (Array.isArray(parsed.users) ? parsed.users : []).map((u) => ({
      ...u,
      schoolId: u.schoolId || schools[0].id,
    }));

    return {
      schools,
      users,
      states,
      sessionSecret: parsed.sessionSecret || crypto.randomBytes(32).toString('hex'),
      gasDbUrl: parsed.gasDbUrl || '',
      spreadsheetUrl: parsed.spreadsheetUrl || '',
      lastSpreadsheetSyncAt: parsed.lastSpreadsheetSyncAt || '',
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return createInitialStore();
  }
}

let gasSyncTimer: NodeJS.Timeout | null = null;
let gasSyncChain: Promise<void> = Promise.resolve();
let lastSpreadsheetSyncError = '';

function writeStoreToDiskOnly(targetStore: StoreFile) {
  ensureStoreDir();
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(targetStore, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function getActiveGasDbUrl(): URL | null {
  const envUrl = process.env.GAS_DB_URL?.trim();
  if (envUrl) {
    const parsedEnv = validateGasUrl(envUrl);
    if (parsedEnv) return parsedEnv;
  }
  if (store?.gasDbUrl) {
    const parsedStore = validateGasUrl(store.gasDbUrl);
    if (parsedStore) return parsedStore;
  }
  for (const st of Object.values(store?.states || {})) {
    if (st?.settings?.gasEndpointUrl) {
      const parsedSt = validateGasUrl(st.settings.gasEndpointUrl);
      if (parsedSt) return parsedSt;
    }
  }
  return null;
}

function scheduleSpreadsheetSync() {
  if (!getActiveGasDbUrl()) return;
  if (gasSyncTimer) clearTimeout(gasSyncTimer);
  gasSyncTimer = setTimeout(() => {
    gasSyncTimer = null;
    void pushStoreToSpreadsheet().catch((err) => {
      lastSpreadsheetSyncError = err instanceof Error ? err.message : 'Gagal sinkronisasi otomatis ke Spreadsheet.';
    });
  }, 350);
}

function saveStore(targetStore: StoreFile, skipRemoteSync = false) {
  targetStore.updatedAt = new Date().toISOString();
  if (!targetStore.sessionSecret) {
    targetStore.sessionSecret = crypto.randomBytes(32).toString('hex');
  }
  writeStoreToDiskOnly(targetStore);
  if (!skipRemoteSync) {
    scheduleSpreadsheetSync();
  }
}

let store: StoreFile = loadStore();

function getSchoolState(schoolId: string): AppState {
  if (!store.states[schoolId]) {
    const sch = store.schools.find((s) => s.id === schoolId);
    store.states[schoolId] = createDefaultState({
      schoolId,
      namaSekolah: sch?.nama,
      npsn: sch?.npsn,
      jenisLembaga: sch?.jenisLembaga,
      emptyStudents: schoolId !== DEFAULT_SCHOOL_ID,
    });
  }
  return store.states[schoolId];
}

function slugSchoolCode(name: string): string {
  const letters = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w.slice(0, 3).toUpperCase())
    .join('-');
  const base = letters || 'SCH';
  let code = base;
  let counter = 2;
  while (store.schools.some((s) => s.kodeSekolah.toLowerCase() === code.toLowerCase())) {
    code = `${base}-${counter++}`;
  }
  return code;
}

function createSessionToken(user: StoredUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid: user.id,
      role: user.role,
      schoolId: user.schoolId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): StoredUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid: string;
      schoolId?: string;
      exp: number;
    };
    if (!decoded.uid || decoded.exp < Date.now()) return null;
    const user = store.users.find((u) => u.id === decoded.uid);
    if (!user || !user.aktif) return null;
    if (decoded.schoolId && user.schoolId !== decoded.schoolId) return null;
    const school = store.schools.find((s) => s.id === user.schoolId);
    if (!school || !school.aktif) return null;
    return user;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  authUser?: StoredUser;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan login kembali.' });
    return;
  }
  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({
      error:
        'Sesi login telah berakhir (server diperbarui/dimulai ulang) atau akun dinonaktifkan. Silakan login kembali.',
    });
    return;
  }
  req.authUser = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser || req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak. Khusus Pengurus PKBM / Admin.' });
    return;
  }
  next();
}

function getAssignedSubjectIdsForUserServer(user: StoredUser, kelas?: string): Set<string> | null {
  if (user.role === 'admin') return null;
  if (user.role === 'guru' || user.role === 'walikelas') {
    const set = new Set<string>();
    (user.teachingAssignments || [])
      .filter((a) => !kelas || a.kelas === kelas)
      .forEach((a) => a.subjectIds.forEach((id) => set.add(id)));
    return set;
  }
  return new Set<string>();
}

function canUserAccessStudentInPenghubung(user: StoredUser, studentId: string): boolean {
  if (user.role === 'siswa') return false;
  const schoolState = getSchoolState(user.schoolId);
  const stu = schoolState.students.find((s) => s.id === studentId);
  if (!stu) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'ortu') {
    return (user.linkedStudentIds || []).includes(studentId);
  }
  return isUserAssignedToClass(user, stu.kelas);
}

function canUserManageTutoringItem(
  user: StoredUser,
  item: { subjectId: string; kelas: string }
): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'guru') {
    const subjs = getAssignedSubjectIdsForUserServer(user, item.kelas);
    return Boolean(subjs && subjs.has(item.subjectId));
  }
  if (user.role === 'walikelas') {
    if (user.waliKelasTarget === item.kelas) return true;
    const subjs = getAssignedSubjectIdsForUserServer(user, item.kelas);
    return Boolean(subjs && subjs.has(item.subjectId));
  }
  return false;
}

function validateSafeHttpUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function sanitizeImageDataUrl(rawUrl: unknown): string | undefined {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return undefined;
  const trimmed = rawUrl.trim();
  if (trimmed.length > 3_500_000) return undefined;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  const safeHttp = validateSafeHttpUrl(trimmed);
  return safeHttp || undefined;
}

const VALID_QUESTION_TYPES: DiagnosticQuestionType[] = [
  'pilihan_ganda',
  'pg_kompleks',
  'menjodohkan',
  'skala_likert',
  'input_gambar',
  'isian_singkat',
  'studi_kasus',
];

function sanitizeDiagnosticQuestions(raw: unknown): DiagnosticQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
    .map((q, idx) => {
      const tipe: DiagnosticQuestionType = VALID_QUESTION_TYPES.includes(
        q.tipe as DiagnosticQuestionType
      )
        ? (q.tipe as DiagnosticQuestionType)
        : 'pilihan_ganda';
      const opsi = Array.isArray(q.opsi)
        ? q.opsi
            .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
            .map((o, oIdx) => ({
              id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `opt-${idx}-${oIdx}`,
              label: typeof o.label === 'string' ? o.label.trim() : '',
              isCorrect: typeof o.isCorrect === 'boolean' ? o.isCorrect : undefined,
              nilaiSkor: typeof o.nilaiSkor === 'number' ? o.nilaiSkor : undefined,
              traitTag: typeof o.traitTag === 'string' && o.traitTag.trim() ? o.traitTag.trim() : undefined,
            }))
        : [];
      const pasanganMenjodohkan = Array.isArray(q.pasanganMenjodohkan)
        ? q.pasanganMenjodohkan
            .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
            .map((p, pIdx) => ({
              id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `pair-${idx}-${pIdx}`,
              kiri: typeof p.kiri === 'string' ? p.kiri.trim() : '',
              kanan: typeof p.kanan === 'string' ? p.kanan.trim() : '',
            }))
        : undefined;
      return {
        id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `dq-${Date.now()}-${idx}`,
        domain: typeof q.domain === 'string' && q.domain.trim() ? q.domain.trim() : 'Umum',
        subDimensi: typeof q.subDimensi === 'string' && q.subDimensi.trim() ? q.subDimensi.trim() : undefined,
        tipe,
        pertanyaan: typeof q.pertanyaan === 'string' ? q.pertanyaan.trim() : '',
        gambarUrl: sanitizeImageDataUrl(q.gambarUrl),
        opsi,
        pasanganMenjodohkan,
        bobotPoin: Math.max(1, Number(q.bobotPoin) || 10),
        cpKode: typeof q.cpKode === 'string' && q.cpKode.trim() ? q.cpKode.trim() : undefined,
        tpKode: typeof q.tpKode === 'string' && q.tpKode.trim() ? q.tpKode.trim() : undefined,
        wajib: typeof q.wajib === 'boolean' ? q.wajib : true,
      };
    });
}

function sanitizeTendikQuestions(raw: unknown): TendikQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
    .map((q, idx) => {
      const tipe: DiagnosticQuestionType = VALID_QUESTION_TYPES.includes(
        q.tipe as DiagnosticQuestionType
      )
        ? (q.tipe as DiagnosticQuestionType)
        : 'pilihan_ganda';
      const kompetensi: TendikCompetency = TENDIK_COMPETENCIES.includes(
        q.kompetensi as TendikCompetency
      )
        ? (q.kompetensi as TendikCompetency)
        : 'Pedagogik';
      const opsi = Array.isArray(q.opsi)
        ? q.opsi
            .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
            .map((o, oIdx) => ({
              id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `topt-${idx}-${oIdx}`,
              label: typeof o.label === 'string' ? o.label.trim() : '',
              isCorrect: typeof o.isCorrect === 'boolean' ? o.isCorrect : undefined,
              nilaiSkor: Math.max(0, Number(o.nilaiSkor) || 0),
            }))
        : [];
      const pasanganMenjodohkan = Array.isArray(q.pasanganMenjodohkan)
        ? q.pasanganMenjodohkan
            .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
            .map((p, pIdx) => ({
              id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `tpair-${idx}-${pIdx}`,
              kiri: typeof p.kiri === 'string' ? p.kiri.trim() : '',
              kanan: typeof p.kanan === 'string' ? p.kanan.trim() : '',
            }))
        : undefined;
      return {
        id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `tq-${Date.now()}-${idx}`,
        kompetensi,
        tipe,
        pertanyaan: typeof q.pertanyaan === 'string' ? q.pertanyaan.trim() : '',
        indikatorKinerja:
          typeof q.indikatorKinerja === 'string' ? q.indikatorKinerja.trim() : '',
        gambarUrl: sanitizeImageDataUrl(q.gambarUrl),
        opsi,
        pasanganMenjodohkan,
        bobotPoin: Math.max(1, Number(q.bobotPoin) || 10),
      };
    });
}

const VALID_SURVEY_TYPES: SurveyQuestion['tipe'][] = [
  'pilihan_ganda',
  'pg_kompleks',
  'skala_likert',
  'isian_singkat',
];

function sanitizeSurveyQuestions(raw: unknown): SurveyQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
    .map((q, idx) => {
      const tipe: SurveyQuestion['tipe'] = VALID_SURVEY_TYPES.includes(
        q.tipe as SurveyQuestion['tipe']
      )
        ? (q.tipe as SurveyQuestion['tipe'])
        : 'skala_likert';
      const opsi = Array.isArray(q.opsi)
        ? q.opsi
            .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
            .map((o, oIdx) => ({
              id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `sopt-${idx}-${oIdx}`,
              label: typeof o.label === 'string' ? o.label.trim() : '',
              nilaiSkor: typeof o.nilaiSkor === 'number' ? o.nilaiSkor : undefined,
              traitTag:
                typeof o.traitTag === 'string' && o.traitTag.trim() ? o.traitTag.trim() : undefined,
            }))
        : [];
      return {
        id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `sq-${Date.now()}-${idx}`,
        domain: typeof q.domain === 'string' && q.domain.trim() ? q.domain.trim() : 'Umum',
        tipe,
        pertanyaan: typeof q.pertanyaan === 'string' ? q.pertanyaan.trim() : '',
        opsi,
        wajib: typeof q.wajib === 'boolean' ? q.wajib : true,
      };
    })
    .filter((q) => Boolean(q.pertanyaan));
}

// Track Tendik video uploads in-memory by "<schoolId>/<fileName>" -> uploader userId
const uploadedVideoOwners = new Map<string, string>();

function isValidVideoMagicBytes(buf: Buffer, ext: '.mp4' | '.webm' | '.mov'): boolean {
  if (ext === '.webm') {
    return (
      buf.length >= 4 &&
      buf[0] === 0x1a &&
      buf[1] === 0x45 &&
      buf[2] === 0xdf &&
      buf[3] === 0xa3
    );
  }
  if (buf.length < 12) return false;
  const boxType = buf.subarray(4, 8).toString('ascii');
  if (ext === '.mp4') {
    return boxType === 'ftyp';
  }
  // QuickTime (.mov)
  return ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(boxType);
}

function scrubDiagnosticQuestionsForStudent(
  questions: DiagnosticQuestion[]
): DiagnosticQuestion[] {
  return (questions || []).map((q) => ({
    ...q,
    opsi: (q.opsi || []).map((o) => {
      const { isCorrect: _omit, ...rest } = o;
      return rest;
    }),
  }));
}

function filterStateForUser(state: AppState, user: StoredUser): AppState {
  if (user.role === 'ortu') {
    const linked = new Set(user.linkedStudentIds || []);
    const linkedStudents = state.students.filter((s) => linked.has(s.id));
    const linkedClasses = new Set(linkedStudents.map((s) => s.kelas));
    const linkedEnrolledSubjIds = new Set<string>();
    linkedStudents.forEach((stu) => {
      getSubjectsForClass(state.subjects, stu.kelas, state.classDefs, stu.jurusan || 'Umum').forEach(
        (subj) => linkedEnrolledSubjIds.add(subj.id)
      );
    });

    const filteredGrades: AppState['grades'] = {};
    Object.entries(state.grades).forEach(([k, val]) => {
      const stuId = k.split('::')[0];
      if (linked.has(stuId)) filteredGrades[k] = val;
    });
    const filteredMeta: AppState['reportMeta'] = {};
    Object.entries(state.reportMeta).forEach(([k, val]) => {
      const stuId = k.split('::')[0];
      if (linked.has(stuId)) filteredMeta[k] = val;
    });
    return {
      ...state,
      settings: { ...state.settings, gasEndpointUrl: '' },
      students: linkedStudents,
      grades: filteredGrades,
      p5Projects: state.p5Projects.filter((p) => linked.has(p.studentId)),
      reportMeta: filteredMeta,
      counselingNotes: state.counselingNotes.filter(
        (c) => linked.has(c.studentId) && c.tampilDiOrtu
      ),
      mutations: state.mutations.filter((m) => linked.has(m.studentId)),
      logbookEntries: state.logbookEntries.filter((l) => linked.has(l.studentId)),
      parentFeedbacks: (state.parentFeedbacks || []).filter((f) => linked.has(f.studentId)),
      tutoringRecommendations: (state.tutoringRecommendations || []).filter((r) =>
        linked.has(r.studentId)
      ),
      tutoringRequests: (state.tutoringRequests || []).filter((r) => linked.has(r.studentId)),
      procurementRequests: [],
      diagnosticPackages: [],
      diagnosticSubmissions: [],
      // Orang Tua: akses LMS read-only untuk semua anak tertaut di kelas/mapel masing-masing
      lmsMaterials: (state.lmsMaterials || []).filter(
        (m) => linkedClasses.has(m.kelas) && linkedEnrolledSubjIds.has(m.subjectId)
      ),
      lmsAssignments: (state.lmsAssignments || []).filter(
        (a) => linkedClasses.has(a.kelas) && linkedEnrolledSubjIds.has(a.subjectId)
      ),
      lmsSubmissions: (state.lmsSubmissions || []).filter((s) => linked.has(s.studentId)),
      lmsDiscussions: (state.lmsDiscussions || []).filter(
        (d) => linkedClasses.has(d.kelas) && linkedEnrolledSubjIds.has(d.subjectId)
      ),
      tendikPackages: [],
      tendikSubmissions: [],
      surveyPackages: (state.surveyPackages || []).filter(
        (pkg) =>
          pkg.status === 'Dirilis' &&
          (!pkg.targetKelasList ||
            pkg.targetKelasList.length === 0 ||
            linkedStudents.some((st) => pkg.targetKelasList.includes(st.kelas)))
      ),
      surveyResponses: (state.surveyResponses || []).filter((r) => linked.has(r.studentId)),
      studentEditRequests: [],
      letters: (state.letters || []).filter((l) => {
        if (l.requestedByUserId === user.id) return true;
        if (l.studentId && linked.has(l.studentId) && l.status !== 'Draft') return true;
        if (l.status === 'Terbit' && l.kategori === 'Pengumuman Sekolah') {
          return (
            !l.targetKelasList ||
            l.targetKelasList.length === 0 ||
            linkedStudents.some((st) => l.targetKelasList!.includes(st.kelas))
          );
        }
        return false;
      }),
    };
  }

  if (user.role === 'siswa') {
    const linked = new Set(user.linkedStudentIds || []);
    const ownStudents = state.students.filter((s) => linked.has(s.id));
    const primary = ownStudents[0];
    const enrolledSubjects = primary
      ? getSubjectsForClass(state.subjects, primary.kelas, state.classDefs, primary.jurusan || 'Umum')
      : [];
    const enrolledSubjIds = new Set(enrolledSubjects.map((s) => s.id));
    const ownClasses = new Set(ownStudents.map((s) => s.kelas));

    const releasedPackages = (state.diagnosticPackages || [])
      .filter((pkg) => {
        if (pkg.status !== 'Dirilis') return false;
        const matchesClass =
          !pkg.targetKelasList ||
          pkg.targetKelasList.length === 0 ||
          ownStudents.some((st) => pkg.targetKelasList.includes(st.kelas));
        if (!matchesClass) return false;
        if (pkg.kategori === 'Akademik' && pkg.subjectId) {
          return enrolledSubjIds.has(pkg.subjectId);
        }
        return true;
      })
      .map((pkg) => ({
        ...pkg,
        pertanyaan: scrubDiagnosticQuestionsForStudent(pkg.pertanyaan),
      }));

    return {
      ...state,
      settings: { ...state.settings, gasEndpointUrl: '' },
      subjects: enrolledSubjects,
      students: ownStudents,
      grades: {},
      p5Projects: [],
      reportMeta: {},
      counselingNotes: [],
      mutations: [],
      archives: [],
      logbookEntries: [],
      parentFeedbacks: [],
      tutoringRecommendations: [],
      tutoringRequests: [],
      procurementRequests: [],
      diagnosticPackages: releasedPackages,
      diagnosticSubmissions: (state.diagnosticSubmissions || []).filter((s) =>
        linked.has(s.studentId)
      ),
      lmsMaterials: (state.lmsMaterials || []).filter(
        (m) => ownClasses.has(m.kelas) && enrolledSubjIds.has(m.subjectId)
      ),
      lmsAssignments: (state.lmsAssignments || []).filter(
        (a) => ownClasses.has(a.kelas) && enrolledSubjIds.has(a.subjectId)
      ),
      lmsSubmissions: (state.lmsSubmissions || []).filter((s) => linked.has(s.studentId)),
      lmsDiscussions: (state.lmsDiscussions || []).filter(
        (d) => ownClasses.has(d.kelas) && enrolledSubjIds.has(d.subjectId)
      ),
      tendikPackages: [],
      tendikSubmissions: [],
      surveyPackages: [],
      surveyResponses: [],
      studentEditRequests: [],
      letters: (state.letters || []).filter((l) => {
        if (
          l.requestedByUserId === user.id ||
          (l.studentId && linked.has(l.studentId) && l.status !== 'Draft')
        ) {
          return true;
        }
        if (l.status === 'Terbit' && l.kategori === 'Pengumuman Sekolah') {
          return (
            !l.targetKelasList ||
            l.targetKelasList.length === 0 ||
            ownStudents.some((st) => l.targetKelasList!.includes(st.kelas))
          );
        }
        return false;
      }),
    };
  }

  if (user.role === 'guru' || user.role === 'walikelas') {
    const allowedAll = getAssignedSubjectIdsForUserServer(user) || new Set<string>();
    const scrubbedSubjects = state.subjects.map((s) => {
      if (allowedAll.has(s.id)) return s;
      return {
        ...s,
        capaianPembelajaran: '',
        cps: [],
        tps: [],
      };
    });

    const accessibleClasses = new Set(
      (state.classes || []).filter((cls) => isUserAssignedToClass(user, cls))
    );
    const accessibleStudentIds = new Set(
      state.students.filter((st) => accessibleClasses.has(st.kelas)).map((st) => st.id)
    );

    const filteredLogbook = state.logbookEntries.filter((l) => isUserAssignedToClass(user, l.kelas));
    const filteredTutorRecs = (state.tutoringRecommendations || []).filter((r) =>
      canUserManageTutoringItem(user, r)
    );
    const filteredTutorReqs = (state.tutoringRequests || []).filter((r) =>
      canUserManageTutoringItem(user, r)
    );
    const filteredProcurements = (state.procurementRequests || []).filter(
      (p) => p.requesterUserId === user.id
    );

    const canAccessLmsItem = (kelas: string, subjectId: string) => {
      if (user.role === 'walikelas' && user.waliKelasTarget === kelas) return true;
      const subjs = getAssignedSubjectIdsForUserServer(user, kelas);
      return Boolean(subjs && subjs.has(subjectId));
    };

    const visibleAssignments = (state.lmsAssignments || []).filter((a) =>
      canAccessLmsItem(a.kelas, a.subjectId)
    );
    const visibleAssignmentIds = new Set(visibleAssignments.map((a) => a.id));

    return {
      ...state,
      settings: { ...state.settings, gasEndpointUrl: '' },
      subjects: scrubbedSubjects,
      logbookEntries: filteredLogbook,
      tutoringRecommendations: filteredTutorRecs,
      tutoringRequests: filteredTutorReqs,
      procurementRequests: filteredProcurements,
      // Guru & Wali Kelas dapat melihat olahan hasil diagnostik (termasuk Pemelajar Mandiri) & Survei Orang Tua untuk kelas binaannya
      diagnosticPackages: (state.diagnosticPackages || []).map((pkg) => ({
        ...pkg,
        pertanyaan: scrubDiagnosticQuestionsForStudent(pkg.pertanyaan),
      })),
      diagnosticSubmissions: (state.diagnosticSubmissions || []).filter(
        (sub) => accessibleClasses.has(sub.kelas) || accessibleStudentIds.has(sub.studentId)
      ),
      lmsMaterials: (state.lmsMaterials || []).filter((m) =>
        canAccessLmsItem(m.kelas, m.subjectId)
      ),
      lmsAssignments: visibleAssignments,
      lmsSubmissions: (state.lmsSubmissions || []).filter((s) =>
        visibleAssignmentIds.has(s.assignmentId)
      ),
      lmsDiscussions: (state.lmsDiscussions || []).filter((d) =>
        canAccessLmsItem(d.kelas, d.subjectId)
      ),
      tendikPackages: (state.tendikPackages || []).filter(
        (p) =>
          p.status === 'Dirilis' &&
          (!p.targetRoles || p.targetRoles.length === 0 || p.targetRoles.includes(user.role as 'guru' | 'walikelas'))
      ),
      tendikSubmissions: (state.tendikSubmissions || []).filter((s) => s.userId === user.id),
      surveyPackages: state.surveyPackages || [],
      surveyResponses: (state.surveyResponses || []).filter(
        (r) => accessibleClasses.has(r.kelas) || accessibleStudentIds.has(r.studentId)
      ),
      studentEditRequests:
        user.role === 'walikelas'
          ? (state.studentEditRequests || []).filter(
              (r) =>
                r.requestedByUserId === user.id ||
                (user.waliKelasTarget && r.kelas === user.waliKelasTarget)
            )
          : [],
      letters: (state.letters || []).filter(
        (l) =>
          l.status === 'Terbit' &&
          (l.kategori === 'Pengumuman Sekolah' || l.kategori === 'Kepegawaian & Tugas Pendidik')
      ),
    };
  }

  return state;
}

function validateGasUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (host === 'script.google.com' && parsed.pathname.startsWith('/macros/s/')) {
      return parsed;
    }
    if (host === 'script.googleusercontent.com' && parsed.pathname.startsWith('/macros/')) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function callGasEndpointJson(
  url: URL,
  method: 'GET' | 'POST',
  bodyObj?: unknown
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    let currentUrl: URL = url;
    let currentMethod: 'GET' | 'POST' = method;
    let response: globalThis.Response | null = null;

    for (let hop = 0; hop <= 5; hop++) {
      response = await fetch(currentUrl.toString(), {
        method: currentMethod,
        redirect: 'manual',
        signal: controller.signal,
        headers: currentMethod === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: currentMethod === 'POST' ? JSON.stringify(bodyObj ?? {}) : undefined,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect Google Apps Script tidak menyertakan header tujuan.');
        }
        const resolved = new URL(location, currentUrl).toString();
        const validatedNext = validateGasUrl(resolved);
        if (!validatedNext) {
          throw new Error(
            'Redirect Google Apps Script menuju domain di luar script.google.com/script.googleusercontent.com ditolak.'
          );
        }
        currentUrl = validatedNext;
        if ([301, 302, 303].includes(response.status)) {
          currentMethod = 'GET';
        }
        continue;
      }
      break;
    }

    if (!response) {
      throw new Error('Gagal menerima respons dari Google Apps Script.');
    }

    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    if (!response.ok || !parsed) {
      if (text.includes('<html') || text.includes('accounts.google.com')) {
        throw new Error(
          'Google Apps Script memerlukan akses publik: pastikan pengaturan Deployment Web App dipilih "Execute as: Me" dan "Who has access: Anyone".'
        );
      }
      throw new Error(`Respons Google Apps Script tidak valid (HTTP ${response.status}).`);
    }
    if (parsed.ok === false && typeof parsed.error === 'string') {
      throw new Error(parsed.error);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function pushStoreToSpreadsheet(explicitUrl?: string): Promise<{
  spreadsheetUrl?: string;
  updatedAt: string;
  schoolsCount: number;
  usersCount: number;
}> {
  const targetUrl = explicitUrl ? validateGasUrl(explicitUrl) : getActiveGasDbUrl();
  if (!targetUrl) {
    throw new Error('URL Google Apps Script (/exec) belum terpasang atau tidak valid.');
  }

  let resultOut: {
    spreadsheetUrl?: string;
    updatedAt: string;
    schoolsCount: number;
    usersCount: number;
  } = {
    spreadsheetUrl: store.spreadsheetUrl,
    updatedAt: store.updatedAt || new Date().toISOString(),
    schoolsCount: store.schools.length,
    usersCount: store.users.length,
  };

  gasSyncChain = gasSyncChain.then(async () => {
    const nowIso = new Date().toISOString();
    const payload = {
      action: 'push_db',
      store: {
        schools: store.schools,
        users: store.users,
        states: store.states,
        updatedAt: store.updatedAt || nowIso,
      },
    };
    const resJson = await callGasEndpointJson(targetUrl, 'POST', payload);
    const ssUrl = typeof resJson.spreadsheetUrl === 'string' ? resJson.spreadsheetUrl : store.spreadsheetUrl;
    store.gasDbUrl = targetUrl.toString();
    if (ssUrl) store.spreadsheetUrl = ssUrl;
    store.lastSpreadsheetSyncAt = nowIso;
    lastSpreadsheetSyncError = '';
    writeStoreToDiskOnly(store);
    resultOut = {
      spreadsheetUrl: ssUrl,
      updatedAt: nowIso,
      schoolsCount: store.schools.length,
      usersCount: store.users.length,
    };
  });

  await gasSyncChain;
  return resultOut;
}

async function pullStoreFromSpreadsheet(explicitUrl?: string): Promise<{
  restored: boolean;
  spreadsheetUrl?: string;
  updatedAt?: string;
  schoolsCount: number;
  usersCount: number;
}> {
  const targetUrl = explicitUrl ? validateGasUrl(explicitUrl) : getActiveGasDbUrl();
  if (!targetUrl) {
    throw new Error('URL Google Apps Script (/exec) belum terpasang atau tidak valid.');
  }
  const pullUrl = new URL(targetUrl.toString());
  pullUrl.searchParams.set('action', 'pull_db');
  const resJson = await callGasEndpointJson(pullUrl, 'GET');
  const remoteStore = resJson.store as Partial<StoreFile> | undefined;
  const ssUrl = typeof resJson.spreadsheetUrl === 'string' ? resJson.spreadsheetUrl : store.spreadsheetUrl;

  if (!remoteStore || !Array.isArray(remoteStore.schools) || remoteStore.schools.length === 0) {
    return {
      restored: false,
      spreadsheetUrl: ssUrl,
      updatedAt: typeof resJson.updatedAt === 'string' ? resJson.updatedAt : undefined,
      schoolsCount: 0,
      usersCount: 0,
    };
  }

  const schools: SchoolTenant[] = remoteStore.schools;
  const states: Record<string, AppState> = {};
  for (const sch of schools) {
    const rawSt = remoteStore.states?.[sch.id];
    states[sch.id] = rawSt
      ? normalizeAppState(rawSt, sch.id)
      : createDefaultState({
          schoolId: sch.id,
          namaSekolah: sch.nama,
          npsn: sch.npsn,
          jenisLembaga: sch.jenisLembaga,
          emptyStudents: sch.id !== DEFAULT_SCHOOL_ID,
        });
    if (states[sch.id]?.settings && !states[sch.id].settings.gasEndpointUrl) {
      states[sch.id].settings.gasEndpointUrl = targetUrl.toString();
    }
  }
  const users: StoredUser[] = Array.isArray(remoteStore.users)
    ? remoteStore.users.map((u) => ({
        ...u,
        schoolId: u.schoolId || schools[0].id,
      }))
    : [];

  store = {
    schools,
    users,
    states,
    sessionSecret:
      typeof remoteStore.sessionSecret === 'string' && remoteStore.sessionSecret.trim()
        ? remoteStore.sessionSecret.trim()
        : store.sessionSecret || crypto.randomBytes(32).toString('hex'),
    gasDbUrl: targetUrl.toString(),
    spreadsheetUrl: ssUrl,
    lastSpreadsheetSyncAt: new Date().toISOString(),
    updatedAt:
      typeof remoteStore.updatedAt === 'string' && remoteStore.updatedAt
        ? remoteStore.updatedAt
        : new Date().toISOString(),
  };
  lastSpreadsheetSyncError = '';
  writeStoreToDiskOnly(store);

  return {
    restored: true,
    spreadsheetUrl: ssUrl,
    updatedAt: store.updatedAt,
    schoolsCount: schools.length,
    usersCount: users.length,
  };
}

function issueRestoredAuth(prevUser: StoredUser): {
  token?: string;
  user?: UserAccount;
  requiresRelogin?: boolean;
} {
  const prevUsername = prevUser.username.toLowerCase();
  const matched =
    store.users.find((u) => u.id === prevUser.id && u.aktif) ||
    store.users.find(
      (u) => u.schoolId === prevUser.schoolId && u.username.toLowerCase() === prevUsername && u.aktif
    ) ||
    store.users.find(
      (u) => u.username.toLowerCase() === prevUsername && u.role === 'admin' && u.aktif
    );
  if (!matched) {
    return { requiresRelogin: true };
  }
  const school = store.schools.find((s) => s.id === matched.schoolId && s.aktif);
  if (!school) {
    return { requiresRelogin: true };
  }
  const schoolMap = new Map(store.schools.map((s) => [s.id, s]));
  return {
    token: createSessionToken(matched),
    user: sanitizeUser(matched, schoolMap),
  };
}

async function hydrateStoreOnStartup() {
  const activeUrl = getActiveGasDbUrl();
  if (!activeUrl) return;
  try {
    const pullUrl = new URL(activeUrl.toString());
    pullUrl.searchParams.set('action', 'pull_db');
    const resJson = await callGasEndpointJson(pullUrl, 'GET');
    const remoteStore = resJson.store as Partial<StoreFile> | undefined;
    const remoteUsers = Array.isArray(remoteStore?.users) ? remoteStore.users : [];
    const remoteSchools = Array.isArray(remoteStore?.schools) ? remoteStore.schools : [];

    const localIsFreshEmpty = store.users.length === 0;
    const remoteUpdatedMs = Date.parse(String(remoteStore?.updatedAt || '')) || 0;
    const localUpdatedMs = Date.parse(String(store.updatedAt || '')) || 0;

    if (
      remoteSchools.length > 0 &&
      (localIsFreshEmpty || remoteUsers.length > store.users.length || remoteUpdatedMs > localUpdatedMs)
    ) {
      await pullStoreFromSpreadsheet(activeUrl.toString());
      console.log(
        `Hydrated database from Google Spreadsheet (${store.schools.length} schools, ${store.users.length} users).`
      );
    } else if (remoteSchools.length === 0 && store.schools.length > 0) {
      await pushStoreToSpreadsheet(activeUrl.toString());
      console.log('Initialized empty Google Spreadsheet database from local seed.');
    }
  } catch (err) {
    lastSpreadsheetSyncError =
      err instanceof Error ? err.message : 'Gagal memulihkan data dari Google Spreadsheet saat startup.';
    console.warn('Spreadsheet startup hydration warning:', lastSpreadsheetSyncError);
  }
}

async function startServer() {
  await hydrateStoreOnStartup();
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '15mb' }));

  const createRateLimiter = (opts: { windowMs: number; max: number; message: string }) => {
    const buckets = new Map<string, number[]>();
    return (req: Request, res: Response, next: NextFunction) => {
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      const ip = forwarded || req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const cutoff = now - opts.windowMs;
      const prev = (buckets.get(ip) || []).filter((ts) => ts > cutoff);
      if (prev.length >= opts.max) {
        res.status(429).json({ error: opts.message });
        return;
      }
      prev.push(now);
      buckets.set(ip, prev);
      if (buckets.size > 5000) {
        for (const [k, v] of buckets.entries()) {
          if (v.every((ts) => ts <= cutoff)) buckets.delete(k);
        }
      }
      next();
    };
  };

  const loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Terlalu banyak percobaan masuk. Coba kembali beberapa menit lagi.',
  });
  const registerRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Terlalu banyak percobaan pendaftaran. Coba kembali beberapa menit lagi.',
  });
  const newSchoolRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Batas pembuatan sekolah baru tercapai. Coba lagi nanti.',
  });
  const verifyRateLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 60,
    message: 'Terlalu banyak permintaan verifikasi. Mohon tunggu sebentar.',
  });

  const VALID_LOGBOOK_STATUSES: LogbookEntry['status'][] = [
    'Baru',
    'Dipantau Wali Kelas',
    'Selesai',
  ];

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<{ ws: WebSocket; user: StoredUser }>();

  function broadcastLogbook(
    schoolId: string,
    payload: unknown,
    studentId?: string,
    kelas?: string
  ) {
    const msg = JSON.stringify(payload);
    for (const c of clients) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      if (c.user.role === 'siswa') continue;
      // Strict multi-school tenant isolation on WebSocket broadcasts
      if (c.user.schoolId !== schoolId) continue;
      if (c.user.role === 'ortu' && studentId) {
        if (!(c.user.linkedStudentIds || []).includes(studentId)) continue;
      } else if ((c.user.role === 'guru' || c.user.role === 'walikelas') && kelas) {
        if (!isUserAssignedToClass(c.user, kelas)) continue;
      }
      c.ws.send(msg);
    }
  }

  function broadcastPresence(schoolId: string) {
    const users = Array.from(clients)
      .filter((c) => c.user.schoolId === schoolId && c.user.role !== 'siswa')
      .map((c) => ({ name: c.user.nama, role: c.user.role }));
    broadcastLogbook(schoolId, { type: 'presence', users });
  }

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (reqUrl.pathname !== '/ws/penghubung') {
      socket.destroy();
      return;
    }
    const token = reqUrl.searchParams.get('token') || '';
    const user = verifySessionToken(token);
    if (!user || user.role === 'siswa') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const clientObj = { ws, user };
      clients.add(clientObj);
      broadcastPresence(user.schoolId);

      ws.on('message', (data) => {
        try {
          if (user.role === 'siswa') return;
          const parsed = JSON.parse(String(data));
          const schoolState = getSchoolState(user.schoolId);
          if (parsed.type === 'entry:create' && parsed.entry) {
            const entry = parsed.entry as LogbookEntry;
            if (!entry.id || !entry.studentId || !entry.judul || !entry.pesan) return;
            if (!canUserAccessStudentInPenghubung(user, entry.studentId)) return;
            const stu = schoolState.students.find((s) => s.id === entry.studentId);
            if (!stu) return;
            const now = new Date().toISOString();
            const forcedEntry: LogbookEntry = {
              id: String(entry.id).slice(0, 64),
              studentId: stu.id,
              studentName: stu.nama,
              kelas: stu.kelas,
              subjectName:
                typeof entry.subjectName === 'string' && entry.subjectName.trim()
                  ? entry.subjectName.trim().slice(0, 120)
                  : undefined,
              kategori:
                typeof entry.kategori === 'string' && entry.kategori.trim()
                  ? entry.kategori.trim().slice(0, 80)
                  : 'Akademik',
              prioritas: (['Normal', 'Perlu Perhatian', 'Segera'] as const).includes(entry.prioritas)
                ? entry.prioritas
                : 'Normal',
              judul: String(entry.judul).trim().slice(0, 200),
              pesan: String(entry.pesan).trim().slice(0, 4000),
              authorRole: user.role,
              authorName: user.nama,
              status: 'Baru',
              replies: [],
              createdAt: now,
              updatedAt: now,
            };
            if (!schoolState.logbookEntries.some((e) => e.id === forcedEntry.id)) {
              schoolState.logbookEntries = [forcedEntry, ...schoolState.logbookEntries];
              saveStore(store);
            }
            broadcastLogbook(
              user.schoolId,
              { type: 'entry:created', entry: forcedEntry },
              forcedEntry.studentId,
              forcedEntry.kelas
            );
          } else if (parsed.type === 'entry:reply' && parsed.entryId && parsed.reply) {
            const target = schoolState.logbookEntries.find((e) => e.id === parsed.entryId);
            if (!target || !canUserAccessStudentInPenghubung(user, target.studentId)) return;
            if (typeof parsed.reply.pesan !== 'string' || !parsed.reply.pesan.trim()) return;
            const forcedReply = {
              id:
                typeof parsed.reply.id === 'string' && parsed.reply.id.trim()
                  ? parsed.reply.id.trim().slice(0, 64)
                  : `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              authorRole: user.role,
              authorName: user.nama,
              pesan: parsed.reply.pesan.trim().slice(0, 4000),
              createdAt: new Date().toISOString(),
            };
            const nextStatus =
              user.role !== 'ortu' && VALID_LOGBOOK_STATUSES.includes(parsed.status)
                ? (parsed.status as LogbookEntry['status'])
                : undefined;
            schoolState.logbookEntries = schoolState.logbookEntries.map((e) => {
              if (e.id !== parsed.entryId) return e;
              if (e.replies.some((r) => r.id === forcedReply.id)) return e;
              return {
                ...e,
                replies: [...e.replies, forcedReply],
                status: nextStatus || e.status,
                updatedAt: new Date().toISOString(),
              };
            });
            saveStore(store);
            broadcastLogbook(
              user.schoolId,
              {
                type: 'entry:replied',
                entryId: parsed.entryId,
                reply: forcedReply,
                status: nextStatus,
              },
              target.studentId,
              target.kelas
            );
          } else if (parsed.type === 'entry:status' && parsed.entryId && parsed.status) {
            if (user.role === 'ortu') return;
            if (!VALID_LOGBOOK_STATUSES.includes(parsed.status)) return;
            const target = schoolState.logbookEntries.find((e) => e.id === parsed.entryId);
            if (!target || !canUserAccessStudentInPenghubung(user, target.studentId)) return;
            schoolState.logbookEntries = schoolState.logbookEntries.map((e) =>
              e.id === parsed.entryId
                ? { ...e, status: parsed.status, updatedAt: new Date().toISOString() }
                : e
            );
            saveStore(store);
            broadcastLogbook(
              user.schoolId,
              {
                type: 'entry:status',
                entryId: parsed.entryId,
                status: parsed.status,
              },
              target.studentId,
              target.kelas
            );
          }
        } catch {
          // ignore malformed WS frames
        }
      });

      ws.on('close', () => {
        clients.delete(clientObj);
        broadcastPresence(user.schoolId);
      });
    });
  });

  // Public multi-school auth status
  app.get('/api/auth/status', (req, res) => {
    const envPasscodeConfigured = Boolean(process.env.ADMIN_PASSCODE?.trim());
    const requestedSchoolId = String(req.query.schoolId || '').trim();
    const activeSchool =
      store.schools.find((s) => s.id === requestedSchoolId && s.aktif) ||
      store.schools.find((s) => s.aktif) ||
      store.schools[0];

    const schoolId = activeSchool?.id || DEFAULT_SCHOOL_ID;
    const schoolState = getSchoolState(schoolId);
    const schoolUsers = store.users.filter((u) => u.schoolId === schoolId);
    const hasAdmin = schoolUsers.some((u) => u.role === 'admin' && u.aktif);

    const schoolsSummary = store.schools
      .filter((s) => s.aktif)
      .map((s) => {
        const sHasAdmin = store.users.some(
          (u) => u.schoolId === s.id && u.role === 'admin' && u.aktif
        );
        return {
          id: s.id,
          kodeSekolah: s.kodeSekolah,
          nama: s.nama,
          npsn: s.npsn,
          jenisLembaga: s.jenisLembaga,
          bootstrapRequired: !sHasAdmin && !envPasscodeConfigured,
        };
      });

    res.json({
      bootstrapRequired: !hasAdmin && !envPasscodeConfigured,
      hasAdmin,
      envPasscodeConfigured,
      accountCount: schoolUsers.length,
      activeSchoolId: schoolId,
      schools: schoolsSummary,
      classes: schoolState.classes,
      classDefs: schoolState.classDefs,
      subjects: schoolState.subjects
        .filter((s) => s.aktif !== false)
        .map((s) => ({
          id: s.id,
          kode: s.kode,
          nama: s.nama,
          tingkatList: s.tingkatList,
          kelasList: s.kelasList,
        })),
    });
  });

  // Login (strictly isolated per schoolId)
  app.post('/api/auth/login', loginRateLimiter, (req, res) => {
    const { schoolId, username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      res.status(400).json({ error: 'Masukkan username dan kata sandi terlebih dahulu.' });
      return;
    }

    const cleanUser = username.trim().toLowerCase();
    const targetSchoolId =
      typeof schoolId === 'string' && schoolId.trim()
        ? schoolId.trim()
        : store.schools[0]?.id || DEFAULT_SCHOOL_ID;

    const school = store.schools.find((s) => s.id === targetSchoolId && s.aktif);
    if (!school) {
      res.status(404).json({ error: 'Sekolah / lembaga yang dipilih tidak ditemukan atau nonaktif.' });
      return;
    }

    const user = store.users.find(
      (u) => u.schoolId === targetSchoolId && u.username.toLowerCase() === cleanUser
    );
    if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      res.status(401).json({
        error: `Username atau kata sandi tidak sesuai untuk sekolah ${school.nama}.`,
      });
      return;
    }

    if (!user.aktif) {
      res.status(403).json({
        error:
          'Akun Anda berstatus Nonaktif dan menunggu verifikasi Pengurus Sekolah (Admin).',
      });
      return;
    }

    const schoolMap = new Map(store.schools.map((s) => [s.id, s]));
    const token = createSessionToken(user);
    res.json({ token, user: sanitizeUser(user, schoolMap) });
  });

  // Public signup (supports existing schoolId OR onboarding a brand-new isolated school)
  app.post(
    '/api/auth/register',
    registerRateLimiter,
    (req, res, next) => {
      if (req.body?.createNewSchool) {
        newSchoolRateLimiter(req, res, next);
        return;
      }
      next();
    },
    (req, res) => {
    const {
      schoolId,
      createNewSchool,
      newSchoolName,
      newSchoolKode,
      newSchoolNpsn,
      newSchoolJenis,
      nama,
      username,
      password,
      nip,
      role,
      waliKelasTarget,
      teachingAssignments,
      childNisCodes,
      adminAuthPassword,
    } = req.body || {};

    if (typeof nama !== 'string' || !nama.trim() || typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'Nama lengkap dan username wajib diisi.' });
      return;
    }
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
      res.status(400).json({
        error: 'Username harus 3–32 karakter huruf kecil, angka, titik, atau garis bawah.',
      });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    const validRoles: UserRole[] = ['admin', 'walikelas', 'guru', 'ortu', 'siswa'];
    let requestedRole: UserRole = validRoles.includes(role) ? role : 'guru';

    let targetSchoolId =
      typeof schoolId === 'string' && schoolId.trim()
        ? schoolId.trim()
        : store.schools[0]?.id || DEFAULT_SCHOOL_ID;

    if (createNewSchool) {
      if (typeof newSchoolName !== 'string' || !newSchoolName.trim()) {
        res.status(400).json({ error: 'Nama Sekolah / Lembaga baru wajib diisi.' });
        return;
      }
      const cleanName = newSchoolName.trim();
      const duplicateSchool = store.schools.find(
        (s) => s.nama.toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicateSchool) {
        res.status(409).json({
          error: `Sekolah "${cleanName}" sudah terdaftar. Silakan pilih dari daftar sekolah.`,
        });
        return;
      }
      requestedRole = 'admin';
      const createdSchoolId = `sch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const cleanKode =
        typeof newSchoolKode === 'string' && newSchoolKode.trim()
          ? newSchoolKode.trim().toUpperCase().slice(0, 16)
          : slugSchoolCode(cleanName);
      const jenis: 'PKBM' | 'Sekolah Formal' =
        newSchoolJenis === 'Sekolah Formal' ? 'Sekolah Formal' : 'PKBM';
      const newTenant: SchoolTenant = {
        id: createdSchoolId,
        kodeSekolah: cleanKode,
        nama: cleanName,
        npsn: typeof newSchoolNpsn === 'string' ? newSchoolNpsn.trim() : '',
        jenisLembaga: jenis,
        aktif: true,
        createdAt: new Date().toISOString(),
      };
      store.schools.push(newTenant);
      store.states[createdSchoolId] = createDefaultState({
        schoolId: createdSchoolId,
        namaSekolah: newTenant.nama,
        npsn: newTenant.npsn,
        jenisLembaga: newTenant.jenisLembaga,
        emptyStudents: true,
      });
      targetSchoolId = createdSchoolId;
    } else {
      const existingSchool = store.schools.find((s) => s.id === targetSchoolId && s.aktif);
      if (!existingSchool) {
        res.status(404).json({ error: 'Sekolah yang dipilih tidak ditemukan atau nonaktif.' });
        return;
      }
    }

    if (
      store.users.some(
        (u) => u.schoolId === targetSchoolId && u.username.toLowerCase() === cleanUsername
      )
    ) {
      res.status(409).json({
        error: 'Username sudah terdaftar di sekolah ini. Gunakan username lain.',
      });
      return;
    }

    const hasAdminInSchool = store.users.some(
      (u) => u.schoolId === targetSchoolId && u.role === 'admin' && u.aktif
    );
    const envPass = process.env.ADMIN_PASSCODE?.trim();

    if (!createNewSchool && requestedRole === 'admin' && (hasAdminInSchool || envPass)) {
      const matchesEnv = envPass && adminAuthPassword === envPass;
      const matchesExistingSchoolAdmin =
        typeof adminAuthPassword === 'string' &&
        store.users.some(
          (u) =>
            u.schoolId === targetSchoolId &&
            u.role === 'admin' &&
            u.aktif &&
            verifyPassword(adminAuthPassword, u.passwordHash, u.passwordSalt)
        );
      if (!matchesEnv && !matchesExistingSchoolAdmin) {
        res.status(403).json({
          error: 'Otorisasi kata sandi Pengurus / Admin aktif sekolah ini tidak valid.',
        });
        return;
      }
    }

    const schoolState = getSchoolState(targetSchoolId);
    let linkedStudentIds: string[] = [];
    if (requestedRole === 'ortu' && typeof childNisCodes === 'string' && childNisCodes.trim()) {
      const codes = childNisCodes
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);
      linkedStudentIds = schoolState.students
        .filter(
          (s) =>
            codes.includes(s.nis.toLowerCase()) ||
            (s.nisn && codes.includes(s.nisn.toLowerCase()))
        )
        .map((s) => s.id);
    } else if (requestedRole === 'siswa') {
      const code = typeof childNisCodes === 'string' ? childNisCodes.trim().toLowerCase() : '';
      if (!code) {
        res.status(400).json({ error: 'NIS atau NISN wajib diisi saat mendaftar sebagai Siswa.' });
        return;
      }
      const matchedStudent = schoolState.students.find(
        (s) =>
          s.status === 'Aktif' &&
          (s.nis.toLowerCase() === code || (s.nisn && s.nisn.toLowerCase() === code))
      );
      if (!matchedStudent) {
        res.status(400).json({
          error:
            'NIS / NISN siswa aktif tidak ditemukan di sekolah ini. Hubungi Pengurus PKBM/Sekolah agar data Anda didaftarkan terlebih dahulu.',
        });
        return;
      }
      const alreadyClaimed = store.users.some(
        (u) =>
          u.schoolId === targetSchoolId &&
          u.role === 'siswa' &&
          (u.linkedStudentIds || []).includes(matchedStudent.id)
      );
      if (alreadyClaimed) {
        res.status(409).json({
          error:
            'Akun login siswa untuk NIS / NISN tersebut sudah terdaftar. Silakan masuk atau hubungi Pengurus untuk bantuan akun.',
        });
        return;
      }
      linkedStudentIds = [matchedStudent.id];
    }

    const { hash, salt } = hashPassword(password);
    const requiresParentLinkVerification =
      requestedRole === 'ortu' && linkedStudentIds.length > 0;
    const requiresVerification =
      requestedRole === 'guru' ||
      requestedRole === 'walikelas' ||
      requiresParentLinkVerification;
    const isActiveByDefault = !requiresVerification;

    const cleanAssignments: TeachingAssignment[] = Array.isArray(teachingAssignments)
      ? teachingAssignments
          .filter((a) => a && typeof a.kelas === 'string' && Array.isArray(a.subjectIds))
          .map((a) => ({
            kelas: a.kelas,
            subjectIds: a.subjectIds.filter((id: unknown) => typeof id === 'string'),
          }))
      : [];

    const schoolObj = store.schools.find((s) => s.id === targetSchoolId);
    const newUser: StoredUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: targetSchoolId,
      schoolName: schoolObj?.nama,
      username: cleanUsername,
      nama: nama.trim(),
      nip: typeof nip === 'string' ? nip.trim() : '',
      role: requestedRole,
      aktif: isActiveByDefault,
      verified: isActiveByDefault,
      verificationNote: requiresParentLinkVerification
        ? 'Menunggu verifikasi Pengurus Sekolah atas tautan Orang Tua/Wali dengan data peserta didik.'
        : requiresVerification
          ? 'Menunggu verifikasi Pengurus Sekolah (daftar guru & daftar mapel).'
          : '',
      waliKelasTarget:
        requestedRole === 'walikelas' ? waliKelasTarget || schoolState.classes[0] : undefined,
      teachingAssignments:
        requestedRole === 'guru' || requestedRole === 'walikelas' ? cleanAssignments : [],
      linkedStudentIds,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);

    const schoolMap = new Map(store.schools.map((s) => [s.id, s]));
    if (requiresVerification) {
      res.status(201).json({
        pendingVerification: true,
        message: requiresParentLinkVerification
          ? 'Pendaftaran berhasil! Tautan akun Orang Tua/Wali dengan NIS/NISN anak menunggu verifikasi Pengurus Sekolah (Admin) sebelum dapat login.'
          : 'Pendaftaran berhasil! Akun Guru & daftar mapel Anda berstatus Nonaktif dan menunggu verifikasi Pengurus Sekolah (Admin) sebelum bisa login.',
        user: sanitizeUser(newUser, schoolMap),
      });
      return;
    }

    const token = createSessionToken(newUser);
    res.status(201).json({
      token,
      user: sanitizeUser(newUser, schoolMap),
      school: schoolObj,
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ ok: true });
  });

  // Create an additional isolated school from inside Admin settings (new school has separate admin & zero shared data)
  app.post('/api/schools', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const {
      nama,
      kodeSekolah,
      npsn,
      jenisLembaga,
      adminUsername,
      adminNama,
      adminPassword,
    } = req.body || {};

    if (typeof nama !== 'string' || !nama.trim()) {
      res.status(400).json({ error: 'Nama sekolah baru wajib diisi.' });
      return;
    }
    if (
      typeof adminUsername !== 'string' ||
      !/^[a-z0-9._-]{3,32}$/.test(adminUsername.trim().toLowerCase())
    ) {
      res.status(400).json({ error: 'Username admin sekolah baru tidak valid (3–32 karakter).' });
      return;
    }
    if (typeof adminNama !== 'string' || !adminNama.trim()) {
      res.status(400).json({ error: 'Nama lengkap admin sekolah baru wajib diisi.' });
      return;
    }
    if (typeof adminPassword !== 'string' || adminPassword.length < 6) {
      res.status(400).json({ error: 'Kata sandi admin minimal 6 karakter.' });
      return;
    }

    const cleanName = nama.trim();
    if (store.schools.some((s) => s.nama.toLowerCase() === cleanName.toLowerCase())) {
      res.status(409).json({ error: `Sekolah "${cleanName}" sudah terdaftar.` });
      return;
    }

    const newSchoolId = `sch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const cleanKode =
      typeof kodeSekolah === 'string' && kodeSekolah.trim()
        ? kodeSekolah.trim().toUpperCase().slice(0, 16)
        : slugSchoolCode(cleanName);
    const jenis: 'PKBM' | 'Sekolah Formal' =
      jenisLembaga === 'Sekolah Formal' ? 'Sekolah Formal' : 'PKBM';

    const newSchool: SchoolTenant = {
      id: newSchoolId,
      kodeSekolah: cleanKode,
      nama: cleanName,
      npsn: typeof npsn === 'string' ? npsn.trim() : '',
      jenisLembaga: jenis,
      aktif: true,
      createdAt: new Date().toISOString(),
    };

    const { hash, salt } = hashPassword(adminPassword);
    const adminUser: StoredUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: newSchoolId,
      schoolName: cleanName,
      username: adminUsername.trim().toLowerCase(),
      nama: adminNama.trim(),
      nip: '',
      role: 'admin',
      aktif: true,
      verified: true,
      teachingAssignments: [],
      linkedStudentIds: [],
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };

    store.schools.push(newSchool);
    store.states[newSchoolId] = createDefaultState({
      schoolId: newSchoolId,
      namaSekolah: cleanName,
      npsn: newSchool.npsn,
      jenisLembaga: jenis,
      emptyStudents: true,
    });
    store.users.push(adminUser);
    saveStore(store);

    res.status(201).json({
      school: newSchool,
      adminUsername: adminUser.username,
    });
  });

  // Admin User Management (strictly scoped to req.authUser.schoolId)
  app.get('/api/auth/users', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.authUser!.schoolId;
    const schoolMap = new Map(store.schools.map((s) => [s.id, s]));
    const users = store.users
      .filter((u) => u.schoolId === schoolId)
      .map((u) => sanitizeUser(u, schoolMap));
    res.json({ users });
  });

  app.post('/api/auth/users', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.authUser!.schoolId;
    const {
      username,
      nama,
      nip,
      password,
      role,
      aktif,
      waliKelasTarget,
      teachingAssignments,
      linkedStudentIds,
    } = req.body || {};

    if (typeof username !== 'string' || !username.trim() || typeof nama !== 'string' || !nama.trim()) {
      res.status(400).json({ error: 'Username dan nama wajib diisi.' });
      return;
    }
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
      res.status(400).json({ error: 'Username tidak valid (3–32 huruf kecil/angka).' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }
    if (
      store.users.some(
        (u) => u.schoolId === schoolId && u.username.toLowerCase() === cleanUsername
      )
    ) {
      res.status(409).json({ error: 'Username sudah terdaftar di sekolah ini.' });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const userRole: UserRole = ['admin', 'walikelas', 'guru', 'ortu', 'siswa'].includes(role)
      ? role
      : 'guru';
    const isAktif = typeof aktif === 'boolean' ? aktif : true;
    const schoolState = getSchoolState(schoolId);
    const validStudentIds = new Set(schoolState.students.map((s) => s.id));
    const safeLinkedStudents = Array.isArray(linkedStudentIds)
      ? linkedStudentIds.filter((id: string) => validStudentIds.has(id))
      : [];

    const schoolMap = new Map(store.schools.map((s) => [s.id, s]));
    const newUser: StoredUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId,
      schoolName: schoolMap.get(schoolId)?.nama,
      username: cleanUsername,
      nama: nama.trim(),
      nip: typeof nip === 'string' ? nip.trim() : '',
      role: userRole,
      aktif: isAktif,
      verified: isAktif,
      waliKelasTarget: userRole === 'walikelas' ? waliKelasTarget : undefined,
      teachingAssignments: Array.isArray(teachingAssignments) ? teachingAssignments : [],
      linkedStudentIds: safeLinkedStudents,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);
    res.status(201).json({ user: sanitizeUser(newUser, schoolMap) });
  });

  app.put('/api/auth/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.authUser!.schoolId;
    const userId = req.params.id;
    const idx = store.users.findIndex((u) => u.id === userId && u.schoolId === schoolId);
    if (idx === -1) {
      res.status(404).json({ error: 'Akun tidak ditemukan pada sekolah ini.' });
      return;
    }
    const prev = store.users[idx];
    const {
      nama,
      nip,
      password,
      role,
      aktif,
      waliKelasTarget,
      teachingAssignments,
      linkedStudentIds,
    } = req.body || {};

    let passwordHash = prev.passwordHash;
    let passwordSalt = prev.passwordSalt;
    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 6) {
        res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
        return;
      }
      const next = hashPassword(password);
      passwordHash = next.hash;
      passwordSalt = next.salt;
    }

    const nextRole: UserRole =
      role && ['admin', 'walikelas', 'guru', 'ortu', 'siswa'].includes(role) ? role : prev.role;
    const nextAktif = typeof aktif === 'boolean' ? aktif : prev.aktif;

    const schoolState = getSchoolState(schoolId);
    const validStudentIds = new Set(schoolState.students.map((s) => s.id));
    const safeLinked = Array.isArray(linkedStudentIds)
      ? linkedStudentIds.filter((id: string) => validStudentIds.has(id))
      : prev.linkedStudentIds;

    const updated: StoredUser = {
      ...prev,
      nama: typeof nama === 'string' && nama.trim() ? nama.trim() : prev.nama,
      nip: typeof nip === 'string' ? nip.trim() : prev.nip || '',
      role: nextRole,
      aktif: nextAktif,
      verified: nextAktif ? true : prev.verified,
      verificationNote: nextAktif ? '' : prev.verificationNote,
      waliKelasTarget:
        nextRole === 'walikelas'
          ? typeof waliKelasTarget === 'string'
            ? waliKelasTarget
            : prev.waliKelasTarget
          : undefined,
      teachingAssignments: Array.isArray(teachingAssignments)
        ? teachingAssignments
        : prev.teachingAssignments,
      linkedStudentIds: safeLinked,
      passwordHash,
      passwordSalt,
    };

    store.users[idx] = updated;
    saveStore(store);
    const schoolMap = new Map(store.schools.map((s) => [s.id, s]));
    res.json({ user: sanitizeUser(updated, schoolMap) });
  });

  app.delete('/api/auth/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.authUser!.schoolId;
    const userId = req.params.id;
    if (req.authUser?.id === userId) {
      res.status(400).json({ error: 'Tidak dapat menghapus akun Anda sendiri yang sedang login.' });
      return;
    }
    const existsInSchool = store.users.some((u) => u.id === userId && u.schoolId === schoolId);
    if (!existsInSchool) {
      res.status(404).json({ error: 'Akun tidak ditemukan pada sekolah ini.' });
      return;
    }
    store.users = store.users.filter((u) => !(u.id === userId && u.schoolId === schoolId));
    saveStore(store);
    res.json({ ok: true });
  });

  // Public Rapor Verification (multi-school aware)
  app.get('/api/verify', verifyRateLimiter, (req, res) => {
    const code = String(req.query.code || '').trim();
    const reqSchoolId = String(req.query.schoolId || '').trim();
    if (!code) {
      res.status(400).json({ valid: false, code: '' });
      return;
    }

    const searchSchools = reqSchoolId
      ? store.schools.filter((s) => s.id === reqSchoolId)
      : store.schools;

    for (const sch of searchSchools) {
      const schState = getSchoolState(sch.id);
      const result = verifyValidationCode(code, schState);
      if (result.valid && result.student) {
        res.json({
          valid: true,
          code: result.code,
          docType: result.docType,
          averageScore: result.averageScore,
          schoolId: sch.id,
          student: {
            nama: result.student.nama,
            nis: result.student.nis,
            nisn: result.student.nisn,
            kelas: result.student.kelas,
          },
          school: {
            namaSekolah: schState.settings.namaSekolah,
            npsn: schState.settings.npsn,
            tahunAjaran: schState.settings.tahunAjaran,
            semester: schState.settings.semester,
          },
        });
        return;
      }
    }

    res.json({ valid: false, code });
  });

  // Public Student ID Card QR Verification (multi-school aware & synced live with mutasi)
  app.get('/api/verify-card', verifyRateLimiter, (req, res) => {
    const id = String(req.query.id || '').trim();
    const nis = String(req.query.nis || '').trim();
    const reqSchoolId = String(req.query.schoolId || '').trim();
    if (!id && !nis) {
      res.status(400).json({ found: false });
      return;
    }
    if (!id && !reqSchoolId) {
      res.status(400).json({
        found: false,
        error: 'Parameter schoolId wajib disertakan untuk verifikasi berdasarkan NIS.',
      });
      return;
    }

    const searchSchools = reqSchoolId
      ? store.schools.filter((s) => s.id === reqSchoolId)
      : store.schools;

    for (const sch of searchSchools) {
      const schState = getSchoolState(sch.id);
      const stu = schState.students.find(
        (s) => (id && s.id === id) || (!id && nis && s.nis.toLowerCase() === nis.toLowerCase())
      );
      if (stu) {
        const matchedByExactQrId = Boolean(id && stu.id === id);
        const stuMutations = schState.mutations.filter((m) => m.studentId === stu.id);
        const latestMutation = stuMutations[0] || null;
        res.json({
          found: true,
          aktifCard: stu.status === 'Aktif',
          schoolId: sch.id,
          student: {
            id: stu.id,
            nis: stu.nis,
            nisn: stu.nisn,
            nama: stu.nama,
            kelas: stu.kelas,
            fase: stu.fase,
            jurusan: stu.jurusan,
            jenisKelamin: stu.jenisKelamin,
            status: stu.status,
            fotoDataUrl: matchedByExactQrId ? stu.fotoDataUrl : undefined,
          },
          latestMutation,
          school: {
            namaSekolah: schState.settings.namaSekolah,
            npsn: schState.settings.npsn,
            tahunAjaran: schState.settings.tahunAjaran,
            kepalaSekolah: schState.settings.kepalaSekolah,
          },
        });
        return;
      }
    }

    res.json({ found: false });
  });

  // Application State (strictly isolated to req.authUser.schoolId)
  app.get('/api/state', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const filtered = filterStateForUser(schoolState, user);
    res.json(filtered);
  });

  app.put('/api/state', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolId = user.schoolId;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({
        error: 'Akun Orang Tua / Siswa hanya dapat mengirim data melalui menu interaksi khusus.',
      });
      return;
    }

    const schoolState = getSchoolState(schoolId);
    const lockStatus = isInputLockedForUser(
      schoolState.settings,
      schoolState.academicYears,
      user
    );
    if (lockStatus.locked) {
      res.status(403).json({ error: lockStatus.reason });
      return;
    }

    const incoming = req.body as AppState;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Payload data tidak valid.' });
      return;
    }

    const studentMap = new Map(schoolState.students.map((s) => [s.id, s]));

    if (user.role === 'guru' || user.role === 'walikelas') {
      if (Array.isArray(incoming.students)) {
        for (const s of incoming.students) {
          const prevStu = studentMap.get(s.id);
          if (!prevStu) {
            res.status(403).json({
              error: 'Hanya Pengurus Sekolah (Admin) yang dapat menambah peserta didik baru.',
            });
            return;
          }
          if (prevStu.status !== s.status) {
            res.status(403).json({
              error: 'Hanya Pengurus Sekolah (Admin) yang dapat mengubah status mutasi/kelulusan siswa.',
            });
            return;
          }
        }
        if (incoming.students.length !== schoolState.students.length) {
          res.status(403).json({
            error: 'Hanya Pengurus Sekolah (Admin) yang dapat menghapus data peserta didik.',
          });
          return;
        }
      }

      const assignedAllCheck = getAssignedSubjectIdsForUserServer(user) || new Set<string>();
      if (Array.isArray(incoming.subjects)) {
        for (const nextSubj of incoming.subjects) {
          if (!assignedAllCheck.has(nextSubj.id)) {
            const hasTamperedContent =
              (nextSubj.cps && nextSubj.cps.length > 0) ||
              (nextSubj.tps && nextSubj.tps.length > 0) ||
              (nextSubj.capaianPembelajaran && nextSubj.capaianPembelajaran.trim() !== '');
            if (hasTamperedContent) {
              res.status(403).json({
                error: 'Anda tidak memiliki penugasan untuk mengubah CP/TP mata pelajaran ini.',
              });
              return;
            }
          }
        }
      }

      if (incoming.grades && typeof incoming.grades === 'object') {
        for (const [k, val] of Object.entries(incoming.grades)) {
          const [stuId, subjId] = k.split('::');
          const stu = studentMap.get(stuId);
          const classAllowedSubjs = stu ? getAssignedSubjectIdsForUserServer(user, stu.kelas) : null;
          if (!stu || !subjId || !classAllowedSubjs || !classAllowedSubjs.has(subjId)) {
            const prevVal = schoolState.grades[k] ?? null;
            if (JSON.stringify(val ?? null) !== JSON.stringify(prevVal)) {
              res.status(403).json({
                error: 'Anda tidak memiliki penugasan untuk mengisi atau mengubah nilai mata pelajaran/kelas ini.',
              });
              return;
            }
          }
        }
      }
    }

    const mergeTeacherSubjectCpTp = (prevSubj: Subject, nextSubj?: Subject): Subject => {
      if (!nextSubj) return prevSubj;
      return syncSubjectFromCPs({
        ...prevSubj,
        capaianPembelajaran:
          typeof nextSubj.capaianPembelajaran === 'string'
            ? nextSubj.capaianPembelajaran
            : prevSubj.capaianPembelajaran,
        cps: Array.isArray(nextSubj.cps) ? nextSubj.cps : prevSubj.cps,
        tps: Array.isArray(nextSubj.tps) ? nextSubj.tps : prevSubj.tps,
      });
    };

    if (user.role === 'guru') {
      const assignedAll = getAssignedSubjectIdsForUserServer(user) || new Set<string>();
      const mergedSubjects = schoolState.subjects.map((prevSubj) => {
        if (!assignedAll.has(prevSubj.id)) return prevSubj;
        const nextSubj = (incoming.subjects || []).find((s) => s.id === prevSubj.id);
        return mergeTeacherSubjectCpTp(prevSubj, nextSubj);
      });

      const mergedGrades = { ...schoolState.grades };
      Object.entries(incoming.grades || {}).forEach(([k, val]) => {
        const [stuId, subjId] = k.split('::');
        const stu = studentMap.get(stuId);
        if (!stu || !subjId) return;
        const classAllowedSubjs = getAssignedSubjectIdsForUserServer(user, stu.kelas);
        if (classAllowedSubjs && classAllowedSubjs.has(subjId)) {
          mergedGrades[k] = val;
        }
      });

      store.states[schoolId] = {
        ...schoolState,
        subjects: mergedSubjects,
        grades: mergedGrades,
        lastUpdated: new Date().toISOString(),
      };
    } else if (user.role === 'walikelas') {
      const waliTarget = user.waliKelasTarget;
      const assignedAll = getAssignedSubjectIdsForUserServer(user) || new Set<string>();

      const mergedSubjects = schoolState.subjects.map((prevSubj) => {
        if (!assignedAll.has(prevSubj.id)) return prevSubj;
        const nextSubj = (incoming.subjects || []).find((s) => s.id === prevSubj.id);
        return mergeTeacherSubjectCpTp(prevSubj, nextSubj);
      });

      const mergedGrades = { ...schoolState.grades };
      Object.entries(incoming.grades || {}).forEach(([k, val]) => {
        const [stuId, subjId] = k.split('::');
        const stu = studentMap.get(stuId);
        if (!stu || !subjId) return;
        const classAllowedSubjs = getAssignedSubjectIdsForUserServer(user, stu.kelas);
        if (classAllowedSubjs && classAllowedSubjs.has(subjId)) {
          mergedGrades[k] = val;
        }
      });

      const incomingStuMap = new Map((incoming.students || []).map((s) => [s.id, s]));
      const mergedStudents = schoolState.students.map((prevStu) => {
        if (!waliTarget || prevStu.kelas !== waliTarget) return prevStu;
        const nextStu = incomingStuMap.get(prevStu.id);
        if (!nextStu) return prevStu;
        const safeFolderUrl =
          typeof nextStu.portfolioFolderUrl === 'string'
            ? nextStu.portfolioFolderUrl.trim()
              ? validateSafeHttpUrl(nextStu.portfolioFolderUrl)
              : ''
            : prevStu.portfolioFolderUrl;
        const safePortfolioItems = Array.isArray(nextStu.portfolioItems)
          ? nextStu.portfolioItems.map((item) => ({
              ...item,
              url: item.url ? validateSafeHttpUrl(item.url) : '',
            }))
          : prevStu.portfolioItems;
        return {
          ...prevStu,
          portfolioFolderUrl: safeFolderUrl,
          portfolioItems: safePortfolioItems,
        };
      });

      const mergedP5 = [
        ...schoolState.p5Projects.filter((p) => studentMap.get(p.studentId)?.kelas !== waliTarget),
        ...(incoming.p5Projects || []).filter(
          (p) => studentMap.get(p.studentId)?.kelas === waliTarget
        ),
      ];

      const mergedMeta = { ...schoolState.reportMeta };
      Object.entries(incoming.reportMeta || {}).forEach(([k, val]) => {
        const stuId = k.split('::')[0];
        if (waliTarget && studentMap.get(stuId)?.kelas === waliTarget) {
          mergedMeta[k] = val;
        }
      });

      const mergedBk = [
        ...schoolState.counselingNotes.filter(
          (n) => studentMap.get(n.studentId)?.kelas !== waliTarget
        ),
        ...(incoming.counselingNotes || []).filter(
          (n) => studentMap.get(n.studentId)?.kelas === waliTarget
        ),
      ];

      store.states[schoolId] = {
        ...schoolState,
        subjects: mergedSubjects,
        grades: mergedGrades,
        students: mergedStudents,
        p5Projects: mergedP5,
        reportMeta: mergedMeta,
        counselingNotes: mergedBk,
        lastUpdated: new Date().toISOString(),
      };
    } else {
      const prevClassById = new Map(schoolState.classDefs.map((c) => [c.id, c.nama]));
      const normalized = normalizeAppState(incoming, schoolId);
      const renamePairs: Record<string, string> = {};
      normalized.classDefs.forEach((c) => {
        const oldName = prevClassById.get(c.id);
        if (oldName && oldName !== c.nama) {
          renamePairs[oldName] = c.nama;
        }
      });

      if (Object.keys(renamePairs).length > 0) {
        store.users = store.users.map((u) => {
          if (u.schoolId !== schoolId) return u;
          return {
            ...u,
            waliKelasTarget:
              u.waliKelasTarget && renamePairs[u.waliKelasTarget]
                ? renamePairs[u.waliKelasTarget]
                : u.waliKelasTarget,
            teachingAssignments: (u.teachingAssignments || []).map((a) => ({
              ...a,
              kelas: renamePairs[a.kelas] || a.kelas,
            })),
          };
        });
      }

      // Sync school tenant identity name/NPSN/type
      store.schools = store.schools.map((sc) =>
        sc.id === schoolId
          ? {
              ...sc,
              nama: normalized.settings.namaSekolah || sc.nama,
              npsn: normalized.settings.npsn || sc.npsn,
              jenisLembaga: normalized.settings.jenisLembaga || sc.jenisLembaga,
            }
          : sc
      );

      if (normalized.settings.gasEndpointUrl?.trim()) {
        const parsedGas = validateGasUrl(normalized.settings.gasEndpointUrl);
        if (parsedGas) {
          store.gasDbUrl = parsedGas.toString();
        }
      }

      // Keep server-authoritative collections (tutoring, procurement, parentFeedbacks, diagnostics, lms, tendik, surveys, studentEditRequests)
      store.states[schoolId] = {
        ...normalized,
        schoolId,
        parentFeedbacks: schoolState.parentFeedbacks,
        tutoringRecommendations: schoolState.tutoringRecommendations,
        tutoringRequests: schoolState.tutoringRequests,
        procurementRequests: schoolState.procurementRequests,
        diagnosticPackages: schoolState.diagnosticPackages,
        diagnosticSubmissions: schoolState.diagnosticSubmissions,
        lmsMaterials: schoolState.lmsMaterials,
        lmsAssignments: schoolState.lmsAssignments,
        lmsSubmissions: schoolState.lmsSubmissions,
        lmsDiscussions: schoolState.lmsDiscussions,
        tendikPackages: schoolState.tendikPackages,
        tendikSubmissions: schoolState.tendikSubmissions,
        surveyPackages: schoolState.surveyPackages,
        surveyResponses: schoolState.surveyResponses,
        studentEditRequests: schoolState.studentEditRequests,
        letters: schoolState.letters,
        lastUpdated: new Date().toISOString(),
      };
    }

    saveStore(store);
    res.json({ ok: true, lastUpdated: store.states[schoolId].lastUpdated });
  });

  app.post('/api/reset', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const schoolId = req.authUser!.schoolId;
    const sch = store.schools.find((s) => s.id === schoolId);
    store.states[schoolId] = createDefaultState({
      schoolId,
      namaSekolah: sch?.nama,
      npsn: sch?.npsn,
      jenisLembaga: sch?.jenisLembaga,
      emptyStudents: schoolId !== DEFAULT_SCHOOL_ID,
    });
    saveStore(store);
    res.json(store.states[schoolId]);
  });

  // Requirement #6: Parent feedback & confirmation endpoint (school-isolated)
  app.post('/api/parent/feedback', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role !== 'ortu' && user.role !== 'admin') {
      res.status(403).json({
        error: 'Konfirmasi & tanggapan orang tua hanya dapat dikirim oleh akun Orang Tua atau Pengurus.',
      });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { studentId, konfirmasiStatus, tanggapan } = req.body || {};
    if (typeof studentId !== 'string' || !studentId.trim()) {
      res.status(400).json({ error: 'ID peserta didik wajib diisi.' });
      return;
    }
    const stuExists = schoolState.students.some((s) => s.id === studentId);
    if (!stuExists) {
      res.status(404).json({ error: 'Peserta didik tidak ditemukan di sekolah ini.' });
      return;
    }
    if (user.role === 'ortu' && !(user.linkedStudentIds || []).includes(studentId)) {
      res.status(403).json({ error: 'Tidak diizinkan mengirim tanggapan untuk siswa ini.' });
      return;
    }
    const validStatuses: ParentFeedback['konfirmasiStatus'][] = [
      'Sudah Membaca & Memahami',
      'Perlu Konsultasi Wali Kelas',
      'Apresiasi & Dukungan',
    ];
    const cleanStatus: ParentFeedback['konfirmasiStatus'] = validStatuses.includes(konfirmasiStatus)
      ? konfirmasiStatus
      : 'Sudah Membaca & Memahami';

    const fb: ParentFeedback = {
      id: `pfb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId,
      semester: schoolState.settings.semester,
      tahunAjaran: schoolState.settings.tahunAjaran,
      parentUserId: user.id,
      parentName: user.nama,
      konfirmasiStatus: cleanStatus,
      tanggapan: typeof tanggapan === 'string' ? tanggapan.trim() : '',
      createdAt: new Date().toISOString(),
    };

    schoolState.parentFeedbacks = [fb, ...(schoolState.parentFeedbacks || [])];
    saveStore(store);
    res.status(201).json({ feedback: fb });
  });

  // --- Requirement #1: Bimbingan Belajar CP & TP Endpoints ---
  app.post('/api/tutoring/recommendations', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Hanya Guru, Wali Kelas, atau Pengurus yang dapat membuat rekomendasi belajar.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { studentId, subjectId, cpId, tpId, rekomendasiGuru, tanggalRekomendasi } = req.body || {};

    const stu = schoolState.students.find((s) => s.id === studentId);
    const subj = schoolState.subjects.find((s) => s.id === subjectId);
    if (!stu || !subj) {
      res.status(404).json({ error: 'Data siswa atau mata pelajaran tidak ditemukan di sekolah ini.' });
      return;
    }
    if (!canUserManageTutoringItem(user, { subjectId: subj.id, kelas: stu.kelas })) {
      res.status(403).json({ error: 'Anda tidak memiliki penugasan untuk mapel/kelas ini.' });
      return;
    }

    const cp = (subj.cps || []).find((c) => c.id === cpId) || subj.cps?.[0];
    if (!cp) {
      res.status(400).json({ error: 'Capaian Pembelajaran (CP) tidak valid.' });
      return;
    }
    const tp = tpId ? (cp.tps || []).find((t) => t.id === tpId) : undefined;
    if (typeof rekomendasiGuru !== 'string' || !rekomendasiGuru.trim()) {
      res.status(400).json({ error: 'Catatan rekomendasi bimbingan belajar wajib diisi.' });
      return;
    }

    const rec: TutoringRecommendation = {
      id: `trec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      studentId: stu.id,
      studentName: stu.nama,
      nis: stu.nis,
      kelas: stu.kelas,
      semester: schoolState.settings.semester,
      tahunAjaran: schoolState.settings.tahunAjaran,
      subjectId: subj.id,
      subjectName: subj.nama,
      cpId: cp.id,
      cpKode: cp.kode,
      cpDeskripsi: cp.deskripsi,
      tpId: tp?.id,
      tpKode: tp?.kode,
      tpDeskripsi: tp?.deskripsi,
      rekomendasiGuru: rekomendasiGuru.trim(),
      recommendedByUserId: user.id,
      recommendedByName: user.nama,
      recommendedByRole: user.role,
      tanggalRekomendasi:
        typeof tanggalRekomendasi === 'string' && tanggalRekomendasi.trim()
          ? tanggalRekomendasi.trim()
          : new Date().toISOString().slice(0, 10),
      status: 'Disarankan',
      createdAt: new Date().toISOString(),
    };

    schoolState.tutoringRecommendations = [rec, ...(schoolState.tutoringRecommendations || [])];
    saveStore(store);
    res.status(201).json({ recommendation: rec });
  });

  app.delete('/api/tutoring/recommendations/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Tidak diizinkan menghapus rekomendasi.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const target = (schoolState.tutoringRecommendations || []).find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Rekomendasi tidak ditemukan.' });
      return;
    }
    if (!canUserManageTutoringItem(user, target)) {
      res.status(403).json({ error: 'Anda tidak memiliki akses menghapus rekomendasi ini.' });
      return;
    }
    schoolState.tutoringRecommendations = (schoolState.tutoringRecommendations || []).filter(
      (r) => r.id !== req.params.id
    );
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/tutoring/requests', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const { studentId, subjectId, cpId, tpIds, tpId, alasan, tanggalAjuan, recommendationId } =
      req.body || {};

    if (typeof studentId !== 'string' || typeof subjectId !== 'string' || typeof cpId !== 'string') {
      res.status(400).json({ error: 'Siswa, Mata Pelajaran, dan CP wajib dipilih.' });
      return;
    }
    const stu = schoolState.students.find((s) => s.id === studentId);
    if (!stu) {
      res.status(404).json({ error: 'Peserta didik tidak ditemukan di sekolah ini.' });
      return;
    }
    if (user.role === 'ortu' && !(user.linkedStudentIds || []).includes(stu.id)) {
      res.status(403).json({ error: 'Anda hanya dapat mengajukan bimbingan untuk anak Anda sendiri.' });
      return;
    }
    if (user.role !== 'ortu' && user.role !== 'admin') {
      res.status(403).json({ error: 'Pengajuan bimbingan dilakukan oleh Orang Tua atau Pengurus.' });
      return;
    }

    const subj = schoolState.subjects.find((s) => s.id === subjectId);
    const cp = subj?.cps?.find((c) => c.id === cpId);
    if (!subj || !cp) {
      res.status(404).json({ error: 'Mata pelajaran atau Capaian Pembelajaran tidak ditemukan.' });
      return;
    }
    if (typeof alasan !== 'string' || !alasan.trim()) {
      res.status(400).json({ error: 'Alasan pengajuan bimbingan belajar wajib diisi.' });
      return;
    }

    const cleanTanggal =
      typeof tanggalAjuan === 'string' && tanggalAjuan.trim()
        ? tanggalAjuan.trim()
        : new Date().toISOString().slice(0, 10);

    const requestedTpIds: Array<string | undefined> =
      Array.isArray(tpIds) && tpIds.length > 0
        ? tpIds
        : tpId
          ? [tpId]
          : [undefined];

    const now = new Date().toISOString();
    const createdRequests: TutoringRequest[] = [];

    for (const tid of requestedTpIds) {
      const tpObj = tid ? (cp.tps || []).find((t) => t.id === tid) : undefined;
      const reqItem: TutoringRequest = {
        id: `treq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        schoolId: user.schoolId,
        studentId: stu.id,
        studentName: stu.nama,
        nis: stu.nis,
        kelas: stu.kelas,
        semester: schoolState.settings.semester,
        tahunAjaran: schoolState.settings.tahunAjaran,
        subjectId: subj.id,
        subjectName: subj.nama,
        cpId: cp.id,
        cpKode: cp.kode,
        cpDeskripsi: cp.deskripsi,
        tpId: tpObj?.id,
        tpKode: tpObj?.kode,
        tpDeskripsi: tpObj?.deskripsi,
        sumber: recommendationId ? 'Rekomendasi Guru' : 'Ortu',
        recommendationId: typeof recommendationId === 'string' ? recommendationId : undefined,
        alasan: alasan.trim(),
        tanggalAjuan: cleanTanggal,
        parentUserId: user.id,
        parentName: user.nama,
        status: 'Menunggu Konfirmasi',
        createdAt: now,
        updatedAt: now,
      };
      createdRequests.push(reqItem);
    }

    if (recommendationId) {
      schoolState.tutoringRecommendations = (schoolState.tutoringRecommendations || []).map((r) =>
        r.id === recommendationId ? { ...r, status: 'Diajukan Ortu' } : r
      );
    }

    schoolState.tutoringRequests = [
      ...createdRequests,
      ...(schoolState.tutoringRequests || []),
    ];
    saveStore(store);
    res.status(201).json({ requests: createdRequests });
  });

  app.patch('/api/tutoring/requests/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Konfirmasi & penjadwalan bimbingan hanya dilakukan oleh Guru atau Pengurus.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.tutoringRequests || []).findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Ajuan bimbingan tidak ditemukan.' });
      return;
    }
    const prev = schoolState.tutoringRequests[idx];
    if (!canUserManageTutoringItem(user, prev)) {
      res.status(403).json({
        error: 'Anda hanya dapat mengonfirmasi ajuan bimbingan untuk mapel & kelas penugasan Anda.',
      });
      return;
    }

    const { status, jadwalTanggal, jadwalWaktu, jadwalLokasi, pembimbingNama, catatanSekolah } =
      req.body || {};

    const validStatuses: TutoringRequestStatus[] = [
      'Menunggu Konfirmasi',
      'Disetujui Guru',
      'Dikonfirmasi Pengurus',
      'Terjadwal',
      'Selesai',
      'Ditolak',
    ];
    const nextStatus: TutoringRequestStatus = validStatuses.includes(status) ? status : prev.status;
    const now = new Date().toISOString();

    const updated: TutoringRequest = {
      ...prev,
      status: nextStatus,
      confirmedByGuruName:
        user.role === 'guru' || user.role === 'walikelas' ? user.nama : prev.confirmedByGuruName,
      confirmedByGuruAt:
        user.role === 'guru' || user.role === 'walikelas' ? now : prev.confirmedByGuruAt,
      approvedByPengurusName: user.role === 'admin' ? user.nama : prev.approvedByPengurusName,
      approvedByPengurusAt: user.role === 'admin' ? now : prev.approvedByPengurusAt,
      jadwalTanggal: typeof jadwalTanggal === 'string' ? jadwalTanggal : prev.jadwalTanggal,
      jadwalWaktu: typeof jadwalWaktu === 'string' ? jadwalWaktu : prev.jadwalWaktu,
      jadwalLokasi: typeof jadwalLokasi === 'string' ? jadwalLokasi : prev.jadwalLokasi,
      pembimbingNama: typeof pembimbingNama === 'string' ? pembimbingNama : prev.pembimbingNama,
      catatanSekolah: typeof catatanSekolah === 'string' ? catatanSekolah.trim() : prev.catatanSekolah,
      updatedAt: now,
    };

    schoolState.tutoringRequests[idx] = updated;
    if (updated.recommendationId && updated.status === 'Selesai') {
      schoolState.tutoringRecommendations = (schoolState.tutoringRecommendations || []).map((r) =>
        r.id === updated.recommendationId ? { ...r, status: 'Selesai' } : r
      );
    }
    saveStore(store);
    res.json({ request: updated });
  });

  app.post('/api/tutoring/schedule-batch', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Penjadwalan bimbingan hanya untuk Guru / Pengurus.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { requestIds, jadwalTanggal, jadwalWaktu, jadwalLokasi, pembimbingNama, catatanSekolah } =
      req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      res.status(400).json({ error: 'Pilih minimal 1 ajuan bimbingan untuk dijadwalkan.' });
      return;
    }
    if (typeof jadwalTanggal !== 'string' || !jadwalTanggal.trim()) {
      res.status(400).json({ error: 'Tanggal jadwal bimbingan wajib diisi.' });
      return;
    }

    const idSet = new Set(requestIds);
    const targets = (schoolState.tutoringRequests || []).filter((r) => idSet.has(r.id));
    if (targets.length === 0) {
      res.status(404).json({ error: 'Data ajuan tidak ditemukan.' });
      return;
    }
    for (const item of targets) {
      if (!canUserManageTutoringItem(user, item)) {
        res.status(403).json({
          error: 'Terdapat ajuan di luar penugasan mapel/kelas Anda sehingga tidak dapat dijadwalkan.',
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const updatedList: TutoringRequest[] = [];
    schoolState.tutoringRequests = (schoolState.tutoringRequests || []).map((r) => {
      if (!idSet.has(r.id)) return r;
      const upd: TutoringRequest = {
        ...r,
        status: 'Terjadwal',
        confirmedByGuruName:
          user.role !== 'admin' ? user.nama : r.confirmedByGuruName,
        confirmedByGuruAt:
          user.role !== 'admin' ? now : r.confirmedByGuruAt,
        approvedByPengurusName:
          user.role === 'admin' ? user.nama : r.approvedByPengurusName,
        approvedByPengurusAt:
          user.role === 'admin' ? now : r.approvedByPengurusAt,
        jadwalTanggal: jadwalTanggal.trim(),
        jadwalWaktu: typeof jadwalWaktu === 'string' ? jadwalWaktu.trim() : r.jadwalWaktu,
        jadwalLokasi: typeof jadwalLokasi === 'string' ? jadwalLokasi.trim() : r.jadwalLokasi,
        pembimbingNama:
          typeof pembimbingNama === 'string' && pembimbingNama.trim()
            ? pembimbingNama.trim()
            : user.nama,
        catatanSekolah:
          typeof catatanSekolah === 'string' && catatanSekolah.trim()
            ? catatanSekolah.trim()
            : r.catatanSekolah,
        updatedAt: now,
      };
      updatedList.push(upd);
      return upd;
    });

    saveStore(store);
    res.json({ requests: updatedList });
  });

  // --- Requirement #3: Pengajuan Alat, Bahan & Kegiatan Endpoints ---
  app.post('/api/procurement', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Pengajuan alat, bahan & kegiatan hanya untuk Guru, Wali Kelas, dan Pengurus.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const {
      kategori,
      namaItem,
      spesifikasi,
      kelasTerkait,
      subjectName,
      qty,
      satuan,
      hargaSatuan,
      prioritas,
      tanggalPengajuan,
      tanggalPenggunaan,
      lokasiAtauVendor,
      keterangan,
    } = req.body || {};

    if (typeof namaItem !== 'string' || !namaItem.trim()) {
      res.status(400).json({ error: 'Nama barang atau kegiatan wajib diisi.' });
      return;
    }
    const cleanQty = Math.max(1, Number(qty) || 0);
    const cleanHarga = Math.max(0, Number(hargaSatuan) || 0);
    const validCategories: ProcurementKategori[] = [
      'Alat Pembelajaran',
      'Bahan Habis Pakai',
      'Kegiatan Siswa / Proyek',
      'Sarana & Prasarana',
      'Lainnya',
    ];
    const cleanKategori: ProcurementKategori = validCategories.includes(kategori)
      ? kategori
      : 'Alat Pembelajaran';

    const seqNum = (schoolState.procurementRequests || []).length + 1;
    const yearStr = new Date().getFullYear();
    const nomorPengajuan = `PBJ-${yearStr}-${String(seqNum).padStart(3, '0')}`;
    const now = new Date().toISOString();

    const item: ProcurementRequest = {
      id: `pbj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      nomorPengajuan,
      tahunAjaran: schoolState.settings.tahunAjaran,
      semester: schoolState.settings.semester,
      requesterUserId: user.id,
      requesterName: user.nama,
      requesterRole: user.role,
      kelasTerkait: typeof kelasTerkait === 'string' ? kelasTerkait.trim() : '',
      subjectName: typeof subjectName === 'string' ? subjectName.trim() : '',
      kategori: cleanKategori,
      namaItem: namaItem.trim(),
      spesifikasi: typeof spesifikasi === 'string' ? spesifikasi.trim() : '',
      qty: cleanQty,
      satuan: typeof satuan === 'string' && satuan.trim() ? satuan.trim() : 'Unit',
      hargaSatuan: cleanHarga,
      total: Math.round(cleanQty * cleanHarga),
      prioritas: ['Normal', 'Mendesak', 'Terjadwal'].includes(prioritas) ? prioritas : 'Normal',
      tanggalPengajuan:
        typeof tanggalPengajuan === 'string' && tanggalPengajuan.trim()
          ? tanggalPengajuan.trim()
          : now.slice(0, 10),
      tanggalPenggunaan:
        typeof tanggalPenggunaan === 'string' && tanggalPenggunaan.trim()
          ? tanggalPenggunaan.trim()
          : now.slice(0, 10),
      lokasiAtauVendor: typeof lokasiAtauVendor === 'string' ? lokasiAtauVendor.trim() : '',
      keterangan: typeof keterangan === 'string' ? keterangan.trim() : '',
      status: 'Menunggu Persetujuan',
      createdAt: now,
      updatedAt: now,
    };

    schoolState.procurementRequests = [item, ...(schoolState.procurementRequests || [])];
    saveStore(store);
    res.status(201).json({ procurement: item });
  });

  app.put('/api/procurement/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Tidak diizinkan mengakses pengajuan pengadaan.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.procurementRequests || []).findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Data pengajuan tidak ditemukan.' });
      return;
    }
    const prev = schoolState.procurementRequests[idx];
    const body = req.body || {};
    const now = new Date().toISOString();

    if (user.role !== 'admin') {
      if (prev.requesterUserId !== user.id) {
        res.status(403).json({ error: 'Anda hanya dapat mengubah pengajuan milik Anda sendiri.' });
        return;
      }
      if (prev.status !== 'Menunggu Persetujuan' && prev.status !== 'Revisi Diminta') {
        res.status(403).json({
          error: 'Pengajuan yang sudah Disetujui / Ditolak / Realisasi tidak dapat diubah lagi oleh pengaju.',
        });
        return;
      }
      if (body.status && body.status !== 'Menunggu Persetujuan' && body.status !== prev.status) {
        res.status(403).json({ error: 'Hanya Pengurus (Admin) yang dapat menyetujui atau menolak pengajuan.' });
        return;
      }
    }

    const nextQty = body.qty !== undefined ? Math.max(1, Number(body.qty) || 1) : prev.qty;
    const nextHarga =
      body.hargaSatuan !== undefined ? Math.max(0, Number(body.hargaSatuan) || 0) : prev.hargaSatuan;

    const validStatuses: ProcurementStatus[] = [
      'Menunggu Persetujuan',
      'Revisi Diminta',
      'Disetujui',
      'Sudah Realisasi',
      'Ditolak',
    ];
    const nextStatus: ProcurementStatus =
      user.role === 'admin' && validStatuses.includes(body.status)
        ? body.status
        : prev.status === 'Revisi Diminta'
          ? 'Menunggu Persetujuan'
          : prev.status;

    const updated: ProcurementRequest = {
      ...prev,
      kategori: body.kategori || prev.kategori,
      namaItem:
        typeof body.namaItem === 'string' && body.namaItem.trim()
          ? body.namaItem.trim()
          : prev.namaItem,
      spesifikasi: typeof body.spesifikasi === 'string' ? body.spesifikasi.trim() : prev.spesifikasi,
      kelasTerkait:
        typeof body.kelasTerkait === 'string' ? body.kelasTerkait.trim() : prev.kelasTerkait,
      subjectName:
        typeof body.subjectName === 'string' ? body.subjectName.trim() : prev.subjectName,
      qty: nextQty,
      satuan:
        typeof body.satuan === 'string' && body.satuan.trim() ? body.satuan.trim() : prev.satuan,
      hargaSatuan: nextHarga,
      total: Math.round(nextQty * nextHarga),
      prioritas: ['Normal', 'Mendesak', 'Terjadwal'].includes(body.prioritas)
        ? body.prioritas
        : prev.prioritas,
      tanggalPenggunaan:
        typeof body.tanggalPenggunaan === 'string' && body.tanggalPenggunaan.trim()
          ? body.tanggalPenggunaan.trim()
          : prev.tanggalPenggunaan,
      lokasiAtauVendor:
        typeof body.lokasiAtauVendor === 'string'
          ? body.lokasiAtauVendor.trim()
          : prev.lokasiAtauVendor,
      keterangan: typeof body.keterangan === 'string' ? body.keterangan.trim() : prev.keterangan,
      status: nextStatus,
      catatanPengurus:
        user.role === 'admin' && typeof body.catatanPengurus === 'string'
          ? body.catatanPengurus.trim()
          : prev.catatanPengurus,
      reviewedByName: user.role === 'admin' ? user.nama : prev.reviewedByName,
      reviewedAt: user.role === 'admin' ? now : prev.reviewedAt,
      realisasiBiaya:
        user.role === 'admin' && body.realisasiBiaya !== undefined
          ? Math.max(0, Number(body.realisasiBiaya) || 0)
          : prev.realisasiBiaya,
      tanggalRealisasi:
        user.role === 'admin' && typeof body.tanggalRealisasi === 'string'
          ? body.tanggalRealisasi
          : prev.tanggalRealisasi,
      updatedAt: now,
    };

    schoolState.procurementRequests[idx] = updated;
    saveStore(store);
    res.json({ procurement: updated });
  });

  app.delete('/api/procurement/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Tidak diizinkan.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const target = (schoolState.procurementRequests || []).find((p) => p.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
      return;
    }
    if (user.role !== 'admin') {
      if (target.requesterUserId !== user.id) {
        res.status(403).json({ error: 'Hanya pemilik pengajuan atau Admin yang dapat menghapus.' });
        return;
      }
      if (target.status === 'Disetujui' || target.status === 'Sudah Realisasi') {
        res.status(403).json({ error: 'Pengajuan yang sudah disetujui/realisasi tidak dapat dihapus.' });
        return;
      }
    }
    schoolState.procurementRequests = (schoolState.procurementRequests || []).filter(
      (p) => p.id !== req.params.id
    );
    saveStore(store);
    res.json({ ok: true });
  });

  // Requirement #10: Buku Penghubung REST endpoints (school-isolated)
  app.post('/api/penghubung', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'siswa') {
      res.status(403).json({ error: 'Buku Penghubung hanya dapat diakses oleh Orang Tua, Guru, Wali Kelas, dan Pengurus.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const entry = req.body as LogbookEntry;
    if (!entry || !entry.id || !entry.studentId || !entry.judul || !entry.pesan) {
      res.status(400).json({ error: 'Data catatan tidak lengkap.' });
      return;
    }
    if (!canUserAccessStudentInPenghubung(user, entry.studentId)) {
      res.status(403).json({ error: 'Siswa ini tidak termasuk dalam penugasan / tautan akun Anda.' });
      return;
    }
    const stu = schoolState.students.find((s) => s.id === entry.studentId);
    if (!stu) {
      res.status(404).json({ error: 'Data peserta didik tidak ditemukan.' });
      return;
    }
    const now = new Date().toISOString();
    const cleanEntry: LogbookEntry = {
      id: String(entry.id).slice(0, 64),
      studentId: stu.id,
      studentName: stu.nama,
      kelas: stu.kelas,
      subjectName:
        typeof entry.subjectName === 'string' && entry.subjectName.trim()
          ? entry.subjectName.trim().slice(0, 120)
          : undefined,
      kategori:
        typeof entry.kategori === 'string' && entry.kategori.trim()
          ? entry.kategori.trim().slice(0, 80)
          : 'Akademik',
      prioritas: (['Normal', 'Perlu Perhatian', 'Segera'] as const).includes(entry.prioritas)
        ? entry.prioritas
        : 'Normal',
      judul: String(entry.judul).trim().slice(0, 200),
      pesan: String(entry.pesan).trim().slice(0, 4000),
      authorRole: user.role,
      authorName: user.nama,
      status: 'Baru',
      replies: [],
      createdAt: now,
      updatedAt: now,
    };
    if (!schoolState.logbookEntries.some((e) => e.id === cleanEntry.id)) {
      schoolState.logbookEntries = [cleanEntry, ...schoolState.logbookEntries];
      saveStore(store);
      broadcastLogbook(
        user.schoolId,
        { type: 'entry:created', entry: cleanEntry },
        cleanEntry.studentId,
        cleanEntry.kelas
      );
    }
    res.status(201).json({ entry: cleanEntry });
  });

  app.post('/api/penghubung/:id/reply', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'siswa') {
      res.status(403).json({ error: 'Buku Penghubung tidak tersedia untuk akun Siswa.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const entryId = req.params.id;
    const target = schoolState.logbookEntries.find((e) => e.id === entryId);
    if (!target || !canUserAccessStudentInPenghubung(user, target.studentId)) {
      res.status(403).json({ error: 'Anda tidak memiliki akses ke topik Buku Penghubung ini.' });
      return;
    }
    const { reply, status } = req.body || {};
    if (!reply || typeof reply.pesan !== 'string' || !reply.pesan.trim()) {
      res.status(400).json({ error: 'Isi balasan wajib diisi.' });
      return;
    }
    const cleanReply = {
      id:
        typeof reply.id === 'string' && reply.id.trim()
          ? reply.id.trim().slice(0, 64)
          : `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authorRole: user.role,
      authorName: user.nama,
      pesan: reply.pesan.trim().slice(0, 4000),
      createdAt: new Date().toISOString(),
    };
    const nextStatus =
      user.role !== 'ortu' && VALID_LOGBOOK_STATUSES.includes(status)
        ? (status as LogbookEntry['status'])
        : undefined;
    schoolState.logbookEntries = schoolState.logbookEntries.map((e) => {
      if (e.id !== entryId) return e;
      if (e.replies.some((r) => r.id === cleanReply.id)) return e;
      return {
        ...e,
        replies: [...e.replies, cleanReply],
        status: nextStatus || e.status,
        updatedAt: new Date().toISOString(),
      };
    });
    saveStore(store);
    broadcastLogbook(
      user.schoolId,
      { type: 'entry:replied', entryId, reply: cleanReply, status: nextStatus },
      target.studentId,
      target.kelas
    );
    res.json({ ok: true });
  });

  app.patch('/api/penghubung/:id/status', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({
        error: 'Status tindak lanjut hanya diubah oleh Guru / Wali Kelas / Pengurus.',
      });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const entryId = req.params.id;
    const target = schoolState.logbookEntries.find((e) => e.id === entryId);
    if (!target || !canUserAccessStudentInPenghubung(user, target.studentId)) {
      res.status(403).json({ error: 'Anda tidak memiliki akses mengubah status catatan kelas ini.' });
      return;
    }
    const { status } = req.body || {};
    if (!VALID_LOGBOOK_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Status tidak valid.' });
      return;
    }
    schoolState.logbookEntries = schoolState.logbookEntries.map((e) =>
      e.id === entryId ? { ...e, status, updatedAt: new Date().toISOString() } : e
    );
    saveStore(store);
    broadcastLogbook(
      user.schoolId,
      { type: 'entry:status', entryId, status },
      target.studentId,
      target.kelas
    );
    res.json({ ok: true });
  });

  // =====================================================================
  // 1. ASESMEN DIAGNOSTIK AKADEMIK & NON-AKADEMIK (Pengurus -> Login Siswa)
  // =====================================================================
  app.post('/api/diagnostics/packages', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const {
      kodePaket,
      judul,
      deskripsi,
      kategori,
      subjectId,
      targetKelasList,
      durasiMenit,
      status,
      pertanyaan,
    } = req.body || {};

    if (typeof judul !== 'string' || !judul.trim()) {
      res.status(400).json({ error: 'Judul paket asesmen diagnostik wajib diisi.' });
      return;
    }
    const cleanKategori: DiagnosticCategory =
      kategori === 'Pemelajar Mandiri'
        ? 'Pemelajar Mandiri'
        : kategori === 'Non-Akademik'
          ? 'Non-Akademik'
          : 'Akademik';
    const subj =
      cleanKategori === 'Akademik' && typeof subjectId === 'string' && subjectId
        ? schoolState.subjects.find((s) => s.id === subjectId)
        : undefined;
    if (cleanKategori === 'Akademik' && !subj) {
      res.status(400).json({ error: 'Pilih mata pelajaran untuk paket diagnostik Akademik.' });
      return;
    }
    if (!Array.isArray(pertanyaan) || pertanyaan.length === 0) {
      res.status(400).json({ error: 'Paket asesmen wajib memiliki minimal 1 pertanyaan.' });
      return;
    }

    const cleanClasses = Array.isArray(targetKelasList)
      ? targetKelasList.filter((c: unknown) => typeof c === 'string' && schoolState.classes.includes(c))
      : [];
    const targetTingkats = cleanClasses
      .map((c) => schoolState.classDefs.find((d) => d.nama === c)?.tingkat)
      .filter((t): t is number => typeof t === 'number');

    const now = new Date().toISOString();
    const cleanStatus: DiagnosticPackage['status'] =
      status === 'Dirilis' ? 'Dirilis' : status === 'Ditutup' ? 'Ditutup' : 'Draft';

    const pkg: DiagnosticPackage = {
      id: `diagpkg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      kodePaket:
        typeof kodePaket === 'string' && kodePaket.trim()
          ? kodePaket.trim().toUpperCase()
          : `DIAG-${((schoolState.diagnosticPackages || []).length + 1).toString().padStart(2, '0')}`,
      judul: judul.trim(),
      deskripsi: typeof deskripsi === 'string' ? deskripsi.trim() : '',
      kategori: cleanKategori,
      subjectId: subj?.id,
      subjectName: subj?.nama,
      targetKelasList: cleanClasses.length > 0 ? cleanClasses : schoolState.classes,
      targetTingkatList: targetTingkats.length > 0 ? targetTingkats : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      durasiMenit: Math.max(5, Number(durasiMenit) || 20),
      status: cleanStatus,
      isTemplateBuiltIn: false,
      releasedAt: cleanStatus === 'Dirilis' ? now : undefined,
      releasedByName: cleanStatus === 'Dirilis' ? user.nama : undefined,
      pertanyaan: sanitizeDiagnosticQuestions(pertanyaan),
      tahunAjaran: schoolState.settings.tahunAjaran,
      semester: schoolState.settings.semester,
      createdByName: user.nama,
      createdAt: now,
      updatedAt: now,
    };

    schoolState.diagnosticPackages = [pkg, ...(schoolState.diagnosticPackages || [])];
    saveStore(store);
    res.status(201).json({ package: pkg });
  });

  app.put('/api/diagnostics/packages/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.diagnosticPackages || []).findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Paket diagnostik tidak ditemukan.' });
      return;
    }
    const prev = schoolState.diagnosticPackages[idx];
    const body = req.body || {};
    const now = new Date().toISOString();
    const nextStatus: DiagnosticPackage['status'] = ['Draft', 'Dirilis', 'Ditutup'].includes(
      body.status
    )
      ? body.status
      : prev.status;

    const cleanKategori: DiagnosticCategory =
      body.kategori === 'Pemelajar Mandiri'
        ? 'Pemelajar Mandiri'
        : body.kategori === 'Non-Akademik'
          ? 'Non-Akademik'
          : body.kategori === 'Akademik'
            ? 'Akademik'
            : prev.kategori;
    const subj =
      cleanKategori === 'Akademik' && typeof body.subjectId === 'string'
        ? schoolState.subjects.find((s) => s.id === body.subjectId)
        : undefined;

    const cleanClasses = Array.isArray(body.targetKelasList)
      ? body.targetKelasList.filter(
          (c: unknown): c is string => typeof c === 'string' && schoolState.classes.includes(c)
        )
      : prev.targetKelasList;
    const targetKelasFinal: string[] = cleanClasses.length > 0 ? cleanClasses : schoolState.classes;
    const targetTingkats = targetKelasFinal
      .map((c: string) => schoolState.classDefs.find((d) => d.nama === c)?.tingkat)
      .filter((t: number | undefined): t is number => typeof t === 'number');

    const updated: DiagnosticPackage = {
      ...prev,
      kodePaket:
        typeof body.kodePaket === 'string' && body.kodePaket.trim()
          ? body.kodePaket.trim().toUpperCase()
          : prev.kodePaket,
      judul:
        typeof body.judul === 'string' && body.judul.trim() ? body.judul.trim() : prev.judul,
      deskripsi: typeof body.deskripsi === 'string' ? body.deskripsi.trim() : prev.deskripsi,
      kategori: cleanKategori,
      subjectId: cleanKategori === 'Akademik' ? subj?.id ?? prev.subjectId : undefined,
      subjectName: cleanKategori === 'Akademik' ? subj?.nama ?? prev.subjectName : undefined,
      targetKelasList: targetKelasFinal,
      targetTingkatList:
        targetTingkats.length > 0 ? targetTingkats : prev.targetTingkatList,
      durasiMenit:
        body.durasiMenit !== undefined ? Math.max(5, Number(body.durasiMenit) || 20) : prev.durasiMenit,
      status: nextStatus,
      releasedAt: nextStatus === 'Dirilis' ? prev.releasedAt || now : prev.releasedAt,
      releasedByName: nextStatus === 'Dirilis' ? prev.releasedByName || user.nama : prev.releasedByName,
      pertanyaan:
        Array.isArray(body.pertanyaan) && body.pertanyaan.length > 0
          ? sanitizeDiagnosticQuestions(body.pertanyaan)
          : prev.pertanyaan,
      updatedAt: now,
    };

    schoolState.diagnosticPackages[idx] = updated;
    saveStore(store);
    res.json({ package: updated });
  });

  app.patch(
    '/api/diagnostics/packages/:id/release',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const schoolState = getSchoolState(user.schoolId);
      const idx = (schoolState.diagnosticPackages || []).findIndex((p) => p.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Paket diagnostik tidak ditemukan.' });
        return;
      }
      const { status, targetKelasList } = req.body || {};
      const nextStatus: DiagnosticPackage['status'] = ['Draft', 'Dirilis', 'Ditutup'].includes(
        status
      )
        ? status
        : 'Dirilis';
      const now = new Date().toISOString();
      const prev = schoolState.diagnosticPackages[idx];
      const updated: DiagnosticPackage = {
        ...prev,
        status: nextStatus,
        targetKelasList: Array.isArray(targetKelasList)
          ? targetKelasList.filter(
              (c: unknown): c is string => typeof c === 'string' && schoolState.classes.includes(c)
            )
          : prev.targetKelasList,
        releasedAt: nextStatus === 'Dirilis' ? now : prev.releasedAt,
        releasedByName: nextStatus === 'Dirilis' ? user.nama : prev.releasedByName,
        updatedAt: now,
      };
      schoolState.diagnosticPackages[idx] = updated;
      saveStore(store);
      res.json({ package: updated });
    }
  );

  app.delete('/api/diagnostics/packages/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const exists = (schoolState.diagnosticPackages || []).some((p) => p.id === req.params.id);
    if (!exists) {
      res.status(404).json({ error: 'Paket diagnostik tidak ditemukan.' });
      return;
    }
    schoolState.diagnosticPackages = (schoolState.diagnosticPackages || []).filter(
      (p) => p.id !== req.params.id
    );
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/diagnostics/submissions', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role !== 'siswa' && user.role !== 'admin') {
      res.status(403).json({
        error: 'Pengisian asesmen diagnostik dilakukan oleh akun Siswa (atau simulasi Pengurus).',
      });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { packageId, studentId: requestedStudentId, answers } = req.body || {};

    const pkg = (schoolState.diagnosticPackages || []).find((p) => p.id === packageId);
    if (!pkg) {
      res.status(404).json({ error: 'Paket asesmen diagnostik tidak ditemukan.' });
      return;
    }
    if (user.role === 'siswa' && pkg.status !== 'Dirilis') {
      res.status(403).json({ error: 'Paket asesmen ini belum dirilis atau sudah ditutup.' });
      return;
    }

    const targetStudentId =
      user.role === 'siswa'
        ? (user.linkedStudentIds || [])[0]
        : typeof requestedStudentId === 'string'
          ? requestedStudentId
          : '';

    const stu = schoolState.students.find((s) => s.id === targetStudentId);
    if (!stu) {
      res.status(404).json({ error: 'Data peserta didik tidak ditemukan pada sekolah ini.' });
      return;
    }
    if (user.role === 'siswa') {
      if (pkg.targetKelasList.length > 0 && !pkg.targetKelasList.includes(stu.kelas)) {
        res.status(403).json({ error: 'Paket asesmen ini tidak ditujukan untuk kelas Anda.' });
        return;
      }
      if (pkg.kategori === 'Akademik' && pkg.subjectId) {
        const stuSubjs = getSubjectsForClass(
          schoolState.subjects,
          stu.kelas,
          schoolState.classDefs,
          stu.jurusan || 'Umum'
        );
        if (!stuSubjs.some((s) => s.id === pkg.subjectId)) {
          res.status(403).json({ error: 'Mata pelajaran paket ini tidak termasuk dalam mapel kelas Anda.' });
          return;
        }
      }
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      res.status(400).json({ error: 'Jawaban asesmen tidak boleh kosong.' });
      return;
    }

    const cleanAnswers: DiagnosticAnswer[] = answers.map((a: DiagnosticAnswer) => {
      const cleanMatching: Record<string, string> | undefined =
        a.matchingAnswers && typeof a.matchingAnswers === 'object'
          ? Object.fromEntries(
              Object.entries(a.matchingAnswers)
                .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
                .map(([k, v]) => [k, v.trim()])
            )
          : undefined;
      return {
        questionId: String(a.questionId || ''),
        selectedOptionId:
          typeof a.selectedOptionId === 'string' ? a.selectedOptionId : undefined,
        selectedOptionIds: Array.isArray(a.selectedOptionIds)
          ? a.selectedOptionIds.filter((id): id is string => typeof id === 'string')
          : undefined,
        matchingAnswers: cleanMatching,
        imageDataUrl: sanitizeImageDataUrl(a.imageDataUrl),
        imageCaption: typeof a.imageCaption === 'string' ? a.imageCaption.trim() : undefined,
        scaleValue: typeof a.scaleValue === 'number' ? a.scaleValue : undefined,
        textAnswer: typeof a.textAnswer === 'string' ? a.textAnswer.trim() : undefined,
      };
    });

    const evaluated = evaluateDiagnosticSubmission(pkg, cleanAnswers);
    const now = new Date().toISOString();

    const existingIdx = (schoolState.diagnosticSubmissions || []).findIndex(
      (s) => s.packageId === pkg.id && s.studentId === stu.id
    );

    const sub: DiagnosticSubmission = {
      id:
        existingIdx >= 0
          ? schoolState.diagnosticSubmissions[existingIdx].id
          : `dsub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      studentId: stu.id,
      studentName: stu.nama,
      nis: stu.nis,
      kelas: stu.kelas,
      tahunAjaran: schoolState.settings.tahunAjaran,
      semester: schoolState.settings.semester,
      submittedAt: now,
      answers: cleanAnswers,
      ...evaluated,
    };

    if (existingIdx >= 0) {
      schoolState.diagnosticSubmissions[existingIdx] = sub;
    } else {
      schoolState.diagnosticSubmissions = [sub, ...(schoolState.diagnosticSubmissions || [])];
    }
    saveStore(store);
    res.status(201).json({ submission: sub });
  });

  app.patch(
    '/api/diagnostics/submissions/:id/verify',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const schoolState = getSchoolState(user.schoolId);
      const idx = (schoolState.diagnosticSubmissions || []).findIndex(
        (s) => s.id === req.params.id
      );
      if (idx === -1) {
        res.status(404).json({ error: 'Hasil asesmen diagnostik tidak ditemukan.' });
        return;
      }
      const { catatanAnalisisPengurus, keputusanTindakLanjut } = req.body || {};
      const prev = schoolState.diagnosticSubmissions[idx];
      const updated: DiagnosticSubmission = {
        ...prev,
        catatanAnalisisPengurus:
          typeof catatanAnalisisPengurus === 'string'
            ? catatanAnalisisPengurus.trim()
            : prev.catatanAnalisisPengurus,
        keputusanTindakLanjut:
          typeof keputusanTindakLanjut === 'string'
            ? keputusanTindakLanjut.trim()
            : prev.keputusanTindakLanjut,
        verifiedByName: user.nama,
        verifiedAt: new Date().toISOString(),
      };
      schoolState.diagnosticSubmissions[idx] = updated;
      saveStore(store);
      res.json({ submission: updated });
    }
  );

  // =====================================================================
  // 2. RUANG LMS (Materi, Tugas, Penilaian & Forum Guru/Wali/Pengurus <-> Siswa)
  // =====================================================================
  const canManageLmsScope = (user: StoredUser, kelas: string, subjectId: string) => {
    if (user.role === 'admin') return true;
    if (user.role === 'walikelas' && user.waliKelasTarget === kelas) return true;
    if (user.role === 'guru' || user.role === 'walikelas') {
      const subjs = getAssignedSubjectIdsForUserServer(user, kelas);
      return Boolean(subjs && subjs.has(subjectId));
    }
    return false;
  };

  const canStudentAccessLmsScope = (user: StoredUser, schoolState: AppState, kelas: string, subjectId: string) => {
    if (user.role !== 'siswa') return false;
    const linked = new Set(user.linkedStudentIds || []);
    return schoolState.students.some((stu) => {
      if (!linked.has(stu.id) || stu.kelas !== kelas) return false;
      const enrolled = getSubjectsForClass(
        schoolState.subjects,
        stu.kelas,
        schoolState.classDefs,
        stu.jurusan || 'Umum'
      );
      return enrolled.some((s) => s.id === subjectId);
    });
  };

  app.post('/api/lms/materials', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Hanya Guru, Wali Kelas, atau Pengurus yang dapat mengunggah materi LMS.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { kelas, subjectId, cpKode, tpKode, judul, tipe, konten, resourceUrl } = req.body || {};

    if (typeof kelas !== 'string' || typeof subjectId !== 'string' || typeof judul !== 'string' || !judul.trim()) {
      res.status(400).json({ error: 'Kelas, mata pelajaran, dan judul materi wajib diisi.' });
      return;
    }
    if (!canManageLmsScope(user, kelas, subjectId)) {
      res.status(403).json({ error: 'Anda tidak memiliki penugasan untuk kelas/mata pelajaran ini.' });
      return;
    }
    const subj = schoolState.subjects.find((s) => s.id === subjectId);
    if (!subj) {
      res.status(404).json({ error: 'Mata pelajaran tidak ditemukan.' });
      return;
    }
    const safeUrl = validateSafeHttpUrl(resourceUrl);
    if (typeof resourceUrl === 'string' && resourceUrl.trim() && !safeUrl) {
      res.status(400).json({ error: 'URL tautan materi tidak valid (gunakan http:// atau https://).' });
      return;
    }

    const now = new Date().toISOString();
    const material: LmsMaterial = {
      id: `lmsmat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      kelas,
      subjectId: subj.id,
      subjectName: subj.nama,
      cpKode: typeof cpKode === 'string' ? cpKode.trim() : undefined,
      tpKode: typeof tpKode === 'string' ? tpKode.trim() : undefined,
      judul: judul.trim(),
      tipe: ['Modul Bacaan', 'Video Pembelajaran', 'Lembar Kerja / Tautan'].includes(tipe)
        ? tipe
        : 'Modul Bacaan',
      konten: typeof konten === 'string' ? konten.trim() : '',
      resourceUrl: safeUrl || undefined,
      authorUserId: user.id,
      authorName: user.nama,
      authorRole: user.role as 'admin' | 'walikelas' | 'guru',
      completedByStudentIds: [],
      createdAt: now,
      updatedAt: now,
    };

    schoolState.lmsMaterials = [material, ...(schoolState.lmsMaterials || [])];
    saveStore(store);
    res.status(201).json({ material });
  });

  app.delete('/api/lms/materials/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Tidak diizinkan menghapus materi LMS.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const target = (schoolState.lmsMaterials || []).find((m) => m.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Materi LMS tidak ditemukan.' });
      return;
    }
    if (!canManageLmsScope(user, target.kelas, target.subjectId)) {
      res.status(403).json({ error: 'Anda tidak memiliki akses menghapus materi ini.' });
      return;
    }
    schoolState.lmsMaterials = (schoolState.lmsMaterials || []).filter(
      (m) => m.id !== req.params.id
    );
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/lms/materials/:id/complete', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role !== 'siswa') {
      res.status(403).json({ error: 'Penanda selesai modul dilakukan dari akun Siswa.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.lmsMaterials || []).findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Materi LMS tidak ditemukan.' });
      return;
    }
    const mat = schoolState.lmsMaterials[idx];
    if (!canStudentAccessLmsScope(user, schoolState, mat.kelas, mat.subjectId)) {
      res.status(403).json({ error: 'Materi ini tidak tersedia untuk kelas atau mapel Anda.' });
      return;
    }
    const stuId = (user.linkedStudentIds || [])[0];
    if (!stuId) {
      res.status(400).json({ error: 'Akun siswa belum tertaut dengan data peserta didik.' });
      return;
    }
    const prevSet = new Set(mat.completedByStudentIds || []);
    if (prevSet.has(stuId)) prevSet.delete(stuId);
    else prevSet.add(stuId);

    const updated: LmsMaterial = {
      ...mat,
      completedByStudentIds: Array.from(prevSet),
      updatedAt: new Date().toISOString(),
    };
    schoolState.lmsMaterials[idx] = updated;
    saveStore(store);
    res.json({ material: updated });
  });

  app.post('/api/lms/assignments', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Hanya Guru, Wali Kelas, atau Pengurus yang dapat membuat tugas LMS.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { kelas, subjectId, cpKode, tpKode, judul, instruksi, tenggat, skorMaksimal } = req.body || {};
    if (typeof kelas !== 'string' || typeof subjectId !== 'string' || typeof judul !== 'string' || !judul.trim()) {
      res.status(400).json({ error: 'Kelas, mata pelajaran, dan judul tugas wajib diisi.' });
      return;
    }
    if (!canManageLmsScope(user, kelas, subjectId)) {
      res.status(403).json({ error: 'Anda tidak memiliki penugasan untuk kelas/mapel ini.' });
      return;
    }
    const subj = schoolState.subjects.find((s) => s.id === subjectId);
    if (!subj) {
      res.status(404).json({ error: 'Mata pelajaran tidak ditemukan.' });
      return;
    }

    const now = new Date().toISOString();
    const assignment: LmsAssignment = {
      id: `lmsasg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      kelas,
      subjectId: subj.id,
      subjectName: subj.nama,
      cpKode: typeof cpKode === 'string' ? cpKode.trim() : undefined,
      tpKode: typeof tpKode === 'string' ? tpKode.trim() : undefined,
      judul: judul.trim(),
      instruksi: typeof instruksi === 'string' ? instruksi.trim() : '',
      tenggat: typeof tenggat === 'string' && tenggat.trim() ? tenggat.trim() : now.slice(0, 10),
      skorMaksimal: Math.min(100, Math.max(10, Number(skorMaksimal) || 100)),
      authorUserId: user.id,
      authorName: user.nama,
      authorRole: user.role as 'admin' | 'walikelas' | 'guru',
      status: 'Aktif',
      createdAt: now,
      updatedAt: now,
    };

    schoolState.lmsAssignments = [assignment, ...(schoolState.lmsAssignments || [])];
    saveStore(store);
    res.status(201).json({ assignment });
  });

  app.delete('/api/lms/assignments/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Tidak diizinkan.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const target = (schoolState.lmsAssignments || []).find((a) => a.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Tugas LMS tidak ditemukan.' });
      return;
    }
    if (!canManageLmsScope(user, target.kelas, target.subjectId)) {
      res.status(403).json({ error: 'Anda tidak memiliki akses menghapus tugas ini.' });
      return;
    }
    schoolState.lmsAssignments = (schoolState.lmsAssignments || []).filter(
      (a) => a.id !== req.params.id
    );
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/lms/submissions', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role !== 'siswa') {
      res.status(403).json({ error: 'Pengumpulan tugas LMS dilakukan oleh akun Siswa.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { assignmentId, jawabanTeks, lampiranUrl } = req.body || {};

    const asg = (schoolState.lmsAssignments || []).find((a) => a.id === assignmentId);
    if (!asg) {
      res.status(404).json({ error: 'Tugas LMS tidak ditemukan.' });
      return;
    }
    if (asg.status !== 'Aktif') {
      res.status(403).json({ error: 'Tugas ini sudah ditutup oleh guru.' });
      return;
    }
    if (!canStudentAccessLmsScope(user, schoolState, asg.kelas, asg.subjectId)) {
      res.status(403).json({ error: 'Tugas ini bukan untuk kelas atau mapel Anda.' });
      return;
    }
    if (typeof jawabanTeks !== 'string' || !jawabanTeks.trim()) {
      res.status(400).json({ error: 'Isi jawaban tugas wajib ditulis sebelum dikirim.' });
      return;
    }
    const safeUrl = validateSafeHttpUrl(lampiranUrl);
    if (typeof lampiranUrl === 'string' && lampiranUrl.trim() && !safeUrl) {
      res.status(400).json({ error: 'Tautan lampiran tugas harus berupa URL http:// atau https://.' });
      return;
    }

    const stuId = (user.linkedStudentIds || [])[0];
    const stu = schoolState.students.find((s) => s.id === stuId);
    if (!stu) {
      res.status(404).json({ error: 'Data siswa tidak ditemukan.' });
      return;
    }

    const now = new Date().toISOString();
    const existingIdx = (schoolState.lmsSubmissions || []).findIndex(
      (s) => s.assignmentId === asg.id && s.studentId === stu.id
    );

    const sub: LmsSubmission = {
      id:
        existingIdx >= 0
          ? schoolState.lmsSubmissions[existingIdx].id
          : `lmssub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      assignmentId: asg.id,
      studentId: stu.id,
      studentName: stu.nama,
      nis: stu.nis,
      kelas: stu.kelas,
      jawabanTeks: jawabanTeks.trim(),
      lampiranUrl: safeUrl || undefined,
      submittedAt: now,
    };

    if (existingIdx >= 0) {
      schoolState.lmsSubmissions[existingIdx] = {
        ...schoolState.lmsSubmissions[existingIdx],
        ...sub,
      };
    } else {
      schoolState.lmsSubmissions = [sub, ...(schoolState.lmsSubmissions || [])];
    }
    saveStore(store);
    res.status(201).json({ submission: existingIdx >= 0 ? schoolState.lmsSubmissions[existingIdx] : sub });
  });

  app.patch('/api/lms/submissions/:id/grade', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu' || user.role === 'siswa') {
      res.status(403).json({ error: 'Penilaian tugas hanya dilakukan oleh Guru, Wali Kelas, atau Pengurus.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.lmsSubmissions || []).findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pengumpulan tugas tidak ditemukan.' });
      return;
    }
    const prev = schoolState.lmsSubmissions[idx];
    const asg = (schoolState.lmsAssignments || []).find((a) => a.id === prev.assignmentId);
    if (!asg || !canManageLmsScope(user, asg.kelas, asg.subjectId)) {
      res.status(403).json({ error: 'Anda tidak memiliki penugasan menilai tugas mapel/kelas ini.' });
      return;
    }

    const { nilai, umpanBalikGuru } = req.body || {};
    const numScore = Number(nilai);
    if (!Number.isFinite(numScore) || numScore < 0 || numScore > asg.skorMaksimal) {
      res.status(400).json({ error: `Nilai harus berada di rentang 0–${asg.skorMaksimal}.` });
      return;
    }

    const updated: LmsSubmission = {
      ...prev,
      nilai: Math.round(numScore),
      umpanBalikGuru: typeof umpanBalikGuru === 'string' ? umpanBalikGuru.trim() : '',
      gradedByName: user.nama,
      gradedAt: new Date().toISOString(),
    };
    schoolState.lmsSubmissions[idx] = updated;
    saveStore(store);
    res.json({ submission: updated });
  });

  app.post('/api/lms/discussions', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ortu') {
      res.status(403).json({ error: 'Forum diskusi Ruang LMS hanya untuk Siswa dan Pendidik.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { kelas, subjectId, pesan } = req.body || {};
    if (typeof kelas !== 'string' || typeof subjectId !== 'string' || typeof pesan !== 'string' || !pesan.trim()) {
      res.status(400).json({ error: 'Kelas, mapel, dan isi pesan diskusi wajib diisi.' });
      return;
    }

    const allowed =
      user.role === 'siswa'
        ? canStudentAccessLmsScope(user, schoolState, kelas, subjectId)
        : canManageLmsScope(user, kelas, subjectId);
    if (!allowed) {
      res.status(403).json({ error: 'Anda tidak memiliki akses ke forum diskusi kelas/mapel ini.' });
      return;
    }
    const subj = schoolState.subjects.find((s) => s.id === subjectId);
    if (!subj) {
      res.status(404).json({ error: 'Mata pelajaran tidak ditemukan.' });
      return;
    }

    const disc: LmsDiscussion = {
      id: `lmsdsc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      kelas,
      subjectId: subj.id,
      subjectName: subj.nama,
      authorUserId: user.id,
      authorName: user.nama,
      authorRole: user.role,
      pesan: pesan.trim(),
      createdAt: new Date().toISOString(),
    };

    schoolState.lmsDiscussions = [...(schoolState.lmsDiscussions || []), disc];
    saveStore(store);
    res.status(201).json({ discussion: disc });
  });

  // =====================================================================
  // 3. ASESMEN & PELATIHAN TENDIK + VIDEO UPLOAD & REFLEKSI POTONGAN MENIT
  // =====================================================================
  app.post('/api/tendik/packages', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const {
      kodePaket,
      judul,
      deskripsi,
      kompetensiList,
      targetRoles,
      wajibUploadVideo,
      instruksiVideo,
      minRefleksiSegmen,
      durasiMenit,
      status,
      pertanyaan,
    } = req.body || {};

    if (typeof judul !== 'string' || !judul.trim()) {
      res.status(400).json({ error: 'Judul paket asesmen/pelatihan tendik wajib diisi.' });
      return;
    }
    const cleanKomps: TendikCompetency[] = Array.isArray(kompetensiList)
      ? kompetensiList.filter((k: TendikCompetency) => TENDIK_COMPETENCIES.includes(k))
      : [...TENDIK_COMPETENCIES];
    if (cleanKomps.length === 0) {
      res.status(400).json({ error: 'Pilih minimal 1 kompetensi Tendik.' });
      return;
    }
    if (!Array.isArray(pertanyaan) || pertanyaan.length === 0) {
      res.status(400).json({ error: 'Paket Tendik wajib memiliki minimal 1 pertanyaan evaluasi.' });
      return;
    }

    const now = new Date().toISOString();
    const cleanStatus: TendikTrainingPackage['status'] =
      status === 'Dirilis' ? 'Dirilis' : status === 'Ditutup' ? 'Ditutup' : 'Draft';

    const pkg: TendikTrainingPackage = {
      id: `tdkpkg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      kodePaket:
        typeof kodePaket === 'string' && kodePaket.trim()
          ? kodePaket.trim().toUpperCase()
          : `TDK-${((schoolState.tendikPackages || []).length + 1).toString().padStart(2, '0')}`,
      judul: judul.trim(),
      deskripsi: typeof deskripsi === 'string' ? deskripsi.trim() : '',
      kompetensiList: cleanKomps,
      targetRoles:
        Array.isArray(targetRoles) && targetRoles.length > 0
          ? targetRoles.filter((r: string) => r === 'guru' || r === 'walikelas')
          : ['guru', 'walikelas'],
      wajibUploadVideo: typeof wajibUploadVideo === 'boolean' ? wajibUploadVideo : true,
      instruksiVideo:
        typeof instruksiVideo === 'string'
          ? instruksiVideo.trim()
          : 'Unggah video praktik pembelajaran lalu tandai potongan menit penting untuk direfleksikan.',
      minRefleksiSegmen: Math.max(0, Number(minRefleksiSegmen) ?? 1),
      durasiMenit: Math.max(10, Number(durasiMenit) || 30),
      status: cleanStatus,
      isTemplateBuiltIn: false,
      pertanyaan: sanitizeTendikQuestions(pertanyaan),
      tahunAjaran: schoolState.settings.tahunAjaran,
      createdByName: user.nama,
      releasedAt: cleanStatus === 'Dirilis' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    schoolState.tendikPackages = [pkg, ...(schoolState.tendikPackages || [])];
    saveStore(store);
    res.status(201).json({ package: pkg });
  });

  app.put('/api/tendik/packages/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.tendikPackages || []).findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Paket pelatihan Tendik tidak ditemukan.' });
      return;
    }
    const prev = schoolState.tendikPackages[idx];
    const body = req.body || {};
    const now = new Date().toISOString();
    const nextStatus: TendikTrainingPackage['status'] = ['Draft', 'Dirilis', 'Ditutup'].includes(
      body.status
    )
      ? body.status
      : prev.status;

    const updated: TendikTrainingPackage = {
      ...prev,
      kodePaket:
        typeof body.kodePaket === 'string' && body.kodePaket.trim()
          ? body.kodePaket.trim().toUpperCase()
          : prev.kodePaket,
      judul:
        typeof body.judul === 'string' && body.judul.trim() ? body.judul.trim() : prev.judul,
      deskripsi: typeof body.deskripsi === 'string' ? body.deskripsi.trim() : prev.deskripsi,
      kompetensiList: Array.isArray(body.kompetensiList)
        ? body.kompetensiList.filter((k: TendikCompetency) => TENDIK_COMPETENCIES.includes(k))
        : prev.kompetensiList,
      wajibUploadVideo:
        typeof body.wajibUploadVideo === 'boolean' ? body.wajibUploadVideo : prev.wajibUploadVideo,
      instruksiVideo:
        typeof body.instruksiVideo === 'string'
          ? body.instruksiVideo.trim()
          : prev.instruksiVideo,
      minRefleksiSegmen:
        body.minRefleksiSegmen !== undefined
          ? Math.max(0, Number(body.minRefleksiSegmen) || 0)
          : prev.minRefleksiSegmen,
      durasiMenit:
        body.durasiMenit !== undefined
          ? Math.max(10, Number(body.durasiMenit) || 30)
          : prev.durasiMenit,
      status: nextStatus,
      releasedAt: nextStatus === 'Dirilis' ? prev.releasedAt || now : prev.releasedAt,
      pertanyaan:
        Array.isArray(body.pertanyaan) && body.pertanyaan.length > 0
          ? sanitizeTendikQuestions(body.pertanyaan)
          : prev.pertanyaan,
      updatedAt: now,
    };

    schoolState.tendikPackages[idx] = updated;
    saveStore(store);
    res.json({ package: updated });
  });

  app.delete('/api/tendik/packages/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const exists = (schoolState.tendikPackages || []).some((p) => p.id === req.params.id);
    if (!exists) {
      res.status(404).json({ error: 'Paket Tendik tidak ditemukan.' });
      return;
    }
    schoolState.tendikPackages = (schoolState.tendikPackages || []).filter(
      (p) => p.id !== req.params.id
    );
    saveStore(store);
    res.json({ ok: true });
  });

  // Binary Video Upload for Tendik (strict MIME/extension allowlist & tenant-isolated storage)
  app.post(
    '/api/tendik/upload-video',
    requireAuth,
    express.raw({
      type: ['video/mp4', 'video/webm', 'video/quicktime', 'application/octet-stream'],
      limit: '80mb',
    }),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      if (user.role !== 'guru' && user.role !== 'walikelas' && user.role !== 'admin') {
        res.status(403).json({ error: 'Unggah video pelatihan Tendik hanya untuk Guru, Wali Kelas, atau Pengurus.' });
        return;
      }
      const rawBody = req.body;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        res.status(400).json({ error: 'Berkas video kosong atau format Content-Type tidak didukung.' });
        return;
      }

      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      const origName = String(req.headers['x-file-name'] || 'video.mp4').toLowerCase();
      let ext: '.mp4' | '.webm' | '.mov' = '.mp4';
      if (contentType.includes('webm') || origName.endsWith('.webm')) {
        ext = '.webm';
      } else if (contentType.includes('quicktime') || origName.endsWith('.mov')) {
        ext = '.mov';
      } else if (contentType.includes('mp4') || origName.endsWith('.mp4')) {
        ext = '.mp4';
      } else {
        res.status(400).json({ error: 'Format video harus berupa MP4, WebM, atau MOV.' });
        return;
      }

      if (!isValidVideoMagicBytes(rawBody, ext)) {
        res.status(400).json({
          error: 'Isi berkas tidak sesuai dengan format video MP4, WebM, atau MOV yang sah.',
        });
        return;
      }

      const safeSchoolDir = path.resolve(UPLOADS_TENDIK_DIR, user.schoolId.replace(/[^a-zA-Z0-9_-]/g, '_'));
      fs.mkdirSync(safeSchoolDir, { recursive: true });
      const fileName = `tdkvid-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
      const targetPath = path.resolve(safeSchoolDir, fileName);
      if (!targetPath.startsWith(safeSchoolDir + path.sep)) {
        res.status(400).json({ error: 'Nama berkas tidak valid.' });
        return;
      }

      fs.writeFileSync(targetPath, rawBody);
      uploadedVideoOwners.set(`${user.schoolId}/${fileName}`, user.id);
      res.status(201).json({
        fileName,
        videoUrl: `/api/tendik/video/${encodeURIComponent(user.schoolId)}/${encodeURIComponent(fileName)}`,
        sizeBytes: rawBody.length,
      });
    }
  );

  // Authenticated & tenant-isolated Video Streaming with HTTP 206 Range Support
  app.get('/api/tendik/video/:schoolId/:fileName', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const token = bearerToken || queryToken;
    const user = token ? verifySessionToken(token) : null;
    if (!user) {
      res.status(401).json({ error: 'Autentikasi diperlukan untuk memutar video pelatihan.' });
      return;
    }

    const reqSchoolId = String(req.params.schoolId || '');
    const reqFileName = String(req.params.fileName || '');
    if (user.schoolId !== reqSchoolId) {
      res.status(403).json({ error: 'Akses lintas sekolah ditolak.' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+\.(mp4|webm|mov)$/.test(reqFileName)) {
      res.status(400).json({ error: 'Nama file video tidak valid.' });
      return;
    }

    if (user.role !== 'admin') {
      const schoolState = getSchoolState(user.schoolId);
      const isSubmissionOwner = (schoolState.tendikSubmissions || []).some(
        (s) => s.userId === user.id && s.videoFileName === reqFileName
      );
      const isSessionUploader =
        uploadedVideoOwners.get(`${user.schoolId}/${reqFileName}`) === user.id;
      if (!isSubmissionOwner && !isSessionUploader) {
        res.status(403).json({
          error: 'Anda hanya dapat memutar video pelatihan yang Anda unggah sendiri.',
        });
        return;
      }
    }

    const safeSchoolDir = path.resolve(UPLOADS_TENDIK_DIR, user.schoolId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    const filePath = path.resolve(safeSchoolDir, reqFileName);
    if (!filePath.startsWith(safeSchoolDir + path.sep) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Berkas video tidak ditemukan.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const total = stat.size;
    const mimeType = reqFileName.endsWith('.webm')
      ? 'video/webm'
      : reqFileName.endsWith('.mov')
        ? 'video/quicktime'
        : 'video/mp4';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      if (Number.isNaN(start) || start >= total || end >= total || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': mimeType,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  app.post('/api/tendik/submissions', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role !== 'guru' && user.role !== 'walikelas' && user.role !== 'admin') {
      res.status(403).json({ error: 'Pengisian asesmen Tendik hanya untuk Guru, Wali Kelas, atau Pengurus.' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const {
      packageId,
      answers,
      videoSourceType,
      videoFileName,
      videoUrl,
      videoJudul,
      videoDurasiDetik,
      refleksiSegmen,
    } = req.body || {};

    const pkg = (schoolState.tendikPackages || []).find((p) => p.id === packageId);
    if (!pkg) {
      res.status(404).json({ error: 'Paket pelatihan Tendik tidak ditemukan.' });
      return;
    }
    if (user.role !== 'admin' && pkg.status !== 'Dirilis') {
      res.status(403).json({ error: 'Paket pelatihan ini belum dirilis atau sudah ditutup.' });
      return;
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      res.status(400).json({ error: 'Jawaban instrumen asesmen tendik wajib diisi.' });
      return;
    }

    const cleanSourceType: TendikSubmission['videoSourceType'] =
      videoSourceType === 'upload' ? 'upload' : videoSourceType === 'url' ? 'url' : 'none';

    let finalVideoUrl: string | undefined;
    let finalVideoFileName: string | undefined;

    if (cleanSourceType === 'upload') {
      if (typeof videoFileName !== 'string' || !/^[a-zA-Z0-9_-]+\.(mp4|webm|mov)$/.test(videoFileName)) {
        res.status(400).json({ error: 'Berkas video unggahan tidak valid.' });
        return;
      }
      const safeSchoolDir = path.resolve(
        UPLOADS_TENDIK_DIR,
        user.schoolId.replace(/[^a-zA-Z0-9_-]/g, '_')
      );
      const targetPath = path.resolve(safeSchoolDir, videoFileName);
      if (!targetPath.startsWith(safeSchoolDir + path.sep) || !fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Berkas video unggahan tidak ditemukan di server.' });
        return;
      }
      if (user.role !== 'admin') {
        const ownsUploaded =
          uploadedVideoOwners.get(`${user.schoolId}/${videoFileName}`) === user.id ||
          (schoolState.tendikSubmissions || []).some(
            (s) => s.userId === user.id && s.videoFileName === videoFileName
          );
        if (!ownsUploaded) {
          res.status(403).json({
            error: 'Anda tidak dapat melampirkan berkas video milik peserta lain.',
          });
          return;
        }
      }
      finalVideoFileName = videoFileName;
      finalVideoUrl = `/api/tendik/video/${encodeURIComponent(user.schoolId)}/${encodeURIComponent(videoFileName)}`;
    } else if (cleanSourceType === 'url') {
      const safeExternal = validateSafeHttpUrl(videoUrl);
      if (!safeExternal) {
        res.status(400).json({ error: 'Tautan video eksternal harus berupa URL http:// atau https:// yang valid.' });
        return;
      }
      finalVideoUrl = safeExternal;
    }

    const cleanSegments: TendikVideoReflectionSegment[] = Array.isArray(refleksiSegmen)
      ? refleksiSegmen
          .filter(
            (seg: TendikVideoReflectionSegment) =>
              seg && typeof seg.refleksiDiri === 'string' && seg.refleksiDiri.trim()
          )
          .map((seg: TendikVideoReflectionSegment, idx: number) => ({
            id: typeof seg.id === 'string' && seg.id ? seg.id : `seg-${Date.now()}-${idx}`,
            startDetik: Math.max(0, Math.round(Number(seg.startDetik) || 0)),
            endDetik: Math.max(0, Math.round(Number(seg.endDetik) || 0)),
            startLabel: typeof seg.startLabel === 'string' ? seg.startLabel : '00:00',
            endLabel: typeof seg.endLabel === 'string' ? seg.endLabel : '00:30',
            kompetensiTerkait: TENDIK_COMPETENCIES.includes(seg.kompetensiTerkait)
              ? seg.kompetensiTerkait
              : 'Pedagogik',
            aspekDiamati: typeof seg.aspekDiamati === 'string' ? seg.aspekDiamati.trim() : '',
            refleksiDiri: seg.refleksiDiri.trim(),
            rencanaPerbaikan:
              typeof seg.rencanaPerbaikan === 'string' ? seg.rencanaPerbaikan.trim() : '',
          }))
      : [];

    if (pkg.wajibUploadVideo) {
      if (cleanSourceType === 'none' || !finalVideoUrl) {
        res.status(400).json({ error: 'Paket pelatihan ini mewajibkan unggahan video atau tautan video praktik.' });
        return;
      }
      if (cleanSegments.length < pkg.minRefleksiSegmen) {
        res.status(400).json({
          error: `Wajib menyertakan minimal ${pkg.minRefleksiSegmen} refleksi potongan menit video.`,
        });
        return;
      }
    }

    const cleanAnswers: DiagnosticAnswer[] = answers.map((a: DiagnosticAnswer) => {
      const cleanMatching: Record<string, string> | undefined =
        a.matchingAnswers && typeof a.matchingAnswers === 'object'
          ? Object.fromEntries(
              Object.entries(a.matchingAnswers)
                .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
                .map(([k, v]) => [k, v.trim()])
            )
          : undefined;
      return {
        questionId: String(a.questionId || ''),
        selectedOptionId:
          typeof a.selectedOptionId === 'string' ? a.selectedOptionId : undefined,
        selectedOptionIds: Array.isArray(a.selectedOptionIds)
          ? a.selectedOptionIds.filter((id): id is string => typeof id === 'string')
          : undefined,
        matchingAnswers: cleanMatching,
        imageDataUrl: sanitizeImageDataUrl(a.imageDataUrl),
        imageCaption: typeof a.imageCaption === 'string' ? a.imageCaption.trim() : undefined,
        textAnswer: typeof a.textAnswer === 'string' ? a.textAnswer.trim() : undefined,
      };
    });

    const { skorPerKompetensi, skorAsesmenTotal } = evaluateTendikSubmission(pkg, cleanAnswers);
    const now = new Date().toISOString();

    const existingIdx = (schoolState.tendikSubmissions || []).findIndex(
      (s) => s.packageId === pkg.id && s.userId === user.id
    );

    const sub: TendikSubmission = {
      id:
        existingIdx >= 0
          ? schoolState.tendikSubmissions[existingIdx].id
          : `tdksub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      packageId: pkg.id,
      packageJudul: pkg.judul,
      userId: user.id,
      userName: user.nama,
      userRole: user.role as 'guru' | 'walikelas' | 'admin',
      nip: user.nip || '',
      tahunAjaran: schoolState.settings.tahunAjaran,
      answers: cleanAnswers,
      skorPerKompetensi,
      skorAsesmenTotal,
      videoSourceType: cleanSourceType,
      videoFileName: finalVideoFileName,
      videoUrl: finalVideoUrl,
      videoJudul: typeof videoJudul === 'string' ? videoJudul.trim() : '',
      videoDurasiDetik:
        typeof videoDurasiDetik === 'number' ? Math.max(0, Math.round(videoDurasiDetik)) : undefined,
      refleksiSegmen: cleanSegments,
      statusReview: 'Belum Ditinjau',
      submittedAt: now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      schoolState.tendikSubmissions[existingIdx] = sub;
    } else {
      schoolState.tendikSubmissions = [sub, ...(schoolState.tendikSubmissions || [])];
    }
    saveStore(store);
    res.status(201).json({ submission: sub });
  });

  app.patch('/api/tendik/submissions/:id/review', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.tendikSubmissions || []).findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pengumpulan pelatihan Tendik tidak ditemukan.' });
      return;
    }
    const prev = schoolState.tendikSubmissions[idx];
    const {
      skorPraktikVideo,
      statusReview,
      catatanPengurus,
      rekomendasiPelatihanLanjutan,
      segmentNotes,
    } = req.body || {};

    const cleanSkorVideo =
      skorPraktikVideo !== undefined && skorPraktikVideo !== null
        ? Math.min(100, Math.max(0, Math.round(Number(skorPraktikVideo) || 0)))
        : prev.skorPraktikVideo;

    const nextStatus: TendikSubmission['statusReview'] = [
      'Belum Ditinjau',
      'Direview Pengurus',
      'Lulus Pelatihan',
    ].includes(statusReview)
      ? statusReview
      : 'Direview Pengurus';

    const segNoteMap =
      segmentNotes && typeof segmentNotes === 'object' ? (segmentNotes as Record<string, string>) : {};
    const updatedSegments = prev.refleksiSegmen.map((seg) => ({
      ...seg,
      catatanPengurus:
        typeof segNoteMap[seg.id] === 'string' ? segNoteMap[seg.id].trim() : seg.catatanPengurus,
    }));

    const skorAkhirGabungan =
      typeof cleanSkorVideo === 'number'
        ? Math.round(prev.skorAsesmenTotal * 0.5 + cleanSkorVideo * 0.5)
        : prev.skorAsesmenTotal;

    const updated: TendikSubmission = {
      ...prev,
      refleksiSegmen: updatedSegments,
      skorPraktikVideo: cleanSkorVideo,
      skorAkhirGabungan,
      statusReview: nextStatus,
      catatanPengurus:
        typeof catatanPengurus === 'string' ? catatanPengurus.trim() : prev.catatanPengurus,
      rekomendasiPelatihanLanjutan:
        typeof rekomendasiPelatihanLanjutan === 'string'
          ? rekomendasiPelatihanLanjutan.trim()
          : prev.rekomendasiPelatihanLanjutan,
      reviewedByName: user.nama,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    schoolState.tendikSubmissions[idx] = updated;
    saveStore(store);
    res.json({ submission: updated });
  });

  // =====================================================================
  // 4. SURVEI ORANG TUA (Literasi Keluarga & Kustom — Pengurus -> Ortu -> Olahan Hasil)
  // =====================================================================
  app.post('/api/surveys/packages', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const { kodePaket, judul, deskripsi, kategori, targetKelasList, status, pertanyaan } =
      req.body || {};

    if (typeof judul !== 'string' || !judul.trim()) {
      res.status(400).json({ error: 'Judul paket survei wajib diisi.' });
      return;
    }
    const cleanQuestions = sanitizeSurveyQuestions(pertanyaan);
    if (cleanQuestions.length === 0) {
      res.status(400).json({ error: 'Paket survei wajib memiliki minimal 1 pertanyaan valid.' });
      return;
    }

    const now = new Date().toISOString();
    const cleanStatus: SurveyPackage['status'] =
      status === 'Dirilis' ? 'Dirilis' : status === 'Ditutup' ? 'Ditutup' : 'Draft';
    const cleanClasses = Array.isArray(targetKelasList)
      ? targetKelasList.filter((c: unknown) => typeof c === 'string' && schoolState.classes.includes(c))
      : [];

    const pkg: SurveyPackage = {
      id: `srvpkg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      kodePaket:
        typeof kodePaket === 'string' && kodePaket.trim()
          ? kodePaket.trim().toUpperCase()
          : `SRV-${((schoolState.surveyPackages || []).length + 1).toString().padStart(2, '0')}`,
      judul: judul.trim(),
      deskripsi: typeof deskripsi === 'string' ? deskripsi.trim() : '',
      kategori: kategori === 'Literasi Keluarga' ? 'Literasi Keluarga' : 'Kustom',
      targetKelasList: cleanClasses,
      status: cleanStatus,
      isTemplateBuiltIn: false,
      pertanyaan: cleanQuestions,
      tahunAjaran: schoolState.settings.tahunAjaran,
      semester: schoolState.settings.semester,
      createdByName: user.nama,
      releasedAt: cleanStatus === 'Dirilis' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    schoolState.surveyPackages = [pkg, ...(schoolState.surveyPackages || [])];
    saveStore(store);
    res.status(201).json({ package: pkg });
  });

  app.put('/api/surveys/packages/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.surveyPackages || []).findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Paket survei tidak ditemukan.' });
      return;
    }
    const prev = schoolState.surveyPackages[idx];
    const body = req.body || {};
    const now = new Date().toISOString();
    const nextStatus: SurveyPackage['status'] = ['Draft', 'Dirilis', 'Ditutup'].includes(body.status)
      ? body.status
      : prev.status;

    const sanitizedNextQuestions = Array.isArray(body.pertanyaan)
      ? sanitizeSurveyQuestions(body.pertanyaan)
      : [];

    const updated: SurveyPackage = {
      ...prev,
      kodePaket:
        typeof body.kodePaket === 'string' && body.kodePaket.trim()
          ? body.kodePaket.trim().toUpperCase()
          : prev.kodePaket,
      judul: typeof body.judul === 'string' && body.judul.trim() ? body.judul.trim() : prev.judul,
      deskripsi: typeof body.deskripsi === 'string' ? body.deskripsi.trim() : prev.deskripsi,
      kategori:
        body.kategori === 'Literasi Keluarga'
          ? 'Literasi Keluarga'
          : body.kategori === 'Kustom'
            ? 'Kustom'
            : prev.kategori,
      targetKelasList: Array.isArray(body.targetKelasList)
        ? body.targetKelasList.filter(
            (c: unknown) => typeof c === 'string' && schoolState.classes.includes(c)
          )
        : prev.targetKelasList,
      status: nextStatus,
      releasedAt: nextStatus === 'Dirilis' ? prev.releasedAt || now : prev.releasedAt,
      pertanyaan: sanitizedNextQuestions.length > 0 ? sanitizedNextQuestions : prev.pertanyaan,
      updatedAt: now,
    };

    schoolState.surveyPackages[idx] = updated;
    saveStore(store);
    res.json({ package: updated });
  });

  app.patch('/api/surveys/packages/:id/release', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.surveyPackages || []).findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Paket survei tidak ditemukan.' });
      return;
    }
    const prev = schoolState.surveyPackages[idx];
    const { status } = req.body || {};
    const nextStatus: SurveyPackage['status'] = ['Draft', 'Dirilis', 'Ditutup'].includes(status)
      ? status
      : 'Dirilis';
    const now = new Date().toISOString();
    const updated: SurveyPackage = {
      ...prev,
      status: nextStatus,
      releasedAt: nextStatus === 'Dirilis' ? now : prev.releasedAt,
      updatedAt: now,
    };
    schoolState.surveyPackages[idx] = updated;
    saveStore(store);
    res.json({ package: updated });
  });

  app.delete('/api/surveys/packages/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const exists = (schoolState.surveyPackages || []).some((p) => p.id === req.params.id);
    if (!exists) {
      res.status(404).json({ error: 'Paket survei tidak ditemukan.' });
      return;
    }
    schoolState.surveyPackages = (schoolState.surveyPackages || []).filter(
      (p) => p.id !== req.params.id
    );
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/surveys/responses', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role !== 'ortu' && user.role !== 'admin') {
      res.status(403).json({ error: 'Pengisian survei dilakukan melalui Portal Orang Tua (atau simulasi Pengurus).' });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { packageId, studentId, answers } = req.body || {};

    const pkg = (schoolState.surveyPackages || []).find((p) => p.id === packageId);
    if (!pkg) {
      res.status(404).json({ error: 'Paket survei tidak ditemukan.' });
      return;
    }
    if (user.role === 'ortu' && pkg.status !== 'Dirilis') {
      res.status(403).json({ error: 'Survei ini belum dirilis atau sudah ditutup.' });
      return;
    }

    const targetStuId =
      typeof studentId === 'string' && studentId.trim()
        ? studentId.trim()
        : (user.linkedStudentIds || [])[0] || '';
    if (user.role === 'ortu' && !(user.linkedStudentIds || []).includes(targetStuId)) {
      res.status(403).json({ error: 'Anda tidak terhubung dengan peserta didik yang dipilih.' });
      return;
    }
    const stu = schoolState.students.find((s) => s.id === targetStuId);
    if (!stu) {
      res.status(404).json({ error: 'Data peserta didik tidak ditemukan di sekolah ini.' });
      return;
    }
    if (
      user.role === 'ortu' &&
      pkg.targetKelasList &&
      pkg.targetKelasList.length > 0 &&
      !pkg.targetKelasList.includes(stu.kelas)
    ) {
      res.status(403).json({ error: 'Survei ini tidak ditujukan untuk kelas anak yang dipilih.' });
      return;
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      res.status(400).json({ error: 'Jawaban survei tidak boleh kosong.' });
      return;
    }

    const cleanAnswers: DiagnosticAnswer[] = answers.map((a: DiagnosticAnswer) => ({
      questionId: String(a.questionId || ''),
      selectedOptionId:
        typeof a.selectedOptionId === 'string' ? a.selectedOptionId : undefined,
      selectedOptionIds: Array.isArray(a.selectedOptionIds)
        ? a.selectedOptionIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      scaleValue: typeof a.scaleValue === 'number' ? a.scaleValue : undefined,
      textAnswer: typeof a.textAnswer === 'string' ? a.textAnswer.trim() : undefined,
    }));

    const evaluated = evaluateSurveyResponse(pkg, cleanAnswers);
    const now = new Date().toISOString();
    const existingIdx = (schoolState.surveyResponses || []).findIndex(
      (r) => r.packageId === pkg.id && r.studentId === stu.id
    );

    const record: SurveyResponse = {
      id:
        existingIdx >= 0
          ? schoolState.surveyResponses[existingIdx].id
          : `srvres-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      packageId: pkg.id,
      packageJudul: pkg.judul,
      kategori: pkg.kategori,
      studentId: stu.id,
      studentName: stu.nama,
      nis: stu.nis,
      kelas: stu.kelas,
      parentUserId: user.id,
      parentName: user.nama,
      tahunAjaran: schoolState.settings.tahunAjaran,
      semester: schoolState.settings.semester,
      answers: cleanAnswers,
      ...evaluated,
      submittedAt: existingIdx >= 0 ? schoolState.surveyResponses[existingIdx].submittedAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      schoolState.surveyResponses[existingIdx] = record;
    } else {
      schoolState.surveyResponses = [record, ...(schoolState.surveyResponses || [])];
    }
    saveStore(store);
    res.status(201).json({ response: record });
  });

  app.patch('/api/surveys/responses/:id/verify', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.surveyResponses || []).findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Respons survei tidak ditemukan.' });
      return;
    }
    const { catatanPengurus } = req.body || {};
    const prev = schoolState.surveyResponses[idx];
    const updated: SurveyResponse = {
      ...prev,
      catatanPengurus:
        typeof catatanPengurus === 'string' ? catatanPengurus.trim() : prev.catatanPengurus,
      verifiedByName: user.nama,
      verifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    schoolState.surveyResponses[idx] = updated;
    saveStore(store);
    res.json({ response: updated });
  });

  // =====================================================================
  // 5. USULAN EDIT DATA SISWA OLEH WALI KELAS & PERSETUJUAN PENGURUS
  // =====================================================================
  const ALLOWED_STUDENT_EDIT_FIELDS: Array<keyof StudentEditEditableFields> = [
    'nisn',
    'nama',
    'jenisKelamin',
    'tempatLahir',
    'tanggalLahir',
    'agama',
    'pendidikanSebelumnya',
    'alamat',
    'namaAyah',
    'namaIbu',
    'pekerjaanAyah',
    'pekerjaanIbu',
    'namaWali',
    'noTelpWali',
    'jurusan',
    'portfolioFolderUrl',
    'fotoDataUrl',
  ];

  app.post('/api/student-edits', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role !== 'walikelas' && user.role !== 'admin') {
      res.status(403).json({
        error: 'Hanya Wali Kelas (atau Pengurus) yang dapat mengajukan edit biodata peserta didik.',
      });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const { studentId, proposedChanges, alasanPerubahan } = req.body || {};
    if (typeof studentId !== 'string' || !studentId.trim()) {
      res.status(400).json({ error: 'ID peserta didik wajib diisi.' });
      return;
    }
    const stu = schoolState.students.find((s) => s.id === studentId);
    if (!stu) {
      res.status(404).json({ error: 'Peserta didik tidak ditemukan pada sekolah ini.' });
      return;
    }
    if (user.role === 'walikelas' && user.waliKelasTarget !== stu.kelas) {
      res.status(403).json({
        error: 'Wali Kelas hanya dapat mengajukan perubahan biodata untuk siswa di kelas binaan sendiri.',
      });
      return;
    }
    if (typeof alasanPerubahan !== 'string' || !alasanPerubahan.trim()) {
      res.status(400).json({ error: 'Alasan perubahan data siswa wajib diisi sebagai jejak audit.' });
      return;
    }
    if (!proposedChanges || typeof proposedChanges !== 'object') {
      res.status(400).json({ error: 'Data usulan perubahan tidak valid.' });
      return;
    }

    const previousValues: Partial<StudentEditEditableFields> = {};
    const cleanProposed: Partial<StudentEditEditableFields> = {};

    for (const key of ALLOWED_STUDENT_EDIT_FIELDS) {
      if (!(key in proposedChanges)) continue;
      const rawVal = (proposedChanges as Record<string, unknown>)[key];
      if (rawVal === undefined || rawVal === null) continue;

      let nextVal: string | undefined;
      if (key === 'jenisKelamin') {
        nextVal = rawVal === 'P' ? 'P' : 'L';
      } else if (key === 'fotoDataUrl') {
        nextVal = sanitizeImageDataUrl(rawVal) || '';
      } else if (key === 'portfolioFolderUrl') {
        const str = String(rawVal).trim();
        nextVal = str ? validateSafeHttpUrl(str) || '' : '';
      } else {
        nextVal = String(rawVal).trim();
      }

      const prevVal = String((stu[key] ?? '') as string).trim();
      if (nextVal !== undefined && nextVal !== prevVal) {
        (previousValues as Record<string, string>)[key] = prevVal;
        (cleanProposed as Record<string, string>)[key] = nextVal;
      }
    }

    if (Object.keys(cleanProposed).length === 0) {
      res.status(400).json({ error: 'Tidak ada perubahan data dibandingkan biodata saat ini.' });
      return;
    }

    const editReq: StudentEditRequest = {
      id: `stuedit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      studentId: stu.id,
      studentName: stu.nama,
      nis: stu.nis,
      kelas: stu.kelas,
      requestedByUserId: user.id,
      requestedByName: user.nama,
      alasanPerubahan: alasanPerubahan.trim(),
      previousValues,
      proposedChanges: cleanProposed,
      status: 'Menunggu Persetujuan',
      createdAt: new Date().toISOString(),
    };

    schoolState.studentEditRequests = [editReq, ...(schoolState.studentEditRequests || [])];
    saveStore(store);
    res.status(201).json({ request: editReq });
  });

  app.patch('/api/student-edits/:id/review', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const idx = (schoolState.studentEditRequests || []).findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Usulan edit data siswa tidak ditemukan.' });
      return;
    }
    const prev = schoolState.studentEditRequests[idx];
    const { status, catatanPengurus } = req.body || {};
    const nextStatus: StudentEditRequest['status'] =
      status === 'Disetujui' ? 'Disetujui' : 'Ditolak';

    let updatedStudent = schoolState.students.find((s) => s.id === prev.studentId);
    if (nextStatus === 'Disetujui' && updatedStudent) {
      const safePatch: Partial<StudentEditEditableFields> = {};
      for (const key of ALLOWED_STUDENT_EDIT_FIELDS) {
        if (key in prev.proposedChanges) {
          (safePatch as Record<string, unknown>)[key] = (
            prev.proposedChanges as Record<string, unknown>
          )[key];
        }
      }
      updatedStudent = {
        ...updatedStudent,
        ...safePatch,
      };
      schoolState.students = schoolState.students.map((s) =>
        s.id === updatedStudent!.id ? updatedStudent! : s
      );
    }

    const updatedReq: StudentEditRequest = {
      ...prev,
      status: nextStatus,
      catatanPengurus:
        typeof catatanPengurus === 'string' ? catatanPengurus.trim() : prev.catatanPengurus,
      reviewedByName: user.nama,
      reviewedAt: new Date().toISOString(),
    };

    schoolState.studentEditRequests[idx] = updatedReq;
    saveStore(store);
    res.json({ request: updatedReq, student: updatedStudent });
  });

  // =====================================================================
  // 5B. SURAT MENYURAT SEKOLAH, PENGUMUMAN & PENGAJUAN SURAT SISWA
  // =====================================================================
  const sanitizeDynamicFields = (raw: unknown): Record<string, string> => {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof k === 'string' && k.trim()) {
        out[k.trim()] = typeof v === 'string' ? v.trim() : v !== undefined && v !== null ? String(v).trim() : '';
      }
    }
    return out;
  };

  const hasDuplicatePublishedNomor = (
    letters: SchoolLetter[],
    nomorSurat: string,
    excludeId?: string
  ): boolean => {
    const normalized = nomorSurat.trim().toLowerCase();
    if (!normalized) return false;
    return letters.some(
      (l) =>
        l.id !== excludeId &&
        l.status === 'Terbit' &&
        (l.nomorSurat || '').trim().toLowerCase() === normalized
    );
  };

  app.get('/api/letters/next-number', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const templateId = String(req.query.templateId || '').trim();
    const tanggalSurat = String(req.query.tanggalSurat || new Date().toISOString().slice(0, 10)).trim();
    const tpl = getLetterTemplateById(templateId);
    const seq = getNextLetterSequence(schoolState.letters || [], tanggalSurat);
    const nomorSurat = formatNomorSurat(seq, tpl?.kodeNomor || 'SRT', schoolState.settings, tanggalSurat);
    res.json({ seq, nomorSurat });
  });

  app.post('/api/letters', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const body = req.body || {};
    const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : '';
    const tpl = getLetterTemplateById(templateId);
    if (!tpl) {
      res.status(400).json({ error: 'Template jenis surat tidak ditemukan.' });
      return;
    }

    const stu =
      typeof body.studentId === 'string' && body.studentId.trim()
        ? schoolState.students.find((s) => s.id === body.studentId.trim())
        : undefined;
    if (body.studentId && !stu) {
      res.status(404).json({ error: 'Data siswa yang dipilih tidak ditemukan di sekolah ini.' });
      return;
    }

    const tanggalSurat =
      typeof body.tanggalSurat === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.tanggalSurat.trim())
        ? body.tanggalSurat.trim()
        : new Date().toISOString().slice(0, 10);
    const status: LetterStatus = body.status === 'Draft' ? 'Draft' : 'Terbit';
    const now = new Date().toISOString();

    let urutanNomor: number | undefined;
    let nomorSurat = typeof body.nomorSurat === 'string' ? body.nomorSurat.trim() : '';
    if (status === 'Terbit') {
      const nextSeq = getNextLetterSequence(schoolState.letters || [], tanggalSurat);
      if (!nomorSurat) {
        urutanNomor = nextSeq;
        nomorSurat = formatNomorSurat(nextSeq, tpl.kodeNomor, schoolState.settings, tanggalSurat);
      } else {
        const m = nomorSurat.match(/^(\d{1,5})\//);
        urutanNomor = m ? Number(m[1]) : nextSeq;
      }
      if (hasDuplicatePublishedNomor(schoolState.letters || [], nomorSurat)) {
        res.status(409).json({
          error: `Nomor surat "${nomorSurat}" sudah digunakan pada surat terbit lainnya. Gunakan nomor urut baru.`,
        });
        return;
      }
    }

    const cleanTargetKelas = Array.isArray(body.targetKelasList)
      ? body.targetKelasList.filter(
          (c: unknown): c is string => typeof c === 'string' && schoolState.classes.includes(c)
        )
      : undefined;

    const letter: SchoolLetter = {
      id: `ltr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      templateId: tpl.id,
      templateNama: tpl.nama,
      kategori: tpl.kategori,
      subKategori: tpl.subKategori,
      kodeNomor: tpl.kodeNomor,
      nomorSurat,
      urutanNomor,
      perihal:
        typeof body.perihal === 'string' && body.perihal.trim()
          ? body.perihal.trim()
          : tpl.defaultPerihal,
      tanggalSurat,
      status,
      studentId: stu?.id,
      studentName: stu?.nama,
      studentNis: stu?.nis,
      studentKelas: stu?.kelas,
      targetAudience:
        typeof body.targetAudience === 'string' && body.targetAudience.trim()
          ? body.targetAudience.trim()
          : tpl.defaultTargetAudience,
      targetKelasList: cleanTargetKelas,
      penerimaNama: typeof body.penerimaNama === 'string' ? body.penerimaNama.trim() : undefined,
      penerimaJabatan:
        typeof body.penerimaJabatan === 'string' ? body.penerimaJabatan.trim() : undefined,
      penerimaInstansi:
        typeof body.penerimaInstansi === 'string' ? body.penerimaInstansi.trim() : undefined,
      dynamicFields: sanitizeDynamicFields(body.dynamicFields),
      penandatanganNama:
        typeof body.penandatanganNama === 'string' && body.penandatanganNama.trim()
          ? body.penandatanganNama.trim()
          : schoolState.settings.kepalaSekolah || user.nama,
      penandatanganJabatan:
        typeof body.penandatanganJabatan === 'string' && body.penandatanganJabatan.trim()
          ? body.penandatanganJabatan.trim()
          : `Kepala ${schoolState.settings.jenisLembaga || 'PKBM'}`,
      penandatanganNip:
        typeof body.penandatanganNip === 'string'
          ? body.penandatanganNip.trim()
          : schoolState.settings.nipKepalaSekolah || '',
      issuedByName: status === 'Terbit' ? user.nama : undefined,
      issuedAt: status === 'Terbit' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    schoolState.letters = [letter, ...(schoolState.letters || [])];
    saveStore(store);
    res.status(201).json({ letter });
  });

  app.post('/api/letters/request', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role !== 'siswa' && user.role !== 'ortu' && user.role !== 'admin') {
      res.status(403).json({
        error: 'Pengajuan surat dilakukan melalui akun Siswa atau Orang Tua / Wali.',
      });
      return;
    }
    const schoolState = getSchoolState(user.schoolId);
    const body = req.body || {};
    const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : '';
    const tpl = getLetterTemplateById(templateId);
    if (!tpl) {
      res.status(400).json({ error: 'Template jenis surat tidak ditemukan.' });
      return;
    }
    if (!tpl.studentRequestable) {
      res.status(403).json({ error: 'Jenis surat ini tidak dapat diajukan mandiri oleh siswa/orang tua.' });
      return;
    }

    const linkedIds = user.linkedStudentIds || [];
    let targetStudentId: string | undefined;
    if (user.role === 'siswa' || user.role === 'ortu') {
      if (typeof body.studentId === 'string' && body.studentId.trim()) {
        if (!linkedIds.includes(body.studentId.trim())) {
          res.status(403).json({
            error: 'Anda hanya dapat mengajukan surat untuk peserta didik yang tertaut dengan akun Anda.',
          });
          return;
        }
        targetStudentId = body.studentId.trim();
      } else {
        targetStudentId = linkedIds[0];
      }
    } else {
      targetStudentId = typeof body.studentId === 'string' ? body.studentId.trim() : undefined;
    }

    const stu = targetStudentId
      ? schoolState.students.find((s) => s.id === targetStudentId)
      : undefined;
    if (!stu) {
      res.status(404).json({ error: 'Data peserta didik pemohon tidak ditemukan.' });
      return;
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const cleanFields = sanitizeDynamicFields(body.dynamicFields);
    const alasanPengajuan =
      cleanFields.keperluan ||
      cleanFields.alasanDetail ||
      cleanFields.alasanPindah ||
      cleanFields.namaProgram ||
      cleanFields.namaKegiatan ||
      cleanFields.instansiMitra ||
      cleanFields.programTujuan ||
      cleanFields.sekolahAsal ||
      cleanFields.dokumenSumberSalah ||
      cleanFields.alasan ||
      cleanFields.tujuanPindah ||
      '';

    const letter: SchoolLetter = {
      id: `ltrreq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      schoolId: user.schoolId,
      templateId: tpl.id,
      templateNama: tpl.nama,
      kategori: tpl.kategori,
      subKategori: tpl.subKategori,
      kodeNomor: tpl.kodeNomor,
      nomorSurat: '',
      perihal:
        typeof body.perihal === 'string' && body.perihal.trim()
          ? body.perihal.trim()
          : tpl.defaultPerihal,
      tanggalSurat: today,
      status: 'Menunggu Persetujuan',
      studentId: stu.id,
      studentName: stu.nama,
      studentNis: stu.nis,
      studentKelas: stu.kelas,
      dynamicFields: cleanFields,
      penandatanganNama: schoolState.settings.kepalaSekolah || '',
      penandatanganJabatan: `Kepala ${schoolState.settings.jenisLembaga || 'PKBM'}`,
      penandatanganNip: schoolState.settings.nipKepalaSekolah || '',
      requestedByUserId: user.id,
      requestedByName: user.nama,
      requestedByRole: user.role,
      alasanPengajuan,
      createdAt: now,
      updatedAt: now,
    };

    schoolState.letters = [letter, ...(schoolState.letters || [])];
    saveStore(store);
    res.status(201).json({ letter });
  });

  app.put('/api/letters/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const letters = schoolState.letters || [];
    const idx = letters.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Dokumen surat tidak ditemukan.' });
      return;
    }
    const prev = letters[idx];
    const body = req.body || {};
    const now = new Date().toISOString();

    const nextStatus: LetterStatus = [
      'Draft',
      'Menunggu Persetujuan',
      'Terbit',
      'Ditolak',
    ].includes(body.status)
      ? body.status
      : prev.status;

    const tanggalSurat =
      typeof body.tanggalSurat === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.tanggalSurat.trim())
        ? body.tanggalSurat.trim()
        : prev.tanggalSurat;

    let nextTpl = getLetterTemplateById(prev.templateId);
    if (typeof body.templateId === 'string' && body.templateId.trim() && prev.status === 'Draft') {
      const candidate = getLetterTemplateById(body.templateId.trim());
      if (candidate) nextTpl = candidate;
    }

    let nextStu =
      prev.studentId ? schoolState.students.find((s) => s.id === prev.studentId) : undefined;
    if (body.studentId !== undefined) {
      if (typeof body.studentId === 'string' && body.studentId.trim()) {
        const foundStu = schoolState.students.find((s) => s.id === body.studentId.trim());
        if (!foundStu) {
          res.status(404).json({ error: 'Data siswa yang dipilih tidak ditemukan di sekolah ini.' });
          return;
        }
        nextStu = foundStu;
      } else {
        nextStu = undefined;
      }
    }

    const activeKodeNomor = nextTpl?.kodeNomor || prev.kodeNomor;
    let nomorSurat =
      typeof body.nomorSurat === 'string' ? body.nomorSurat.trim() : prev.nomorSurat;
    let urutanNomor = prev.urutanNomor;
    if (nextStatus === 'Terbit') {
      if (!nomorSurat) {
        const nextSeq = getNextLetterSequence(schoolState.letters || [], tanggalSurat);
        urutanNomor = nextSeq;
        nomorSurat = formatNomorSurat(nextSeq, activeKodeNomor, schoolState.settings, tanggalSurat);
      } else if (!urutanNomor) {
        const m = nomorSurat.match(/^(\d{1,5})\//);
        if (m) urutanNomor = Number(m[1]);
      }
      if (hasDuplicatePublishedNomor(schoolState.letters || [], nomorSurat, prev.id)) {
        res.status(409).json({
          error: `Nomor surat "${nomorSurat}" sudah digunakan pada surat terbit lainnya. Gunakan nomor urut baru.`,
        });
        return;
      }
    }

    const updated: SchoolLetter = {
      ...prev,
      templateId: nextTpl?.id || prev.templateId,
      templateNama: nextTpl?.nama || prev.templateNama,
      kategori: nextTpl?.kategori || prev.kategori,
      subKategori: nextTpl?.subKategori ?? prev.subKategori,
      kodeNomor: activeKodeNomor,
      studentId: nextStu?.id,
      studentName: nextStu?.nama,
      studentNis: nextStu?.nis,
      studentKelas: nextStu?.kelas,
      perihal:
        typeof body.perihal === 'string' && body.perihal.trim() ? body.perihal.trim() : prev.perihal,
      tanggalSurat,
      nomorSurat,
      urutanNomor,
      status: nextStatus,
      targetAudience:
        typeof body.targetAudience === 'string' ? body.targetAudience.trim() : prev.targetAudience,
      targetKelasList: Array.isArray(body.targetKelasList)
        ? body.targetKelasList.filter(
            (c: unknown): c is string => typeof c === 'string' && schoolState.classes.includes(c)
          )
        : prev.targetKelasList,
      penerimaNama:
        typeof body.penerimaNama === 'string' ? body.penerimaNama.trim() : prev.penerimaNama,
      penerimaJabatan:
        typeof body.penerimaJabatan === 'string'
          ? body.penerimaJabatan.trim()
          : prev.penerimaJabatan,
      penerimaInstansi:
        typeof body.penerimaInstansi === 'string'
          ? body.penerimaInstansi.trim()
          : prev.penerimaInstansi,
      dynamicFields: body.dynamicFields
        ? sanitizeDynamicFields(body.dynamicFields)
        : prev.dynamicFields,
      penandatanganNama:
        typeof body.penandatanganNama === 'string'
          ? body.penandatanganNama.trim()
          : prev.penandatanganNama,
      penandatanganJabatan:
        typeof body.penandatanganJabatan === 'string'
          ? body.penandatanganJabatan.trim()
          : prev.penandatanganJabatan,
      penandatanganNip:
        typeof body.penandatanganNip === 'string'
          ? body.penandatanganNip.trim()
          : prev.penandatanganNip,
      catatanPengurus:
        typeof body.catatanPengurus === 'string'
          ? body.catatanPengurus.trim()
          : prev.catatanPengurus,
      issuedByName: nextStatus === 'Terbit' ? prev.issuedByName || user.nama : prev.issuedByName,
      issuedAt: nextStatus === 'Terbit' ? prev.issuedAt || now : prev.issuedAt,
      updatedAt: now,
    };

    schoolState.letters![idx] = updated;
    saveStore(store);
    res.json({ letter: updated });
  });

  app.patch('/api/letters/:id/issue', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const letters = schoolState.letters || [];
    const idx = letters.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pengajuan atau dokumen surat tidak ditemukan.' });
      return;
    }
    const prev = letters[idx];
    const body = req.body || {};
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    if (body.action === 'reject') {
      const rejected: SchoolLetter = {
        ...prev,
        status: 'Ditolak',
        catatanPengurus:
          typeof body.catatanPengurus === 'string'
            ? body.catatanPengurus.trim()
            : prev.catatanPengurus,
        issuedByName: user.nama,
        issuedAt: now,
        updatedAt: now,
      };
      schoolState.letters![idx] = rejected;
      saveStore(store);
      res.json({ letter: rejected });
      return;
    }

    const tanggalSurat = prev.tanggalSurat || today;
    let nomorSurat =
      typeof body.nomorSurat === 'string' && body.nomorSurat.trim()
        ? body.nomorSurat.trim()
        : prev.nomorSurat;
    let urutanNomor = prev.urutanNomor;
    if (!nomorSurat) {
      const nextSeq = getNextLetterSequence(schoolState.letters || [], tanggalSurat);
      urutanNomor = nextSeq;
      nomorSurat = formatNomorSurat(nextSeq, prev.kodeNomor, schoolState.settings, tanggalSurat);
    } else if (!urutanNomor) {
      const m = nomorSurat.match(/^(\d{1,5})\//);
      if (m) urutanNomor = Number(m[1]);
    }

    if (hasDuplicatePublishedNomor(schoolState.letters || [], nomorSurat, prev.id)) {
      res.status(409).json({
        error: `Nomor surat "${nomorSurat}" sudah digunakan pada surat terbit lainnya. Gunakan nomor urut baru.`,
      });
      return;
    }

    const issued: SchoolLetter = {
      ...prev,
      status: 'Terbit',
      nomorSurat,
      urutanNomor,
      perihal:
        typeof body.perihal === 'string' && body.perihal.trim() ? body.perihal.trim() : prev.perihal,
      dynamicFields: body.dynamicFields
        ? sanitizeDynamicFields(body.dynamicFields)
        : prev.dynamicFields,
      penandatanganNama:
        typeof body.penandatanganNama === 'string' && body.penandatanganNama.trim()
          ? body.penandatanganNama.trim()
          : prev.penandatanganNama || schoolState.settings.kepalaSekolah || user.nama,
      penandatanganJabatan:
        typeof body.penandatanganJabatan === 'string' && body.penandatanganJabatan.trim()
          ? body.penandatanganJabatan.trim()
          : prev.penandatanganJabatan || `Kepala ${schoolState.settings.jenisLembaga || 'PKBM'}`,
      penandatanganNip:
        typeof body.penandatanganNip === 'string'
          ? body.penandatanganNip.trim()
          : prev.penandatanganNip ?? schoolState.settings.nipKepalaSekolah ?? '',
      catatanPengurus:
        typeof body.catatanPengurus === 'string'
          ? body.catatanPengurus.trim()
          : prev.catatanPengurus,
      issuedByName: user.nama,
      issuedAt: now,
      updatedAt: now,
    };

    schoolState.letters![idx] = issued;
    saveStore(store);
    res.json({ letter: issued });
  });

  app.delete('/api/letters/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const schoolState = getSchoolState(user.schoolId);
    const target = (schoolState.letters || []).find((l) => l.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Surat tidak ditemukan.' });
      return;
    }

    if (user.role !== 'admin') {
      const isOwnRequester =
        (user.role === 'siswa' || user.role === 'ortu') &&
        target.status === 'Menunggu Persetujuan' &&
        (target.requestedByUserId === user.id ||
          (target.studentId && (user.linkedStudentIds || []).includes(target.studentId)));
      if (!isOwnRequester) {
        res.status(403).json({
          error: 'Anda hanya dapat membatalkan pengajuan surat milik sendiri yang masih menunggu persetujuan.',
        });
        return;
      }
    }

    schoolState.letters = (schoolState.letters || []).filter((l) => l.id !== req.params.id);
    saveStore(store);
    res.json({ ok: true });
  });

  // =====================================================================
  // 6. DATABASE PERMANEN BERBASIS GOOGLE SPREADSHEET (MULTI-SEKOLAH + AKUN)
  // =====================================================================
  app.get('/api/db/spreadsheet/status', requireAuth, requireAdmin, (_req: AuthedRequest, res) => {
    const activeUrl = getActiveGasDbUrl();
    const totalStudents = Object.values(store.states).reduce(
      (sum, st) => sum + (st.students?.length || 0),
      0
    );
    res.json({
      connected: Boolean(activeUrl),
      configuredViaEnv: Boolean(process.env.GAS_DB_URL?.trim()),
      gasDbUrl: activeUrl ? activeUrl.toString() : '',
      spreadsheetUrl: store.spreadsheetUrl || '',
      folderUrl: 'https://drive.google.com/drive/folders/15sLbrUw-mkEOBjEFrhJK-CN9tnbFrIjg?usp=sharing',
      lastSyncAt: store.lastSpreadsheetSyncAt || '',
      lastSyncError: lastSpreadsheetSyncError,
      counts: {
        schools: store.schools.length,
        users: store.users.length,
        students: totalStudents,
      },
    });
  });

  app.post('/api/db/spreadsheet/connect', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const schoolId = req.authUser!.schoolId;
    const { url, action } = req.body || {};
    const validUrl = typeof url === 'string' ? validateGasUrl(url) : getActiveGasDbUrl();
    if (!validUrl) {
      res.status(400).json({
        error:
          'URL Web App Google Apps Script tidak valid. Gunakan URL resmi https://script.google.com/macros/s/.../exec',
      });
      return;
    }

    try {
      const pingUrl = new URL(validUrl.toString());
      pingUrl.searchParams.set('action', 'ping');
      const pingRes = await callGasEndpointJson(pingUrl, 'GET');
      const ssUrl = typeof pingRes.spreadsheetUrl === 'string' ? pingRes.spreadsheetUrl : '';
      const remoteUsersCount = Number(pingRes.usersCount || 0);
      const remoteSchoolsCount = Number(pingRes.schoolsCount || 0);

      store.gasDbUrl = validUrl.toString();
      if (ssUrl) store.spreadsheetUrl = ssUrl;
      const schoolState = getSchoolState(schoolId);
      schoolState.settings.gasEndpointUrl = validUrl.toString();
      writeStoreToDiskOnly(store);

      // If remote Spreadsheet already has saved users/schools and caller didn't force push/pull, let client know or auto-pull if local only has bootstrap admin
      if (action === 'pull') {
        const prevUser = req.authUser!;
        const pulled = await pullStoreFromSpreadsheet(validUrl.toString());
        const authFollowup = issueRestoredAuth(prevUser);
        res.json({
          ok: true,
          mode: 'pulled',
          spreadsheetUrl: pulled.spreadsheetUrl || ssUrl,
          lastSyncAt: store.lastSpreadsheetSyncAt,
          schoolsCount: pulled.schoolsCount,
          usersCount: pulled.usersCount,
          ...authFollowup,
          message: authFollowup.requiresRelogin
            ? `Berhasil memulihkan ${pulled.schoolsCount} sekolah & ${pulled.usersCount} akun dari Google Spreadsheet. Silakan login menggunakan akun Pengurus dari Spreadsheet.`
            : `Berhasil memulihkan ${pulled.schoolsCount} sekolah & ${pulled.usersCount} akun dari Google Spreadsheet.`,
        });
        return;
      }

      if (action !== 'overwrite' && remoteUsersCount > store.users.length) {
        res.json({
          ok: true,
          needsRestoreConfirm: true,
          spreadsheetUrl: ssUrl,
          remoteSummary: {
            schoolsCount: remoteSchoolsCount,
            usersCount: remoteUsersCount,
            updatedAt: pingRes.updatedAt || '',
          },
          message: `Database Spreadsheet sudah berisi ${remoteSchoolsCount} sekolah dan ${remoteUsersCount} akun. Pilih Pulihkan dari Spreadsheet agar data lama tidak tertimpa.`,
        });
        return;
      }

      const pushed = await pushStoreToSpreadsheet(validUrl.toString());
      res.json({
        ok: true,
        mode: 'pushed',
        spreadsheetUrl: pushed.spreadsheetUrl || ssUrl,
        lastSyncAt: pushed.updatedAt,
        schoolsCount: pushed.schoolsCount,
        usersCount: pushed.usersCount,
        message: `Database Google Spreadsheet terhubung di folder Drive & seluruh data (${pushed.schoolsCount} sekolah, ${pushed.usersCount} akun) berhasil disimpan permanen.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungkan ke Google Apps Script.';
      lastSpreadsheetSyncError = msg;
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/db/spreadsheet/sync', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const schoolId = req.authUser!.schoolId;
    const { url } = req.body || {};
    if (typeof url === 'string' && url.trim()) {
      const valid = validateGasUrl(url);
      if (!valid) {
        res.status(400).json({
          error: 'URL Web App Google Apps Script tidak valid (harus https://script.google.com/macros/s/.../exec).',
        });
        return;
      }
      store.gasDbUrl = valid.toString();
      getSchoolState(schoolId).settings.gasEndpointUrl = valid.toString();
    }
    try {
      const pushed = await pushStoreToSpreadsheet();
      res.json({
        ok: true,
        spreadsheetUrl: pushed.spreadsheetUrl || store.spreadsheetUrl || '',
        lastSyncAt: pushed.updatedAt,
        schoolsCount: pushed.schoolsCount,
        usersCount: pushed.usersCount,
        message: `Tersimpan permanen ke Google Spreadsheet (${pushed.schoolsCount} sekolah, ${pushed.usersCount} akun).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan database ke Spreadsheet.';
      lastSpreadsheetSyncError = msg;
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/db/spreadsheet/restore', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { url } = req.body || {};
    const prevUser = req.authUser!;
    try {
      const pulled = await pullStoreFromSpreadsheet(typeof url === 'string' && url.trim() ? url : undefined);
      if (!pulled.restored) {
        res.status(404).json({
          error: 'Database Google Spreadsheet masih kosong atau belum pernah diisi data.',
        });
        return;
      }
      const authFollowup = issueRestoredAuth(prevUser);
      res.json({
        ok: true,
        spreadsheetUrl: pulled.spreadsheetUrl || '',
        lastSyncAt: store.lastSpreadsheetSyncAt,
        schoolsCount: pulled.schoolsCount,
        usersCount: pulled.usersCount,
        ...authFollowup,
        message: authFollowup.requiresRelogin
          ? `Seluruh database berhasil dipulihkan dari Google Spreadsheet (${pulled.schoolsCount} sekolah, ${pulled.usersCount} akun). Silakan login menggunakan akun Pengurus dari Spreadsheet.`
          : `Seluruh database berhasil dipulihkan dari Google Spreadsheet (${pulled.schoolsCount} sekolah, ${pulled.usersCount} akun).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memulihkan database dari Spreadsheet.';
      lastSpreadsheetSyncError = msg;
      res.status(502).json({ error: msg });
    }
  });

  // Google Apps Script Proxy (Admin only + strict HTTPS script.google.com allowlist)
  app.post('/api/gas-sync', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { url, mode } = req.body || {};
    const validUrl = typeof url === 'string' ? validateGasUrl(url) : null;
    if (!validUrl) {
      res.status(400).json({
        error:
          'URL Google Apps Script tidak valid. Gunakan URL HTTPS resmi https://script.google.com/macros/s/.../exec',
      });
      return;
    }

    try {
      if (mode === 'ping') {
        const target = new URL(validUrl.toString());
        target.searchParams.set('action', 'ping');
        const info = await callGasEndpointJson(target, 'GET');
        if (typeof info.spreadsheetUrl === 'string' && info.spreadsheetUrl) {
          store.spreadsheetUrl = info.spreadsheetUrl;
        }
        store.gasDbUrl = validUrl.toString();
        getSchoolState(req.authUser!.schoolId).settings.gasEndpointUrl = validUrl.toString();
        writeStoreToDiskOnly(store);
        res.json({
          type: 'text',
          spreadsheetUrl: info.spreadsheetUrl || '',
          message: `Koneksi Google Apps Script berhasil terhubung.${info.spreadsheetUrl ? ' File database Spreadsheet siap di Google Drive.' : ''}`,
        });
      } else if (mode === 'pull') {
        const prevUser = req.authUser!;
        const pulled = await pullStoreFromSpreadsheet(validUrl.toString());
        if (!pulled.restored) {
          res.status(404).json({ error: 'Belum ada data database tersimpan di Google Spreadsheet.' });
          return;
        }
        const authFollowup = issueRestoredAuth(prevUser);
        res.json({
          type: 'restored',
          spreadsheetUrl: pulled.spreadsheetUrl || '',
          ...authFollowup,
          message: authFollowup.requiresRelogin
            ? `Berhasil memulihkan ${pulled.schoolsCount} sekolah & ${pulled.usersCount} akun dari Google Spreadsheet. Silakan login kembali menggunakan akun Pengurus yang dipulihkan.`
            : `Berhasil memulihkan ${pulled.schoolsCount} sekolah & ${pulled.usersCount} akun dari Google Spreadsheet.`,
        });
      } else if (mode === 'push') {
        store.gasDbUrl = validUrl.toString();
        getSchoolState(req.authUser!.schoolId).settings.gasEndpointUrl = validUrl.toString();
        const pushed = await pushStoreToSpreadsheet(validUrl.toString());
        res.json({
          type: 'text',
          spreadsheetUrl: pushed.spreadsheetUrl || '',
          message: `Seluruh data sekolah (${pushed.schoolsCount}) & akun (${pushed.usersCount}) berhasil disimpan ke Google Spreadsheet.`,
        });
      } else {
        res.status(400).json({ error: 'Mode sinkronisasi tidak dikenal.' });
      }
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Gagal menghubungi Google Apps Script (/exec).',
      });
    }
  });

  // Vite / Static Frontend
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SIM Rapor Merdeka running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
