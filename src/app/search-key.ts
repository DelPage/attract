/** Search normalization: case, accents, punctuation and roman numerals don't matter. */
export const matchKeyForSearch = (text: string): string => text
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ')
  .replace(/\bii\b/g, '2').replace(/\biii\b/g, '3').replace(/\biv\b/g, '4')
  .replace(/[^a-z0-9]+/g, '');
