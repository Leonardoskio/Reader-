export type VoiceId =
  | "Kore"
  | "Charon"
  | "Zephyr"
  | "Puck"
  | "Fenrir"
  | "Aoede"
  | "Orus";

export interface StudioVoiceProfile {
  id: VoiceId;
  italianTitle: string;
  genderLabel: "Femminile" | "Maschile";
  register: string;
  timbre: string;
  recommendedFor: string;
  vocalRangeHz: string;
  samplePhrase: string;
}

export const STUDIO_VOICES: StudioVoiceProfile[] = [
  {
    id: "Kore",
    italianTitle: "01. Kore — Calda & Narrativa",
    genderLabel: "Femminile",
    register: "Mezzosoprano naturale",
    timbre: "Vellutato, morbido, avvolgente con armoniche calde",
    recommendedFor: "Audiolibri letterari, narrativa d'autore, podcast intimisti",
    vocalRangeHz: "185 – 230 Hz",
    samplePhrase:
      "Ogni pagina racchiude un silenzio diverso, pronto a trasformarsi in racconto.",
  },
  {
    id: "Charon",
    italianTitle: "02. Charon — Profonda & Autorevole",
    genderLabel: "Maschile",
    register: "Baritono profondo",
    timbre: "Risonante, composto, dizione scolpita e posata",
    recommendedFor: "Documentari storici, saggistica, approfondimento giornalistico",
    vocalRangeHz: "105 – 140 Hz",
    samplePhrase:
      "Nel corso dei secoli, la misura dell'architettura ha custodito la memoria delle città.",
  },
  {
    id: "Zephyr",
    italianTitle: "03. Zephyr — Nitida & Editoriale",
    genderLabel: "Femminile",
    register: "Soprano lirico-leggero",
    timbre: "Cristallino, articolato, luminoso sulle vocali aperte",
    recommendedFor: "Rassegna stampa, conduzione radiofonica, e-learning",
    vocalRangeHz: "205 – 255 Hz",
    samplePhrase:
      "Buongiorno, apriamo l'approfondimento di oggi con uno sguardo alle novità culturali.",
  },
  {
    id: "Puck",
    italianTitle: "04. Puck — Brillante & Dinamica",
    genderLabel: "Maschile",
    register: "Tenore naturale",
    timbre: "Vivace, espressivo, ritmo conversazionale spontaneo",
    recommendedFor: "Dialoghi podcast, storytelling contemporaneo, spot",
    vocalRangeHz: "135 – 175 Hz",
    samplePhrase:
      "Benvenuti in ascolto: oggi scopriremo come una semplice virgola cambi il ritmo della frase.",
  },
  {
    id: "Fenrir",
    italianTitle: "05. Fenrir — Intensa & Cinematografica",
    genderLabel: "Maschile",
    register: "Basso-baritono",
    timbre: "Scuro, magnetico, forte presenza sul diaframma",
    recommendedFor: "Doppiaggio cinematografico, trailer, racconti drammatici",
    vocalRangeHz: "92 – 125 Hz",
    samplePhrase:
      "Quando le luci della sala si spengono, resta soltanto il respiro della voce nel buio.",
  },
  {
    id: "Aoede",
    italianTitle: "06. Aoede — Lirica & Poetica",
    genderLabel: "Femminile",
    register: "Contralto espressivo",
    timbre: "Pastoso, teatrale, ricco di sfumature a mezza voce",
    recommendedFor: "Poesia, prosa d'arte, letture teatrali e monologhi",
    vocalRangeHz: "165 – 205 Hz",
    samplePhrase:
      "Ascolta il passo lieve della sera, mentre il vento sfiora le pietre antiche.",
  },
  {
    id: "Orus",
    italianTitle: "07. Orus — Posata & Divulgativa",
    genderLabel: "Maschile",
    register: "Baritono chiaro",
    timbre: "Equilibrato, limpido, cadenza didattica rassicurante",
    recommendedFor: "Divulgazione scientifica, manualistica, corsi accademici",
    vocalRangeHz: "118 – 155 Hz",
    samplePhrase:
      "Osserviamo ora con precisione il legame tra struttura sintattica e chiarezza espositiva.",
  },
];

export interface VoiceStylePreset {
  id: string;
  label: string;
  description: string;
  defaultVoice: VoiceId;
  defaultComma: "morbida" | "classica" | "teatrale";
  defaultSpeed: "lenta" | "naturale" | "dinamica";
}

