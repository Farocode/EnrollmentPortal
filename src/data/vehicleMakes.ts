import type { SelectOption } from '../engine/types';

// Common makes for the demo dropdown — not exhaustive, just enough to
// replace free-text entry with a realistic pre-populated list.
export const VEHICLE_MAKES: SelectOption[] = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Jeep', 'Ram', 'GMC',
  'Hyundai', 'Kia', 'Subaru', 'Volkswagen', 'BMW', 'Mercedes-Benz', 'Audi',
  'Lexus', 'Mazda', 'Dodge', 'Chrysler', 'Buick', 'Cadillac', 'Tesla',
  'Volvo', 'Mitsubishi', 'Acura', 'Infiniti', 'Porsche', 'Mini',
].map((make) => ({ value: make, label: make }));

VEHICLE_MAKES.push({ value: 'other', label: 'Other / not listed' });
