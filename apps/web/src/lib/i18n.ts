import i18next from 'i18next';
import ptBR from '../locales/pt-BR.json';

// Todo texto da interface passa por t('chave', 'Texto padrão em pt-BR').
// O arquivo locales/pt-BR.json é gerado por `pnpm i18n:extract`; para traduzir,
// copie-o (ex.: es.json), traduza os valores e registre o idioma aqui.
void i18next.init({
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  resources: { 'pt-BR': { translation: ptBR } },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function t(key: string, def: string, vars?: Record<string, unknown>): string {
  return i18next.t(key, { defaultValue: def, ...(vars ?? {}) }) as string;
}

export default i18next;
