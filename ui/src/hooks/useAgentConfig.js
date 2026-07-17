import { useState, useEffect } from 'react';
import { usePersistedState } from './usePersistedState';

const DEFAULT_FORM_JSON = `{
  "system_prompt": "You are a customer support agent. Collect the user's name and contact number.",
  "required_fields": [
    { "key": "name",  "label": "Full Name",     "description": "The user's full name" },
    { "key": "phone", "label": "Phone Number",  "description": "The user's contact number" }
  ]
}`;

export const VOICE_BY_LANG = {
  'en-US': ['en-US-AvaNeural', 'en-US-JennyNeural', 'en-US-EmmaNeural', 'en-US-BrianNeural', 'en-US-AndrewNeural', 'en-US-GuyNeural'],
  'en-GB': ['en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-GB-LibbyNeural'],
  'en-AU': ['en-AU-NatashaNeural', 'en-AU-WilliamNeural'],
  'en-IN': ['en-IN-NeerjaNeural', 'en-IN-PrabhatNeural'],
  'en-CA': ['en-CA-ClaraNeural', 'en-CA-LiamNeural'],
  'es-ES': ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
  'es-MX': ['es-MX-DaliaNeural', 'es-MX-JorgeNeural'],
  'fr-FR': ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
  'fr-CA': ['fr-CA-SylvieNeural', 'fr-CA-JeanNeural'],
  'de-DE': ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
  'it-IT': ['it-IT-ElsaNeural', 'it-IT-DiegoNeural'],
  'pt-BR': ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural'],
  'pt-PT': ['pt-PT-RaquelNeural', 'pt-PT-DuarteNeural'],
  'nl-NL': ['nl-NL-ColetteNeural', 'nl-NL-MaartenNeural'],
  'ru-RU': ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural'],
  'pl-PL': ['pl-PL-AgnieszkaNeural', 'pl-PL-MarekNeural'],
  'sv-SE': ['sv-SE-SofieNeural', 'sv-SE-MattiasNeural'],
  'nb-NO': ['nb-NO-IselinNeural', 'nb-NO-FinnNeural'],
  'da-DK': ['da-DK-ChristelNeural', 'da-DK-JeppeNeural'],
  'fi-FI': ['fi-FI-SelmaNeural', 'fi-FI-HarriNeural'],
  'el-GR': ['el-GR-AthinaNeural', 'el-GR-NestorasNeural'],
  'tr-TR': ['tr-TR-EmelNeural', 'tr-TR-AhmetNeural'],
  'cs-CZ': ['cs-CZ-VlastaNeural', 'cs-CZ-AntoninNeural'],
  'hu-HU': ['hu-HU-NoemiNeural', 'hu-HU-TamasNeural'],
  'ro-RO': ['ro-RO-AlinaNeural', 'ro-RO-EmilNeural'],
  'uk-UA': ['uk-UA-PolinaNeural', 'uk-UA-OstapNeural'],
  'ar-SA': ['ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'],
  'ar-EG': ['ar-EG-SalmaNeural', 'ar-EG-ShakirNeural'],
  'he-IL': ['he-IL-HilaNeural', 'he-IL-AvriNeural'],
  'hi-IN': ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'],
  'zh-CN': ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
  'zh-TW': ['zh-TW-HsiaoChenNeural', 'zh-TW-YunJheNeural'],
  'zh-HK': ['zh-HK-HiuMaanNeural', 'zh-HK-WanLungNeural'],
  'ja-JP': ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
  'ko-KR': ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural'],
  'vi-VN': ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'],
  'th-TH': ['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural'],
  'id-ID': ['id-ID-GadisNeural', 'id-ID-ArdiNeural'],
  'ms-MY': ['ms-MY-YasminNeural', 'ms-MY-OsmanNeural'],
  'fil-PH': ['fil-PH-BlessicaNeural', 'fil-PH-AngeloNeural'],
  'bn-IN': ['bn-IN-TanishaaNeural', 'bn-IN-BashkarNeural'],
  'ta-IN': ['ta-IN-PallaviNeural', 'ta-IN-ValluvarNeural'],
  'ur-PK': ['ur-PK-UzmaNeural', 'ur-PK-AsadNeural'],
  'fa-IR': ['fa-IR-DilaraNeural', 'fa-IR-FaridNeural'],
  'sw-KE': ['sw-KE-ZuriNeural', 'sw-KE-RafikiNeural'],
  'af-ZA': ['af-ZA-AdriNeural', 'af-ZA-WillemNeural'],
};

