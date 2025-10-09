import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import all translation files
import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enPatients from './locales/en/patients.json';
import enMedical from './locales/en/medical.json';
import enEntities from './locales/en/entities.json';
import enForms from './locales/en/forms.json';
import enHouseholds from './locales/en/households.json';
import enSettings from './locales/en/settings.json';
import enAppointments from './locales/en/appointments.json';

import mkCommon from './locales/mk/common.json';
import mkNavigation from './locales/mk/navigation.json';
import mkPatients from './locales/mk/patients.json';
import mkMedical from './locales/mk/medical.json';
import mkEntities from './locales/mk/entities.json';
import mkForms from './locales/mk/forms.json';
import mkHouseholds from './locales/mk/households.json';
import mkSettings from './locales/mk/settings.json';
import mkAppointments from './locales/mk/appointments.json';

const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    patients: enPatients,
    medical: enMedical,
    entities: enEntities,
    forms: enForms,
    households: enHouseholds,
    settings: enSettings,
    appointments: enAppointments,
  },
  mk: {
    common: mkCommon,
    navigation: mkNavigation,
    patients: mkPatients,
    medical: mkMedical,
    entities: mkEntities,
    forms: mkForms,
    households: mkHouseholds,
    settings: mkSettings,
    appointments: mkAppointments,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'veterinary-clinic-language',
    },

    ns: ['common', 'navigation', 'patients', 'medical', 'entities', 'forms', 'households', 'settings', 'appointments'],
    defaultNS: 'common',

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    react: {
      useSuspense: true,
      bindI18n: 'languageChanged loaded',
      bindI18nStore: 'added removed',
    },

    supportedLngs: ['en', 'mk'],

    returnEmptyString: false, // Show key names for missing translations in dev
  });

export default i18n;