export const VOICE_STYLE_PRESETS: VoiceStylePreset[] = [
  {
    id: "narrativa",
    label: "Narrativa Letteraria",
    description: "Appoggio morbido sul fiato, sospensioni espressive sulle virgole e cadenze avvolgenti.",
    defaultVoice: "Kore",
    defaultComma: "classica",
    defaultSpeed: "naturale",
  },
  {
    id: "documentario",
    label: "Documentario d'Arte & Storia",
    description: "Timbro profondo, respiro ampio, sottolineatura solenne degli incisi e dei due punti.",
    defaultVoice: "Charon",
    defaultComma: "teatrale",
    defaultSpeed: "lenta",
  },
  {
    id: "giornalismo",
    label: "Giornalismo & Rubrica",
    description: "Attacco nitido, scansione ritmica precisa e pause sintattiche pulite senza enfasi eccessiva.",
    defaultVoice: "Zephyr",
    defaultComma: "morbida",
    defaultSpeed: "dinamica",
  },
  {
    id: "podcast",
    label: "Podcast Conversazionale",
    description: "Tono spontaneo, caloroso e diretto, con inflessioni naturali del parlato colto italiano.",
    defaultVoice: "Puck",
    defaultComma: "morbida",
    defaultSpeed: "naturale",
  },
  {
    id: "cinema",
    label: "Monologo Cinematografico",
    description: "Dinamica intima a mezza voce alternata a proiezione intensa, pause cariche di sottotesto.",
    defaultVoice: "Fenrir",
    defaultComma: "teatrale",
    defaultSpeed: "lenta",
  },
  {
    id: "poesia",
    label: "Prosa d'Arte & Teatro",
    description: "Intonazione lirica, legato espressivo sulle vocali e sospensioni cariche di risonanza.",
    defaultVoice: "Aoede",
    defaultComma: "teatrale",
    defaultSpeed: "lenta",
  },
  {
    id: "divulgazione",
    label: "Divulgazione & Accademia",
    description: "Esposizione chiara, ordinata e autorevole per saggi, lezioni e dispense PDF.",
    defaultVoice: "Orus",
    defaultComma: "classica",
    defaultSpeed: "naturale",
  },
];

export interface SampleItalianScript {
  id: string;
  title: string;
  category: string;
  mode: "single" | "dialogue";
  voiceStylePreset: string;
  recommendedVoice: VoiceId;
  secondaryVoice?: VoiceId;
  speakerA?: string;
  speakerB?: string;
  text: string;
}

export const SAMPLE_ITALIAN_SCRIPTS: SampleItalianScript[] = [
  {
    id: "calvino-notturno",
    title: "Le Città e la Memoria Silenziosa",
    category: "Narrativa Letteraria",
    mode: "single",
    voiceStylePreset: "narrativa",
    recommendedVoice: "Kore",
    text: `Quando si entra in una città antica al tramonto, mentre le ombre si allungano sui selciati di pietra tiepida, non si ascolta soltanto il rumore dei passi; si percepisce, quasi in filigrana, il respiro delle voci che l'hanno attraversata. Ogni portico, ogni finestra socchiusa, conserva una virgola di esitazione, un tono sospeso tra ciò che è stato detto e ciò che attende ancora di trovare parola. Fermarsi un istante, dunque, significa imparare ad ascoltare davvero.`,
  },
  {
    id: "bottega-rinascimento",
    title: "La Luce nelle Botteghe Fiorentine",
    category: "Documentario Storico",
    mode: "single",
    voiceStylePreset: "documentario",
    recommendedVoice: "Charon",
    text: `Nella Firenze del Quattrocento, prima ancora che il pennello toccasse la tavola preparata a gesso, l'opera nasceva nel silenzio operoso della bottega: si macinavano i minerali azzurri, si dosava l'olio di lino, si studiava l'inclinazione esatta della luce mattutina. Non era semplice mestiere, bensì una disciplina dello sguardo; perché ogni dettaglio, anche il più minuto, doveva restituire la misura viva dell'uomo.`,
  },
  {
    id: "editoriale-design",
    title: "L'Arte della Misura nel Design Italiano",
    category: "Giornalismo & Cultura",
    mode: "single",
    voiceStylePreset: "giornalismo",
    recommendedVoice: "Zephyr",
    text: `Cosa rende davvero riconoscibile un oggetto progettato in Italia? Non l'eccesso ornamentale, né la ricerca dell'effetto a tutti i costi, ma una qualità più sottile: l'equilibrio naturale tra rigore tecnico e calore umano. Quando una forma funziona, non ha bisogno di alzare la voce; dialoga con chi la usa, con discrezione, giorno dopo giorno.`,
  },
  {
    id: "dialogo-podcast",
    title: "Dietro le Quinte della Voce",
    category: "Dialogo a Due Voci",
    mode: "dialogue",
    voiceStylePreset: "podcast",
    recommendedVoice: "Puck",
    secondaryVoice: "Kore",
    speakerA: "Marco",
    speakerB: "Elena",
    text: `Marco: Benvenuti in studio! Oggi parliamo di un dettaglio che trasforma completamente l'ascolto di un racconto: il valore delle virgole e dei silenzi.
Elena: È proprio così, Marco; spesso pensiamo che leggere bene significhi pronunciare tutte le parole in fila, ma è nella pausa prima di un inciso che nasce l'emozione.
Marco: Esatto, quando la voce resta leggermente sospesa sulla virgola, chi ascolta immagina già cosa sta per arrivare.
Elena: Ed è lì che il testo smette di essere inchiostro sulla pagina, e diventa una voce viva.`,
  },
];

