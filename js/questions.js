/*
  أسئلة «الفشّار»
  ----------------
  - أول 3 أسئلة هما الأساسيين (بالترتيب). الباقي احتياطي: زرار «سؤال تاني» بياخد اللي بعده.
  - prompt: الجملة، والفراغ مكتوب ____
  - hint: نوع الإجابة اللي بيظهر تحت الخانة
  - truth: الإجابة الصح زي ما هتظهر على الشاشة (اكتبها بسيطة زي ما الناس بتكتب)
  - accept: صيغ مقبولة للإجابة الصح (المقارنة بتتجاهل الهمزات والتاء المربوطة و«ال» والمسافات)
  - keywords: لو الكدبة فيها أي كلمة من دول تتعتبر «كتب الحقيقة»
  - decoys: كدبات احتياطي بتتحط بس لو عدد الكدبات قليل جداً (أقل من 3)
  - source: مصدر المعلومة (للمذيع بس)
*/
window.QUESTIONS = [
  {
    id: "emu",
    prompt: "سنة 1932 الجيش الأسترالي نزل حرب رسمية بالرشاشات ضد ____ … وخسرها",
    hint: "اكتب: كائن",
    truth: "طيور الايمو",
    accept: ["ايمو", "طيور الايمو", "طير الايمو", "emu", "emus"],
    keywords: ["ايمو", "emu"],
    decoys: ["الكناغر", "النمل الأبيض", "الأرانب البرية"],
    source: "The Great Emu War, Western Australia, Nov–Dec 1932 (History Hit, Discover Wildlife)"
  },
  {
    id: "bubblewrap",
    prompt: "البلاستيك أبو فقاقيع اللي بنفرقعه (Bubble Wrap) اتخترع في الأول عشان يبقى ____",
    hint: "اكتب: استخدام",
    truth: "ورق حيطان",
    accept: ["ورق حيطان", "ورق حائط", "ورق جدران", "ورق حوائط", "wallpaper", "ديكور حيطان", "تلبيس حيطان"],
    keywords: ["ورقحيط", "ورقحائط", "ورقحوائط", "ورقجدران", "wallpaper", "ديكورحيط", "تلبيسحيط"],
    decoys: ["عازل للصوت", "مرتبة للسباحة", "لعبة أطفال"],
    source: "Invented 1957 by Fielding & Chavannes as textured wallpaper (Mental Floss, Wikipedia)"
  },
  {
    id: "penguin",
    prompt: "الحرس الملكي النرويجي عنده لواء رسمي حامل لقب «سير»… واللواء ده ____",
    hint: "اكتب: مين/إيه",
    truth: "بطريق",
    accept: ["بطريق", "بطريق ملكي", "penguin", "بنجوين", "بطريء"],
    keywords: ["بطريق", "penguin", "بنجوين", "بنجوين"],
    decoys: ["كلب", "طفل عنده 8 سنين", "حصان"],
    source: "Sir Nils Olav III, king penguin at Edinburgh Zoo, Major General of the Norwegian King's Guard since 2023 (Guinness World Records)"
  },
  {
    id: "napoleon",
    prompt: "نابليون اتهاجم في رحلة صيد سنة 1807 من آلاف ____ واضطر ينسحب",
    hint: "اكتب: كائن",
    truth: "أرانب",
    accept: ["ارانب", "ارنب", "rabbits", "bunnies"],
    keywords: ["ارانب", "ارنب", "rabbit", "bunn"],
    decoys: ["بط", "نحل", "غربان"],
    source: "Rabbit hunt after the Treaties of Tilsit, July 1807 — Baron Thiébault's memoirs (Mental Floss)"
  },
  {
    id: "nintendo",
    prompt: "شركة نينتندو (بتاعة ماريو) بدأت سنة 1889 بتصنع ____",
    hint: "اكتب: منتج",
    truth: "كوتشينة",
    accept: ["كوتشينه", "كوتشينة", "ورق لعب", "كروت لعب", "playing cards", "كارتات"],
    keywords: ["كوتشين", "ورقلعب", "كروتلعب", "كارتاتلعب", "playingcard"],
    decoys: ["مظلات", "فوانيس ورق", "صابون"],
    source: "Founded 23 Sep 1889 in Kyoto to make hanafuda playing cards (TechRadar, MoneyWeek)"
  },
  {
    id: "webcam",
    prompt: "أول كاميرا ويب في التاريخ (جامعة كامبريدج) اتعملت عشان تراقب ____",
    hint: "اكتب: حاجة",
    truth: "ماكينة القهوة",
    accept: ["ماكينه القهوه", "ماكينة قهوة", "كنكة القهوة", "القهوة", "coffee pot", "بوت القهوة", "دورق القهوة"],
    keywords: ["قهوه", "قهوة", "coffee", "كوفي"],
    decoys: ["قفص الفيران", "باب المعمل", "عش حمام على الشباك"],
    source: "Trojan Room coffee pot, Cambridge Computer Lab, 1991 (Wikipedia, Guinness World Records)"
  },
  {
    id: "ketchup",
    prompt: "في ثلاثينات القرن الـ19 الكاتشب كان بيتباع في أمريكا على إنه ____",
    hint: "اكتب: حاجة",
    truth: "دوا",
    accept: ["دوا", "دواء", "علاج", "حبوب علاج", "medicine"],
    keywords: ["دوا", "علاج", "medicine"],
    decoys: ["حبر للكتابة", "صبغة شعر", "ملمّع جزم"],
    source: "Dr. John Cook Bennett sold tomato ketchup / tomato pills as medicine from 1834 (The Star QuickCheck, Cracked)"
  },
  {
    id: "ebay",
    prompt: "أول حاجة اتباعت على موقع eBay في التاريخ كانت ____",
    hint: "اكتب: حاجة",
    truth: "ليزر بوينتر بايظ",
    accept: ["ليزر بايظ", "ليزر بوينتر بايظ", "ليزر مكسور", "مؤشر ليزر بايظ", "broken laser pointer"],
    keywords: ["ليزر", "laser"],
    decoys: ["شراب مستعمل", "كوباية مكسورة", "كتاب طبخ"],
    source: "Broken laser pointer sold for $14.83 in 1995 on AuctionWeb (TIME)"
  }
];
