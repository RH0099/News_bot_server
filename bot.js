const Parser = require('rss-parser');
const TelegramBot = require('node-telegram-bot-api');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const { translate } = require('@vitalets/google-translate-api');

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
    ]
  }
});

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ TELEGRAM_BOT_TOKEN অথবা TELEGRAM_CHAT_ID পাওয়া যায়নি!");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

const FEEDS = [
  { name: 'আল জাজিরা (Al Jazeera)', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'বিবিসি ওয়ার্ল্ড (BBC)', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'টিআরটি ওয়ার্ল্ড (TRT)', url: 'https://www.trtworld.com/rss/news' }
];

// বর্ধিত ট্রল বিজ্ঞাপনের তালিকা
const FUNNY_ADS = [
  { title: 'আওয়ামী মোবাইল - সেরা দামে ফালতু ফোন', brand: 'মি আওয়ামী', warranty: '১৭ বছরের গ্যারান্টি' },
  { title: 'ভণ্ড চার্জার - ১০০% স্লো চার্জের গ্যারান্টি', brand: 'ভণ্ড', warranty: 'গ্যারান্টি নাই' },
  { title: 'ফাঁকি ফ্যান - হাওয়া ছাড়া শুধুই বিকট শব্দ', brand: 'ফাঁকি', warranty: '৫০ বছরের ওয়ারেন্টি' },
  { title: 'ভুয়া পাওয়ার ব্যাংক - ২ পার্সেন্টে চার্জ শেষ', brand: 'ফেক পাওয়ার', warranty: 'জিরো ওয়ারেন্টি' },
  { title: 'পলাইম সিম - নেটওয়ার্ক ছাড়া ফালতু স্পিড', brand: 'পলাইম', warranty: 'লাইফটাইম ধোঁকা' },
  { title: 'ফাঁকা বাল্ব - আলো দেবে না শুধুই বিল তুলবে', brand: 'ফাঁকা', warranty: '১০০ বছরের ওয়ারেন্টি' },
  { title: 'ঠকবাজ এসি - গরম বাতাসে ঘর ভরিয়ে দেয়', brand: 'ঠকবাজ', warranty: 'কোনো গ্যারান্টি নেই' }
];

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

async function translateToBangla(text) {
  try {
    const res = await translate(text, { to: 'bn' });
    return res.text;
  } catch (err) {
    return text;
  }
}

// RSS Feed থেকে সংবাদের আসল ছবি বের করার ফাংশন
function extractNewsImage(item) {
  if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
    return item.mediaContent.$.url;
  }
  if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
    return item.mediaThumbnail.$.url;
  }
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  
  // HTML Content থেকে img tag খোঁজা
  const content = item.content || item['content:encoded'] || item.description || '';
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }
  return null;
}