export interface TonicAccentItem {
  word: string;
  phoneticHint: string;
  reason: string;
}

export interface InternalReadingData {
  semanticSummary: string;
  emotionalRegister: string;
  narrativeArc: string;
  estimatedWpm: number;
  wordCount: number;
  syllableCount: number;
  estimatedDurationSec: number;
  breathUnitsCount: number;
  tonicAccents: TonicAccentItem[];
}

export interface ProsodicClause {
  id: string;
  speaker?: string;
  text: string;
  punctuationMark: string;
  punctuationFunction: string;
  tone: string;
  pitchContour: "rising" | "falling" | "sustained" | "circumflex" | "neutral";
  pauseMs: number;
  vocalSetting: string;
  emphasisWords: string[];
}

export interface ProsodyMapData {
  globalVocalSetting: string;
  englishStyleDirective: string;
  punctuationStats: {
    commas: number;
    semicolonsColons: number;
    periods: number;
    expressiveMarks: number;
    totalPauseMs: number;
  };
  clauses: ProsodicClause[];
}

export const INITIAL_INTERNAL_READING: InternalReadingData = {
  semanticSummary:
    "Riflessione lirica e sensoriale sull'ingresso in una città storica italiana al crepuscolo, dove l'architettura diventa custodia della memoria vocale e dell'ascolto consapevole.",
  emotionalRegister: "Contemplativo, caldo e intimamente evocativo",
  narrativeArc:
    "Attacco descrittivo sospeso sulle subordinate temporali -> apertura riflessiva dopo il punto e virgola -> chiusa aforistica raccolta e risolutiva",
  estimatedWpm: 132,
  wordCount: 73,
  syllableCount: 168,
  estimatedDurationSec: 36.4,
  breathUnitsCount: 5,
  tonicAccents: [
    {
      word: "città",
      phoneticHint: "Accento tronca finale netto, raddoppiamento fonosintattico",
      reason: "Sostantivo cardine dell'immagine d'apertura",
    },
    {
      word: "pèrcipisce",
      phoneticHint: "Articolazione morbida della palatale, appoggio sulla terza sillaba",
      reason: "Passaggio dalla percezione fisica del passo all'ascolto interiore",
    },
    {
      word: "ancóra",
      phoneticHint: "Ó chiusa tonica sulla penultima sillaba (avverbio di tempo, non àncora)",
      reason: "Omografo italiano classico: richiede ó chiusa per indicare continuità temporale",
    },
    {
      word: "davvéro",
      phoneticHint: "É chiusa tonica con tenuta lunga conclusiva",
      reason: "Sigillo semantico dell'intero brano",
    },
  ],
};