export const LANGUAGE_LABELS = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-AU', 'English (Australia)'],
  ['en-IN', 'English (India)'], ['en-CA', 'English (Canada)'],
  ['es-ES', 'Spanish (Spain)'], ['es-MX', 'Spanish (Mexico)'],
  ['fr-FR', 'French (France)'], ['fr-CA', 'French (Canada)'],
  ['de-DE', 'German'], ['it-IT', 'Italian'],
  ['pt-BR', 'Portuguese (Brazil)'], ['pt-PT', 'Portuguese (Portugal)'],
  ['nl-NL', 'Dutch'], ['ru-RU', 'Russian'], ['pl-PL', 'Polish'],
  ['sv-SE', 'Swedish'], ['nb-NO', 'Norwegian'], ['da-DK', 'Danish'], ['fi-FI', 'Finnish'],
  ['el-GR', 'Greek'], ['tr-TR', 'Turkish'], ['cs-CZ', 'Czech'], ['hu-HU', 'Hungarian'],
  ['ro-RO', 'Romanian'], ['uk-UA', 'Ukrainian'],
  ['ar-SA', 'Arabic (Saudi Arabia)'], ['ar-EG', 'Arabic (Egypt)'], ['he-IL', 'Hebrew'],
  ['hi-IN', 'Hindi'], ['bn-IN', 'Bengali'], ['ta-IN', 'Tamil'], ['ur-PK', 'Urdu'], ['fa-IR', 'Persian'],
  ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'], ['zh-HK', 'Chinese (Hong Kong)'],
  ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['vi-VN', 'Vietnamese'], ['th-TH', 'Thai'],
  ['id-ID', 'Indonesian'], ['ms-MY', 'Malay'], ['fil-PH', 'Filipino'],
  ['sw-KE', 'Swahili'], ['af-ZA', 'Afrikaans'],
];

function parseFormJson(str) {
  try {
    const cfg = JSON.parse(str);
    return { ok: true, cfg };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function useAgentConfig() {
  const [language, setLanguage] = usePersistedState('voice.language', 'en-US');
  const [voice, setVoice] = usePersistedState('voice.voice', 'en-US-JennyNeural');
  const [proactive, setProactive] = usePersistedState('voice.proactive', true);
  const [configMode, setConfigMode] = usePersistedState('voice.configMode', 'cdb'); // simple | form | cdb
  const [instructions, setInstructions] = usePersistedState(
    'voice.instructions',
    'You are a helpful, concise voice assistant. Keep responses short and conversational — two or three sentences max.',
  );
  const [formJson, setFormJson] = usePersistedState('voice.formJson', DEFAULT_FORM_JSON);
  const [formJsonError, setFormJsonError] = useState('');
  const [parsedFormConfig, setParsedFormConfig] = useState(null);

  useEffect(() => {
    const voices = VOICE_BY_LANG[language] || VOICE_BY_LANG['en-US'];
    if (!voices.includes(voice)) setVoice(voices[0]);
  }, [language]);

  useEffect(() => {
    const { ok, cfg, error: err } = parseFormJson(formJson);
    if (ok) {
      setParsedFormConfig(cfg);
      setFormJsonError('');
    } else {
      setFormJsonError('Invalid JSON: ' + err);
      setParsedFormConfig(null);
    }
  }, [formJson]);

  return {
    language, setLanguage,
    voice, setVoice,
    proactive, setProactive,
    configMode, setConfigMode,
    instructions, setInstructions,
    formJson, setFormJson,
    formJsonError,
    parsedFormConfig,
  };
}
