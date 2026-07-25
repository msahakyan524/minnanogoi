/* ====== Books ====== */
const BOOKS = [
  { id:"minna1",  name:"Minna no Nihongo I",  level:"n5", lessons:25, start:1  },
  { id:"minna2",  name:"Minna no Nihongo II", level:"n4", lessons:25, start:26 },
  { id:"kirariN5",name:"Kirari Nihongo N5",   level:"n5", lessons:13, start:1  },
  { id:"kirariN4",name:"Kirari Nihongo N4",   level:"n4", lessons:14, start:1  },
];

/* ====== UI strings ====== */
const UI = {
  en:{flashcards:"Flashcards",lessons:"Lessons",home_title:"Choose what to study",
    home_sub:"Drag your finger across lessons to grab several at once. Mix N5 and N4 freely.",
    specify_title:"Pick exact words",select_all:"Select all",clear:"Clear",
    lessons_title:"Study one lesson",shuffle:"Shuffle",flip:"Flip",
    tap_hint:"Tap to flip · up: know, down: don't know",
    words_selected:"words selected",deselect_all:"Deselect all",specify_btn:"Specify words",study_btn:"Study →",
    study_lesson:"Study this lesson",study_these:"Study these →",no_words:"Pick some lessons first.",
    known:"Known",review:"Review",session_done:"Session done!",
    review_again:"Review the tricky ones",restart:"Study all again",done_all:"You knew every card.",
    word:"word",word_plural:"words",correct:"Correct",wrong:"Wrong",lesson_word:"Lesson"},
  ru:{flashcards:"Карточки",lessons:"Уроки",home_title:"Что будем учить?",
    home_sub:"Проведите пальцем по урокам, чтобы выбрать сразу несколько. Смешивайте N5 и N4.",
    specify_title:"Выбрать слова",select_all:"Выбрать все",clear:"Очистить",
    lessons_title:"Один урок",shuffle:"Перемешать",flip:"Перевернуть",
    tap_hint:"Нажмите, чтобы перевернуть · вверх: знаю, вниз: не знаю",
    words_selected:"слов выбрано",deselect_all:"Снять выбор",specify_btn:"Выбрать слова",study_btn:"Учить →",
    study_lesson:"Учить этот урок",study_these:"Учить эти →",no_words:"Сначала выберите уроки.",
    known:"Знаю",review:"Повторить",session_done:"Готово!",
    review_again:"Повторить сложные",restart:"Учить всё заново",done_all:"Ты знал все карточки.",
    word:"слово",word_plural:"слов",correct:"Верно",wrong:"Неверно",lesson_word:"Урок"},
  hy:{flashcards:"Քարտեր",lessons:"Դասեր",home_title:"Ի՞նչ սովորենք",
    home_sub:"Մատով քաշիր դասերի վրայով՝ մի քանիսը միանգամից ընտրելու համար։ Խառնիր N5 և N4։",
    specify_title:"Ընտրիր բառերը",select_all:"Ընտրել բոլորը",clear:"Մաքրել",
    lessons_title:"Մեկ դաս",shuffle:"Խառնել",flip:"Շրջել",
    tap_hint:"Սեղմիր՝ շրջելու համար · վերև՝ գիտեմ, ներքև՝ չգիտեմ",
    words_selected:"բառ ընտրված",deselect_all:"Ապընտրել բոլորը",specify_btn:"Ընտրել բառերը",study_btn:"Սովորել →",
    study_lesson:"Սովորել այս դասը",study_these:"Սովորել սրանք →",no_words:"Նախ ընտրիր դասերը։",
    known:"Գիտեմ",review:"Կրկնել",session_done:"Պատրաստ է։",
    review_again:"Կրկնիր դժվարները",restart:"Սովորել նորից",done_all:"Դու գիտեիր բոլորը։",
    word:"բառ",word_plural:"բառեր",correct:"Ճիշտ",wrong:"Սխալ",lesson_word:"Դաս"},
};

