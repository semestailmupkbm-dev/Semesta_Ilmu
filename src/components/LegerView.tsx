import React, { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { AppState, UserAccount } from '../types';
import {
  calculateClassLeger,
  filterSubjectsForUser,
  getClassTingkat,
  getSubjectsForClass,
} from '../utils/academic';
import { exportLegerExcel } from '../utils/excel';
import { generateLegerPDF } from '../utils/pdf';

interface LegerViewProps {
  state: AppState;
  currentUser: UserAccount;
  selectedClass: string;
}

export const LegerView: React.FC<LegerViewProps> = ({ state, currentUser, selectedClass }) => {
  const { settings, students, subjects, grades, classDefs } = state;
  const semester = settings.semester;
  const tingkat = getClassTingkat(selectedClass, classDefs);
  const hasJurusan = tingkat !== null && tingkat >= 11;

  const [mode, setMode] = useState<'SAS' | 'STS'>('SAS');
  const [sortBy, setSortBy] = useState<'rank' | 'name'>('rank');
  const [jurusanFilter, setJurusanFilter] = useState<'ALL' | 'IPA' | 'IPS'>('ALL');

  const classSubjectsAll = getSubjectsForClass(
    subjects,
    selectedClass,
    classDefs,
    hasJurusan ? jurusanFilter : 'ALL'
  );
  const classSubjects = filterSubjectsForUser(classSubjectsAll, currentUser, selectedClass, {
    includeWaliClassView: true,
  });

  const rows = calculateClassLeger(
    students,
    classSubjects,
    grades,
    settings,
    semester,
    selectedClass,
    mode,
    classDefs,
    hasJurusan ? jurusanFilter : 'ALL'
  );

  const sortedRows =
    sortBy === 'rank'
      ? [...rows].sort((a, b) => a.peringkat - b.peringkat)
      : [...rows].sort((a, b) => a.student.nama.localeCompare(b.student.nama, 'id'));

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Leger Nilai & Peringkat Kelas — {selectedClass}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Rekapitulasi nilai seluruh mata pelajaran Semester {semester === '1' ? '1 (Ganjil)' : '2 (Genap)'} · KKTP {settings.kktp}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setMode('SAS')}
              className={`px-3 py-1 rounded-md font-medium ${
                mode === 'SAS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Nilai Akhir (SAS)
            </button>
            <button
              type="button"
              onClick={() => setMode('STS')}
              className={`px-3 py-1 rounded-md font-medium ${
                mode === 'STS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tengah Semester (STS)
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setSortBy('rank')}
              className={`px-3 py-1 rounded-md font-medium ${
                sortBy === 'rank' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Urut Peringkat
            </button>
            <button
              type="button"
              onClick={() => setSortBy('name')}
              className={`px-3 py-1 rounded-md font-medium ${
                sortBy === 'name' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Urut Abjad
            </button>
          </div>

          {hasJurusan && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              {(['ALL', 'IPA', 'IPS'] as const).map((j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => setJurusanFilter(j)}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    jurusanFilter === j ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {j === 'ALL' ? 'Semua' : j}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              exportLegerExcel(
                students,
                classSubjects,
                grades,
                settings,
                semester,
                selectedClass,
                mode,
                classDefs,
                hasJurusan ? jurusanFilter : 'ALL'
              )
            }
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>

          <button
            type="button"
            onClick={() => {
              const doc = generateLegerPDF(
                students,
                classSubjects,
                state,
                selectedClass,
                mode,
                hasJurusan ? jurusanFilter : 'ALL'
              );
              doc.save(`Leger_${mode}_${selectedClass.replace(/\s+/g, '_')}.pdf`);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800"
          >
            <Printer className="w-3.5 h-3.5" /> Cetak PDF
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-3 text-center w-10">No</th>
                <th className="px-3 py-3 font-mono w-24">NIS</th>
                <th className="px-4 py-3 min-w-[200px]">Nama Peserta Didik</th>
                {classSubjects.map((subj) => (
                  <th
                    key={subj.id}
                    title={subj.nama}
                    className="px-2.5 py-3 text-center font-mono whitespace-nowrap"
                  >
                    {subj.kode}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-semibold text-slate-900">Jumlah</th>
                <th className="px-3 py-3 text-center font-semibold text-slate-900">Rata-rata</th>
                <th className="px-3 py-3 text-center font-semibold text-emerald-800">Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={classSubjects.length + 6}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    Belum ada siswa aktif di {selectedClass}.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => (
                  <tr key={row.student.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-slate-600">
                      {row.student.nis}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{row.student.nama}</td>
                    {classSubjects.map((subj) => {
                      const val = row.scoresBySubject[subj.id];
                      const below = val !== null && val < settings.kktp;
                      return (
                        <td
                          key={subj.id}
                          className={`px-2.5 py-2.5 text-center font-mono tabular-nums ${
                            val === null
                              ? 'text-slate-300'
                              : below
                                ? 'text-red-600 font-semibold'
                                : 'text-slate-800'
                          }`}
                        >
                          {val ?? '-'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums font-semibold text-slate-900">
                      {row.totalNilai}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums font-bold text-emerald-700">
                      {row.rataRata.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums font-bold text-slate-900">
                      #{row.peringkat}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
