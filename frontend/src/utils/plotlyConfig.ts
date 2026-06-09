import type { Config } from 'plotly.js';
import ruLocale from 'plotly.js/lib/locales/ru';

export const russianPlotlyConfig: Partial<Config> = {
  locale: 'ru',
  locales: {
    ru: {
      dictionary: ruLocale.dictionary,
      format: ruLocale.format,
    },
  },
};
