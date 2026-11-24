/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Menu, QrCode, RefreshCw, XCircle } from 'lucide-react';
import {
  AcademicYearRecord,
  AppState,
  ClassDef,
  CounselingNote,
  DiagnosticAnswer,
  DiagnosticPackage,
  DiagnosticSubmission,
  GradeEntry,
  LmsAssignment,
  LmsDiscussion,
  LmsMaterial,
  LmsSubmission,
  LogbookAuthorRole,
  LogbookEntry,
  MutationRecord,
  P5Project,
  ParentFeedback,
  PortfolioItem,
  ProcurementKategori,
  ProcurementRequest,
  ReportMeta,
  SchoolLetter,
  SchoolSettings,
  Student,
  StudentEditEditableFields,
  StudentEditRequest,
  Subject,
  SurveyPackage,
  SurveyResponse,
  TendikSubmission,
  TendikTrainingPackage,
  TendikVideoReflectionSegment,
  TutoringRecommendation,
  TutoringRequest,
  TutoringRequestStatus,
  UserAccount,
} from './types';
import {
  createDefaultProfilLulusanDimensions,
  generateNIS,
  getClassTingkat,
  getFaseFromTingkat,
  isInputLockedForUser,
  metaKey,
  syncSubjectFromCPs,
} from './utils/academic';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar, NAV_ITEMS, SectionId } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { StudentsView } from './components/StudentsView';
import { RekamDidikView } from './components/RekamDidikView';
import { MutasiView } from './components/MutasiView';
import { PenghubungView } from './components/PenghubungView';
import { BimbinganView } from './components/BimbinganView';
import { ProcurementView } from './components/ProcurementView';
import { DiagnostikView } from './components/DiagnostikView';
import { LmsView } from './components/LmsView';
import { TendikView } from './components/TendikView';
import { SubjectsView } from './components/SubjectsView';
import { GradesView } from './components/GradesView';
import { ExtrasView } from './components/ExtrasView';
import { LegerView } from './components/LegerView';
import { AnalyticsView } from './components/AnalyticsView';
import { PrintRaporView } from './components/PrintRaporView';
import { KartuPelajarView } from './components/KartuPelajarView';
import { SuratView } from './components/SuratView';
import { ParentPortalView } from './components/ParentPortalView';
import { SurveysView } from './components/SurveysView';
import { SettingsView } from './components/SettingsView';

