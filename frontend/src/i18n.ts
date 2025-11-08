import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en/common.json';
import nl from './locales/nl/common.json';
import fr from './locales/fr/common.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      nl: { translation: nl },
      fr: { translation: fr }
    },
    lng: 'nl',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })
  .catch((err) => {
    console.error('Failed to initialize i18n', err);
  });

export default i18n;