/* ====== Words ======
   b=book, l=lesson, jp=main (kanji/kana), rd=reading, ro=romaji,
   en/ru/hy=meaning, img=picture key (see images.js) */
const WORDS = [
  /* ---- Minna I — Lesson 1 : people & jobs ---- */
  {b:"minna1",l:1,jp:"私",rd:"わたし",ro:"watashi",en:"I, me",ru:"я",hy:"ես",img:"person"},
  {b:"minna1",l:1,jp:"あなた",rd:"",ro:"anata",en:"you",ru:"ты, вы",hy:"դու",img:""},
  {b:"minna1",l:1,jp:"先生",rd:"せんせい",ro:"sensei",en:"teacher",ru:"учитель",hy:"ուսուցիչ",img:"teacher"},
  {b:"minna1",l:1,jp:"学生",rd:"がくせい",ro:"gakusei",en:"student",ru:"студент",hy:"ուսանող",img:"student"},
  {b:"minna1",l:1,jp:"医者",rd:"いしゃ",ro:"isha",en:"doctor",ru:"врач",hy:"բժիշկ",img:"doctor"},
  {b:"minna1",l:1,jp:"会社員",rd:"かいしゃいん",ro:"kaishain",en:"office worker",ru:"служащий",hy:"աշխատակից",img:"worker"},
  {b:"minna1",l:1,jp:"エンジニア",rd:"",ro:"enjinia",en:"engineer",ru:"инженер",hy:"ինժեներ",img:"engineer"},
  {b:"minna1",l:1,jp:"大学",rd:"だいがく",ro:"daigaku",en:"university",ru:"университет",hy:"համալսարան",img:"university"},
  {b:"minna1",l:1,jp:"病院",rd:"びょういん",ro:"byouin",en:"hospital",ru:"больница",hy:"հիվանդանոց",img:"hospital"},
  {b:"minna1",l:1,jp:"銀行員",rd:"ぎんこういん",ro:"ginkouin",en:"bank clerk",ru:"банковский служащий",hy:"բանկի աշխատակից",img:"bank"},

  /* ---- Minna I — Lesson 2 : things ---- */
  {b:"minna1",l:2,jp:"本",rd:"ほん",ro:"hon",en:"book",ru:"книга",hy:"գիրք",img:"book"},
  {b:"minna1",l:2,jp:"時計",rd:"とけい",ro:"tokei",en:"watch, clock",ru:"часы",hy:"ժամացույց",img:"clock"},
  {b:"minna1",l:2,jp:"傘",rd:"かさ",ro:"kasa",en:"umbrella",ru:"зонт",hy:"հովանոց",img:"umbrella"},
  {b:"minna1",l:2,jp:"かばん",rd:"",ro:"kaban",en:"bag",ru:"сумка",hy:"պայուսակ",img:"bag"},
  {b:"minna1",l:2,jp:"カメラ",rd:"",ro:"kamera",en:"camera",ru:"фотоаппарат",hy:"ֆոտոխցիկ",img:"camera"},
  {b:"minna1",l:2,jp:"テレビ",rd:"",ro:"terebi",en:"TV",ru:"телевизор",hy:"հեռուստացույց",img:"tv"},
  {b:"minna1",l:2,jp:"ラジオ",rd:"",ro:"rajio",en:"radio",ru:"радио",hy:"ռադիո",img:"radio"},
  {b:"minna1",l:2,jp:"鉛筆",rd:"えんぴつ",ro:"enpitsu",en:"pencil",ru:"карандаш",hy:"մատիտ",img:"pencil"},
  {b:"minna1",l:2,jp:"ノート",rd:"",ro:"nooto",en:"notebook",ru:"тетрадь",hy:"տետր",img:"notebook"},
  {b:"minna1",l:2,jp:"椅子",rd:"いす",ro:"isu",en:"chair",ru:"стул",hy:"աթոռ",img:"chair"},
  {b:"minna1",l:2,jp:"机",rd:"つくえ",ro:"tsukue",en:"desk",ru:"стол",hy:"սեղան",img:"desk"},

  /* ---- Minna I — Lesson 3 : places ---- */
  {b:"minna1",l:3,jp:"駅",rd:"えき",ro:"eki",en:"station",ru:"станция",hy:"կայարան",img:"station"},
  {b:"minna1",l:3,jp:"銀行",rd:"ぎんこう",ro:"ginkou",en:"bank",ru:"банк",hy:"բանկ",img:"bank"},
  {b:"minna1",l:3,jp:"郵便局",rd:"ゆうびんきょく",ro:"yuubinkyoku",en:"post office",ru:"почта",hy:"փոստ",img:"post"},
  {b:"minna1",l:3,jp:"図書館",rd:"としょかん",ro:"toshokan",en:"library",ru:"библиотека",hy:"գրադարան",img:"library"},
  {b:"minna1",l:3,jp:"デパート",rd:"",ro:"depaato",en:"department store",ru:"универмаг",hy:"հանրախանութ",img:"store"},
  {b:"minna1",l:3,jp:"会社",rd:"かいしゃ",ro:"kaisha",en:"company",ru:"компания",hy:"ընկերություն",img:"worker"},
  {b:"minna1",l:3,jp:"学校",rd:"がっこう",ro:"gakkou",en:"school",ru:"школа",hy:"դպրոց",img:"school"},
  {b:"minna1",l:3,jp:"家",rd:"いえ",ro:"ie",en:"house, home",ru:"дом",hy:"տուն",img:"house"},
  {b:"minna1",l:3,jp:"喫茶店",rd:"きっさてん",ro:"kissaten",en:"café",ru:"кафе",hy:"սրճարան",img:"cafe"},

  /* ---- Minna I — Lesson 4 : time & daily verbs ---- */
  {b:"minna1",l:4,jp:"今",rd:"いま",ro:"ima",en:"now",ru:"сейчас",hy:"հիմա",img:""},
  {b:"minna1",l:4,jp:"今日",rd:"きょう",ro:"kyou",en:"today",ru:"сегодня",hy:"այսօր",img:""},
  {b:"minna1",l:4,jp:"毎日",rd:"まいにち",ro:"mainichi",en:"every day",ru:"каждый день",hy:"ամեն օր",img:""},
  {b:"minna1",l:4,jp:"起きます",rd:"おきます",ro:"okimasu",en:"to wake up",ru:"вставать",hy:"արթնանալ",img:""},
  {b:"minna1",l:4,jp:"寝ます",rd:"ねます",ro:"nemasu",en:"to sleep",ru:"спать",hy:"քնել",img:""},
  {b:"minna1",l:4,jp:"働きます",rd:"はたらきます",ro:"hatarakimasu",en:"to work",ru:"работать",hy:"աշխատել",img:""},
  {b:"minna1",l:4,jp:"勉強します",rd:"べんきょうします",ro:"benkyou shimasu",en:"to study",ru:"учиться",hy:"սովորել",img:""},
  {b:"minna1",l:4,jp:"終わります",rd:"おわります",ro:"owarimasu",en:"to finish",ru:"заканчивать",hy:"ավարտել",img:""},

  /* ---- Minna I — Lesson 5 : transport & motion ---- */
  {b:"minna1",l:5,jp:"行きます",rd:"いきます",ro:"ikimasu",en:"to go",ru:"идти, ехать",hy:"գնալ",img:""},
  {b:"minna1",l:5,jp:"来ます",rd:"きます",ro:"kimasu",en:"to come",ru:"приходить",hy:"գալ",img:""},
  {b:"minna1",l:5,jp:"帰ります",rd:"かえります",ro:"kaerimasu",en:"to return",ru:"возвращаться",hy:"վերադառնալ",img:""},
  {b:"minna1",l:5,jp:"電車",rd:"でんしゃ",ro:"densha",en:"train",ru:"поезд",hy:"գնացք",img:"train"},
  {b:"minna1",l:5,jp:"バス",rd:"",ro:"basu",en:"bus",ru:"автобус",hy:"ավտոբուս",img:"bus"},
  {b:"minna1",l:5,jp:"地下鉄",rd:"ちかてつ",ro:"chikatetsu",en:"subway",ru:"метро",hy:"մետրո",img:"subway"},
  {b:"minna1",l:5,jp:"飛行機",rd:"ひこうき",ro:"hikouki",en:"airplane",ru:"самолёт",hy:"ինքնաթիռ",img:"airplane"},
  {b:"minna1",l:5,jp:"船",rd:"ふね",ro:"fune",en:"ship, boat",ru:"корабль",hy:"նավ",img:"ship"},
  {b:"minna1",l:5,jp:"車",rd:"くるま",ro:"kuruma",en:"car",ru:"машина",hy:"մեքենա",img:"car"},
  {b:"minna1",l:5,jp:"自転車",rd:"じてんしゃ",ro:"jitensha",en:"bicycle",ru:"велосипед",hy:"հեծանիվ",img:"bicycle"},
  {b:"minna1",l:5,jp:"タクシー",rd:"",ro:"takushii",en:"taxi",ru:"такси",hy:"տաքսի",img:"taxi"},

  /* ---- Minna I — Lesson 6 : food & eating ---- */
  {b:"minna1",l:6,jp:"食べます",rd:"たべます",ro:"tabemasu",en:"to eat",ru:"есть",hy:"ուտել",img:""},
  {b:"minna1",l:6,jp:"飲みます",rd:"のみます",ro:"nomimasu",en:"to drink",ru:"пить",hy:"խմել",img:""},
  {b:"minna1",l:6,jp:"ご飯",rd:"ごはん",ro:"gohan",en:"rice, meal",ru:"рис, еда",hy:"բրինձ, կերակուր",img:"rice"},
  {b:"minna1",l:6,jp:"パン",rd:"",ro:"pan",en:"bread",ru:"хлеб",hy:"հաց",img:"bread"},
  {b:"minna1",l:6,jp:"卵",rd:"たまご",ro:"tamago",en:"egg",ru:"яйцо",hy:"ձու",img:"egg"},
  {b:"minna1",l:6,jp:"肉",rd:"にく",ro:"niku",en:"meat",ru:"мясо",hy:"միս",img:"meat"},
  {b:"minna1",l:6,jp:"魚",rd:"さかな",ro:"sakana",en:"fish",ru:"рыба",hy:"ձուկ",img:"fish"},
  {b:"minna1",l:6,jp:"野菜",rd:"やさい",ro:"yasai",en:"vegetable",ru:"овощи",hy:"բանջարեղեն",img:"vegetable"},
  {b:"minna1",l:6,jp:"果物",rd:"くだもの",ro:"kudamono",en:"fruit",ru:"фрукты",hy:"միրգ",img:"fruit"},
  {b:"minna1",l:6,jp:"水",rd:"みず",ro:"mizu",en:"water",ru:"вода",hy:"ջուր",img:"water"},
  {b:"minna1",l:6,jp:"お茶",rd:"おちゃ",ro:"ocha",en:"tea",ru:"чай",hy:"թեյ",img:"tea"},
  {b:"minna1",l:6,jp:"コーヒー",rd:"",ro:"koohii",en:"coffee",ru:"кофе",hy:"սուրճ",img:"coffee"},
  {b:"minna1",l:6,jp:"牛乳",rd:"ぎゅうにゅう",ro:"gyuunyuu",en:"milk",ru:"молоко",hy:"կաթ",img:"milk"},
  {b:"minna1",l:6,jp:"ビール",rd:"",ro:"biiru",en:"beer",ru:"пиво",hy:"գարեջուր",img:"beer"},
  {b:"minna1",l:6,jp:"りんご",rd:"",ro:"ringo",en:"apple",ru:"яблоко",hy:"խնձոր",img:"apple"},
];

/* give every word a stable id */
WORDS.forEach((w,i)=>{ w.id = w.b+"-"+w.l+"-"+i; });
