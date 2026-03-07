const japanDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const getTodayInJapan = () => {
  return japanDateFormatter.format(new Date());
};

export const daysUntil = (date: string | null | undefined) => {
  if (!date) {
    return null;
  }

  const target = new Date(`${date}T00:00:00+09:00`);
  const today = new Date(`${getTodayInJapan()}T00:00:00+09:00`);
  const diff = target.getTime() - today.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
