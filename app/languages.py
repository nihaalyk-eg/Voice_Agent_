"""
Shared language-name / locale resolution for all three voice agents.

Lets a caller say a language by name ("Spanish", "Finnish") or locale code
("es-ES", "fi-FI") and get back a consistent (locale, azure_voice, display_name)
tuple, used both to auto-start in a matched customer's preferred language and
to handle a mid-call "can we switch to X" request.
"""

# name (lowercase) -> (locale_code, default_azure_neural_voice, display_name)
LANGUAGES = {
    "english":            ("en-US", "en-US-JennyNeural",       "English"),
    "english (uk)":       ("en-GB", "en-GB-SoniaNeural",       "English (UK)"),
    "english (australia)": ("en-AU", "en-AU-NatashaNeural",    "English (Australia)"),
    "english (india)":    ("en-IN", "en-IN-NeerjaNeural",      "English (India)"),
    "english (canada)":   ("en-CA", "en-CA-ClaraNeural",       "English (Canada)"),
    "spanish":            ("es-ES", "es-ES-ElviraNeural",      "Spanish"),
    "spanish (mexico)":   ("es-MX", "es-MX-DaliaNeural",       "Spanish (Mexico)"),
    "french":             ("fr-FR", "fr-FR-DeniseNeural",      "French"),
    "french (canada)":    ("fr-CA", "fr-CA-SylvieNeural",      "French (Canada)"),
    "german":             ("de-DE", "de-DE-KatjaNeural",       "German"),
    "italian":            ("it-IT", "it-IT-ElsaNeural",        "Italian"),
    "portuguese":         ("pt-BR", "pt-BR-FranciscaNeural",   "Portuguese (Brazil)"),
    "portuguese (portugal)": ("pt-PT", "pt-PT-RaquelNeural",   "Portuguese (Portugal)"),
    "dutch":              ("nl-NL", "nl-NL-ColetteNeural",     "Dutch"),
    "russian":            ("ru-RU", "ru-RU-SvetlanaNeural",    "Russian"),
    "polish":             ("pl-PL", "pl-PL-AgnieszkaNeural",   "Polish"),
    "swedish":            ("sv-SE", "sv-SE-SofieNeural",       "Swedish"),
    "norwegian":          ("nb-NO", "nb-NO-IselinNeural",      "Norwegian"),
    "danish":             ("da-DK", "da-DK-ChristelNeural",    "Danish"),
    "finnish":            ("fi-FI", "fi-FI-SelmaNeural",       "Finnish"),
    "greek":              ("el-GR", "el-GR-AthinaNeural",      "Greek"),
    "turkish":            ("tr-TR", "tr-TR-EmelNeural",        "Turkish"),
    "czech":              ("cs-CZ", "cs-CZ-VlastaNeural",      "Czech"),
    "hungarian":          ("hu-HU", "hu-HU-NoemiNeural",       "Hungarian"),
    "romanian":           ("ro-RO", "ro-RO-AlinaNeural",       "Romanian"),
    "ukrainian":          ("uk-UA", "uk-UA-PolinaNeural",      "Ukrainian"),
    "arabic":             ("ar-SA", "ar-SA-ZariyahNeural",     "Arabic (Saudi Arabia)"),
    "arabic (egypt)":     ("ar-EG", "ar-EG-SalmaNeural",       "Arabic (Egypt)"),
    "hebrew":             ("he-IL", "he-IL-HilaNeural",        "Hebrew"),
    "hindi":              ("hi-IN", "hi-IN-SwaraNeural",       "Hindi"),
    "bengali":            ("bn-IN", "bn-IN-TanishaaNeural",    "Bengali"),
    "tamil":              ("ta-IN", "ta-IN-PallaviNeural",     "Tamil"),
    "urdu":               ("ur-PK", "ur-PK-UzmaNeural",        "Urdu"),
    "persian":            ("fa-IR", "fa-IR-DilaraNeural",      "Persian"),
    "farsi":              ("fa-IR", "fa-IR-DilaraNeural",      "Persian"),
    "chinese":            ("zh-CN", "zh-CN-XiaoxiaoNeural",    "Chinese (Simplified)"),
    "chinese (traditional)": ("zh-TW", "zh-TW-HsiaoChenNeural", "Chinese (Traditional)"),
    "cantonese":          ("zh-HK", "zh-HK-HiuMaanNeural",     "Chinese (Hong Kong)"),
    "japanese":           ("ja-JP", "ja-JP-NanamiNeural",      "Japanese"),
    "korean":             ("ko-KR", "ko-KR-SunHiNeural",       "Korean"),
    "vietnamese":         ("vi-VN", "vi-VN-HoaiMyNeural",      "Vietnamese"),
    "thai":               ("th-TH", "th-TH-PremwadeeNeural",   "Thai"),
    "indonesian":         ("id-ID", "id-ID-GadisNeural",       "Indonesian"),
    "malay":              ("ms-MY", "ms-MY-YasminNeural",      "Malay"),
    "filipino":           ("fil-PH", "fil-PH-BlessicaNeural",  "Filipino"),
    "tagalog":            ("fil-PH", "fil-PH-BlessicaNeural",  "Filipino"),
    "swahili":            ("sw-KE", "sw-KE-ZuriNeural",        "Swahili"),
    "afrikaans":          ("af-ZA", "af-ZA-AdriNeural",        "Afrikaans"),
}

# Locale code (lowercase) -> same tuple, for lookups by code instead of name
_BY_CODE = {locale.lower(): (locale, voice, display) for locale, voice, display in LANGUAGES.values()}


def resolve_language(query: str):
    """
    Resolve a free-text language name (e.g. 'Spanish', from a caller's speech
    or a customer's on-file language_preference) or a locale code (e.g. 'es-ES')
    to (locale_code, azure_voice, display_name). Returns None if unrecognized.
    """
    if not query:
        return None
    q = query.strip().lower()
    if q in LANGUAGES:
        return LANGUAGES[q]
    if q in _BY_CODE:
        return _BY_CODE[q]
    # bare primary subtag, e.g. "es" -> es-ES, or a partial name match
    for locale, voice, display in _BY_CODE.values():
        if locale.lower().split("-")[0] == q:
            return (locale, voice, display)
    for name, entry in LANGUAGES.items():
        if q in name or name in q:
            return entry
    return None
