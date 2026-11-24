import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  Unlock,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AcademicYearRecord,
  AppState,
  ClassDef,
  Jenjang,
  SchoolSettings,
  SchoolTenant,
  Student,
  Subject,
  TeachingAssignment,
  UserAccount,
  UserRole,
} from '../types';
import {
  getSubjectsForClass,
  getTingkatOptionsForJenjang,
  resizeImageToDataUrl,
} from '../utils/academic';
import {
  GAS_SPREADSHEET_DB_SCRIPT,
  TARGET_DRIVE_FOLDER_URL,
} from '../utils/gasTemplate';

interface SettingsViewProps {
  state: AppState;
  authToken: string;
  currentUser: UserAccount;
  onUpdateSettings: (settings: SchoolSettings, immediate?: boolean) => Promise<boolean> | void;
  onUpdateAcademicYears?: (
    years: AcademicYearRecord[],
    settingsPatch?: Partial<SchoolSettings>
  ) => void;
  onUpdateClasses: (classDefs: ClassDef[], renameMap?: Record<string, string>) => void;
  onImportState: (state: AppState) => void;
  onReloadServerState?: (tokenOverride?: string) => Promise<void>;
  onRefreshAuth?: (token: string, user: UserAccount) => void;
  onSessionExpired?: () => void;
  onResetAll: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

interface SpreadsheetDbStatus {
  connected: boolean;
  configuredViaEnv: boolean;
  gasDbUrl: string;
  spreadsheetUrl: string;
  folderUrl: string;
  lastSyncAt: string;
  lastSyncError: string;
  counts: {
    schools: number;
    users: number;
    students: number;
  };
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  authToken,
  currentUser,
  onUpdateSettings,
  onUpdateAcademicYears,
  onUpdateClasses,
  onImportState,
  onReloadServerState,
  onRefreshAuth,
  onSessionExpired,
  onResetAll,
  onNotify,
}) => {
  const [draftSettings, setDraftSettings] = useState<SchoolSettings>(state.settings);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);

  const handleUnauthorized = (res: Response): boolean => {
    if (res.status === 401) {
      onNotify(
        'Sesi login Anda telah berakhir (server diperbarui atau dimulai ulang). Silakan login kembali.',
        true
      );
      onSessionExpired?.();
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!hasUnsavedSettings) {
      setDraftSettings(state.settings);
    }
  }, [state.settings, hasUnsavedSettings]);

  const s = draftSettings;
  const { subjects, students } = state;
  const classDefs = [...state.classDefs].sort((a, b) => a.urutan - b.urutan);
  const academicYears = state.academicYears || [];

  const patchSetting = <K extends keyof SchoolSettings>(key: K, value: SchoolSettings[K]) => {
    setHasUnsavedSettings(true);
    setDraftSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSettingsSection = async (sectionKey: string, label: string) => {
    setSavingSection(sectionKey);
    try {
      const ok = await onUpdateSettings(draftSettings, true);
      if (ok !== false) {
        setHasUnsavedSettings(false);
        onNotify(`${label} berhasil disimpan permanen.`);
      }
    } finally {
      setSavingSection(null);
    }
  };

  // --- Requirement #7: Multi-Tahun Ajaran & Kunci Pengisian Guru/Wali Kelas ---
  const [newTaName, setNewTaName] = useState('2026/2027');
  const [newTaSem, setNewTaSem] = useState<'1' | '2'>('1');
  const [newTaNotes, setNewTaNotes] = useState('');

  const handleToggleGuruLock = () => {
    const nextLocked = !s.lockedForGuru;
    const nextYears = academicYears.map((y) =>
      y.tahunAjaran === s.tahunAjaran && y.semester === s.semester
        ? { ...y, lockedForGuru: nextLocked }
        : y
    );
    if (onUpdateAcademicYears) {
      onUpdateAcademicYears(nextYears, { lockedForGuru: nextLocked });
    } else {
      patchSetting('lockedForGuru', nextLocked);
    }
    onNotify(
      nextLocked
        ? 'Pengisian nilai & CP/TP untuk Guru Mapel dikunci.'
        : 'Pengisian untuk Guru Mapel dibuka kembali.'
    );
  };

  const handleToggleWaliLock = () => {
    const nextLocked = !s.lockedForWaliKelas;
    const nextYears = academicYears.map((y) =>
      y.tahunAjaran === s.tahunAjaran && y.semester === s.semester
        ? { ...y, lockedForWaliKelas: nextLocked }
        : y
    );
    if (onUpdateAcademicYears) {
      onUpdateAcademicYears(nextYears, { lockedForWaliKelas: nextLocked });
    } else {
      patchSetting('lockedForWaliKelas', nextLocked);
    }
    onNotify(
      nextLocked
        ? 'Pengisian rapor & BK untuk Wali Kelas dikunci.'
        : 'Pengisian untuk Wali Kelas dibuka kembali.'
    );
  };

  const handleToggleCurrentYearActive = () => {
    const nextAktif = s.tahunAjaranAktif === false;
    const nextYears = academicYears.map((y) =>
      y.tahunAjaran === s.tahunAjaran && y.semester === s.semester
        ? { ...y, aktif: nextAktif }
        : y
    );
    if (onUpdateAcademicYears) {
      onUpdateAcademicYears(nextYears, { tahunAjaranAktif: nextAktif });
    } else {
      patchSetting('tahunAjaranAktif', nextAktif);
    }
    onNotify(
      nextAktif
        ? `Tahun Ajaran ${s.tahunAjaran} diaktifkan untuk input data.`
        : `Tahun Ajaran ${s.tahunAjaran} dinonaktifkan (mode baca saja bagi Guru & Wali Kelas).`
    );
  };

  const handleAddAcademicYear = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTa = newTaName.trim();
    if (!cleanTa) {
      onNotify('Nama Tahun Ajaran wajib diisi (mis. 2026/2027).', true);
      return;
    }
    if (academicYears.some((y) => y.tahunAjaran === cleanTa && y.semester === newTaSem)) {
      onNotify(`Tahun Ajaran ${cleanTa} Semester ${newTaSem} sudah terdaftar.`, true);
      return;
    }
    const created: AcademicYearRecord = {
      id: `ta-${Date.now()}`,
      tahunAjaran: cleanTa,
      semester: newTaSem,
      aktif: false,
      lockedForGuru: false,
      lockedForWaliKelas: false,
      createdAt: new Date().toISOString(),
      notes: newTaNotes.trim(),
    };
    onUpdateAcademicYears?.([...academicYears, created]);
    setNewTaNotes('');
    onNotify(`Tahun Ajaran ${cleanTa} (Sem. ${newTaSem}) ditambahkan.`);
  };

  const handleActivateYearRecord = (rec: AcademicYearRecord) => {
    const nextYears = academicYears.map((y) => ({
      ...y,
      aktif: y.id === rec.id,
    }));
    onUpdateAcademicYears?.(nextYears, {
      tahunAjaran: rec.tahunAjaran,
      semester: rec.semester,
      tahunAjaranAktif: true,
      lockedForGuru: rec.lockedForGuru,
      lockedForWaliKelas: rec.lockedForWaliKelas,
    });
    onNotify(`Beralih ke Tahun Ajaran Aktif: ${rec.tahunAjaran} Semester ${rec.semester}.`);
  };

  const handleToggleRecordAktif = (rec: AcademicYearRecord) => {
    const isCurrent = rec.tahunAjaran === s.tahunAjaran && rec.semester === s.semester;
    const nextAktif = !rec.aktif;
    const nextYears = academicYears.map((y) =>
      y.id === rec.id ? { ...y, aktif: nextAktif } : y
    );
    onUpdateAcademicYears?.(
      nextYears,
      isCurrent ? { tahunAjaranAktif: nextAktif } : undefined
    );
    onNotify(
      `Tahun Ajaran ${rec.tahunAjaran} S${rec.semester} ${nextAktif ? 'diaktifkan' : 'dinonaktifkan'}.`
    );
  };

  const handleDeleteYearRecord = (rec: AcademicYearRecord) => {
    if (academicYears.length <= 1) {
      onNotify('Minimal harus tersisa 1 data Tahun Ajaran.', true);
      return;
    }
    if (rec.tahunAjaran === s.tahunAjaran && rec.semester === s.semester) {
      onNotify('Tidak dapat menghapus Tahun Ajaran yang sedang aktif digunakan.', true);
      return;
    }
    onUpdateAcademicYears?.(academicYears.filter((y) => y.id !== rec.id));
    onNotify(`Tahun Ajaran ${rec.tahunAjaran} S${rec.semester} dihapus.`);
  };

  // --- Improvement #2: Class CRUD + Jenjang + Reordering ---
  const [newClassName, setNewClassName] = useState('');
  const [newClassJenjang, setNewClassJenjang] = useState<Jenjang>('SMP');
  const [newClassTingkat, setNewClassTingkat] = useState<number>(7);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [editClassJenjang, setEditClassJenjang] = useState<Jenjang>('SMP');
  const [editClassTingkat, setEditClassTingkat] = useState<number>(7);

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newClassName.trim();
    if (!clean) {
      onNotify('Nama kelas wajib diisi.', true);
      return;
    }
    if (classDefs.some((c) => c.nama.toLowerCase() === clean.toLowerCase())) {
      onNotify('Nama kelas sudah ada di daftar.', true);
      return;
    }
    const nextDef: ClassDef = {
      id: `cls-${Date.now()}`,
      nama: clean,
      jenjang: newClassJenjang,
      tingkat: newClassTingkat,
      urutan: classDefs.length + 1,
    };
    const nextList = [...classDefs, nextDef].map((c, i) => ({ ...c, urutan: i + 1 }));
    onUpdateClasses(nextList);
    setNewClassName('');
    onNotify(`Kelas "${clean}" (${newClassJenjang} · Tingkat ${newClassTingkat}) ditambahkan.`);
  };

  const startEditClass = (cls: ClassDef) => {
    setEditingClassId(cls.id);
    setEditClassName(cls.nama);
    setEditClassJenjang(cls.jenjang);
    setEditClassTingkat(cls.tingkat);
  };

  const saveEditClass = (cls: ClassDef) => {
    const clean = editClassName.trim();
    if (!clean) {
      onNotify('Nama kelas tidak boleh kosong.', true);
      return;
    }
    if (
      clean.toLowerCase() !== cls.nama.toLowerCase() &&
      classDefs.some((c) => c.nama.toLowerCase() === clean.toLowerCase())
    ) {
      onNotify('Nama kelas sudah digunakan oleh kelas lain.', true);
      return;
    }
    const renameMap = clean !== cls.nama ? { [cls.nama]: clean } : undefined;
    const nextList = classDefs.map((c) =>
      c.id === cls.id
        ? { ...c, nama: clean, jenjang: editClassJenjang, tingkat: editClassTingkat }
        : c
    );
    onUpdateClasses(nextList, renameMap);
    setEditingClassId(null);
    onNotify(`Kelas diperbarui menjadi "${clean}" (${editClassJenjang} · Tingkat ${editClassTingkat}).`);
  };

  const moveClass = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= classDefs.length) return;
    const copy = [...classDefs];
    const [removed] = copy.splice(idx, 1);
    copy.splice(target, 0, removed);
    const reordered = copy.map((c, i) => ({ ...c, urutan: i + 1 }));
    onUpdateClasses(reordered);
  };

  const deleteClass = (cls: ClassDef) => {
    const countStudents = students.filter((st) => st.kelas === cls.nama).length;
    if (countStudents > 0) {
      onNotify(
        `Tidak dapat menghapus "${cls.nama}" karena masih memiliki ${countStudents} data siswa.`,
        true
      );
      return;
    }
    if (classDefs.length <= 1) {
      onNotify('Minimal harus tersisa 1 kelas.', true);
      return;
    }
    const next = classDefs
      .filter((c) => c.id !== cls.id)
      .map((c, i) => ({ ...c, urutan: i + 1 }));
    onUpdateClasses(next);
    onNotify(`Kelas "${cls.nama}" dihapus.`);
  };

  // --- Accounts & Verification State (Improvements #3 & #6) ---
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userFilter, setUserFilter] = useState<'all' | 'pending' | 'active'>('all');

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [uUsername, setUUsername] = useState('');
  const [uNama, setUNama] = useState('');
  const [uNip, setUNip] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<UserRole>('walikelas');
  const [uAktif, setUAktif] = useState(true);
  const [uWaliTarget, setUWaliTarget] = useState(classDefs[0]?.nama || '');
  const [uAssignments, setUAssignments] = useState<TeachingAssignment[]>([]);
  const [uLinkedStudents, setULinkedStudents] = useState<string[]>([]);
  const [savingUser, setSavingUser] = useState(false);

  // Multi-Sekolah isolated tenant creation
  const [schoolsList, setSchoolsList] = useState<SchoolTenant[]>([]);
  const [schNama, setSchNama] = useState('');
  const [schKode, setSchKode] = useState('');
  const [schNpsn, setSchNpsn] = useState('');
  const [schJenis, setSchJenis] = useState<'PKBM' | 'Sekolah Formal'>('PKBM');
  const [schAdminNama, setSchAdminNama] = useState('');
  const [schAdminUsername, setSchAdminUsername] = useState('');
  const [schAdminPassword, setSchAdminPassword] = useState('');
  const [creatingSchool, setCreatingSchool] = useState(false);

  const loadSchools = async () => {
    try {
      const res = await fetch('/api/schools');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.schools)) setSchoolsList(data.schools);
    } catch {
      // ignore
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    if (!schNama.trim() || !schAdminNama.trim() || !schAdminUsername.trim() || schAdminPassword.length < 6) {
      onNotify('Lengkapi nama sekolah, admin, username, dan kata sandi (min 6 karakter).', true);
      return;
    }
    setCreatingSchool(true);
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          nama: schNama.trim(),
          kodeSekolah: schKode.trim(),
          npsn: schNpsn.trim(),
          jenisLembaga: schJenis,
          adminNama: schAdminNama.trim(),
          adminUsername: schAdminUsername.trim().toLowerCase(),
          adminPassword: schAdminPassword,
        }),
      });
      const data = await res.json();
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        onNotify(data.error || 'Gagal mendaftarkan sekolah baru.', true);
        return;
      }
      onNotify(
        `Sekolah "${data.school?.nama}" berhasil dibuat dengan data siswa, guru, orang tua & rapor terisolasi. Login di halaman Masuk dengan memilih sekolah tersebut.`
      );
      setSchNama('');
      setSchKode('');
      setSchNpsn('');
      setSchAdminNama('');
      setSchAdminUsername('');
      setSchAdminPassword('');
      await loadSchools();
    } catch {
      onNotify('Gagal terhubung ke server saat membuat sekolah.', true);
    } finally {
      setCreatingSchool(false);
    }
  };

  const loadUsers = async (tokenOverride?: string) => {
    const token = tokenOverride || authToken;
    if (!token) return;
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/auth/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.users)) setUsers(data.users);
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  };

  const [dbStatus, setDbStatus] = useState<SpreadsheetDbStatus | null>(null);
  const [remoteRestorePrompt, setRemoteRestorePrompt] = useState<{
    schoolsCount: number;
    usersCount: number;
    updatedAt: string;
  } | null>(null);

  const loadDbStatus = async (tokenOverride?: string) => {
    const token = tokenOverride || authToken;
    if (!token) return;
    try {
      const res = await fetch('/api/db/spreadsheet/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) return;
      const data = (await res.json()) as SpreadsheetDbStatus;
      setDbStatus(data);
      if (data.gasDbUrl && !draftSettings.gasEndpointUrl) {
        setDraftSettings((prev) => ({ ...prev, gasEndpointUrl: data.gasDbUrl }));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (currentUser.role === 'admin' && authToken) {
      loadUsers();
      loadSchools();
      loadDbStatus();
    }
  }, [authToken, currentUser.role]);

  const waliKelasUsers = users.filter((u) => u.role === 'walikelas');
  const pendingUsersCount = users.filter((u) => !u.aktif).length;

  const openAddUserModal = () => {
    setEditUserId(null);
    setUUsername('');
    setUNama('');
    setUNip('');
    setUPassword('');
    setURole('walikelas');
    setUAktif(true);
    setUWaliTarget(classDefs[6]?.nama || classDefs[0]?.nama || '');
    setUAssignments([{ kelas: classDefs[6]?.nama || classDefs[0]?.nama || '', subjectIds: [] }]);
    setULinkedStudents([]);
    setUserModalOpen(true);
  };

  const openEditUserModal = (u: UserAccount) => {
    setEditUserId(u.id);
    setUUsername(u.username);
    setUNama(u.nama);
    setUNip(u.nip || '');
    setUPassword('');
    setURole(u.role);
    setUAktif(u.aktif);
    setUWaliTarget(u.waliKelasTarget || classDefs[0]?.nama || '');
    setUAssignments(
      u.teachingAssignments && u.teachingAssignments.length > 0
        ? u.teachingAssignments
        : [{ kelas: classDefs[0]?.nama || '', subjectIds: [] }]
    );
    setULinkedStudents(u.linkedStudentIds || []);
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      const payload = {
        username: uUsername.trim().toLowerCase(),
        nama: uNama.trim(),
        nip: uNip.trim(),
        password: uPassword,
        role: uRole,
        aktif: uAktif,
        waliKelasTarget: uRole === 'walikelas' ? uWaliTarget : undefined,
        teachingAssignments:
          uRole === 'walikelas' || uRole === 'guru'
            ? uAssignments.filter((a) => a.kelas && a.subjectIds.length > 0)
            : [],
        linkedStudentIds:
          uRole === 'ortu'
            ? uLinkedStudents
            : uRole === 'siswa'
              ? uLinkedStudents.slice(0, 1)
              : [],
      };
      const url = editUserId ? `/api/auth/users/${encodeURIComponent(editUserId)}` : '/api/auth/users';
      const method = editUserId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        onNotify(data.error || 'Gagal menyimpan akun pengguna.', true);
        return;
      }
      await loadUsers();
      setUserModalOpen(false);
      onNotify(editUserId ? 'Akun pengguna diperbarui.' : 'Akun pengguna baru ditambahkan.');
    } catch {
      onNotify('Gagal menghubungi server manajemen akun.', true);
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserActive = async (u: UserAccount) => {
    try {
      const res = await fetch(`/api/auth/users/${encodeURIComponent(u.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ aktif: !u.aktif }),
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        onNotify(d.error || 'Gagal memperbarui status akun.', true);
        return;
      }
      await loadUsers();
      onNotify(
        !u.aktif
          ? `Akun ${u.nama} (${u.username}) telah diverifikasi & diaktifkan. Sekarang dapat login.`
          : `Akun ${u.nama} dinonaktifkan.`
      );
    } catch {
      onNotify('Gagal memperbarui status akun.', true);
    }
  };

  const handleDeleteUser = async (u: UserAccount) => {
    try {
      const res = await fetch(`/api/auth/users/${encodeURIComponent(u.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        onNotify(d.error || 'Gagal menghapus akun.', true);
        return;
      }
      await loadUsers();
      onNotify(`Akun @${u.username} dihapus.`);
    } catch {
      onNotify('Gagal menghapus akun.', true);
    }
  };

  // --- Image uploads & GAS sync ---
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const ttdKepalaInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const [gasBusy, setGasBusy] = useState(false);
  const [gasStatusMsg, setGasStatusMsg] = useState<string | null>(null);
  const [showGasCode, setShowGasCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 320, 320, true);
      patchSetting('logoDataUrl', dataUrl);
      onNotify('Logo sekolah berhasil diunggah.');
    } catch {
      onNotify('Gagal memproses file logo.', true);
    }
  };

  const handleUploadTtdKepala = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 360, 180, true);
      patchSetting('ttdKepalaDataUrl', dataUrl);
      onNotify('Tanda tangan digital Kepala Lembaga berhasil diunggah.');
    } catch {
      onNotify('Gagal memproses file TTD.', true);
    }
  };

  const handleUploadTtdWali = async (kelas: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 360, 180, true);
      const prev = s.waliKelasMap[kelas] ?? { nama: '', nip: '' };
      patchSetting('waliKelasMap', {
        ...s.waliKelasMap,
        [kelas]: { ...prev, ttdDataUrl: dataUrl },
      });
      onNotify(`TTD digital Wali ${kelas} berhasil diunggah.`);
    } catch {
      onNotify('Gagal memproses file TTD wali kelas.', true);
    }
  };

  const handleGasSync = async (mode: 'ping' | 'pull' | 'push') => {
    if (!s.gasEndpointUrl.trim()) {
      onNotify('Masukkan URL Web App Google Apps Script (/exec) terlebih dahulu.', true);
      return;
    }
    setGasBusy(true);
    setGasStatusMsg(null);
    try {
      const res = await fetch('/api/gas-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          url: s.gasEndpointUrl,
          mode,
        }),
      });
      const data = await res.json();
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        const msg = data.error || 'Gagal menghubungi Google Apps Script.';
        setGasStatusMsg(msg);
        onNotify(msg, true);
        return;
      }
      if (mode === 'pull' && data.type === 'restored') {
        if (data.token && data.user) {
          onRefreshAuth?.(data.token, data.user);
        } else if (data.requiresRelogin) {
          onNotify(data.message || 'Data dipulihkan. Silakan login kembali dengan akun dari Spreadsheet.');
          onSessionExpired?.();
          return;
        }
        const nextToken = data.token || authToken;
        await onReloadServerState?.(nextToken);
        await loadUsers(nextToken);
        await loadSchools();
        await loadDbStatus(nextToken);
        onNotify(data.message || 'Database dipulihkan dari Google Spreadsheet.');
      } else {
        await loadDbStatus();
        onNotify(data.message || 'Koneksi berhasil.');
      }
      setGasStatusMsg(data.message || 'Sinkronisasi berhasil.');
    } catch {
      onNotify('Gagal menghubungi server sinkronisasi GAS.', true);
    } finally {
      setGasBusy(false);
    }
  };

  const handleConnectSpreadsheetDb = async (action: 'connect' | 'pull' | 'overwrite' = 'connect') => {
    const targetUrl = s.gasEndpointUrl.trim() || dbStatus?.gasDbUrl || '';
    if (!targetUrl) {
      onNotify('Tempel URL Web App Google Apps Script (/exec) terlebih dahulu.', true);
      return;
    }
    setGasBusy(true);
    setGasStatusMsg(null);
    try {
      if (hasUnsavedSettings) {
        const savedOk = await onUpdateSettings(draftSettings, true);
        if (savedOk === false) return;
        setHasUnsavedSettings(false);
      }
      const res = await fetch('/api/db/spreadsheet/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ url: targetUrl, action }),
      });
      const data = await res.json();
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        const msg = data.error || 'Gagal menghubungkan ke Database Spreadsheet.';
        setGasStatusMsg(msg);
        onNotify(msg, true);
        return;
      }
      if (data.needsRestoreConfirm && data.remoteSummary) {
        setRemoteRestorePrompt(data.remoteSummary);
        setGasStatusMsg(data.message);
        onNotify(data.message);
        await loadDbStatus();
        return;
      }
      setRemoteRestorePrompt(null);
      if (data.mode === 'pulled') {
        if (data.token && data.user) {
          onRefreshAuth?.(data.token, data.user);
        } else if (data.requiresRelogin) {
          onNotify(data.message || 'Data dipulihkan. Silakan login menggunakan akun Pengurus dari Spreadsheet.');
          onSessionExpired?.();
          return;
        }
        const nextToken = data.token || authToken;
        await onReloadServerState?.(nextToken);
        await loadUsers(nextToken);
        await loadSchools();
        await loadDbStatus(nextToken);
      } else {
        await loadDbStatus();
      }
      setGasStatusMsg(data.message || 'Database Google Spreadsheet terhubung & tersimpan.');
      onNotify(data.message || 'Database Google Spreadsheet terhubung.');
    } catch {
      onNotify('Gagal menghubungi server saat menghubungkan Spreadsheet DB.', true);
    } finally {
      setGasBusy(false);
    }
  };

  const handleForceSyncSpreadsheetDb = async () => {
    setGasBusy(true);
    setGasStatusMsg(null);
    try {
      if (hasUnsavedSettings) {
        const savedOk = await onUpdateSettings(draftSettings, true);
        if (savedOk === false) return;
        setHasUnsavedSettings(false);
      }
      const res = await fetch('/api/db/spreadsheet/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ url: s.gasEndpointUrl.trim() || dbStatus?.gasDbUrl || '' }),
      });
      const data = await res.json();
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        const msg = data.error || 'Gagal menyimpan data ke Spreadsheet.';
        setGasStatusMsg(msg);
        onNotify(msg, true);
        return;
      }
      await loadDbStatus();
      setGasStatusMsg(data.message);
      onNotify(data.message || 'Semua data & akun tersimpan ke Spreadsheet.');
    } catch {
      onNotify('Koneksi terganggu saat menyimpan ke Spreadsheet.', true);
    } finally {
      setGasBusy(false);
    }
  };

  const handleRestoreSpreadsheetDb = async () => {
    setGasBusy(true);
    setGasStatusMsg(null);
    try {
      const res = await fetch('/api/db/spreadsheet/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ url: s.gasEndpointUrl.trim() || dbStatus?.gasDbUrl || '' }),
      });
      const data = await res.json();
      if (handleUnauthorized(res)) return;
      if (!res.ok) {
        const msg = data.error || 'Gagal memulihkan data dari Spreadsheet.';
        setGasStatusMsg(msg);
        onNotify(msg, true);
        return;
      }
      setRemoteRestorePrompt(null);
      if (data.token && data.user) {
        onRefreshAuth?.(data.token, data.user);
      } else if (data.requiresRelogin) {
        onNotify(data.message || 'Database dipulihkan. Silakan login kembali dengan akun dari Spreadsheet.');
        onSessionExpired?.();
        return;
      }
      const nextToken = data.token || authToken;
      await onReloadServerState?.(nextToken);
      await loadUsers(nextToken);
      await loadSchools();
      await loadDbStatus(nextToken);
      setHasUnsavedSettings(false);
      setGasStatusMsg(data.message);
      onNotify(data.message || 'Database berhasil dipulihkan dari Spreadsheet.');
    } catch {
      onNotify('Koneksi terganggu saat memulihkan data dari Spreadsheet.', true);
    } finally {
      setGasBusy(false);
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_SIM_Rapor_${s.tahunAjaran.replace('/', '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppState;
      if (!parsed.settings || !Array.isArray(parsed.students)) {
        onNotify('Format file backup JSON tidak valid.', true);
        return;
      }
      onImportState(parsed);
      onNotify('Backup JSON berhasil dipulihkan.');
    } catch {
      onNotify('Gagal membaca file backup JSON.', true);
    }
  };

  const totalWeight = s.bobot.tugas + s.bobot.kuis + s.bobot.ujian;
  const filteredUsers = users.filter((u) => {
    if (userFilter === 'pending') return !u.aktif;
    if (userFilter === 'active') return u.aktif;
    return true;
  });

  const subjectLookup = new Map(subjects.map((sub) => [sub.id, sub]));

  return (
    <div className="space-y-6">
      {hasUnsavedSettings && (
        <div className="sticky top-2 z-20 p-3 rounded-xl border border-amber-300 bg-amber-50/95 backdrop-blur flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <span className="font-semibold text-amber-900">
            Ada perubahan pada Identitas Lembaga / Pengaturan / Konfigurasi Sync yang belum disimpan.
          </span>
          <button
            type="button"
            disabled={savingSection !== null}
            onClick={() => handleSaveSettingsSection('all', 'Seluruh perubahan Identitas & Pengaturan')}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSection ? 'Menyimpan...' : 'Simpan Semua Perubahan'}
          </button>
        </div>
      )}

      {/* 1. School Profile & Digital Assets */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Identitas Lembaga (PKBM / Sekolah) & Aset Resmi
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh profil sekolah, logo, dan tanda tangan digital akan dicetak otomatis ke Rapor PDF & Kartu Pelajar.
            </p>
          </div>
          <button
            type="button"
            disabled={savingSection !== null}
            onClick={() => handleSaveSettingsSection('identitas', 'Identitas Lembaga')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSection === 'identitas' ? 'Menyimpan...' : 'Simpan Identitas'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              {s.logoDataUrl ? (
                <img src={s.logoDataUrl} alt="Logo Sekolah" className="w-full h-full object-contain p-1" />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900">Logo Sekolah / PKBM</div>
              <p className="text-[11px] text-slate-500">
                Format PNG/JPG. Muncul pada kop rapor PDF & header kartu pelajar.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadLogo}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="w-3 h-3" /> Unggah Logo
                </button>
                {s.logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => patchSetting('logoDataUrl', '')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3" /> Hapus
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center gap-4">
            <div className="w-24 h-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              {s.ttdKepalaDataUrl ? (
                <img
                  src={s.ttdKepalaDataUrl}
                  alt="TTD Kepala Sekolah"
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <span className="text-[10px] text-slate-400">Belum ada TTD</span>
              )}
            </div>
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900">
                TTD Digital Kepala Lembaga
              </div>
              <p className="text-[11px] text-slate-500">
                Muncul otomatis di atas nama Kepala Lembaga pada lembar pengesahan rapor.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <input
                  ref={ttdKepalaInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadTtdKepala}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => ttdKepalaInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="w-3 h-3" /> Unggah TTD
                </button>
                {s.ttdKepalaDataUrl && (
                  <button
                    type="button"
                    onClick={() => patchSetting('ttdKepalaDataUrl', '')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3" /> Hapus
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Lembaga</label>
            <select
              value={s.jenisLembaga}
              onChange={(e) =>
                patchSetting('jenisLembaga', e.target.value as SchoolSettings['jenisLembaga'])
              }
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="PKBM">PKBM (Paket A / B / C)</option>
              <option value="Sekolah Formal">Sekolah Formal (SD / SMP / SMA)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Lembaga / Sekolah
            </label>
            <input
              type="text"
              value={s.namaSekolah}
              onChange={(e) => patchSetting('namaSekolah', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">NPSN</label>
            <input
              type="text"
              value={s.npsn}
              onChange={(e) => patchSetting('npsn', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              NSS / Nomor Izin Operasional
            </label>
            <input
              type="text"
              value={s.nss}
              onChange={(e) => patchSetting('nss', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Status Akreditasi
            </label>
            <input
              type="text"
              value={s.akreditasi}
              onChange={(e) => patchSetting('akreditasi', e.target.value)}
              placeholder="Contoh: A (Unggul)"
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tahun Pelajaran
            </label>
            <input
              type="text"
              value={s.tahunAjaran}
              onChange={(e) => patchSetting('tahunAjaran', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Alamat Jalan Lembaga
            </label>
            <input
              type="text"
              value={s.alamat}
              onChange={(e) => patchSetting('alamat', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Kelurahan / Desa
            </label>
            <input
              type="text"
              value={s.kelurahan}
              onChange={(e) => patchSetting('kelurahan', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kecamatan</label>
            <input
              type="text"
              value={s.kecamatan}
              onChange={(e) => patchSetting('kecamatan', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Kabupaten / Kota
            </label>
            <input
              type="text"
              value={s.kabupaten}
              onChange={(e) => patchSetting('kabupaten', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Provinsi</label>
              <input
                type="text"
                value={s.provinsi}
                onChange={(e) => patchSetting('provinsi', e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kode Pos</label>
              <input
                type="text"
                value={s.kodePos}
                onChange={(e) => patchSetting('kodePos', e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-2 font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Telepon Lembaga
            </label>
            <input
              type="text"
              value={s.telepon}
              onChange={(e) => patchSetting('telepon', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email Resmi</label>
            <input
              type="email"
              value={s.email}
              onChange={(e) => patchSetting('email', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Website Lembaga
            </label>
            <input
              type="text"
              value={s.website}
              onChange={(e) => patchSetting('website', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Kepala Lembaga / Sekolah
            </label>
            <input
              type="text"
              value={s.kepalaSekolah}
              onChange={(e) => patchSetting('kepalaSekolah', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              NIP / NUPTK Kepala
            </label>
            <input
              type="text"
              value={s.nipKepalaSekolah}
              onChange={(e) => patchSetting('nipKepalaSekolah', e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tempat Rapor</label>
              <input
                type="text"
                value={s.tempatRapor}
                onChange={(e) => patchSetting('tempatRapor', e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-3"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tanggal Rapor
              </label>
              <input
                type="date"
                value={s.tanggalRapor}
                onChange={(e) => patchSetting('tanggalRapor', e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 px-2.5 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Pastikan klik tombol simpan setelah mengubah data identitas lembaga.
          </span>
          <button
            type="button"
            disabled={savingSection !== null}
            onClick={() => handleSaveSettingsSection('identitas', 'Identitas Lembaga')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSection === 'identitas' ? 'Menyimpan...' : 'Simpan Identitas Lembaga'}
          </button>
        </div>
      </div>

      {/* 1B. Manajemen Multi-Tahun Ajaran & Kunci Pengisian Guru / Wali Kelas */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Manajemen Tahun Ajaran (Multi-TA) & Kunci Pengisian
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Aktifkan atau nonaktifkan Tahun Ajaran dan kunci pengisian nilai/rapor bagi Guru Mapel maupun Wali Kelas.
              </p>
            </div>
          </div>
          <div className="text-xs font-mono text-slate-700">
            TA Berjalan: <strong className="text-slate-900">{s.tahunAjaran}</strong> · Sem{' '}
            <strong>{s.semester}</strong> ·{' '}
            <strong className={s.tahunAjaranAktif === false ? 'text-red-600' : 'text-emerald-700'}>
              {s.tahunAjaranAktif === false ? 'NONAKTIF' : 'AKTIF'}
            </strong>
          </div>
        </div>

        {/* Penguncian Cepat */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">Status Tahun Ajaran Aktif</div>
              <div className="text-slate-500 mt-0.5">
                {s.tahunAjaranAktif === false
                  ? 'Nonaktif (Guru & Wali tidak bisa input)'
                  : 'Aktif (Pengisian terbuka sesuai kunci peran)'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleCurrentYearActive}
              className={`h-8 px-3 rounded-lg font-semibold whitespace-nowrap shrink-0 ${
                s.tahunAjaranAktif === false
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
              }`}
            >
              {s.tahunAjaranAktif === false ? 'Aktifkan TA' : 'Nonaktifkan TA'}
            </button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">Kunci Pengisian Guru Mapel</div>
              <div className="text-slate-500 mt-0.5">
                {s.lockedForGuru
                  ? 'Terkunci — Guru hanya dapat melihat'
                  : 'Terbuka — Guru dapat input nilai & CP/TP'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleGuruLock}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg font-semibold whitespace-nowrap shrink-0 ${
                s.lockedForGuru
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
            >
              {s.lockedForGuru ? (
                <>
                  <Lock className="w-3.5 h-3.5" /> Terkunci
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-700" /> Buka / Kunci
                </>
              )}
            </button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">Kunci Pengisian Wali Kelas</div>
              <div className="text-slate-500 mt-0.5">
                {s.lockedForWaliKelas
                  ? 'Terkunci — Profil Lulusan, Ekskul & BK dikunci'
                  : 'Terbuka — Wali Kelas dapat mengisi rapor'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleWaliLock}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg font-semibold whitespace-nowrap shrink-0 ${
                s.lockedForWaliKelas
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
            >
              {s.lockedForWaliKelas ? (
                <>
                  <Lock className="w-3.5 h-3.5" /> Terkunci
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-700" /> Buka / Kunci
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tambah Tahun Ajaran Baru */}
        <form
          onSubmit={handleAddAcademicYear}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-4 rounded-xl border border-slate-200 bg-slate-50/70 text-xs"
        >
          <div className="sm:col-span-3">
            <label className="block font-medium text-slate-700 mb-1">Tahun Ajaran *</label>
            <input
              type="text"
              value={newTaName}
              onChange={(e) => setNewTaName(e.target.value)}
              placeholder="2026/2027"
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 font-mono"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block font-medium text-slate-700 mb-1">Semester *</label>
            <select
              value={newTaSem}
              onChange={(e) => setNewTaSem(e.target.value as '1' | '2')}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
            >
              <option value="1">Semester 1 (Ganjil)</option>
              <option value="2">Semester 2 (Genap)</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="block font-medium text-slate-700 mb-1">Keterangan (Opsional)</label>
            <input
              type="text"
              value={newTaNotes}
              onChange={(e) => setNewTaNotes(e.target.value)}
              placeholder="Contoh: Persiapan TA baru"
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Tahun Ajaran
            </button>
          </div>
        </form>

        {/* Tabel Daftar Tahun Ajaran */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 font-mono">Tahun Ajaran</th>
                <th className="px-4 py-2.5">Semester</th>
                <th className="px-4 py-2.5">Status Aktif</th>
                <th className="px-4 py-2.5">Keterangan</th>
                <th className="px-4 py-2.5 text-right">Aksi Pengurus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {academicYears.map((rec) => {
                const isSelectedCurrent =
                  rec.tahunAjaran === s.tahunAjaran && rec.semester === s.semester;
                return (
                  <tr key={rec.id} className={isSelectedCurrent ? 'bg-emerald-50/40' : ''}>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">
                      {rec.tahunAjaran}{' '}
                      {isSelectedCurrent && (
                        <span className="text-emerald-700 font-sans">· Dipilih Saat Ini</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      Semester {rec.semester} ({rec.semester === '1' ? 'Ganjil' : 'Genap'})
                    </td>
                    <td className="px-4 py-2.5 font-semibold">
                      <span className={rec.aktif ? 'text-emerald-700' : 'text-slate-500'}>
                        {rec.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{rec.notes || '-'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {!isSelectedCurrent && (
                          <button
                            type="button"
                            onClick={() => handleActivateYearRecord(rec)}
                            className="px-2.5 py-1 rounded border border-emerald-700 bg-emerald-50 text-emerald-800 font-semibold hover:bg-emerald-100"
                          >
                            Gunakan & Aktifkan
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleRecordAktif(rec)}
                          className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50"
                        >
                          {rec.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        {!isSelectedCurrent && academicYears.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteYearRecord(rec)}
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Improvement #2: Manajemen Daftar Kelas, Jenjang (SD/SMP/SMA), & Urutan Kelas */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            Manajemen Daftar Kelas (SD / SMP / SMA) & Urutan Kelas
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tambah kelas baru ke jenjang SD, SMP, atau SMA, ubah nama kelas, serta atur urutan daftar kelas yang tampil di seluruh aplikasi.
          </p>
        </div>

        <form
          onSubmit={handleAddClass}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-4 rounded-xl border border-slate-200 bg-slate-50/70 text-xs"
        >
          <div className="sm:col-span-5">
            <label className="block font-medium text-slate-700 mb-1">Nama Kelas Baru *</label>
            <input
              type="text"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Contoh: Kelas 7A SMP atau Kelas 10 IPA SMA"
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">Jenjang *</label>
            <select
              value={newClassJenjang}
              onChange={(e) => {
                const j = e.target.value as Jenjang;
                setNewClassJenjang(j);
                setNewClassTingkat(getTingkatOptionsForJenjang(j)[0]);
              }}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium"
            >
              <option value="SD">SD</option>
              <option value="SMP">SMP</option>
              <option value="SMA">SMA</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">Tingkat *</label>
            <select
              value={newClassTingkat}
              onChange={(e) => setNewClassTingkat(Number(e.target.value))}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-mono"
            >
              {getTingkatOptionsForJenjang(newClassJenjang).map((t) => (
                <option key={t} value={t}>
                  Kelas {t}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Kelas ke {newClassJenjang}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 w-16 text-center">Urut</th>
                <th className="px-4 py-2.5">Nama Kelas</th>
                <th className="px-3 py-2.5 w-28">Jenjang</th>
                <th className="px-3 py-2.5 w-28 text-center">Tingkat</th>
                <th className="px-3 py-2.5 w-24 text-center">Siswa</th>
                <th className="px-4 py-2.5 text-right">Urutkan & Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {classDefs.map((cls, idx) => {
                const isEditing = editingClassId === cls.id;
                const stuCount = students.filter((st) => st.kelas === cls.nama).length;
                return (
                  <tr key={cls.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editClassName}
                          onChange={(e) => setEditClassName(e.target.value)}
                          className="w-full h-8 rounded border border-emerald-600 bg-white px-2.5 text-xs font-semibold"
                        />
                      ) : (
                        cls.nama
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <select
                          value={editClassJenjang}
                          onChange={(e) => {
                            const j = e.target.value as Jenjang;
                            setEditClassJenjang(j);
                            setEditClassTingkat(getTingkatOptionsForJenjang(j)[0]);
                          }}
                          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                        >
                          <option value="SD">SD</option>
                          <option value="SMP">SMP</option>
                          <option value="SMA">SMA</option>
                        </select>
                      ) : (
                        <span className="font-semibold text-slate-700">{cls.jenjang}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums">
                      {isEditing ? (
                        <select
                          value={editClassTingkat}
                          onChange={(e) => setEditClassTingkat(Number(e.target.value))}
                          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-mono"
                        >
                          {getTingkatOptionsForJenjang(editClassJenjang).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      ) : (
                        `Tingkat ${cls.tingkat}`
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-600">
                      {stuCount}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveClass(idx, -1)}
                          title="Naikkan urutan"
                          className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === classDefs.length - 1}
                          onClick={() => moveClass(idx, 1)}
                          title="Turunkan urutan"
                          className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 mr-1"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEditClass(cls)}
                              className="px-2.5 py-1 rounded bg-emerald-700 text-white font-medium hover:bg-emerald-800 inline-flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" /> Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingClassId(null)}
                              className="px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                            >
                              Batal
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditClass(cls)}
                              title="Edit nama & jenjang kelas"
                              className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteClass(cls)}
                              title="Hapus kelas"
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Improvement #6: Wali Kelas Dropdown from Penugasan Wali Kelas yang Ada + TTD Digital */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Wali Kelas (Berdasarkan Penugasan Wali Kelas) & Upload TTD Digital
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih Wali Kelas masing-masing kelas melalui dropdown dari daftar penugasan Wali Kelas yang terdaftar di Manajemen Akun.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500 font-mono">
              {waliKelasUsers.length} akun Wali Kelas tersedia
            </span>
            <button
              type="button"
              disabled={savingSection !== null}
              onClick={() => handleSaveSettingsSection('walikelas', 'Penugasan Wali Kelas & TTD')}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {savingSection === 'walikelas' ? 'Menyimpan...' : 'Simpan Wali Kelas'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {classDefs.map((clsDef) => {
            const cls = clsDef.nama;
            const info = s.waliKelasMap[cls] ?? { nama: '', nip: '' };
            const ttdInputId = `ttd-wk-${cls.replace(/[^a-zA-Z0-9]/g, '-')}`;

            // Match by userId first, then by exact nama
            const matchedUser =
              waliKelasUsers.find((u) => u.id === info.userId) ||
              waliKelasUsers.find((u) => u.nama === info.nama) ||
              waliKelasUsers.find((u) => u.waliKelasTarget === cls);

            return (
              <div
                key={clsDef.id}
                className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2"
              >
                <div className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-3 text-xs font-bold text-slate-800 truncate">
                    {cls}
                  </span>
                  <div className="col-span-5">
                    <select
                      aria-label={`Wali Kelas ${cls}`}
                      value={matchedUser?.id || (info.nama ? `__legacy__:${info.nama}` : '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          patchSetting('waliKelasMap', {
                            ...s.waliKelasMap,
                            [cls]: { ...info, userId: undefined, nama: '', nip: '' },
                          });
                          return;
                        }
                        if (val.startsWith('__legacy__:')) return;
                        const picked = waliKelasUsers.find((u) => u.id === val);
                        if (picked) {
                          patchSetting('waliKelasMap', {
                            ...s.waliKelasMap,
                            [cls]: {
                              ...info,
                              userId: picked.id,
                              nama: picked.nama,
                              nip: picked.nip || info.nip || '',
                            },
                          });
                        }
                      }}
                      className="w-full h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-900"
                    >
                      <option value="">
                        {waliKelasUsers.length === 0
                          ? '-- Belum ada penugasan Wali Kelas --'
                          : '-- Pilih Penugasan Wali Kelas --'}
                      </option>
                      {!matchedUser && info.nama && (
                        <option value={`__legacy__:${info.nama}`}>
                          {info.nama} (Tersimpan Sebelumnya)
                        </option>
                      )}
                      {waliKelasUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nama} (@{u.username}
                          {u.waliKelasTarget ? ` · ${u.waliKelasTarget}` : ''}
                          {!u.aktif ? ' · Belum Verifikasi' : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="NIP / NUPTK"
                    value={info.nip}
                    onChange={(e) =>
                      patchSetting('waliKelasMap', {
                        ...s.waliKelasMap,
                        [cls]: { ...info, nip: e.target.value },
                      })
                    }
                    className="col-span-4 h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-mono"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center gap-2 min-w-0">
                    {info.ttdDataUrl ? (
                      <img
                        src={info.ttdDataUrl}
                        alt={`TTD ${cls}`}
                        className="h-7 w-16 object-contain bg-white border border-slate-200 rounded px-1"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-400">Belum ada TTD digital</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      id={ttdInputId}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleUploadTtdWali(cls, e)}
                      className="hidden"
                    />
                    <label
                      htmlFor={ttdInputId}
                      className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Upload className="w-3 h-3" /> Upload TTD
                    </label>
                    {info.ttdDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          patchSetting('waliKelasMap', {
                            ...s.waliKelasMap,
                            [cls]: { ...info, ttdDataUrl: '' },
                          })
                        }
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Hapus TTD"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Improvement #5: Metode Nilai Akhir with individual Tugas, Kuis, Ujian headings above columns */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Metode Nilai Akhir, Bobot Komponen & KKTP
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih rata-rata murni komponen atau pembobotan persentase khusus dengan judul kolom Nilai Tugas, Nilai Kuis, dan Nilai Ujian di atas masing-masing isian.
            </p>
          </div>
          {s.calculationMode === 'weighted' && (
            <span
              className={`text-xs font-mono font-semibold tabular-nums ${
                totalWeight === 100 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              Total Bobot: {totalWeight}%
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-sm items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Metode Hitung Nilai Akhir
            </label>
            <select
              value={s.calculationMode}
              onChange={(e) =>
                patchSetting('calculationMode', e.target.value as 'average' | 'weighted')
              }
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium"
            >
              <option value="average">Rata-rata Murni Komponen (Tugas + Kuis + Ujian)</option>
              <option value="weighted">Rata-rata Berbobot (% Tugas / Kuis / Ujian)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">KKTP Minimal</label>
            <input
              type="number"
              min={0}
              max={100}
              value={s.kktp}
              onChange={(e) => patchSetting('kktp', Number(e.target.value) || 0)}
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono tabular-nums"
            />
          </div>

          {/* Dedicated columns: Title directly above each input */}
          <div className="md:col-span-2">
            <label
              htmlFor="bobot-tugas"
              className="block text-xs font-semibold text-slate-800 mb-1"
            >
              Nilai Tugas (%)
            </label>
            <input
              id="bobot-tugas"
              type="number"
              min={0}
              max={100}
              disabled={s.calculationMode === 'average'}
              value={s.calculationMode === 'average' ? 33 : s.bobot.tugas}
              onChange={(e) =>
                patchSetting('bobot', { ...s.bobot, tugas: Number(e.target.value) || 0 })
              }
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono tabular-nums disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="bobot-kuis"
              className="block text-xs font-semibold text-slate-800 mb-1"
            >
              Nilai Kuis (%)
            </label>
            <input
              id="bobot-kuis"
              type="number"
              min={0}
              max={100}
              disabled={s.calculationMode === 'average'}
              value={s.calculationMode === 'average' ? 33 : s.bobot.kuis}
              onChange={(e) =>
                patchSetting('bobot', { ...s.bobot, kuis: Number(e.target.value) || 0 })
              }
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono tabular-nums disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="bobot-ujian"
              className="block text-xs font-semibold text-slate-800 mb-1"
            >
              Nilai Ujian (%)
            </label>
            <input
              id="bobot-ujian"
              type="number"
              min={0}
              max={100}
              disabled={s.calculationMode === 'average'}
              value={s.calculationMode === 'average' ? 34 : s.bobot.ujian}
              onChange={(e) =>
                patchSetting('bobot', { ...s.bobot, ujian: Number(e.target.value) || 0 })
              }
              className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono tabular-nums disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>
        </div>
        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            disabled={savingSection !== null}
            onClick={() => handleSaveSettingsSection('nilai', 'Metode Nilai & KKTP')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSection === 'nilai' ? 'Menyimpan...' : 'Simpan Metode Nilai & KKTP'}
          </button>
        </div>
      </div>

      {/* 5. Database Permanen Berbasis Google Spreadsheet (Folder Google Drive) & Sync */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Database className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Database Permanen Berbasis Google Spreadsheet & Sync
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Menyimpan otomatis seluruh data sekolah, akun login (Pengurus, Walas, Guru, Siswa, Ortu), siswa, nilai, CP/TP, LMS, dan survei ke Google Spreadsheet di folder Google Drive Anda agar tidak hilang saat server idle.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={savingSection !== null || gasBusy}
            onClick={() => handleConnectSpreadsheetDb('connect')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            {gasBusy ? 'Menyimpan...' : 'Simpan & Hubungkan Sync'}
          </button>
        </div>

        {/* Status Card & Target Drive Folder Link */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div
            className={`p-3.5 rounded-xl border space-y-1.5 ${
              dbStatus?.connected
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-amber-200 bg-amber-50/70'
            }`}
          >
            <div className="font-semibold text-slate-900 flex items-center justify-between gap-2">
              <span>
                Status Database Spreadsheet:{' '}
                {dbStatus?.connected ? (
                  <span className="text-emerald-800">Terhubung Otomatis</span>
                ) : (
                  <span className="text-amber-800">Belum Terhubung ke Web App GAS</span>
                )}
              </span>
              {dbStatus?.configuredViaEnv && (
                <span className="text-[11px] font-mono text-emerald-700">Auto-Pulih Aktif</span>
              )}
            </div>
            <div className="text-slate-600">
              Data tersimpan saat ini:{' '}
              <strong className="font-mono">{dbStatus?.counts.schools ?? schoolsList.length}</strong> sekolah ·{' '}
              <strong className="font-mono">{dbStatus?.counts.users ?? users.length}</strong> akun login ·{' '}
              <strong className="font-mono">{dbStatus?.counts.students ?? students.length}</strong> siswa.
            </div>
            {dbStatus?.lastSyncAt && (
              <div className="text-[11px] text-slate-500">
                Sinkronisasi terakhir: {new Date(dbStatus.lastSyncAt).toLocaleString('id-ID')}
              </div>
            )}
            {dbStatus?.lastSyncError && (
              <div className="text-[11px] text-red-700 font-medium">
                Peringatan Sync: {dbStatus.lastSyncError}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
            <div className="font-semibold text-slate-900">Folder Google Drive Tujuan Penyimpanan</div>
            <a
              href={dbStatus?.folderUrl || TARGET_DRIVE_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline break-all"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              Buka Folder Drive Database (SIM_RAPOR_MERDEKA_DATABASE)
            </a>
            {dbStatus?.spreadsheetUrl && (
              <div>
                <a
                  href={dbStatus.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-700 font-semibold hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  Buka Langsung File Google Spreadsheet Database
                </a>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              Untuk pemulihan otomatis 100% saat server Cloud Run baru menyala setelah tidur, tambahkan juga URL `/exec` di Secrets AI Studio sebagai variabel <code className="font-mono bg-white px-1 rounded border">GAS_DB_URL</code>.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">
            URL Deployment Web App Google Apps Script (/exec)
          </label>
          <input
            type="url"
            value={s.gasEndpointUrl}
            onChange={(e) => patchSetting('gasEndpointUrl', e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono text-xs text-slate-800"
          />

          {remoteRestorePrompt && (
            <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-950 space-y-2">
              <div className="font-semibold">
                Spreadsheet di Drive sudah berisi {remoteRestorePrompt.schoolsCount} sekolah dan{' '}
                {remoteRestorePrompt.usersCount} akun login!
              </div>
              <p className="text-amber-900">
                Pilih <strong>Pulihkan dari Spreadsheet</strong> untuk mengembalikan seluruh data & akun lama, atau pilih <strong>Timpa dengan Data Saat Ini</strong> jika memang ingin menimpa isi Spreadsheet.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={gasBusy}
                  onClick={() => handleConnectSpreadsheetDb('pull')}
                  className="h-8 px-3 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800"
                >
                  Pulihkan Semua Data & Akun dari Spreadsheet
                </button>
                <button
                  type="button"
                  disabled={gasBusy}
                  onClick={() => handleConnectSpreadsheetDb('overwrite')}
                  className="h-8 px-3 rounded-lg border border-red-300 bg-white text-red-700 font-semibold hover:bg-red-50"
                >
                  Timpa Spreadsheet dengan Data Lokal Sekarang
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={gasBusy}
              onClick={() => handleSaveSettingsSection('sync', 'Konfigurasi URL Sync')}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-emerald-700 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Simpan URL Sync
            </button>
            <button
              type="button"
              disabled={gasBusy}
              onClick={() => handleGasSync('ping')}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gasBusy ? 'animate-spin' : ''}`} />
              Uji Koneksi GAS
            </button>
            <button
              type="button"
              disabled={gasBusy}
              onClick={handleRestoreSpreadsheetDb}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Pulihkan Data & Akun dari Spreadsheet
            </button>
            <button
              type="button"
              disabled={gasBusy}
              onClick={handleForceSyncSpreadsheetDb}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Simpan & Sinkronkan Semua ke Spreadsheet
            </button>
            <button
              type="button"
              onClick={() => setShowGasCode((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 hover:text-slate-900"
            >
              <Code className="w-3.5 h-3.5" />
              {showGasCode ? 'Tutup Skrip Database Spreadsheet' : 'Lihat Skrip Database Spreadsheet (Code.gs)'}
            </button>
          </div>

          {gasStatusMsg && (
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 leading-relaxed">
              {gasStatusMsg}
            </div>
          )}

          {showGasCode && (
            <div className="rounded-lg border border-slate-200 bg-slate-900 text-slate-100 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                <span>
                  Salin ke script.google.com lalu Deploy sebagai Web App (Execute as: Me · Access: Anyone). Otomatis membuat database di folder Drive Anda.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(GAS_SPREADSHEET_DB_SCRIPT);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
                >
                  {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedCode ? 'Tersalin' : 'Salin Skrip Code.gs'}
                </button>
              </div>
              <pre className="text-[11px] font-mono overflow-x-auto max-h-80 leading-relaxed text-emerald-300">
                {GAS_SPREADSHEET_DB_SCRIPT}
              </pre>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={backupInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJson}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              Ekspor Backup (.json)
            </button>
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="w-3.5 h-3.5" />
              Pulihkan Backup (.json)
            </button>
          </div>
          <button
            type="button"
            onClick={onResetAll}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset ke Data Contoh Awal
          </button>
        </div>
      </div>

      {/* 6. Improvement #3: Manajemen Akun & Verifikasi Daftar Guru & Daftar Mapel */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Users className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Manajemen Akun Login, Verifikasi Guru/Mapel & Penugasan Mengajar
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pendaftar baru Guru Mapel & Wali Kelas berstatus Nonaktif secara default hingga Admin memverifikasi daftar guru & penugasan mapelnya.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setUserFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  userFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Semua ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setUserFilter('pending')}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  userFilter === 'pending' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600'
                }`}
              >
                Menunggu Verifikasi ({pendingUsersCount})
              </button>
              <button
                type="button"
                onClick={() => setUserFilter('active')}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  userFilter === 'active' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600'
                }`}
              >
                Aktif ({users.length - pendingUsersCount})
              </button>
            </div>
            <button
              type="button"
              onClick={openAddUserModal}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Tambah Akun Pengguna
            </button>
            <button
              type="button"
              disabled={gasBusy}
              onClick={async () => {
                await loadUsers();
                if (dbStatus?.connected || s.gasEndpointUrl.trim()) {
                  await handleForceSyncSpreadsheetDb();
                } else {
                  onNotify(`Daftar ${users.length} akun pengguna tersimpan di server.`);
                }
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-emerald-700 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Simpan & Sinkronkan Akun
            </button>
          </div>
        </div>

        {pendingUsersCount > 0 && (
          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 flex items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Terdapat <strong>{pendingUsersCount} akun</strong> (daftar guru / daftar mapel) berstatus Nonaktif menunggu verifikasi Anda sebelum dapat login.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setUserFilter('pending')}
              className="px-3 py-1 rounded-md bg-amber-700 text-white font-semibold hover:bg-amber-800 shrink-0"
            >
              Tinjau Sekarang
            </button>
          </div>
        )}

        {loadingUsers ? (
          <div className="py-6 text-center text-xs text-slate-500">
            Memuat daftar akun pengguna...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded-lg bg-slate-50">
            Belum ada akun pada filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Nama & Username</th>
                  <th className="px-3 py-2.5">Peran Akses</th>
                  <th className="px-4 py-2.5">Daftar Kelas / Daftar Mapel / Anak</th>
                  <th className="px-3 py-2.5 text-center">Status Verifikasi</th>
                  <th className="px-4 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUsers.map((u) => {
                  const roleLabel =
                    u.role === 'admin'
                      ? 'Pengurus PKBM'
                      : u.role === 'walikelas'
                        ? 'Wali Kelas (Rangkap)'
                        : u.role === 'guru'
                          ? 'Guru Mapel'
                          : u.role === 'siswa'
                            ? 'Siswa / Peserta Didik'
                            : 'Orang Tua';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{u.nama}</div>
                        <div className="font-mono text-slate-500">
                          @{u.username}
                          {u.nip ? ` · NIP ${u.nip}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800">{roleLabel}</td>
                      <td className="px-4 py-3 text-slate-600 space-y-0.5">
                        {u.role === 'admin' && <span>Akses penuh manajemen PKBM</span>}
                        {u.role === 'walikelas' && (
                          <>
                            <div className="font-medium text-slate-800">
                              Wali: {u.waliKelasTarget || '-'}
                            </div>
                            {(u.teachingAssignments?.length ?? 0) > 0 && (
                              <div className="text-[11px] text-emerald-700">
                                Mapel:{' '}
                                {u.teachingAssignments
                                  .map(
                                    (a) =>
                                      `${a.kelas} (${a.subjectIds
                                        .map((id) => subjectLookup.get(id)?.kode || id)
                                        .join(', ')})`
                                  )
                                  .join('; ')}
                              </div>
                            )}
                          </>
                        )}
                        {u.role === 'guru' && (
                          <div>
                            {(u.teachingAssignments?.length ?? 0) > 0
                              ? u.teachingAssignments
                                  .map(
                                    (a) =>
                                      `${a.kelas}: ${a.subjectIds
                                        .map((id) => subjectLookup.get(id)?.kode || id)
                                        .join(', ')}`
                                  )
                                  .join(' | ')
                              : 'Semua kelas & mapel (tidak dibatasi)'}
                          </div>
                        )}
                        {(u.role === 'ortu' || u.role === 'siswa') && (
                          <div>
                            {u.role === 'siswa'
                              ? (() => {
                                  const stu = students.find((s) => s.id === (u.linkedStudentIds || [])[0]);
                                  return stu
                                    ? `Siswa: ${stu.nama} (${stu.kelas} · NIS ${stu.nis})`
                                    : 'Belum tertaut ke siswa';
                                })()
                              : `Terhubung ke ${u.linkedStudentIds?.length ?? 0} anak`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {u.aktif ? (
                          <button
                            type="button"
                            onClick={() => handleToggleUserActive(u)}
                            disabled={currentUser.id === u.id}
                            className="inline-flex items-center gap-1 font-semibold text-emerald-700 underline disabled:opacity-40"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aktif (Terverifikasi)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleUserActive(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700"
                          >
                            <Clock className="w-3 h-3" /> Verifikasi & Aktifkan
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditUserModal(u)}
                          className="px-2.5 py-1 rounded border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-100 mr-1.5"
                        >
                          Edit / Mapel / Sandi
                        </button>
                        {currentUser.id !== u.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 inline-flex align-middle"
                            title="Hapus akun"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. Multi-Sekolah (Isolasi Database Tenant Sekolah) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 text-xs">
        <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <Building2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Multi-Sekolah & Isolasi Data Antar Lembaga
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Aplikasi mendukung beberapa sekolah sekaligus. Data siswa, orang tua, guru, wali kelas, nilai, bimbingan CP/TP, dan pengajuan dijamin tidak saling tercampur.
              </p>
            </div>
          </div>
          <div className="font-mono text-[11px] font-semibold text-emerald-700 shrink-0">
            Tenant Aktif: {state.schoolId || currentUser.schoolId || 'sch-utama'}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-2.5">
            <div className="font-semibold text-slate-800">
              Daftar Sekolah Terdaftar ({schoolsList.length})
            </div>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
              {schoolsList.map((sch) => {
                const isCurrent = sch.id === (state.schoolId || currentUser.schoolId);
                return (
                  <div key={sch.id} className="p-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {sch.nama}{' '}
                        {isCurrent && (
                          <span className="text-emerald-700 font-bold">(Aktif Saat Ini)</span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {sch.jenisLembaga} · Kode {sch.kodeSekolah} · NPSN {sch.npsn || '-'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleCreateSchool} className="lg:col-span-7 space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
            <div className="font-semibold text-slate-900">
              Daftarkan Sekolah / Lembaga Baru Terisolasi
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Sekolah / Lembaga *
                </label>
                <input
                  type="text"
                  required
                  value={schNama}
                  onChange={(e) => setSchNama(e.target.value)}
                  placeholder="Misal: PKBM Pelita Ilmu Surabaya"
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Kode Sekolah</label>
                <input
                  type="text"
                  value={schKode}
                  onChange={(e) => setSchKode(e.target.value.toUpperCase())}
                  placeholder="Misal: PKBM-PIS"
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">NPSN & Jenis</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={schNpsn}
                    onChange={(e) => setSchNpsn(e.target.value)}
                    placeholder="NPSN"
                    className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-3 font-mono"
                  />
                  <select
                    value={schJenis}
                    onChange={(e) =>
                      setSchJenis(e.target.value as 'PKBM' | 'Sekolah Formal')
                    }
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2"
                  >
                    <option value="PKBM">PKBM</option>
                    <option value="Sekolah Formal">Sekolah Formal</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Admin Sekolah Baru *
                </label>
                <input
                  type="text"
                  required
                  value={schAdminNama}
                  onChange={(e) => setSchAdminNama(e.target.value)}
                  placeholder="Kepala / Admin Sekolah"
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Username Admin Baru *
                </label>
                <input
                  type="text"
                  required
                  value={schAdminUsername}
                  onChange={(e) => setSchAdminUsername(e.target.value.toLowerCase())}
                  placeholder="admin_pelita"
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Kata Sandi Admin Sekolah Baru (Min. 6 karakter) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={schAdminPassword}
                  onChange={(e) => setSchAdminPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={creatingSchool}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              {creatingSchool ? 'Membuat Ruang Sekolah...' : 'Buat Sekolah Baru Terisolasi'}
            </button>
          </form>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  {editUserId ? `Edit Akun: @${uUsername}` : 'Tambah Akun Login Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Username Login *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editUserId)}
                    value={uUsername}
                    onChange={(e) => setUUsername(e.target.value.toLowerCase())}
                    placeholder="Contoh: walikelas7"
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Nama Lengkap Pengguna *
                  </label>
                  <input
                    type="text"
                    required
                    value={uNama}
                    onChange={(e) => setUNama(e.target.value)}
                    placeholder="Contoh: Rina Marlina, M.Pd."
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    NIP / NUPTK (Opsional)
                  </label>
                  <input
                    type="text"
                    value={uNip}
                    onChange={(e) => setUNip(e.target.value)}
                    placeholder="1987..."
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Peran Hak Akses *</label>
                  <select
                    value={uRole}
                    onChange={(e) => setURole(e.target.value as UserRole)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5"
                  >
                    <option value="admin">Pengurus PKBM (Admin)</option>
                    <option value="walikelas">Wali Kelas (Merangkap Guru Mapel)</option>
                    <option value="guru">Guru Mata Pelajaran</option>
                    <option value="ortu">Orang Tua / Wali Peserta Didik</option>
                    <option value="siswa">Siswa / Peserta Didik (Diagnostik & LMS)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="w-3 h-3" />
                      {editUserId
                        ? 'Kata Sandi Baru (Kosongkan jika tetap)'
                        : 'Kata Sandi (Min. 6 karakter) *'}
                    </span>
                  </label>
                  <input
                    type="password"
                    required={!editUserId}
                    minLength={editUserId ? undefined : 6}
                    value={uPassword}
                    onChange={(e) => setUPassword(e.target.value)}
                    placeholder={editUserId ? 'Biarkan kosong jika tidak diganti' : 'Minimal 6 karakter'}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Status Verifikasi Akun
                  </label>
                  <select
                    value={uAktif ? 'aktif' : 'nonaktif'}
                    onChange={(e) => setUAktif(e.target.value === 'aktif')}
                    disabled={editUserId === currentUser.id}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-medium"
                  >
                    <option value="aktif">Aktif (Terverifikasi — Bisa Login)</option>
                    <option value="nonaktif">Nonaktif (Menunggu Verifikasi)</option>
                  </select>
                </div>
              </div>

              {uRole === 'walikelas' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Kelas Perwalian Utama (Akses Rapor, BK, P5, & Cetak Kelas Ini)
                  </label>
                  <select
                    value={uWaliTarget}
                    onChange={(e) => setUWaliTarget(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3"
                  >
                    {classDefs.map((c) => (
                      <option key={c.id} value={c.nama}>
                        {c.nama}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(uRole === 'walikelas' || uRole === 'guru') && (
                <div className="space-y-2.5 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">
                        Penugasan Mengajar Lintas Kelas & Mata Pelajaran
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {uRole === 'walikelas'
                          ? 'Wali Kelas dapat merangkap menjadi Guru Mapel di berbagai kelas lain.'
                          : 'Guru Mapel yang dibatasi penugasan hanya bisa melihat CP & TP dari mapel yang diajarkannya.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setUAssignments((prev) => [
                          ...prev,
                          { kelas: classDefs[0]?.nama || '', subjectIds: [] },
                        ])
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="w-3 h-3" /> Tambah Kelas Ajar
                    </button>
                  </div>

                  {uAssignments.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic">
                      Belum ada penugasan spesifik (jika dikosongkan, akses kelas & mapel bersifat umum).
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {uAssignments.map((assign, idx) => {
                        const clsSubjs = getSubjectsForClass(subjects, assign.kelas, classDefs);
                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <select
                                value={assign.kelas}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setUAssignments((prev) =>
                                    prev.map((a, i) =>
                                      i === idx ? { kelas: val, subjectIds: [] } : a
                                    )
                                  );
                                }}
                                className="h-8 rounded border border-slate-300 bg-white px-2 font-medium text-slate-900"
                              >
                                {classDefs.map((c) => (
                                  <option key={c.id} value={c.nama}>
                                    {c.nama}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  setUAssignments((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="text-red-600 hover:underline"
                              >
                                Hapus Kelas
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {clsSubjs.map((subj: Subject) => {
                                const picked = assign.subjectIds.includes(subj.id);
                                return (
                                  <button
                                    key={subj.id}
                                    type="button"
                                    onClick={() =>
                                      setUAssignments((prev) =>
                                        prev.map((a, i) => {
                                          if (i !== idx) return a;
                                          const has = a.subjectIds.includes(subj.id);
                                          return {
                                            ...a,
                                            subjectIds: has
                                              ? a.subjectIds.filter((id) => id !== subj.id)
                                              : [...a.subjectIds, subj.id],
                                          };
                                        })
                                      )
                                    }
                                    className={`px-2 py-1 rounded border text-[11px] font-medium ${
                                      picked
                                        ? 'bg-emerald-700 text-white border-emerald-700'
                                        : 'bg-white text-slate-600 border-slate-300'
                                    }`}
                                  >
                                    {subj.kode} — {subj.nama}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {(uRole === 'ortu' || uRole === 'siswa') && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="font-semibold text-slate-900">
                    {uRole === 'siswa'
                      ? `Tautkan Akun Siswa dengan 1 Peserta Didik (${uLinkedStudents.length} dipilih)`
                      : `Hubungkan Akun Orang Tua dengan Peserta Didik (${uLinkedStudents.length} dipilih)`}
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {students.map((stu: Student) => {
                      const checked = uLinkedStudents.includes(stu.id);
                      return (
                        <label
                          key={stu.id}
                          className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type={uRole === 'siswa' ? 'radio' : 'checkbox'}
                              name={uRole === 'siswa' ? 'siswa-link-picker' : undefined}
                              checked={checked}
                              onChange={(e) => {
                                if (uRole === 'siswa') {
                                  setULinkedStudents([stu.id]);
                                } else {
                                  const c = e.target.checked;
                                  setULinkedStudents((prev) =>
                                    c ? [...prev, stu.id] : prev.filter((id) => id !== stu.id)
                                  );
                                }
                              }}
                              className="accent-emerald-700"
                            />
                            <span className="font-medium text-slate-800">{stu.nama}</span>
                          </div>
                          <span className="font-mono text-slate-500">
                            {stu.kelas} · NIS {stu.nis}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 rounded-lg bg-emerald-700 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {savingUser ? 'Menyimpan...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