export const INITIAL_PROSODY_MAP: ProsodyMapData = {
  globalVocalSetting:
    "Voce italiana impostata sul registro medio-caldo con appoggio diaframmatico morbido; vocali toniche ben timbrate, sospensione melodica sulle virgole d'inciso senza lasciar cadere il fiato, e cadenza grave e raccolta sui punti fermi.",
  englishStyleDirective:
    "Native Italian literary audiobook narrator. Warm, resonant, velvety vocal tone with authentic Italian diction. Honor every comma with a delicate upward melodic suspension, pause naturally at semicolons, and close periods with a calm downward cadence.",
  punctuationStats: {
    commas: 6,
    semicolonsColons: 1,
    periods: 3,
    expressiveMarks: 0,
    totalPauseMs: 3610,
  },
  clauses: [
    {
      id: "clause-1",
      speaker: "Narratore",
      text: "Quando si entra in una città antica al tramonto,",
      punctuationMark: ",",
      punctuationFunction: "Virgola d'apertura temporale",
      tone: "Sospensivo luminoso",
      pitchContour: "rising",
      pauseMs: 240,
      vocalSetting: "Attacco morbido, lieve innalzamento tonale su 'tramonto'",
      emphasisWords: ["città", "tramonto"],
    },
    {
      id: "clause-2",
      speaker: "Narratore",
      text: "mentre le ombre si allungano sui selciati di pietra tiepida,",
      punctuationMark: ",",
      punctuationFunction: "Virgola d'inciso descrittivo",
      tone: "Avvolgente e visivo",
      pitchContour: "sustained",
      pauseMs: 280,
      vocalSetting: "Legato fluido sulle consonanti doppie, tenuta di fiato",
      emphasisWords: ["ombre", "pietra"],
    },
    {
      id: "clause-3",
      speaker: "Narratore",
      text: "non si ascolta soltanto il rumore dei passi;",
      punctuationMark: ";",
      punctuationFunction: "Punto e virgola di snodo concettuale",
      tone: "Asseverativo misurato",
      pitchContour: "sustained",
      pauseMs: 460,
      vocalSetting: "Cesura netta ma non definitiva, micro-respiro prima della rivelazione",
      emphasisWords: ["soltanto", "passi"],
    },
    {
      id: "clause-4",
      speaker: "Narratore",
      text: "si percepisce,",
      punctuationMark: ",",
      punctuationFunction: "Virgola d'apertura inciso parentetico",
      tone: "Intimo e sospeso",
      pitchContour: "rising",
      pauseMs: 190,
      vocalSetting: "Volume leggermente raccolto per preparare l'inciso",
      emphasisWords: ["percepisce"],
    },
    {
      id: "clause-5",
      speaker: "Narratore",
      text: "quasi in filigrana,",
      punctuationMark: ",",
      punctuationFunction: "Virgola di chiusura inciso",
      tone: "Inciso confidenziale a mezza voce",
      pitchContour: "circumflex",
      pauseMs: 230,
      vocalSetting: "Pronuncia delicata tra parentesi tonali",
      emphasisWords: ["filigrana"],
    },
    {
      id: "clause-6",
      speaker: "Narratore",
      text: "il respiro delle voci che l'hanno attraversata.",
      punctuationMark: ".",
      punctuationFunction: "Punto fermo di fine primo periodo",
      tone: "Profondo e risolutivo",
      pitchContour: "falling",
      pauseMs: 650,
      vocalSetting: "Cadenza discendente piena e presa di fiato completa",
      emphasisWords: ["respiro", "voci"],
    },
    {
      id: "clause-7",
      speaker: "Narratore",
      text: "Ogni portico,",
      punctuationMark: ",",
      punctuationFunction: "Virgola seriale anaforica",
      tone: "Scandito e ritmico",
      pitchContour: "rising",
      pauseMs: 200,
      vocalSetting: "Articolazione nitida della 'o' aperta di portico",
      emphasisWords: ["portico"],
    },
    {
      id: "clause-8",
      speaker: "Narratore",
      text: "ogni finestra socchiusa,",
      punctuationMark: ",",
      punctuationFunction: "Virgola di culmine del soggetto",
      tone: "Sospensivo d'attesa",
      pitchContour: "rising",
      pauseMs: 260,
      vocalSetting: "Lieve crescendo prima del verbo principale",
      emphasisWords: ["finestra", "socchiusa"],
    },
    {
      id: "clause-9",
      speaker: "Narratore",
      text: "conserva una virgola di esitazione,",
      punctuationMark: ",",
      punctuationFunction: "Virgola appositiva",
      tone: "Poetico e misurato",
      pitchContour: "sustained",
      pauseMs: 250,
      vocalSetting: "Micro-esitazione intenzionale dopo la parola 'esitazione'",
      emphasisWords: ["virgola", "esitazione"],
    },
    {
      id: "clause-10",
      speaker: "Narratore",
      text: "un tono sospeso tra ciò che è stato detto e ciò che attende ancora di trovare parola.",
      punctuationMark: ".",
      punctuationFunction: "Punto fermo meditativo",
      tone: "Largo e contemplativo",
      pitchContour: "falling",
      pauseMs: 640,
      vocalSetting: "Arco unico di fiato su tutta la coordinata, chiusura morbida",
      emphasisWords: ["sospeso", "ancora", "parola"],
    },
    {
      id: "clause-11",
      speaker: "Narratore",
      text: "Fermarsi un istante, dunque, significa imparare ad ascoltare davvero.",
      punctuationMark: ".",
      punctuationFunction: "Punto fermo di chiusa finale",
      tone: "Caldo, fermo e definitivo",
      pitchContour: "falling",
      pauseMs: 210,
      vocalSetting: "Rallentando naturale sulle ultime tre parole, timbro caldo e pieno",
      emphasisWords: ["Fermarsi", "ascoltare", "davvero"],
    },
  ],
};
