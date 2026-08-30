const Parser = require('rss-parser');
const TelegramBot = require('node-telegram-bot-api');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

const parser = new Parser();

// GitHub Secrets / Environment Variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ TELEGRAM_BOT_TOKEN অথবা TELEGRAM_CHAT_ID পাওয়া যায়নি!");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// সংবাদ উৎসের তালিকা (Al Jazeera অগ্রাধিকার পাবে)
const FEEDS = [
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'TRT World', url: 'https://www.trtworld.com/rss/news' }
];

// মজার কাস্টম অ্যাডভারটাইজমেন্ট কালেকশন (নিচের অ্যাড স্ট্রিপের জন্য)
const FUNNY_ADS = [
  { title: 'আওয়ামী মোবাইল - সেরা দামে ফালতু ফোন', brand: 'mi awami', warranty: '17 YEARS GUARANTY' },
  { title: 'ভণ্ড চার্জার - ১০০% স্লো চার্জের গ্যারান্টি', brand: 'Bhondu', warranty: 'NO GUARANTY' },
  { title: 'ফাঁকি ফ্যান - হাওয়া ছাড়া শুধুই বিকট শব্দ', brand: 'Fanki', warranty: '50 YEARS WARRANTY' },
  { title: 'ভুয়া পাওয়ার ব্যাংক - ২ পার্সেন্টে শেষ চার্জ', brand: 'FakePower', warranty: 'ZERO GUARANTY' }
];

// ইতিমধ্যে পোস্ট করা সংবাদের রেকর্ড সংরক্ষণের ব্যবস্থা
const POSTED_NEWS_FILE = './posted_news.json';
let postedNews = [];

if (fs.existsSync(POSTED_NEWS_FILE)) {
  try {
    postedNews = JSON.parse(fs.readFileSync(POSTED_NEWS_FILE, 'utf8'));
  } catch (e) {
    postedNews = [];
  }
}

function savePostedNews(link) {
  postedNews.push(link);
  if (postedNews.length > 500) postedNews.shift();
  fs.writeFileSync(POSTED_NEWS_FILE, JSON.stringify(postedNews, null, 2));
}

// আপলোড করা ফটোর মতো হুবহু Canvas Graphic জেনারেটর
async function generateCustomNewsCard(title, imageUrl) {
  const canvas = createCanvas(1000, 1000);
  const ctx = canvas.getContext('2d');

  // ১. মূল নিউজের ছবি (উপরের অংশে)
  try {
    if (imageUrl) {
      const mainImg = await loadImage(imageUrl);
      ctx.drawImage(mainImg, 0, 0, 1000, 580);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1000, 580);
    }
  } catch (e) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1000, 580);
  }

  // ২. লাল ব্যাকগ্রাউন্ড (নিউজ টাইটেল সেকশন)
  ctx.fillStyle = '#a3080c';
  ctx.fillRect(0, 580, 1000, 335);

  // ৩. নিউজ টাইটেল টেক্সট (সাদা কালার ও সেন্টার অ্যালাইনমেন্ট)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';

  const words = title.split(' ');
  let line = '';
  let y = 650;
  const maxWidth = 900;

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 500, y);
      line = words[n] + ' ';
      y += 50;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 500, y);

  // ৪. বাংলা তারিখ (ডানপাশে)
  const todayBn = new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(todayBn, 960, 860);

  // ৫. চ্যানলের নাম ও সোশ্যাল মিডিয়া বার (M,A TV Branding)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('M,A TV', 40, 895);

  ctx.font = '18px sans-serif';
  ctx.fillText('► www.matv.news   f  /matvbd   🔴 /matvbd', 200, 892);

  // ৬. নিচের স্পেশাল কাস্টম অ্যাডভারটাইজমেন্ট বার (Ads Banner Strip)
  const randomAd = FUNNY_ADS[Math.floor(Math.random() * FUNNY_ADS.length)];
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 915, 1000, 85);

  // অ্যাড টেক্সট
  ctx.fillStyle = '#d97706';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(randomAd.title, 40, 965);

  // অ্যাড ব্র্যান্ড বক্স
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(650, 925, 160, 65);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(randomAd.brand, 665, 962);

  // ওয়ারেন্টি টেক্সট
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(randomAd.warranty, 825, 960);

  return canvas.toBuffer('image/png');
}

