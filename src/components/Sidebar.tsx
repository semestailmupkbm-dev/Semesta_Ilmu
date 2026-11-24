import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  BarChart3,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  ClipboardEdit,
  ClipboardList,
  CreditCard,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  MonitorPlay,
  Package,
  Printer,
  Settings,
  Table2,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { ClassDef, Jenjang, SchoolSettings, Student, UserAccount, UserRole } from '../types';
import { getAccessibleClassesForUser, getClassJenjang, getClassTingkat } from '../utils/academic';

export type SectionId =
  | 'dashboard'
  | 'analytics'
  | 'students'
  | 'rekamdidik'
  | 'mutasi'
  | 'penghubung'
  | 'tutoring'
  | 'procurement'
  | 'diagnostik'
  | 'lms'
  | 'tendik'
  | 'subjects'
  | 'grades'
  | 'extras'
  | 'leger'
  | 'print'
  | 'cards'
  | 'surat'
  | 'parent'
  | 'surveys'
  | 'settings';

export const NAV_ITEMS: Array<{
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}> = [
  { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard, roles: ['admin', 'walikelas', 'guru'] },
  { id: 'analytics', label: 'Analisis & Statistika', icon: BarChart3, roles: ['admin', 'walikelas', 'guru'] },
  { id: 'students', label: 'Data Siswa', icon: Users, roles: ['admin', 'walikelas'] },
  { id: 'rekamdidik', label: 'Rekam Didik', icon: FolderKanban, roles: ['admin', 'walikelas'] },
  { id: 'mutasi', label: 'Mutasi & Migrasi TA', icon: ArrowLeftRight, roles: ['admin', 'walikelas'] },
  { id: 'penghubung', label: 'Buku Penghubung', icon: MessageSquare, roles: ['admin', 'walikelas', 'guru', 'ortu'] },
  { id: 'tutoring', label: 'Bimbingan CP & TP', icon: CalendarClock, roles: ['admin', 'walikelas', 'guru'] },
  { id: 'procurement', label: 'Pengajuan Alat & Kegiatan', icon: Package, roles: ['admin', 'walikelas', 'guru'] },
  { id: 'diagnostik', label: 'Asesmen Diagnostik', icon: ClipboardCheck, roles: ['admin', 'walikelas', 'guru', 'siswa'] },
  { id: 'lms', label: 'Ruang LMS Belajar', icon: MonitorPlay, roles: ['admin', 'walikelas', 'guru', 'siswa', 'ortu'] },
  { id: 'tendik', label: 'Pelatihan & Video Tendik', icon: Video, roles: ['admin', 'walikelas', 'guru'] },
  { id: 'subjects', label: 'Mapel & Tujuan (TP)', icon: BookOpen, roles: ['admin', 'walikelas', 'guru'] },
  { id: 'grades', label: 'Input & Olah Nilai', icon: ClipboardEdit, roles: ['admin', 'walikelas', 'guru'] },
  { id: 'extras', label: 'Profil Lulusan, Ekskul & BK', icon: Award, roles: ['admin', 'walikelas'] },
  { id: 'leger', label: 'Leger & Peringkat', icon: Table2, roles: ['admin', 'walikelas', 'guru'] },
  { id: 'print', label: 'Cetak Rapor PDF', icon: Printer, roles: ['admin', 'walikelas'] },
  { id: 'cards', label: 'Kartu Pelajar', icon: CreditCard, roles: ['admin', 'walikelas'] },
  {
    id: 'surat',
    label: 'Surat & Pengumuman',
    icon: Mail,
    roles: ['admin', 'walikelas', 'guru', 'ortu', 'siswa'],
  },
  { id: 'parent', label: 'Portal Orang Tua', icon: GraduationCap, roles: ['admin', 'walikelas', 'ortu'] },
  { id: 'surveys', label: 'Survei Orang Tua', icon: ClipboardList, roles: ['admin', 'walikelas', 'guru', 'ortu'] },
  { id: 'settings', label: 'Identitas, Akun & Sync', icon: Settings, roles: ['admin'] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Pengurus PKBM',
  walikelas: 'Wali Kelas · Guru Mapel',
  guru: 'Guru Mata Pelajaran',
  ortu: 'Orang Tua / Wali',
  siswa: 'Siswa / Peserta Didik',
};

interface SidebarProps {
  currentUser: UserAccount;
  onLogout: () => void;
  activeSection: SectionId;
  onSelectSection: (s: SectionId) => void;
  settings: SchoolSettings;
  selectedClass: string;
  onSelectClass: (cls: string) => void;
  classes: string[];
  classDefs: ClassDef[];
  onChangeSemester: (sem: '1' | '2') => void;
  unreadLogbookCount?: number;
  pendingTutoringCount?: number;
  pendingProcurementCount?: number;
  pendingStudentEditCount?: number;
  pendingLetterCount?: number;
  linkedStudents?: Student[];
  activeOrtuStudentId?: string;
  onChangeActiveOrtuStudentId?: (studentId: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  onLogout,
  activeSection,
  onSelectSection,
  settings,
  selectedClass,
  onSelectClass,
  classes,
  classDefs,
  onChangeSemester,
  unreadLogbookCount = 0,
  pendingTutoringCount = 0,
  pendingProcurementCount = 0,
  pendingStudentEditCount = 0,
  pendingLetterCount = 0,
  linkedStudents = [],
  activeOrtuStudentId = '',
  onChangeActiveOrtuStudentId,
  mobileOpen,
  onCloseMobile,
}) => {
  const role = currentUser.role;
  const activeJenjang = getClassJenjang(selectedClass, classDefs);
  const [jenjangTab, setJenjangTab] = useState<Jenjang>(activeJenjang);

  useEffect(() => {
    setJenjangTab(activeJenjang);
  }, [activeJenjang]);

  const assignments = currentUser.teachingAssignments ?? [];

  // Respect the exact user-defined class order from classDefs/classes
  const orderedClasses =
    classDefs && classDefs.length > 0
      ? [...classDefs].sort((a, b) => a.urutan - b.urutan).map((c) => c.nama)
      : classes;

  const accessibleClasses = getAccessibleClassesForUser(orderedClasses, currentUser);

  const classesInJenjang = accessibleClasses.filter(
    (c) => getClassJenjang(c, classDefs) === jenjangTab
  );
  const dropdownClasses = classesInJenjang.length > 0 ? classesInJenjang : accessibleClasses;

  const handleSelectJenjang = (j: Jenjang) => {
    setJenjangTab(j);
    const first = accessibleClasses.find((c) => getClassJenjang(c, classDefs) === j);
    if (first) onSelectClass(first);
  };

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const activeTingkat = getClassTingkat(selectedClass, classDefs);

  const sidebarBody = (
    <div className="h-full flex flex-col bg-white border-r border-slate-200 w-[260px]">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelectSection(
              role === 'ortu'
                ? 'parent'
                : role === 'siswa'
                  ? 'diagnostik'
                  : role === 'guru'
                    ? 'grades'
                    : 'dashboard'
            );
            onCloseMobile();
          }}
          className="text-left focus-visible:outline-2 focus-visible:outline-emerald-700 rounded"
        >
          <span className="block text-[15px] font-bold tracking-tight text-slate-900 whitespace-nowrap">
            SIM Rapor Merdeka
          </span>
          <span className="block text-xs text-slate-500 truncate max-w-[185px]">
            {currentUser.schoolName || settings.namaSekolah}
          </span>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <UserCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{ROLE_LABELS[role]}</span>
            </div>
            <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
              {currentUser.nama}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              @{currentUser.username}
              {role === 'walikelas' && currentUser.waliKelasTarget
                ? ` · Wali ${currentUser.waliKelasTarget}`
                : ''}
            </p>
            {(role === 'walikelas' || role === 'guru') && assignments.length > 0 && (
              <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                Mengampu mapel di {assignments.length} kelas
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Keluar dari akun"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors shrink-0"
          >
            <LogOut className="w-3 h-3" />
            Keluar
          </button>
        </div>
      </div>

      {role === 'ortu' && linkedStudents.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-200 space-y-1.5">
          <label
            htmlFor="sidebar-ortu-child-select"
            className="block text-[11px] font-semibold text-emerald-700"
          >
            Anak Aktif Dipantau ({linkedStudents.length})
          </label>
          <select
            id="sidebar-ortu-child-select"
            value={activeOrtuStudentId || linkedStudents[0]?.id || ''}
            onChange={(e) => onChangeActiveOrtuStudentId?.(e.target.value)}
            className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none"
          >
            {linkedStudents.map((child) => (
              <option key={child.id} value={child.id}>
                {child.nama} ({child.kelas})
              </option>
            ))}
          </select>
        </div>
      )}

      {role !== 'ortu' && role !== 'siswa' && (
        <div className="px-4 py-3.5 border-b border-slate-200 space-y-3">
          <div>
            <span className="block text-xs font-medium text-slate-600 mb-1">
              Jenjang (SD / SMP / SMA)
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              {(['SD', 'SMP', 'SMA'] as Jenjang[]).map((j) => {
                const hasClass = accessibleClasses.some((c) => getClassJenjang(c, classDefs) === j);
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={!hasClass}
                    onClick={() => handleSelectJenjang(j)}
                    className={`py-1 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      jenjangTab === j
                        ? 'bg-white text-slate-900 shadow-xs'
                        : hasClass
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    {j}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="sidebar-class-select"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Kelas Aktif {activeTingkat ? `(Tingkat ${activeTingkat})` : ''}
            </label>
            <select
              id="sidebar-class-select"
              value={selectedClass}
              onChange={(e) => onSelectClass(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-900 focus:border-emerald-700 focus:outline-none"
            >
              {dropdownClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                  {role === 'walikelas' && currentUser.waliKelasTarget === cls ? ' (Kelas Wali)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 mb-1">
              Semester ({settings.tahunAjaran})
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeSemester('1')}
                disabled={role === 'guru'}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  settings.semester === '1'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ganjil (1)
              </button>
              <button
                type="button"
                onClick={() => onChangeSemester('2')}
                disabled={role === 'guru'}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  settings.semester === '2'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Genap (2)
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1" aria-label="Menu Utama">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap ${
                active
                  ? 'bg-emerald-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate flex-1">{item.label}</span>
              {item.id === 'students' && role === 'admin' && pendingStudentEditCount > 0 && (
                <span
                  className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${
                    active ? 'text-emerald-100' : 'text-amber-700'
                  }`}
                >
                  {pendingStudentEditCount}
                </span>
              )}
              {item.id === 'penghubung' && unreadLogbookCount > 0 && (
                <span
                  className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${
                    active ? 'text-emerald-100' : 'text-emerald-700'
                  }`}
                >
                  {unreadLogbookCount}
                </span>
              )}
              {item.id === 'tutoring' && pendingTutoringCount > 0 && (
                <span
                  className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${
                    active ? 'text-emerald-100' : 'text-amber-700'
                  }`}
                >
                  {pendingTutoringCount}
                </span>
              )}
              {item.id === 'procurement' && pendingProcurementCount > 0 && (
                <span
                  className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${
                    active ? 'text-emerald-100' : 'text-amber-700'
                  }`}
                >
                  {pendingProcurementCount}
                </span>
              )}
              {item.id === 'surat' && role === 'admin' && pendingLetterCount > 0 && (
                <span
                  className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${
                    active ? 'text-emerald-100' : 'text-amber-700'
                  }`}
                >
                  {pendingLetterCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-500 space-y-0.5">
        <div className="truncate font-medium text-slate-700">
          {settings.jenisLembaga} · {settings.waliKelasMap[selectedClass]?.nama || 'Wali Kelas belum dipilih'}
        </div>
        <div className="tabular-nums">
          KKTP: {settings.kktp} ·{' '}
          {settings.calculationMode === 'average'
            ? 'Rata-rata Komponen'
            : `Bobot ${settings.bobot.tugas}/${settings.bobot.kuis}/${settings.bobot.ujian}`}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 no-print">{sidebarBody}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 h-full">{sidebarBody}</aside>
        </div>
      )}
    </>
  );
};