interface ToastState {
  id: number;
  message: string;
  isError: boolean;
}

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [savingState, setSavingState] = useState(false);

  const [selectedClass, setSelectedClass] = useState<string>('');
  const [activeOrtuStudentId, setActiveOrtuStudentId] = useState<string>('');
  const [activeSection, setActiveSection] = useState<SectionId>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [presenceUsers, setPresenceUsers] = useState<Array<{ name: string; role: string }>>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [senderName, setSenderName] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyCodeInput, setVerifyCodeInput] = useState('');
  const [verifyCheckResult, setVerifyCheckResult] = useState<{
    loading: boolean;
    data?: {
      valid: boolean;
      code: string;
      docType?: string;
      averageScore?: number;
      student?: { nama: string; nis: string; nisn?: string; kelas: string };
      school?: { namaSekolah: string; npsn: string; tahunAjaran: string; semester: string };
    };
  }>({ loading: false });

  const [initialVerifyCode] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('verify');
    } catch {
      return null;
    }
  });

  const [initialVerifyCardId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('verifyCard');
    } catch {
      return null;
    }
  });

  const [initialVerifySchoolId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('schoolId');
    } catch {
      return null;
    }
  });

  const saveTimerRef = useRef<number | null>(null);
  const latestTokenRef = useRef<string | null>(null);
  latestTokenRef.current = authToken;

  const onNotify = useCallback((message: string, isError = false) => {
    setToast({ id: Date.now(), message, isError });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const pickInitialClass = (appState: AppState, user: UserAccount): string => {
    const ordered =
      appState.classDefs.length > 0
        ? [...appState.classDefs].sort((a, b) => a.urutan - b.urutan).map((c) => c.nama)
        : appState.classes;
    if (user.role === 'walikelas' && user.waliKelasTarget && ordered.includes(user.waliKelasTarget)) {
      return user.waliKelasTarget;
    }
    if (
      (user.role === 'guru' || user.role === 'walikelas') &&
      user.teachingAssignments &&
      user.teachingAssignments.length > 0
    ) {
      const match = user.teachingAssignments.find((a) => ordered.includes(a.kelas));
      if (match) return match.kelas;
    }
    return ordered[0] || '';
  };

  const handleAuthenticated = useCallback(
    async (token: string, user: UserAccount) => {
      setAuthToken(token);
      setCurrentUser(user);
      setSenderName(user.nama);
      setLoadingState(true);
      try {
        const res = await fetch('/api/state', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error('Gagal memuat data akademik.');
        }
        const loaded = (await res.json()) as AppState;
        setState(loaded);
        setSelectedClass(pickInitialClass(loaded, user));
        if (user.role === 'ortu') {
          const linked = loaded.students.filter((s) =>
            (user.linkedStudentIds || []).includes(s.id)
          );
          setActiveOrtuStudentId(linked[0]?.id || loaded.students[0]?.id || '');
        } else {
          setActiveOrtuStudentId('');
        }
        setActiveSection(
          user.role === 'ortu'
            ? 'parent'
            : user.role === 'siswa'
              ? 'diagnostik'
              : user.role === 'guru'
                ? 'grades'
                : 'dashboard'
        );
      } catch (err) {
        onNotify(
          err instanceof Error ? err.message : 'Gagal memuat data aplikasi dari server.',
          true
        );
        setAuthToken(null);
        setCurrentUser(null);
      } finally {
        setLoadingState(false);
      }
    },
    [onNotify]
  );

  const handleLogout = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout error
    }
    setAuthToken(null);
    setCurrentUser(null);
    setState(null);
    setActiveOrtuStudentId('');
    setPresenceUsers([]);
    setWsConnected(false);
  }, []);

  const handleRefreshAuth = useCallback((newToken: string, updatedUser: UserAccount) => {
    latestTokenRef.current = newToken;
    setAuthToken(newToken);
    setCurrentUser(updatedUser);
    setSenderName(updatedUser.nama);
  }, []);

  const checkUnauthorized = useCallback(
    (res: Response): boolean => {
      if (res.status === 401) {
        onNotify('Sesi login telah berakhir. Silakan login kembali.', true);
        void handleLogout();
        return true;
      }
      return false;
    },
    [handleLogout, onNotify]
  );

  const persistStateNow = useCallback(
    async (nextState: AppState): Promise<boolean> => {
      const token = latestTokenRef.current;
      if (!token || currentUser?.role === 'ortu' || currentUser?.role === 'siswa') return false;
      setSavingState(true);
      try {
        const res = await fetch('/api/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(nextState),
        });
        if (res.status === 401) {
          onNotify('Sesi berakhir. Silakan login kembali.', true);
          handleLogout();
          return false;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          onNotify(err.error || 'Gagal menyimpan perubahan ke server.', true);
          return false;
        }
        return true;
      } catch {
        onNotify('Koneksi server terganggu saat menyimpan data.', true);
        return false;
      } finally {
        setSavingState(false);
      }
    },
    [currentUser?.role, handleLogout, onNotify]
  );

  const commitState = useCallback(
    (updater: (prev: AppState) => AppState, immediate = false) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (currentUser?.role !== 'ortu' && currentUser?.role !== 'siswa') {
          if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          if (immediate) {
            void persistStateNow(next);
          } else {
            saveTimerRef.current = window.setTimeout(() => {
              void persistStateNow(next);
            }, 420);
          }
        }
        return next;
      });
    },
    [currentUser?.role, persistStateNow]
  );

  const reloadServerState = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride || latestTokenRef.current;
      if (!token) return;
      try {
        const res = await fetch('/api/state', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          onNotify('Sesi berakhir. Silakan login kembali.', true);
          handleLogout();
          return;
        }
        if (!res.ok) return;
        const loaded = (await res.json()) as AppState;
        setState(loaded);
        if (loaded.classes?.length) {
          setSelectedClass((prevCls) =>
            loaded.classes.includes(prevCls) ? prevCls : loaded.classes[0]
          );
        }
      } catch {
        // ignore
      }
    },
    [handleLogout, onNotify]
  );

  // WebSocket connection for 4-way Buku Penghubung (Admin, Wali Kelas, Guru, Orang Tua)
  useEffect(() => {
    if (!authToken || !currentUser) return;

    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connectWs = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/penghubung?token=${encodeURIComponent(
        authToken
      )}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'presence' && Array.isArray(msg.users)) {
            setPresenceUsers(msg.users);
          } else if (msg.type === 'entry:created' && msg.entry) {
            const incoming = msg.entry as LogbookEntry;
            setState((prev) => {
              if (!prev) return prev;
              if (prev.logbookEntries.some((e) => e.id === incoming.id)) return prev;
              return {
                ...prev,
                logbookEntries: [incoming, ...prev.logbookEntries],
              };
            });
          } else if (msg.type === 'entry:replied' && msg.entryId && msg.reply) {
            setState((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                logbookEntries: prev.logbookEntries.map((e) => {
                  if (e.id !== msg.entryId) return e;
                  if (e.replies.some((r) => r.id === msg.reply.id)) return e;
                  return {
                    ...e,
                    replies: [...e.replies, msg.reply],
                    status: msg.status || e.status,
                    updatedAt: new Date().toISOString(),
                  };
                }),
              };
            });
          } else if (msg.type === 'entry:status' && msg.entryId && msg.status) {
            setState((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                logbookEntries: prev.logbookEntries.map((e) =>
                  e.id === msg.entryId
                    ? { ...e, status: msg.status, updatedAt: new Date().toISOString() }
                    : e
                ),
              };
            });
          }
        } catch {
          // ignore invalid frame
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setWsConnected(false);
        reconnectTimer = window.setTimeout(connectWs, 3500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [authToken, currentUser]);

  // --- Handlers for subviews ---
  const handleSelectSection = (sec: SectionId) => {
    if (!currentUser) return;
    const item = NAV_ITEMS.find((n) => n.id === sec);
    if (item && !item.roles.includes(currentUser.role)) return;
    setActiveSection(sec);
  };

  const handleChangeSemester = (sem: '1' | '2') => {
    if (
      currentUser?.role === 'guru' ||
      currentUser?.role === 'ortu' ||
      currentUser?.role === 'siswa'
    )
      return;
    commitState(
      (prev) => ({
        ...prev,
        settings: { ...prev.settings, semester: sem },
      }),
      true
    );
  };

  const guardLockOrNotify = useCallback(() => {
    if (!state || !currentUser) return true;
    const info = isInputLockedForUser(state.settings, state.academicYears, currentUser);
    if (info.locked) {
      onNotify(info.reason, true);
      return true;
    }
    return false;
  }, [state, currentUser, onNotify]);

  const handleSaveStudent = (student: Student, isNew: boolean) => {
    if (currentUser?.role !== 'admin') {
      onNotify('Hanya Pengurus PKBM (Admin) yang dapat menambah atau mengubah data siswa.', true);
      return;
    }
    commitState((prev) => ({
      ...prev,
      students: isNew
        ? [...prev.students, student]
        : prev.students.map((s) => (s.id === student.id ? student : s)),
    }));
  };

  const handleImportStudents = (rows: Partial<Student>[]) => {
    if (currentUser?.role !== 'admin') {
      onNotify('Hanya Pengurus PKBM (Admin) yang dapat mengimpor data siswa.', true);
      return;
    }
    commitState((prev) => {
      const next = [...prev.students];
      rows.forEach((r, idx) => {
        if (!r.nama) return;
        const targetClass = r.kelas && prev.classes.includes(r.kelas) ? r.kelas : selectedClass;
        const t = getClassTingkat(targetClass, prev.classDefs) ?? 7;
        const existingIdx = r.nis
          ? next.findIndex((s) => s.nis.toLowerCase() === r.nis!.toLowerCase())
          : -1;
        if (existingIdx >= 0) {
          next[existingIdx] = {
            ...next[existingIdx],
            ...r,
            kelas: targetClass,
            fase: getFaseFromTingkat(t),
          };
        } else {
          const nis =
            r.nis ||
            generateNIS(targetClass, next, prev.settings.tahunAjaran, prev.classDefs);
          next.push({
            id: `stu-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
            nis,
            nisn: r.nisn || '',
            nama: r.nama,
            kelas: targetClass,
            fase: getFaseFromTingkat(t),
            jurusan: r.jurusan || 'Umum',
            jenisKelamin: r.jenisKelamin === 'P' ? 'P' : 'L',
            tempatLahir: r.tempatLahir || '',
            tanggalLahir: r.tanggalLahir || '',
            agama: r.agama || 'Islam',
            pendidikanSebelumnya: r.pendidikanSebelumnya || '',
            alamat: r.alamat || '',
            namaAyah: r.namaAyah || '',
            namaIbu: r.namaIbu || '',
            pekerjaanAyah: '',
            pekerjaanIbu: '',
            namaWali: r.namaWali || '',
            noTelpWali: r.noTelpWali || '',
            status: 'Aktif',
            fotoDataUrl: '',
            portfolioFolderUrl: '',
            portfolioItems: [],
            createdAt: new Date().toISOString(),
          });
        }
      });
      return { ...prev, students: next };
    }, true);
  };

  const handleAutoGenerateNIS = () => {
    if (currentUser?.role !== 'admin') {
      onNotify('Hanya Pengurus PKBM (Admin) yang dapat membuat NIS otomatis.', true);
      return;
    }
    commitState((prev) => {
      const working = [...prev.students];
      for (let i = 0; i < working.length; i++) {
        const s = working[i];
        if (!s.nis || !s.nis.trim()) {
          const newNis = generateNIS(
            s.kelas,
            working,
            prev.settings.tahunAjaran,
            prev.classDefs
          );
          working[i] = { ...s, nis: newNis };
        }
      }
      return { ...prev, students: working };
    }, true);
  };

  const handleDeleteStudent = (id: string) => {
    if (currentUser?.role !== 'admin') {
      onNotify('Hanya Pengurus PKBM (Admin) yang dapat menghapus data siswa.', true);
      return;
    }
    commitState((prev) => ({
      ...prev,
      students: prev.students.filter((s) => s.id !== id),
    }));
  };

  const handleUpdatePortfolio = (
    studentId: string,
    folderUrl: string,
    items: PortfolioItem[]
  ) => {
    if (guardLockOrNotify()) return;
    commitState((prev) => ({
      ...prev,
      students: prev.students.map((s) =>
        s.id === studentId
          ? { ...s, portfolioFolderUrl: folderUrl, portfolioItems: items }
          : s
      ),
    }));
  };

  const handleMutasiMasuk = (student: Student, record: MutationRecord) => {
    if (currentUser?.role !== 'admin') {
      onNotify('Hanya Pengurus PKBM (Admin) yang dapat mencatat Mutasi Masuk siswa baru.', true);
      return;
    }
    commitState(
      (prev) => ({
        ...prev,
        students: [...prev.students, student],
        mutations: [record, ...prev.mutations],
      }),
      true
    );
  };

  const handleMutasiKeluar = (studentId: string, record: MutationRecord) => {
    if (guardLockOrNotify()) return;
    commitState(
      (prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === studentId ? { ...s, status: 'Pindah' } : s
        ),
        mutations: [record, ...prev.mutations],
      }),
      true
    );
  };

  const handleRestoreStudent = (studentId: string) => {
    if (currentUser?.role !== 'admin') {
      onNotify('Hanya Pengurus PKBM (Admin) yang dapat mengaktifkan kembali status siswa.', true);
      return;
    }
    commitState(
      (prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === studentId ? { ...s, status: 'Aktif' } : s
        ),
      }),
      true
    );
  };

  const handleMigrateAcademicYear = (params: {
    nextAcademicYear: string;
    nextReportDate: string;
    archiveCurrentYear: boolean;
    decisions: Record<
      string,
      { action: 'naik' | 'tinggal' | 'lulus'; targetClass: string; targetJurusan: string }
    >;
  }) => {
    if (currentUser?.role !== 'admin') {
      onNotify('Hanya Pengurus PKBM (Admin) yang dapat melakukan migrasi tahun ajaran.', true);
      return;
    }
    commitState((prev) => {
      let promotedCount = 0;
      let graduatedCount = 0;
      let retainedCount = 0;

      const updatedStudents = prev.students.map((s) => {
        if (s.status !== 'Aktif') return s;
        const d = params.decisions[s.id];
        if (!d) return s;
        if (d.action === 'lulus') {
          graduatedCount++;
          return { ...s, status: 'Lulus' as const };
        }
        if (d.action === 'naik') {
          promotedCount++;
          const nextTingkat = getClassTingkat(d.targetClass, prev.classDefs) ?? 7;
          return {
            ...s,
            kelas: d.targetClass,
            fase: getFaseFromTingkat(nextTingkat),
            jurusan: d.targetJurusan || s.jurusan,
          };
        }
        retainedCount++;
        return s;
      });

      const archives = params.archiveCurrentYear
        ? [
            {
              id: `arc-${Date.now()}`,
              tahunAjaran: prev.settings.tahunAjaran,
              archivedAt: new Date().toISOString(),
              totalSiswa: prev.students.filter((s) => s.status === 'Aktif').length,
              promotedCount,
              graduatedCount,
              retainedCount,
              students: prev.students,
              grades: prev.grades,
              p5Projects: prev.p5Projects,
              reportMeta: prev.reportMeta,
              counselingNotes: prev.counselingNotes,
            },
            ...prev.archives,
          ]
        : prev.archives;

      const nextAcademicYears = prev.academicYears.some(
        (y) => y.tahunAjaran === params.nextAcademicYear && y.semester === '1'
      )
        ? prev.academicYears.map((y) => ({
            ...y,
            aktif: y.tahunAjaran === params.nextAcademicYear && y.semester === '1',
          }))
        : [
            ...prev.academicYears.map((y) => ({ ...y, aktif: false })),
            {
              id: `ta-${Date.now()}`,
              tahunAjaran: params.nextAcademicYear,
              semester: '1' as const,
              aktif: true,
              lockedForGuru: false,
              lockedForWaliKelas: false,
              createdAt: new Date().toISOString(),
              notes: 'Migrasi Tahun Ajaran',
            },
          ];

      return {
        ...prev,
        settings: {
          ...prev.settings,
          tahunAjaran: params.nextAcademicYear,
          semester: '1',
          tahunAjaranAktif: true,
          tanggalRapor: params.nextReportDate,
        },
        academicYears: nextAcademicYears,
        students: updatedStudents,
        archives,
      };
    }, true);
  };

  const handleSaveSubject = (subject: Subject, isNew: boolean, immediate = false) => {
    if (guardLockOrNotify()) return;
    const synced = syncSubjectFromCPs(subject);
    commitState(
      (prev) => ({
        ...prev,
        subjects: isNew
          ? [...prev.subjects, synced]
          : prev.subjects.map((s) => (s.id === synced.id ? synced : s)),
      }),
      Boolean(immediate)
    );
  };

  const handleBulkUpdateSubjects = (nextSubjects: Subject[]) => {
    if (guardLockOrNotify()) return;
    commitState(
      (prev) => ({
        ...prev,
        subjects: nextSubjects.map(syncSubjectFromCPs),
      }),
      true
    );
  };

  const handleDeleteSubject = (id: string) => {
    if (guardLockOrNotify()) return;
    commitState((prev) => ({
      ...prev,
      subjects: prev.subjects.filter((s) => s.id !== id),
    }));
  };

  const handleUpdateGrade = (key: string, entry: GradeEntry) => {
    if (guardLockOrNotify()) return;
    commitState((prev) => ({
      ...prev,
      grades: { ...prev.grades, [key]: entry },
    }));
  };

  const handleBulkUpdateGrades = (nextGrades: Record<string, GradeEntry>) => {
    if (guardLockOrNotify()) return;
    commitState(
      (prev) => ({
        ...prev,
        grades: nextGrades,
      }),
      true
    );
  };

  const handleQuickCreateStudent = (nama: string, kelas: string): Student => {
    const tingkat = getClassTingkat(kelas, state?.classDefs) ?? 7;
    const created: Student = {
      id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      nis: generateNIS(
        kelas,
        state?.students || [],
        state?.settings.tahunAjaran || '2025/2026',
        state?.classDefs
      ),
      nisn: '',
      nama: nama.trim(),
      kelas,
      fase: getFaseFromTingkat(tingkat),
      jurusan: 'Umum',
      jenisKelamin: 'L',
      tempatLahir: '',
      tanggalLahir: '',
      agama: 'Islam',
      pendidikanSebelumnya: '',
      alamat: '',
      namaAyah: '',
      namaIbu: '',
      pekerjaanAyah: '',
      pekerjaanIbu: '',
      namaWali: '',
      noTelpWali: '',
      status: 'Aktif',
      fotoDataUrl: '',
      portfolioFolderUrl: '',
      portfolioItems: [],
      createdAt: new Date().toISOString(),
    };
    if (currentUser?.role !== 'admin') {
      onNotify('Hanya Pengurus PKBM (Admin) yang dapat menambah siswa baru.', true);
      return created;
    }
    commitState((prev) => ({
      ...prev,
      students: [...prev.students, created],
    }));
    return created;
  };

  const handleSaveP5 = (proj: P5Project) => {
    if (guardLockOrNotify()) return;
    commitState((prev) => {
      const exists = prev.p5Projects.some((p) => p.id === proj.id);
      return {
        ...prev,
        p5Projects: exists
          ? prev.p5Projects.map((p) => (p.id === proj.id ? proj : p))
          : [...prev.p5Projects, proj],
      };
    });
  };

  const handleSaveMeta = (key: string, meta: ReportMeta) => {
    if (guardLockOrNotify()) return;
    commitState((prev) => ({
      ...prev,
      reportMeta: { ...prev.reportMeta, [key]: meta },
    }));
  };

  const handleApplyP5TemplateToClass = (
    tema: string,
    judulProjek: string,
    deskripsi: string
  ) => {
    if (guardLockOrNotify()) return;
    commitState((prev) => {
      const sem = prev.settings.semester;
      const classStudents = prev.students.filter(
        (s) => s.kelas === selectedClass && s.status === 'Aktif'
      );
      const updated = [...prev.p5Projects];
      classStudents.forEach((stu) => {
        const idx = updated.findIndex((p) => p.studentId === stu.id && p.semester === sem);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], tema, judulProjek, deskripsi };
        } else {
          updated.push({
            id: `p5-${stu.id}-s${sem}`,
            studentId: stu.id,
            semester: sem,
            tahunAjaran: prev.settings.tahunAjaran,
            tema,
            judulProjek,
            deskripsi,
            dimensi: createDefaultProfilLulusanDimensions(),
          });
        }
      });
      return { ...prev, p5Projects: updated };
    }, true);
  };

  const handleSaveCounselingNote = (note: CounselingNote, isNew: boolean) => {
    if (guardLockOrNotify()) return;
    commitState((prev) => ({
      ...prev,
      counselingNotes: isNew
        ? [note, ...prev.counselingNotes]
        : prev.counselingNotes.map((n) => (n.id === note.id ? note : n)),
    }));
  };

  const handleDeleteCounselingNote = (id: string) => {
    if (guardLockOrNotify()) return;
    commitState((prev) => ({
      ...prev,
      counselingNotes: prev.counselingNotes.filter((n) => n.id !== id),
    }));
  };

  const handleCreateLogbookEntry = async (
    entryDraft: Omit<LogbookEntry, 'id' | 'replies' | 'createdAt' | 'updatedAt'>
  ): Promise<boolean> => {
    if (!authToken) return false;
    const now = new Date().toISOString();
    const entry: LogbookEntry = {
      ...entryDraft,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      replies: [],
      createdAt: now,
      updatedAt: now,
    };

    setState((prev) =>
      prev ? { ...prev, logbookEntries: [entry, ...prev.logbookEntries] } : prev
    );

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'entry:create', entry }));
      return true;
    }

    try {
      const res = await fetch('/api/penghubung', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(entry),
      });
      if (checkUnauthorized(res)) return false;
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleReplyLogbookEntry = async (
    entryId: string,
    authorRole: LogbookAuthorRole,
    authorName: string,
    pesan: string,
    nextStatus?: LogbookEntry['status']
  ): Promise<boolean> => {
    if (!authToken) return false;
    const reply = {
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      authorRole,
      authorName,
      pesan,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        logbookEntries: prev.logbookEntries.map((e) =>
          e.id === entryId
            ? {
                ...e,
                replies: [...e.replies, reply],
                status: nextStatus || e.status,
                updatedAt: new Date().toISOString(),
              }
            : e
        ),
      };
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'entry:reply', entryId, reply, status: nextStatus })
      );
      return true;
    }

    try {
      const res = await fetch(`/api/penghubung/${entryId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reply, status: nextStatus }),
      });
      if (checkUnauthorized(res)) return false;
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleUpdateLogbookStatus = async (
    entryId: string,
    status: LogbookEntry['status']
  ) => {
    if (!authToken) return;
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        logbookEntries: prev.logbookEntries.map((e) =>
          e.id === entryId ? { ...e, status, updatedAt: new Date().toISOString() } : e
        ),
      };
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'entry:status', entryId, status }));
      return;
    }

    try {
      const res = await fetch(`/api/penghubung/${entryId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status }),
      });
      checkUnauthorized(res);
    } catch {
      // ignore fallback network error
    }
  };

  const handleUpdateSettings = async (
    settings: SchoolSettings,
    immediate = false
  ): Promise<boolean> => {
    if (!immediate || !state) {
      commitState((prev) => ({ ...prev, settings }), false);
      return true;
    }
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const nextState: AppState = { ...state, settings };
    setState(nextState);
    return persistStateNow(nextState);
  };

  const handleUpdateAcademicYears = (
    years: AcademicYearRecord[],
    settingsPatch?: Partial<SchoolSettings>
  ) => {
    commitState(
      (prev) => ({
        ...prev,
        academicYears: years,
        settings: settingsPatch ? { ...prev.settings, ...settingsPatch } : prev.settings,
      }),
      true
    );
  };

  const handleSubmitParentFeedback = async (payload: {
    studentId: string;
    konfirmasiStatus: ParentFeedback['konfirmasiStatus'];
    tanggapan: string;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/parent/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      if (!res.ok) return false;
      const data = await res.json();
      if (data.feedback) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                parentFeedbacks: [data.feedback as ParentFeedback, ...(prev.parentFeedbacks || [])],
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  // --- Bimbingan Belajar CP & TP API Handlers ---
  const handleCreateTutoringRecommendation = async (payload: {
    studentId: string;
    subjectId: string;
    cpId: string;
    tpId?: string;
    rekomendasiGuru: string;
    tanggalRekomendasi: string;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/tutoring/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan rekomendasi bimbingan belajar.', true);
        return false;
      }
      if (data.recommendation) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                tutoringRecommendations: [
                  data.recommendation as TutoringRecommendation,
                  ...(prev.tutoringRecommendations || []),
                ],
              }
            : prev
        );
      }
      return true;
    } catch {
      onNotify('Koneksi terganggu saat membuat rekomendasi bimbingan.', true);
      return false;
    }
  };

  const handleDeleteTutoringRecommendation = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/tutoring/recommendations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (checkUnauthorized(res)) return false;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onNotify(data.error || 'Gagal menghapus rekomendasi.', true);
        return false;
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              tutoringRecommendations: (prev.tutoringRecommendations || []).filter(
                (r) => r.id !== id
              ),
            }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleCreateTutoringRequests = async (payload: {
    studentId: string;
    subjectId: string;
    cpId: string;
    tpIds: string[];
    alasan: string;
    tanggalAjuan: string;
    recommendationId?: string;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/tutoring/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengajukan bimbingan belajar.', true);
        return false;
      }
      if (Array.isArray(data.requests)) {
        const created = data.requests as TutoringRequest[];
        setState((prev) =>
          prev
            ? {
                ...prev,
                tutoringRequests: [...created, ...(prev.tutoringRequests || [])],
                tutoringRecommendations: payload.recommendationId
                  ? (prev.tutoringRecommendations || []).map((r) =>
                      r.id === payload.recommendationId
                        ? { ...r, status: 'Diajukan Ortu' }
                        : r
                    )
                  : prev.tutoringRecommendations,
              }
            : prev
        );
      }
      return true;
    } catch {
      onNotify('Koneksi terganggu saat mengirim ajuan bimbingan.', true);
      return false;
    }
  };

  const handleUpdateTutoringRequest = async (
    id: string,
    payload: {
      status?: TutoringRequestStatus;
      jadwalTanggal?: string;
      jadwalWaktu?: string;
      jadwalLokasi?: string;
      pembimbingNama?: string;
      catatanSekolah?: string;
    }
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/tutoring/requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal memperbarui status bimbingan.', true);
        return false;
      }
      if (data.request) {
        const updated = data.request as TutoringRequest;
        setState((prev) =>
          prev
            ? {
                ...prev,
                tutoringRequests: (prev.tutoringRequests || []).map((r) =>
                  r.id === id ? updated : r
                ),
                tutoringRecommendations:
                  updated.recommendationId && updated.status === 'Selesai'
                    ? (prev.tutoringRecommendations || []).map((rec) =>
                        rec.id === updated.recommendationId
                          ? { ...rec, status: 'Selesai' }
                          : rec
                      )
                    : prev.tutoringRecommendations,
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleScheduleTutoringBatch = async (payload: {
    requestIds: string[];
    jadwalTanggal: string;
    jadwalWaktu: string;
    jadwalLokasi: string;
    pembimbingNama: string;
    catatanSekolah?: string;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/tutoring/schedule-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menjadwalkan kelompok bimbingan.', true);
        return false;
      }
      if (Array.isArray(data.requests)) {
        const updatedMap = new Map(
          (data.requests as TutoringRequest[]).map((r) => [r.id, r])
        );
        setState((prev) =>
          prev
            ? {
                ...prev,
                tutoringRequests: (prev.tutoringRequests || []).map(
                  (r) => updatedMap.get(r.id) || r
                ),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  // --- Pengajuan Alat, Bahan & Kegiatan API Handlers ---
  const handleCreateProcurement = async (payload: {
    kategori: ProcurementKategori;
    namaItem: string;
    spesifikasi: string;
    kelasTerkait: string;
    subjectName: string;
    qty: number;
    satuan: string;
    hargaSatuan: number;
    prioritas: 'Normal' | 'Mendesak' | 'Terjadwal';
    tanggalPengajuan: string;
    tanggalPenggunaan: string;
    lokasiAtauVendor: string;
    keterangan: string;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/procurement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan pengajuan alat / kegiatan.', true);
        return false;
      }
      if (data.procurement) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                procurementRequests: [
                  data.procurement as ProcurementRequest,
                  ...(prev.procurementRequests || []),
                ],
              }
            : prev
        );
      }
      return true;
    } catch {
      onNotify('Koneksi terganggu saat mengirim pengajuan.', true);
      return false;
    }
  };

  const handleUpdateProcurement = async (
    id: string,
    payload: Partial<ProcurementRequest>
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/procurement/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal memperbarui pengajuan.', true);
        return false;
      }
      if (data.procurement) {
        const updated = data.procurement as ProcurementRequest;
        setState((prev) =>
          prev
            ? {
                ...prev,
                procurementRequests: (prev.procurementRequests || []).map((p) =>
                  p.id === id ? updated : p
                ),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteProcurement = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/procurement/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (checkUnauthorized(res)) return false;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onNotify(data.error || 'Gagal menghapus pengajuan.', true);
        return false;
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              procurementRequests: (prev.procurementRequests || []).filter((p) => p.id !== id),
            }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  // --- Asesmen Diagnostik Akademik & Non-Akademik Handlers ---
  const handleSaveDiagnosticPackage = async (
    pkgPayload: Partial<DiagnosticPackage>,
    editId?: string
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const url = editId
        ? `/api/diagnostics/packages/${encodeURIComponent(editId)}`
        : '/api/diagnostics/packages';
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(pkgPayload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan paket asesmen diagnostik.', true);
        return false;
      }
      if (data.package) {
        const savedPkg = data.package as DiagnosticPackage;
        setState((prev) =>
          prev
            ? {
                ...prev,
                diagnosticPackages: editId
                  ? (prev.diagnosticPackages || []).map((p) => (p.id === editId ? savedPkg : p))
                  : [savedPkg, ...(prev.diagnosticPackages || [])],
              }
            : prev
        );
      }
      return true;
    } catch {
      onNotify('Koneksi terganggu saat menyimpan paket diagnostik.', true);
      return false;
    }
  };

  const handleReleaseDiagnosticPackage = async (
    id: string,
    status: DiagnosticPackage['status'],
    targetKelasList?: string[]
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/diagnostics/packages/${encodeURIComponent(id)}/release`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status, targetKelasList }),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengubah status rilis paket diagnostik.', true);
        return false;
      }
      if (data.package) {
        const updated = data.package as DiagnosticPackage;
        setState((prev) =>
          prev
            ? {
                ...prev,
                diagnosticPackages: (prev.diagnosticPackages || []).map((p) =>
                  p.id === id ? updated : p
                ),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteDiagnosticPackage = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/diagnostics/packages/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (checkUnauthorized(res)) return false;
      if (!res.ok) return false;
      setState((prev) =>
        prev
          ? {
              ...prev,
              diagnosticPackages: (prev.diagnosticPackages || []).filter((p) => p.id !== id),
            }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmitDiagnosticAssessment = async (
    packageId: string,
    answers: DiagnosticAnswer[],
    studentId?: string
  ): Promise<DiagnosticSubmission | null> => {
    if (!authToken) return null;
    try {
      const res = await fetch('/api/diagnostics/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ packageId, answers, studentId }),
      });
      if (checkUnauthorized(res)) return null;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengirim jawaban asesmen diagnostik.', true);
        return null;
      }
      if (data.submission) {
        const sub = data.submission as DiagnosticSubmission;
        setState((prev) => {
          if (!prev) return prev;
          const exists = (prev.diagnosticSubmissions || []).some((s) => s.id === sub.id);
          return {
            ...prev,
            diagnosticSubmissions: exists
              ? (prev.diagnosticSubmissions || []).map((s) => (s.id === sub.id ? sub : s))
              : [sub, ...(prev.diagnosticSubmissions || [])],
          };
        });
        return sub;
      }
      return null;
    } catch {
      onNotify('Koneksi terganggu saat mengirim asesmen.', true);
      return null;
    }
  };

  const handleVerifyDiagnosticSubmission = async (
    id: string,
    catatanAnalisisPengurus: string,
    keputusanTindakLanjut: string
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/diagnostics/submissions/${encodeURIComponent(id)}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ catatanAnalisisPengurus, keputusanTindakLanjut }),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengesahkan hasil asesmen.', true);
        return false;
      }
      if (data.submission) {
        const updated = data.submission as DiagnosticSubmission;
        setState((prev) =>
          prev
            ? {
                ...prev,
                diagnosticSubmissions: (prev.diagnosticSubmissions || []).map((s) =>
                  s.id === id ? updated : s
                ),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  // --- Ruang LMS API Handlers ---
  const handleCreateLmsMaterial = async (payload: {
    kelas: string;
    subjectId: string;
    cpKode?: string;
    tpKode?: string;
    judul: string;
    tipe: LmsMaterial['tipe'];
    konten: string;
    resourceUrl?: string;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/lms/materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menerbitkan materi LMS.', true);
        return false;
      }
      if (data.material) {
        setState((prev) =>
          prev
            ? { ...prev, lmsMaterials: [data.material as LmsMaterial, ...(prev.lmsMaterials || [])] }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteLmsMaterial = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/lms/materials/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return false;
      setState((prev) =>
        prev
          ? { ...prev, lmsMaterials: (prev.lmsMaterials || []).filter((m) => m.id !== id) }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleToggleCompleteLmsMaterial = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/lms/materials/${encodeURIComponent(id)}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) return false;
      if (data.material) {
        const updated = data.material as LmsMaterial;
        setState((prev) =>
          prev
            ? {
                ...prev,
                lmsMaterials: (prev.lmsMaterials || []).map((m) => (m.id === id ? updated : m)),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleCreateLmsAssignment = async (payload: {
    kelas: string;
    subjectId: string;
    cpKode?: string;
    tpKode?: string;
    judul: string;
    instruksi: string;
    tenggat: string;
    skorMaksimal: number;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/lms/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal membuat tugas LMS.', true);
        return false;
      }
      if (data.assignment) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                lmsAssignments: [data.assignment as LmsAssignment, ...(prev.lmsAssignments || [])],
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteLmsAssignment = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/lms/assignments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return false;
      setState((prev) =>
        prev
          ? { ...prev, lmsAssignments: (prev.lmsAssignments || []).filter((a) => a.id !== id) }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmitLmsAssignment = async (payload: {
    assignmentId: string;
    jawabanTeks: string;
    lampiranUrl?: string;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/lms/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengirim tugas LMS.', true);
        return false;
      }
      if (data.submission) {
        const sub = data.submission as LmsSubmission;
        setState((prev) => {
          if (!prev) return prev;
          const exists = (prev.lmsSubmissions || []).some((s) => s.id === sub.id);
          return {
            ...prev,
            lmsSubmissions: exists
              ? (prev.lmsSubmissions || []).map((s) => (s.id === sub.id ? sub : s))
              : [sub, ...(prev.lmsSubmissions || [])],
          };
        });
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleGradeLmsSubmission = async (
    id: string,
    nilai: number,
    umpanBalikGuru: string
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/lms/submissions/${encodeURIComponent(id)}/grade`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ nilai, umpanBalikGuru }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan nilai tugas LMS.', true);
        return false;
      }
      if (data.submission) {
        const updated = data.submission as LmsSubmission;
        setState((prev) =>
          prev
            ? {
                ...prev,
                lmsSubmissions: (prev.lmsSubmissions || []).map((s) =>
                  s.id === id ? updated : s
                ),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handlePostLmsDiscussion = async (payload: {
    kelas: string;
    subjectId: string;
    pesan: string;
  }): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/lms/discussions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengirim pesan forum.', true);
        return false;
      }
      if (data.discussion) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                lmsDiscussions: [...(prev.lmsDiscussions || []), data.discussion as LmsDiscussion],
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  // --- Asesmen & Pelatihan Tendik + Video Upload Handlers ---
  const handleSaveTendikPackage = async (
    payload: Partial<TendikTrainingPackage>,
    editId?: string
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const url = editId
        ? `/api/tendik/packages/${encodeURIComponent(editId)}`
        : '/api/tendik/packages';
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan paket pelatihan Tendik.', true);
        return false;
      }
      if (data.package) {
        const savedPkg = data.package as TendikTrainingPackage;
        setState((prev) =>
          prev
            ? {
                ...prev,
                tendikPackages: editId
                  ? (prev.tendikPackages || []).map((p) => (p.id === editId ? savedPkg : p))
                  : [savedPkg, ...(prev.tendikPackages || [])],
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteTendikPackage = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/tendik/packages/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return false;
      setState((prev) =>
        prev
          ? { ...prev, tendikPackages: (prev.tendikPackages || []).filter((p) => p.id !== id) }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleUploadTendikVideo = async (
    file: File
  ): Promise<{ fileName: string; videoUrl: string; sizeBytes: number } | null> => {
    if (!authToken) return null;
    try {
      const mime = file.type || 'video/mp4';
      const buf = await file.arrayBuffer();
      const res = await fetch('/api/tendik/upload-video', {
        method: 'POST',
        headers: {
          'Content-Type': mime,
          'X-File-Name': file.name,
          Authorization: `Bearer ${authToken}`,
        },
        body: buf,
      });
      if (checkUnauthorized(res)) return null;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengunggah video praktik.', true);
        return null;
      }
      return data as { fileName: string; videoUrl: string; sizeBytes: number };
    } catch {
      onNotify('Koneksi terganggu saat mengunggah berkas video.', true);
      return null;
    }
  };

  const handleSubmitTendik = async (payload: {
    packageId: string;
    answers: DiagnosticAnswer[];
    videoSourceType: 'upload' | 'url' | 'none';
    videoFileName?: string;
    videoUrl?: string;
    videoJudul?: string;
    videoDurasiDetik?: number;
    refleksiSegmen: TendikVideoReflectionSegment[];
  }): Promise<TendikSubmission | null> => {
    if (!authToken) return null;
    try {
      const res = await fetch('/api/tendik/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return null;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengirim asesmen Tendik & refleksi video.', true);
        return null;
      }
      if (data.submission) {
        const sub = data.submission as TendikSubmission;
        setState((prev) => {
          if (!prev) return prev;
          const exists = (prev.tendikSubmissions || []).some((s) => s.id === sub.id);
          return {
            ...prev,
            tendikSubmissions: exists
              ? (prev.tendikSubmissions || []).map((s) => (s.id === sub.id ? sub : s))
              : [sub, ...(prev.tendikSubmissions || [])],
          };
        });
        return sub;
      }
      return null;
    } catch {
      onNotify('Koneksi terganggu saat mengirim asesmen Tendik.', true);
      return null;
    }
  };

  const handleReviewTendikSubmission = async (
    id: string,
    payload: {
      skorPraktikVideo?: number;
      statusReview: TendikSubmission['statusReview'];
      catatanPengurus: string;
      rekomendasiPelatihanLanjutan: string;
      segmentNotes: Record<string, string>;
    }
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/tendik/submissions/${encodeURIComponent(id)}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan review pelatihan Tendik.', true);
        return false;
      }
      if (data.submission) {
        const updated = data.submission as TendikSubmission;
        setState((prev) =>
          prev
            ? {
                ...prev,
                tendikSubmissions: (prev.tendikSubmissions || []).map((s) =>
                  s.id === id ? updated : s
                ),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  // --- Survei Orang Tua & Literasi Keluarga Handlers ---
  const handleSaveSurveyPackage = async (
    payload: Partial<SurveyPackage>,
    editId?: string
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const url = editId
        ? `/api/surveys/packages/${encodeURIComponent(editId)}`
        : '/api/surveys/packages';
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return false;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan paket survei orang tua.', true);
        return false;
      }
      if (data.package) {
        const savedPkg = data.package as SurveyPackage;
        setState((prev) =>
          prev
            ? {
                ...prev,
                surveyPackages: editId
                  ? (prev.surveyPackages || []).map((p) => (p.id === editId ? savedPkg : p))
                  : [savedPkg, ...(prev.surveyPackages || [])],
              }
            : prev
        );
      }
      return true;
    } catch {
      onNotify('Koneksi terganggu saat menyimpan paket survei.', true);
      return false;
    }
  };

  const handleReleaseSurveyPackage = async (
    id: string,
    status: SurveyPackage['status']
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/surveys/packages/${encodeURIComponent(id)}/release`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal memperbarui status rilis survei.', true);
        return false;
      }
      if (data.package) {
        const updated = data.package as SurveyPackage;
        setState((prev) =>
          prev
            ? {
                ...prev,
                surveyPackages: (prev.surveyPackages || []).map((p) =>
                  p.id === id ? updated : p
                ),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteSurveyPackage = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/surveys/packages/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return false;
      setState((prev) =>
        prev
          ? { ...prev, surveyPackages: (prev.surveyPackages || []).filter((p) => p.id !== id) }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmitSurveyResponse = async (
    packageId: string,
    studentId: string,
    answers: DiagnosticAnswer[]
  ): Promise<SurveyResponse | null> => {
    if (!authToken) return null;
    try {
      const res = await fetch('/api/surveys/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ packageId, studentId, answers }),
      });
      if (checkUnauthorized(res)) return null;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengirim respons survei orang tua.', true);
        return null;
      }
      if (data.response) {
        const saved = data.response as SurveyResponse;
        setState((prev) => {
          if (!prev) return prev;
          const exists = (prev.surveyResponses || []).some((r) => r.id === saved.id);
          return {
            ...prev,
            surveyResponses: exists
              ? (prev.surveyResponses || []).map((r) => (r.id === saved.id ? saved : r))
              : [saved, ...(prev.surveyResponses || [])],
          };
        });
        return saved;
      }
      return null;
    } catch {
      onNotify('Koneksi terganggu saat mengirim survei.', true);
      return null;
    }
  };

  const handleVerifySurveyResponse = async (
    id: string,
    catatanPengurus: string
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/surveys/responses/${encodeURIComponent(id)}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ catatanPengurus }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan catatan verifikasi survei.', true);
        return false;
      }
      if (data.response) {
        const updated = data.response as SurveyResponse;
        setState((prev) =>
          prev
            ? {
                ...prev,
                surveyResponses: (prev.surveyResponses || []).map((r) =>
                  r.id === id ? updated : r
                ),
              }
            : prev
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  // --- Wali Kelas Usulan Edit Biodata Siswa Handlers ---
  const handleSubmitStudentEditRequest = async (
    studentId: string,
    proposedChanges: Partial<StudentEditEditableFields>,
    alasanPerubahan: string
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch('/api/student-edits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ studentId, proposedChanges, alasanPerubahan }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengirim usulan edit biodata siswa.', true);
        return false;
      }
      if (data.request) {
        const created = data.request as StudentEditRequest;
        setState((prev) =>
          prev
            ? { ...prev, studentEditRequests: [created, ...(prev.studentEditRequests || [])] }
            : prev
        );
      }
      return true;
    } catch {
      onNotify('Koneksi terganggu saat mengirim usulan edit biodata.', true);
      return false;
    }
  };

  const handleReviewStudentEditRequest = async (
    id: string,
    status: 'Disetujui' | 'Ditolak',
    catatanPengurus: string
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/student-edits/${encodeURIComponent(id)}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status, catatanPengurus }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal memproses persetujuan edit biodata siswa.', true);
        return false;
      }
      setState((prev) => {
        if (!prev) return prev;
        const updatedReq = data.request as StudentEditRequest | undefined;
        const updatedStudent = data.student as Student | undefined;
        return {
          ...prev,
          studentEditRequests: updatedReq
            ? (prev.studentEditRequests || []).map((r) => (r.id === id ? updatedReq : r))
            : prev.studentEditRequests,
          students: updatedStudent
            ? prev.students.map((s) => (s.id === updatedStudent.id ? updatedStudent : s))
            : prev.students,
        };
      });
      return true;
    } catch {
      return false;
    }
  };

  // --- Surat Menyurat & Pengumuman Sekolah Handlers ---
  const handleCreateLetter = async (payload: {
    templateId: string;
    studentId?: string;
    tanggalSurat: string;
    nomorSurat?: string;
    perihal: string;
    targetAudience?: string;
    targetKelasList?: string[];
    penerimaNama?: string;
    penerimaJabatan?: string;
    penerimaInstansi?: string;
    dynamicFields: Record<string, string>;
    penandatanganNama: string;
    penandatanganJabatan: string;
    penandatanganNip: string;
    status: 'Draft' | 'Terbit';
  }): Promise<SchoolLetter | null> => {
    if (!authToken) return null;
    try {
      const res = await fetch('/api/letters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return null;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan surat / pengumuman.', true);
        return null;
      }
      if (data.letter) {
        const created = data.letter as SchoolLetter;
        setState((prev) =>
          prev ? { ...prev, letters: [created, ...(prev.letters || [])] } : prev
        );
        return created;
      }
      return null;
    } catch {
      onNotify('Koneksi terganggu saat membuat surat.', true);
      return null;
    }
  };

  const handleRequestLetter = async (payload: {
    templateId: string;
    studentId?: string;
    perihal?: string;
    dynamicFields: Record<string, string>;
  }): Promise<SchoolLetter | null> => {
    if (!authToken) return null;
    try {
      const res = await fetch('/api/letters/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return null;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal mengirim pengajuan surat ke pengurus.', true);
        return null;
      }
      if (data.letter) {
        const created = data.letter as SchoolLetter;
        setState((prev) =>
          prev ? { ...prev, letters: [created, ...(prev.letters || [])] } : prev
        );
        return created;
      }
      return null;
    } catch {
      onNotify('Koneksi terganggu saat mengajukan surat.', true);
      return null;
    }
  };

  const handleUpdateLetter = async (
    id: string,
    payload: Partial<SchoolLetter>
  ): Promise<SchoolLetter | null> => {
    if (!authToken) return null;
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return null;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal memperbarui dokumen surat.', true);
        return null;
      }
      if (data.letter) {
        const updated = data.letter as SchoolLetter;
        setState((prev) =>
          prev
            ? {
                ...prev,
                letters: (prev.letters || []).map((l) => (l.id === id ? updated : l)),
              }
            : prev
        );
        return updated;
      }
      return null;
    } catch {
      onNotify('Koneksi terganggu saat memperbarui surat.', true);
      return null;
    }
  };

  const handleIssueLetter = async (
    id: string,
    payload: {
      action: 'issue' | 'reject';
      nomorSurat?: string;
      perihal?: string;
      dynamicFields?: Record<string, string>;
      penandatanganNama?: string;
      penandatanganJabatan?: string;
      penandatanganNip?: string;
      catatanPengurus?: string;
    }
  ): Promise<SchoolLetter | null> => {
    if (!authToken) return null;
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(id)}/issue`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (checkUnauthorized(res)) return null;
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Gagal memproses penerbitan surat.', true);
        return null;
      }
      if (data.letter) {
        const updated = data.letter as SchoolLetter;
        setState((prev) =>
          prev
            ? {
                ...prev,
                letters: (prev.letters || []).map((l) => (l.id === id ? updated : l)),
              }
            : prev
        );
        return updated;
      }
      return null;
    } catch {
      onNotify('Koneksi terganggu saat menerbitkan surat.', true);
      return null;
    }
  };

  const handleDeleteLetter = async (id: string): Promise<boolean> => {
    if (!authToken) return false;
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (checkUnauthorized(res)) return false;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onNotify(data.error || 'Gagal menghapus surat.', true);
        return false;
      }
      setState((prev) =>
        prev ? { ...prev, letters: (prev.letters || []).filter((l) => l.id !== id) } : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  // Improvement #2: Cascade class renames & preserve classDefs ordering across entire state
  const handleUpdateClasses = (
    nextClassDefs: ClassDef[],
    renameMap: Record<string, string> = {}
  ) => {
    const orderedDefs = [...nextClassDefs]
      .sort((a, b) => a.urutan - b.urutan)
      .map((c, idx) => ({ ...c, urutan: idx + 1 }));
    const orderedNames = orderedDefs.map((c) => c.nama);

    commitState((prev) => {
      const rename = (cls: string) => renameMap[cls] || cls;

      const nextWaliMap = { ...prev.settings.waliKelasMap };
      Object.entries(renameMap).forEach(([oldName, newName]) => {
        if (nextWaliMap[oldName]) {
          nextWaliMap[newName] = nextWaliMap[oldName];
          delete nextWaliMap[oldName];
        }
      });

      const nextStudents = prev.students.map((s) => {
        const nextCls = rename(s.kelas);
        if (nextCls === s.kelas) return s;
        const targetDef = orderedDefs.find((c) => c.nama === nextCls);
        return {
          ...s,
          kelas: nextCls,
          fase: getFaseFromTingkat(targetDef?.tingkat ?? getClassTingkat(nextCls, orderedDefs) ?? 7),
        };
      });

      const nextSubjects = prev.subjects.map((subj) => {
        const nextKelasList = subj.kelasList.map(rename);
        const nextCps = (subj.cps || []).map((cp) => ({
          ...cp,
          kelasList: (cp.kelasList || []).map(rename),
        }));
        return syncSubjectFromCPs({
          ...subj,
          kelasList: Array.from(new Set(nextKelasList)),
          cps: nextCps,
        });
      });

      const nextMutations = prev.mutations.map((m) => ({
        ...m,
        kelas: rename(m.kelas),
      }));

      const nextLogbook = prev.logbookEntries.map((l) => ({
        ...l,
        kelas: rename(l.kelas),
      }));

      return {
        ...prev,
        classDefs: orderedDefs,
        classes: orderedNames,
        settings: {
          ...prev.settings,
          waliKelasMap: nextWaliMap,
        },
        students: nextStudents,
        subjects: nextSubjects,
        mutations: nextMutations,
        logbookEntries: nextLogbook,
      };
    }, true);

    setSelectedClass((prevCls) => {
      const renamed = renameMap[prevCls] || prevCls;
      if (orderedNames.includes(renamed)) return renamed;
      return orderedNames[0] || '';
    });
  };

  const handleImportState = (imported: AppState) => {
    commitState(() => imported, true);
    if (imported.classes && imported.classes.length > 0) {
      setSelectedClass(imported.classes[0]);
    }
  };

  const handleResetAll = async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (checkUnauthorized(res)) return;
      if (!res.ok) {
        onNotify('Gagal mereset data ke default.', true);
        return;
      }
      const fresh = (await res.json()) as AppState;
      setState(fresh);
      setSelectedClass(fresh.classes[0] || '');
      onNotify('Seluruh data berhasil direset ke contoh awal.');
    } catch {
      onNotify('Terjadi kesalahan koneksi saat mereset data.', true);
    }
  };

  // --- Auth Gate ---
  if (!authToken || !currentUser || !state) {
    if (loadingState) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 flex items-center gap-3 text-sm font-medium text-slate-700 shadow-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
            Memuat data akademik PKBM...
          </div>
        </div>
      );
    }
    return (
      <AuthScreen
        initialVerifyCode={initialVerifyCode}
        initialVerifyCardId={initialVerifyCardId}
        initialVerifySchoolId={initialVerifySchoolId}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === activeSection);
  const unreadLogbookCount = state.logbookEntries.filter((e) => e.status === 'Baru').length;
  const pendingTutoringCount = (state.tutoringRequests || []).filter(
    (r) => r.status === 'Menunggu Konfirmasi' || r.status === 'Disetujui Guru'
  ).length;
  const pendingProcurementCount = (state.procurementRequests || []).filter(
    (p) => p.status === 'Menunggu Persetujuan' || p.status === 'Revisi Diminta'
  ).length;
  const pendingStudentEditCount = (state.studentEditRequests || []).filter(
    (r) => r.status === 'Menunggu Persetujuan'
  ).length;
  const pendingLetterCount = (state.letters || []).filter(
    (l) => l.status === 'Menunggu Persetujuan'
  ).length;
  const linkedStudents =
    currentUser.role === 'ortu'
      ? state.students.filter((s) => (currentUser.linkedStudentIds || []).includes(s.id))
      : [];
  const activeTingkat = getClassTingkat(selectedClass, state.classDefs);
  void metaKey;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <Sidebar
        currentUser={currentUser}
        onLogout={handleLogout}
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        settings={state.settings}
        selectedClass={selectedClass}
        onSelectClass={setSelectedClass}
        classes={state.classes}
        classDefs={state.classDefs}
        onChangeSemester={handleChangeSemester}
        unreadLogbookCount={unreadLogbookCount}
        pendingTutoringCount={pendingTutoringCount}
        pendingProcurementCount={pendingProcurementCount}
        pendingStudentEditCount={pendingStudentEditCount}
        pendingLetterCount={pendingLetterCount}
        linkedStudents={linkedStudents}
        activeOrtuStudentId={activeOrtuStudentId}
        onChangeActiveOrtuStudentId={setActiveOrtuStudentId}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                  {activeNav?.label || 'SIM Rapor Merdeka'}
                </h2>
                {currentUser.role !== 'ortu' && currentUser.role !== 'siswa' && selectedClass && (
                  <span className="hidden sm:inline text-xs font-medium text-slate-500 whitespace-nowrap">
                    · {selectedClass}
                    {activeTingkat ? ` (Tingkat ${activeTingkat})` : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                TA {state.settings.tahunAjaran} · Semester {state.settings.semester} (
                {state.settings.semester === '1' ? 'Ganjil' : 'Genap'})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {savingState && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Menyimpan...
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setVerifyCodeInput('');
                setVerifyCheckResult({ loading: false });
                setVerifyModalOpen(true);
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-700" />
              Cek QR Rapor
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onNavigate={handleSelectSection}
            />
          )}

          {activeSection === 'students' && (
            <StudentsView
              students={state.students}
              currentUser={currentUser}
              selectedClass={selectedClass}
              classes={state.classes}
              classDefs={state.classDefs}
              tahunAjaran={state.settings.tahunAjaran}
              studentEditRequests={state.studentEditRequests || []}
              onSaveStudent={handleSaveStudent}
              onImportStudents={handleImportStudents}
              onAutoGenerateNIS={handleAutoGenerateNIS}
              onDeleteStudent={handleDeleteStudent}
              onSubmitStudentEditRequest={handleSubmitStudentEditRequest}
              onReviewStudentEditRequest={handleReviewStudentEditRequest}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'rekamdidik' && (
            <RekamDidikView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onUpdatePortfolio={handleUpdatePortfolio}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'mutasi' && (
            <MutasiView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onMutasiMasuk={handleMutasiMasuk}
              onMutasiKeluar={handleMutasiKeluar}
              onRestoreStudent={handleRestoreStudent}
              onMigrateAcademicYear={handleMigrateAcademicYear}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'penghubung' && (
            <PenghubungView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              activeRole={currentUser.role}
              senderName={senderName || currentUser.nama}
              onChangeSenderName={setSenderName}
              entries={state.logbookEntries}
              presenceUsers={presenceUsers}
              wsConnected={wsConnected}
              onCreateEntry={handleCreateLogbookEntry}
              onReplyEntry={handleReplyLogbookEntry}
              onUpdateStatus={handleUpdateLogbookStatus}
              activeStudentId={activeOrtuStudentId}
              onChangeActiveStudentId={setActiveOrtuStudentId}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'tutoring' && (
            <BimbinganView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onCreateRecommendation={handleCreateTutoringRecommendation}
              onDeleteRecommendation={handleDeleteTutoringRecommendation}
              onUpdateRequest={handleUpdateTutoringRequest}
              onScheduleBatch={handleScheduleTutoringBatch}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'procurement' && (
            <ProcurementView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onCreateProcurement={handleCreateProcurement}
              onUpdateProcurement={handleUpdateProcurement}
              onDeleteProcurement={handleDeleteProcurement}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'diagnostik' && (
            <DiagnostikView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onSavePackage={handleSaveDiagnosticPackage}
              onReleasePackage={handleReleaseDiagnosticPackage}
              onDeletePackage={handleDeleteDiagnosticPackage}
              onSubmitAssessment={handleSubmitDiagnosticAssessment}
              onVerifySubmission={handleVerifyDiagnosticSubmission}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'lms' && (
            <LmsView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onCreateMaterial={handleCreateLmsMaterial}
              onDeleteMaterial={handleDeleteLmsMaterial}
              onToggleCompleteMaterial={handleToggleCompleteLmsMaterial}
              onCreateAssignment={handleCreateLmsAssignment}
              onDeleteAssignment={handleDeleteLmsAssignment}
              onSubmitAssignment={handleSubmitLmsAssignment}
              onGradeSubmission={handleGradeLmsSubmission}
              onPostDiscussion={handlePostLmsDiscussion}
              activeStudentId={activeOrtuStudentId}
              onChangeActiveStudentId={setActiveOrtuStudentId}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'tendik' && (
            <TendikView
              state={state}
              authToken={authToken}
              currentUser={currentUser}
              onSavePackage={handleSaveTendikPackage}
              onDeletePackage={handleDeleteTendikPackage}
              onUploadVideo={handleUploadTendikVideo}
              onSubmitTendik={handleSubmitTendik}
              onReviewSubmission={handleReviewTendikSubmission}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'subjects' && (
            <SubjectsView
              subjects={state.subjects}
              selectedClass={selectedClass}
              classes={state.classes}
              classDefs={state.classDefs}
              currentUser={currentUser}
              settings={state.settings}
              academicYears={state.academicYears}
              onSaveSubject={handleSaveSubject}
              onBulkUpdateSubjects={handleBulkUpdateSubjects}
              onDeleteSubject={handleDeleteSubject}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'grades' && (
            <GradesView
              students={state.students}
              subjects={state.subjects}
              grades={state.grades}
              settings={state.settings}
              academicYears={state.academicYears}
              selectedClass={selectedClass}
              classDefs={state.classDefs}
              currentUser={currentUser}
              onUpdateGrade={handleUpdateGrade}
              onBulkUpdateGrades={handleBulkUpdateGrades}
              onQuickCreateStudent={handleQuickCreateStudent}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'extras' && (
            <ExtrasView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onSaveP5={handleSaveP5}
              onSaveMeta={handleSaveMeta}
              onApplyP5TemplateToClass={handleApplyP5TemplateToClass}
              onSaveCounselingNote={handleSaveCounselingNote}
              onDeleteCounselingNote={handleDeleteCounselingNote}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'leger' && (
            <LegerView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
            />
          )}

          {activeSection === 'analytics' && (
            <AnalyticsView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
            />
          )}

          {activeSection === 'print' && (
            <PrintRaporView
              state={state}
              selectedClass={selectedClass}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'cards' && (
            <KartuPelajarView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'surat' && (
            <SuratView
              state={state}
              currentUser={currentUser}
              onCreateLetter={handleCreateLetter}
              onRequestLetter={handleRequestLetter}
              onUpdateLetter={handleUpdateLetter}
              onIssueLetter={handleIssueLetter}
              onDeleteLetter={handleDeleteLetter}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'parent' && (
            <ParentPortalView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              onSubmitParentFeedback={handleSubmitParentFeedback}
              onCreateTutoringRequests={handleCreateTutoringRequests}
              onOpenPenghubung={() => handleSelectSection('penghubung')}
              onOpenLms={() => handleSelectSection('lms')}
              onOpenSurveys={() => handleSelectSection('surveys')}
              activeStudentId={activeOrtuStudentId}
              onChangeActiveStudentId={setActiveOrtuStudentId}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'surveys' && (
            <SurveysView
              state={state}
              currentUser={currentUser}
              selectedClass={selectedClass}
              activeStudentId={activeOrtuStudentId}
              onChangeActiveStudentId={setActiveOrtuStudentId}
              onSavePackage={handleSaveSurveyPackage}
              onReleasePackage={handleReleaseSurveyPackage}
              onDeletePackage={handleDeleteSurveyPackage}
              onSubmitResponse={handleSubmitSurveyResponse}
              onVerifyResponse={handleVerifySurveyResponse}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              state={state}
              authToken={authToken}
              currentUser={currentUser}
              onUpdateSettings={handleUpdateSettings}
              onUpdateAcademicYears={handleUpdateAcademicYears}
              onUpdateClasses={handleUpdateClasses}
              onImportState={handleImportState}
              onReloadServerState={reloadServerState}
              onRefreshAuth={handleRefreshAuth}
              onSessionExpired={handleLogout}
              onResetAll={handleResetAll}
              onNotify={onNotify}
            />
          )}
        </main>
      </div>

      {verifyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Verifikasi Keaslian Rapor (QR)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setVerifyModalOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Tutup
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const clean = verifyCodeInput.trim();
                if (!clean) return;
                setVerifyCheckResult({ loading: true });
                try {
                  const sid = state.schoolId || currentUser.schoolId || 'sch-utama';
                  const res = await fetch(
                    `/api/verify?code=${encodeURIComponent(clean)}&schoolId=${encodeURIComponent(
                      sid
                    )}`
                  );
                  const data = await res.json();
                  setVerifyCheckResult({ loading: false, data });
                } catch {
                  setVerifyCheckResult({ loading: false });
                  onNotify('Gagal memverifikasi kode rapor.', true);
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={verifyCodeInput}
                onChange={(e) => setVerifyCodeInput(e.target.value)}
                placeholder="Masukkan kode VLD-..."
                className="flex-1 h-9 rounded-lg border border-slate-300 px-3 text-xs font-mono uppercase focus:border-emerald-700 focus:outline-none"
              />
              <button
                type="submit"
                disabled={verifyCheckResult.loading}
                className="px-3.5 h-9 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 whitespace-nowrap"
              >
                {verifyCheckResult.loading ? 'Memeriksa...' : 'Periksa'}
              </button>
            </form>
            {verifyCheckResult.data && (
              <div
                className={`rounded-lg border p-3 text-xs space-y-1 ${
                  verifyCheckResult.data.valid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {verifyCheckResult.data.valid ? (
                  <>
                    <div className="font-semibold">Dokumen Rapor Resmi Terverifikasi</div>
                    <div>
                      Siswa: <span className="font-medium">{verifyCheckResult.data.student?.nama}</span> ({verifyCheckResult.data.student?.nis})
                    </div>
                    <div>
                      Kelas: {verifyCheckResult.data.student?.kelas} · Jenis: Rapor {verifyCheckResult.data.docType} · Rata-rata:{' '}
                      <span className="font-mono font-semibold">{verifyCheckResult.data.averageScore}</span>
                    </div>
                  </>
                ) : (
                  <div className="font-medium">
                    Kode <span className="font-mono">{verifyCheckResult.data.code}</span> tidak ditemukan dalam data nilai aktif.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-lg flex items-start gap-2.5 text-xs font-medium ${
            toast.isError
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-white border-emerald-200 text-slate-900'
          }`}
        >
          {toast.isError ? (
            <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