// বন্দি ভাইদের মুক্তির কাস্টম বার্তা
function getAdvocacyMessage() {
  return `\n📢 <b>বিশেষ দাবি ও বার্তা:</b>\nঅন্যায়ভাবে বন্দি থাকা সকল নিরীহ মুসলিম ভাইদের অবিলম্বে নিঃশর্ত মুক্তি ও ন্যায়বিচারের জোর দাবি জানাচ্ছি।`;
}

// নিউজ চেক ও পোস্ট করার মূল প্রসেস
async function checkAndPostNews() {
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 নতুন সংবাদের সন্ধান করা হচ্ছে...`);

  for (const source of FEEDS) {
    try {
      const feed = await parser.parseURL(source.url);
      if (!feed.items || feed.items.length === 0) continue;

      for (const item of feed.items) {
        const newsLink = item.link;

        // আগে পোস্ট করা হয়ে থাকলে স্কিপ করবে
        if (postedNews.includes(newsLink)) continue;

        const title = item.title.trim();
        let snippet = item.contentSnippet || item.content || title;
        snippet = snippet.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
        if (snippet.length > 250) snippet = snippet.slice(0, 250) + '...';

        // সংবাদের আসল ছবি বা থাম্বনেইল ইউআরএল নেওয়ার চেষ্টা
        let mediaUrl = null;
        if (item.enclosure && item.enclosure.url) {
          mediaUrl = item.enclosure.url;
        } else if (item['media:content'] && item['media:content'].$.url) {
          mediaUrl = item['media:content'].$.url;
        }

        console.log(`🚀 নতুন খবর পাওয়া গেছে (${source.name}): ${title}`);

        // কাস্টম টেমপ্লেট অনুযায়ী ফটো ব্যানার জেনারেট
        const photoBuffer = await generateCustomNewsCard(title, mediaUrl);

        // টেলিগ্রাম পোস্ট টেক্সট
        const captionText = 
`📺 <b>M,A TV - LIVE NEWS BROADCAST</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📰 <b>${title}</b>

📝 <b>সংক্ষিপ্ত বিবরণ:</b>
${snippet}
${getAdvocacyMessage()}

📌 <b>উৎস:</b> ${source.name}
🔗 <a href="${newsLink}">মূল খবর বিস্তারিত পড়তে এখানে চাপুন</a>`;

        // টেলিগ্রাম গ্রুপে পাঠানো
        await bot.sendPhoto(CHAT_ID, photoBuffer, {
          caption: captionText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🌐 Read Full Article', url: newsLink }]]
          }
        });

        // রেকর্ড সেভ
        savePostedNews(newsLink);
        console.log('✅ টেলিগ্রাম গ্রুপে সফলভাবে সংবাদ পোস্ট করা হয়েছে!');

        // ১ মিনিট বিরতি দিয়ে পরবর্তী নিউজ থাকলে চেক করবে
        await new Promise(res => setTimeout(res, 60000));
      }
    } catch (err) {
      console.error(`❌ ${source.name} প্রসেস করতে সমস্যা:`, err.message);
    }
  }
}

// অনবরত চেক করার জন্য লাইভ লুপ
async function startContinuousLoop() {
  console.log("⚡ M,A TV News Bot সক্রিয় হয়েছে...");
  while (true) {
    await checkAndPostNews();
    // প্রতি ৩ মিনিট পর পর পুনরায় চেক করবে
    await new Promise(res => setTimeout(res, 180000));
  }
}

startContinuousLoop();
