import { useRef, useState } from 'react';
import type { ComboboxGroup, SelectOption } from '../engine/types';

interface ComboboxInputProps {
  value: string;
  onChange: (value: string) => void;
  groups: ComboboxGroup[];
  placeholder?: string;
  maxLength?: number;
}

// A plain-text field is still the typed value — this never forces the
// user to pick from the list, only assists with one. That matters for a
// field like vehicle make, which can't realistically ship an exhaustive
// list: typing something not in `groups` and pressing Enter/blurring
// still commits exactly what was typed.
function filterGroups(groups: ComboboxGroup[], query: string): ComboboxGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({ label: g.label, options: g.options.filter((o) => o.label.toLowerCase().includes(q)) }))
    .filter((g) => g.options.length > 0);
}

/**
 * Text input with a filtered, grouped suggestion dropdown — built for
 * vehicle make (a ~30-item list that read as one long undifferentiated
 * dropdown; see src/data/vehicleMakes.ts for the "most common first, rest
 * alphabetized below" grouping), but generic over any `ComboboxGroup[]`.
 *
 * Deliberately NOT a native <select>: typing filters live across every
 * group, and — unlike a <select> — committing a value that isn't in the
 * list at all is allowed, since this list is a convenience, not a closed
 * set of valid answers.
 */
export function ComboboxInput({ value, onChange, groups, placeholder, maxLength }: ComboboxInputProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const closeTimer = useRef<number | undefined>(undefined);

  const filtered = filterGroups(groups, value);
  const flat: SelectOption[] = filtered.flatMap((g) => g.options);

  function select(opt: SelectOption) {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    onChange(opt.value);
    setOpen(false);
    setHighlighted(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (highlighted >= 0 && flat[highlighted]) {
        e.preventDefault();
        select(flat[highlighted]);
      } else {
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="combobox">
      <input
        type="text"
        autoFocus
        autoComplete="off"
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // A suggestion's onClick needs the input to still be focused
          // when it fires, or the click target can disappear mid-event —
          // closing on a short delay (rather than immediately) gives the
          // option's onMouseDown (which runs first, see below) a chance
          // to register the selection before the list unmounts.
          closeTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && filtered.length > 0 && (
        <ul className="combobox-list" role="listbox">
          {filtered.map((g) => (
            <li key={g.label} className="combobox-group">
              <div className="combobox-group-label">{g.label}</div>
              <ul>
                {g.options.map((o) => (
                  <li
                    key={o.value}
                    role="option"
                    aria-selected={flat[highlighted]?.value === o.value}
                    className={`combobox-option${flat[highlighted]?.value === o.value ? ' highlighted' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(o)}
                  >
                    {o.label}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
