function durationNumber(value) {
  const match = String(value ?? '').match(/^\s*(\d+)\s*(?:t|ticks?)?\s*$/i);
  return match ? Number(match[1]) : NaN;
}

function digitRangeHas(range, digit) {
  if (!Array.isArray(range)) return false;
  return range.some(item => Number(item) === digit || (typeof item === 'string' && (() => {
    const match = item.match(/^\s*(\d)\s*[-:]\s*(\d)\s*$/);
    return !!match && digit >= Number(match[1]) && digit <= Number(match[2]);
  })()));
}

export function contractAvailabilityReason(available, contract) {
  if (!Array.isArray(available)) return 'Deriv returned no contract availability list.';
  if (contract.duration_unit !== 't' || contract.duration !== 1) return 'Current 4.0 execution requires a one-tick contract.';
  const item = available.find(entry => entry?.contract_type === contract.contract_type);
  if (!item) return `Deriv does not offer ${contract.contract_type} on R_100.`;
  if (item.expiry_type !== 'tick') return `${contract.contract_type} is not offered with tick expiry.`;
  const min = durationNumber(item.min_contract_duration), max = durationNumber(item.max_contract_duration);
  if (!Number.isFinite(min) || !Number.isFinite(max) || contract.duration < min || contract.duration > max) return 'A one-tick duration is outside Deriv’s current limits for ' + contract.contract_type + '.';
  if (contract.barrier !== undefined && !digitRangeHas(item.last_digit_range, Number(contract.barrier))) return `Digit barrier ${contract.barrier} is not confirmed in Deriv’s current last-digit range.`;
  return '';
}