// কাস্টম ক্যানভাস ইমেজ জেনারেটর
async function generateBanglaNewsCard(titleBn, imageUrl, sourceName) {
  const canvas = createCanvas(1000, 1000);
  const ctx = canvas.getContext('2d');

  // ১. সংবাদের ছবি বসানো (ছবি না থাকলে প্রফেশনাল ব্যাকগ্রাউন্ড)
  let imgLoaded = false;
  if (imageUrl) {
    try {
      const mainImg = await loadImage(imageUrl);
      ctx.drawImage(mainImg, 0, 0, 1000, 580);
      imgLoaded = true;
    } catch (e) {
      imgLoaded = false;
    }
  }

  if (!imgLoaded) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1000, 580);

    ctx.fillStyle = '#00f2ff';
    ctx.font = 'bold 45px "Noto Sans Bengali", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('M,A TV - ব্রেকিং নিউজ', 500, 270);

    ctx.fillStyle = '#ffffff';
    ctx.font = '28px "Noto Sans Bengali", sans-serif';
    ctx.fillText(`উৎস: ${sourceName}`, 500, 330);
  }

  // ২. লাল ব্যানার (টাইটেল অংশ)
  ctx.fillStyle = '#a3080c';
  ctx.fillRect(0, 580, 1000, 335);

  // ৩. বাংলা নিউজ টাইটেল
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Noto Sans Bengali", sans-serif';
  ctx.textAlign = 'center';

  const words = titleBn.split(' ');
  let line = '';
  let y = 650;
  const maxWidth = 900;

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 500, y);
      line = words[n] + ' ';
      y += 52;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 500, y);

  // ৪. বাংলা তারিখ
  const todayBn = new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px "Noto Sans Bengali", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(todayBn, 960, 860);

  // ৫. M,A TV ব্রান্ডিং
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px "Noto Sans Bengali", sans-serif';
  ctx.fillText('M,A TV', 40, 895);

  ctx.font = '18px "Noto Sans Bengali", sans-serif';
  ctx.fillText('► www.matv.news   f /matvbd   🔴 /matvbd', 200, 892);

  // ৬. র্যান্ডম মজার ট্রল অ্যাডভারটাইজমেন্ট
  const randomAd = FUNNY_ADS[Math.floor(Math.random() * FUNNY_ADS.length)];
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 915, 1000, 85);

  ctx.fillStyle = '#d97706';
  ctx.font = 'bold 22px "Noto Sans Bengali", sans-serif';
  ctx.fillText(randomAd.title, 40, 965);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(630, 925, 160, 65);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "Noto Sans Bengali", sans-serif';
  ctx.fillText(randomAd.brand, 645, 962);

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px "Noto Sans Bengali", sans-serif';
  ctx.fillText(randomAd.warranty, 805, 960);

  return canvas.toBuffer('image/png');
}

async function checkAndPostNews() {
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 সংবাদ খোঁজা হচ্ছে...`);

  for (const source of FEEDS) {
    try {
      const feed = await parser.parseURL(source.url);
      if (!feed.items || feed.items.length === 0) continue;

      for (const item of feed.items) {
        const newsLink = item.link;

        if (postedNews.includes(newsLink)) continue;

        const rawTitle = item.title.trim();
        let rawSnippet = item.contentSnippet || item.content || rawTitle;
        rawSnippet = rawSnippet.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
        if (rawSnippet.length > 250) rawSnippet = rawSnippet.slice(0, 250) + '...';

        const titleBn = await translateToBangla(rawTitle);
        const snippetBn = await translateToBangla(rawSnippet);

        // সংবাদের সংশ্লিষ্ট ছবি সংগ্রহ
        const mediaUrl = extractNewsImage(item);

        const photoBuffer = await generateBanglaNewsCard(titleBn, mediaUrl, source.name);

        const captionText = 
`📺 <b>M,A TV - সরাসরি সংবাদ সম্প্রচার</b>
━━━━━━━━━━━━━━━━━━━━━━━━━
📰 <b>${titleBn}</b>

📝 <b>সংক্ষিপ্ত বিবরণ:</b>
${snippetBn}

📢 <b>বিশেষ দাবি ও বার্তা:</b>
অন্যায়ভাবে বন্দি থাকা সকল নিরীহ মুসলিম ভাইদের অবিলম্বে নিঃশর্ত মুক্তি ও ন্যায়বিচারের জোর দাবি জানাচ্ছি।

📌 <b>উৎস:</b> ${source.name}
🔗 <a href="${newsLink}">মূল খবর বিস্তারিত পড়তে এখানে চাপুন</a>`;

        await bot.sendPhoto(CHAT_ID, photoBuffer, {
          caption: captionText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🌐 মূল খবরটি সরাসরি পড়ুন', url: newsLink }]]
          }
        });

        savePostedNews(newsLink);
        console.log('✅ বাংলায় সংবাদ সফলভাবে পোস্ট করা হয়েছে!');

        await new Promise(res => setTimeout(res, 60000));
      }
    } catch (err) {
      console.error(`❌ ${source.name} প্রসেসিং ত্রুটি:`, err.message);
    }
  }
}

async function startContinuousLoop() {
  console.log("⚡ M,A TV Bangla News Bot সক্রিয় হয়েছে...");
  while (true) {
    await checkAndPostNews();
    await new Promise(res => setTimeout(res, 180000));
  }
}

startContinuousLoop();
