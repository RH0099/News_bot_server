const Parser = require('rss-parser');
const TelegramBot = require('node-telegram-bot-api');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const axios = require('axios');
const { translate } = require('@vitalets/google-translate-api');

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:group', 'mediaGroup']
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

// আনলিমাইটেড ট্রল এডভারটাইজমেন্ট কালেকশন
const FUNNY_ADS = [
  { title: 'আওয়ামী মোবাইল - সেরা দামে ফালতু ফোন', brand: 'মি আওয়ামী', warranty: '১৭ বছরের গ্যারান্টি' },
  { title: 'ভণ্ড চার্জার - ১০০% স্লো চার্জের গ্যারান্টি', brand: 'ভণ্ড', warranty: 'গ্যারান্টি নাই' },
  { title: 'ফাঁকি ফ্যান - হাওয়া ছাড়া শুধুই বিকট শব্দ', brand: 'ফাঁকি', warranty: '৫০ বছরের ওয়ারেন্টি' },
  { title: 'ভুয়া পাওয়ার ব্যাংক - ২ পার্সেন্টে চার্জ শেষ', brand: 'ফেক পাওয়ার', warranty: 'জিরো ওয়ারেন্টি' },
  { title: 'পলাইম সিম - নেটওয়ার্ক ছাড়া ফালতু স্পিড', brand: 'পলাইম', warranty: 'লাইফটাইম ধোঁকা' },
  { title: 'ফাঁকা বাল্ব - আলো দেবে না শুধুই বিল তুলবে', brand: 'ফাঁকা', warranty: '১০০ বছরের ওয়ারেন্টি' },
  { title: 'ঠকবাজ এসি - গরম বাতাসে ঘর ভরিয়ে দেয়', brand: 'ঠকবাজ', warranty: 'কোনো গ্যারান্টি নেই' },
  { title: 'ধান্দাবাজ বাইক - তেল খাবে বেশি চলবে কম', brand: 'ধান্দা', warranty: '৫ মিনিটের ওয়ারেন্টি' }
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

// ১. RSS Feed এবং Web Scraping থেকে ছবির URL খুঁজে বের করার অ্যাডভান্সড ফাংশন
async function extractNewsImage(item) {
  try {
    // Media content check
    if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) return item.mediaContent.$.url;
    if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) return item.mediaThumbnail.$.url;
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;

    // Media Group (Al Jazeera Specific)
    if (item.mediaGroup && item.mediaGroup['media:content']) {
      const mediaList = item.mediaGroup['media:content'];
      if (Array.isArray(mediaList) && mediaList[0].$.url) return mediaList[0].$.url;
      if (mediaList.$ && mediaList.$.url) return mediaList.$.url;
    }

    // HTML Content scraping (Img Tag)
    const content = item.content || item['content:encoded'] || item.description || '';
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) return imgMatch[1];

    // ওয়েবসাইট থেকে ওপেন গ্রাফ (og:image) ফালতু ব্লকিং ছাড়া নিয়ে আসা
    if (item.link) {
      const response = await axios.get(item.link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 5000
      });
      const ogMatch = response.data.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      response.data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (ogMatch && ogMatch[1]) return ogMatch[1];
    }
  } catch (err) {
    console.log('⚠️ ছবি সরাসরি ওয়েবসাইট থেকে নিতে সমস্যা হয়েছে।');
  }
  return null;
}

// ২. ছবির URL দিয়ে Buffer ডাউনলোড ফাংশন (Hotlink Protection bypass করার জন্য)
async function fetchImageBuffer(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    return Buffer.from(response.data, 'binary');
  } catch (err) {
    console.error('❌ ইমেজ ডাউনলোড ত্রুটি:', err.message);
    return null;
  }
}

// ৩. ক্যানভাস কার্ড জেনারেটর
async function generateBanglaNewsCard(titleBn, imageUrl, sourceName) {
  const canvas = createCanvas(1000, 1000);
  const ctx = canvas.getContext('2d');

  let imgLoaded = false;

  if (imageUrl) {
    const imgBuffer = await fetchImageBuffer(imageUrl);
    if (imgBuffer) {
      try {
        const mainImg = await loadImage(imgBuffer);
        ctx.drawImage(mainImg, 0, 0, 1000, 580);
        imgLoaded = true;
      } catch (e) {
        imgLoaded = false;
      }
    }
  }

  // যদি কোনো কারণে ছবি একেবারেই লোড না হতে পারে
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

  // লাল ব্যানার (টাইটেল অংশ)
  ctx.fillStyle = '#a3080c';
  ctx.fillRect(0, 580, 1000, 335);

  // বাংলা নিউজ টাইটেল
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

  // বাংলা তারিখ
  const todayBn = new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px "Noto Sans Bengali", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(todayBn, 960, 860);

  // M,A TV ব্রান্ডিং
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px "Noto Sans Bengali", sans-serif';
  ctx.fillText('M,A TV', 40, 895);

  ctx.font = '18px "Noto Sans Bengali", sans-serif';
  ctx.fillText('► www.matv.news   f /matvbd   🔴 /matvbd', 200, 892);

  // ডাইনামিক ফানি অ্যাড
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
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 নতুন সংবাদের সন্ধান চলছে...`);

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

        // অ্যাডভান্সড ইমেজ এক্সট্রাকশন
        const imageUrl = await extractNewsImage(item);
        console.log(`🖼 ছবির URL: ${imageUrl || 'ছবি পাওয়া যায়নি'}`);

        const photoBuffer = await generateBanglaNewsCard(titleBn, imageUrl, source.name);

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
        console.log('✅ ফটোসহ বাংলায় পোস্ট সম্পন্ন!');

        await new Promise(res => setTimeout(res, 60000));
      }
    } catch (err) {
      console.error(`❌ ${source.name} প্রসেসিং ত্রুটি:`, err.message);
    }
  }
}

async function startContinuousLoop() {
  console.log("⚡ M,A TV Bot অ্যাক্টিভ হয়েছে...");
  while (true) {
    await checkAndPostNews();
    await new Promise(res => setTimeout(res, 180000));
  }
}

startContinuousLoop();
