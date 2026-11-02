export function parseWorkDate(value) {
  if (typeof value !== 'string' || !/^\d{8}(?:_[1-9]\d{0,5})?$/.test(value)) throw new Error('日付はYYYYMMDD、同日に複数ある場合はYYYYMMDD_1の形式で入力してください。枝番は1からの整数です。');
  const [day, suffix] = value.split('_');
  const date = new Date(`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6,8)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10).replaceAll('-','') !== day) throw new Error(`日付「${day}」は存在しません。`);
  return { day, suffix: Number(suffix || 0) };
}
export function compareWorkDates(a,b) {
  const [aDay,aSuffix='0']=a.split('_'), [bDay,bSuffix='0']=b.split('_');
  return bDay.localeCompare(aDay) || Number(bSuffix)-Number(aSuffix);
}
export function nextWorkDate(day, dates) {
  const used = new Set(dates);
  if (!used.has(day)) return day;
  const suffix = Math.max(0,...dates.filter(value=>value.startsWith(day+'_')).map(value=>Number(value.split('_')[1]) || 0))+1;
  if (suffix>999999) throw new Error('この日付の枝番が上限に達しています。');
  return `${day}_${suffix}`;
}
