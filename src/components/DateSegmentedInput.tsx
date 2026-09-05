import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string; // ISO 'YYYY-MM-DD', or '' if incomplete/empty
  onChange: (iso: string) => void;
}

// Three-segment MM / DD / YYYY entry that auto-advances focus as soon as a
// segment is unambiguously complete — either 2 digits typed, or a single
// digit that can't extend to a valid two-digit value (e.g. typing "3" for
// month can only mean March, so there's no reason to wait for a second
// digit). Backspace on an empty segment moves focus back a segment.
export function DateSegmentedInput({ value, onChange }: Props) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Sync from outside only for a full reset (e.g. the add-form clearing
  // after an entry is saved) — internal typing is the source of truth
  // while segments are mid-entry.
  useEffect(() => {
    if (value === '') {
      setMonth('');
      setDay('');
      setYear('');
      return;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) {
      setYear(m[1]);
      setMonth(m[2]);
      setDay(m[3]);
    }
  }, [value]);

  function emit(m: string, d: string, y: string) {
    onChange(m.length === 2 && d.length === 2 && y.length === 4 ? `${y}-${m}-${d}` : '');
  }

  function handleMonth(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    if (digits.length === 2 || (digits.length === 1 && Number(digits) > 1)) {
      const padded = digits.padStart(2, '0');
      setMonth(padded);
      emit(padded, day, year);
      dayRef.current?.focus();
      dayRef.current?.select();
    } else {
      setMonth(digits);
      emit(digits, day, year);
    }
  }

  function handleDay(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    if (digits.length === 2 || (digits.length === 1 && Number(digits) > 3)) {
      const padded = digits.padStart(2, '0');
      setDay(padded);
      emit(month, padded, year);
      yearRef.current?.focus();
      yearRef.current?.select();
    } else {
      setDay(digits);
      emit(month, digits, year);
    }
  }

  function handleYear(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    setYear(digits);
    emit(month, day, digits);
  }

  return (
    <div className="date-segmented">
      <input
        ref={monthRef}
        aria-label="Month"
        placeholder="MM"
        inputMode="numeric"
        maxLength={2}
        value={month}
        onChange={(e) => handleMonth(e.target.value)}
      />
      <span>/</span>
      <input
        ref={dayRef}
        aria-label="Day"
        placeholder="DD"
        inputMode="numeric"
        maxLength={2}
        value={day}
        onChange={(e) => handleDay(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && day === '') monthRef.current?.focus();
        }}
      />
      <span>/</span>
      <input
        ref={yearRef}
        aria-label="Year"
        placeholder="YYYY"
        inputMode="numeric"
        maxLength={4}
        value={year}
        onChange={(e) => handleYear(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && year === '') dayRef.current?.focus();
        }}
      />
    </div>
  );
}
