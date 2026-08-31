const Parser = require('rss-parser');
const TelegramBot = require('node-telegram-bot-api');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const axios = require('axios');
const { translate } = require('@vitalets/google-translate-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ TELEGRAM_BOT_TOKEN অথবা TELEGRAM_CHAT_ID পাওয়া যায়নি!");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const FEEDS = [
{ name: 'আল জাজিরা (Al Jazeera)', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'বিবিসি ওয়ার্ল্ড (BBC)', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'টিআরটি ওয়ার্ল্ড (TRT)', url: 'https://www.trtworld.com/rss/news.xml' },
  { name: 'রয়টার্স (Reuters)', url: 'https://www.reutersagency.com/feed/?best-topics=world-news&post_type=best' },
  { name: 'ডয়চে ভেলে (DW)', url: 'https://rss.dw.com/rdf/rss-en-all' },
  { name: 'সিএনএন (CNN)', url: 'http://rss.cnn.com/rss/edition_world.rss' },
  { name: 'দ্য গার্ডিয়ান (The Guardian)', url: 'https://www.theguardian.com/world/rss' },
  { name: 'এনপিআর (NPR News)', url: 'https://feeds.npr.org/1001/rss.xml' }
];

const POSTED_NEWS_FILE = './posted_news.json';
const FUNNY_ADS_FILE = './funny_ads.txt';

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

// 📁 ফাইল থেকে মজার অ্যাড পড়ার ফাংশন
function getAdFromFile() {
  if (!fs.existsSync(FUNNY_ADS_FILE)) return null;

  try {
    const data = fs.readFileSync(FUNNY_ADS_FILE, 'utf8');
    const lines = data.split('\n').filter(line => line.trim().length > 0);

    if (lines.length === 0) return null;

    const randomLine = lines[Math.floor(Math.random() * lines.length)];
    const parts = randomLine.split('|').map(p => p.trim());

    if (parts.length >= 3) {
      return { title: parts[0], brand: parts[1], warranty: parts[2] };
    }
  } catch (err) {
    console.error('⚠️ ফাইল থেকে অ্যাড পড়তে সমস্যা হয়েছে:', err.message);
  }
  return null;
}

// 🤖 AI দিয়ে মজার অ্যাড বানানোর ফাংশন (ফাইল ফেল করলে কাজ করবে)
async function generateAdFromAI(newsTitle) {
  if (!genAI) return null;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `একটি ফানি বিজ্ঞাপনের জন্য JSON অবজেক্ট তৈরি করো। কেবল JSON উত্তর দাও:
    {
      "title": "ছোট ট্রল প্রোডাক্ট নাম (সর্বোচ্চ ৬-৭ শব্দ)",
      "brand": "ব্র্যান্ড নাম (১-২ শব্দ)",
      "warranty": "ওয়ারেন্টি মেসেজ (২-৪ শব্দ)"
    }
    সংবাদ শিরোনাম: "${newsTitle}"। কিন্তু বিজ্ঞাপনটি হবে সম্পূর্ণ ফালতু বা ভুয়া পণ্য নিয়ে।`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const cleanJson = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.log('⚠️ AI অ্যাড জেনারেট ব্যর্থ হয়েছে।');
    return null;
  }
}

// 🔄 ফাইল ও AI-এর সমন্বিত লজিক
async function getFunnyAd(newsTitle) {
  // ১. প্রথমে ফাইল থেকে নেওয়ার চেষ্টা করবে
  const fileAd = getAdFromFile();
  if (fileAd) {
    console.log('📄 [funny_ads.txt] ফাইল থেকে বিজ্ঞাপন নেওয়া হয়েছে।');
    return fileAd;
  }

  // ২. ফাইলে না থাকলে AI তৈরি করবে
  const aiAd = await generateAdFromAI(newsTitle);
  if (aiAd) {
    console.log('🤖 [Gemini AI] দিয়ে বিজ্ঞাপন তৈরি করা হয়েছে।');
    return aiAd;
  }

  // ৩. শেষ ব্যাকআপ
  return { title: 'আওয়ামী মোবাইল - সেরা দামে ফালতু ফোন', brand: 'মি আওয়ামী', warranty: '১৭ বছরের গ্যারান্টি' };
}

async function translateToBangla(text) {
  try {
    const res = await translate(text, { to: 'bn' });
    return res.text;
  } catch (err) {
    return text;
  }
}

async function extractNewsImage(item) {
  let url = null;
  try {
    if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) url = item.mediaContent.$.url;
    else if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) url = item.mediaThumbnail.$.url;
    else if (item.enclosure && item.enclosure.url) url = item.enclosure.url;
    else if (item.mediaGroup && item.mediaGroup['media:content']) {
      const mediaList = item.mediaGroup['media:content'];
      if (Array.isArray(mediaList) && mediaList[0].$.url) url = mediaList[0].$.url;
      else if (mediaList.$ && mediaList.$.url) url = mediaList.$.url;
    }

    if (!url) {
      const content = item.content || item['content:encoded'] || item.description || '';
      const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) url = imgMatch[1];
    }

    if (!url && item.link) {
      const response = await axios.get(item.link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 4000
      });
      const ogMatch = response.data.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      response.data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (ogMatch && ogMatch[1]) url = ogMatch[1];
    }

    if (url && url.includes('ichef.bbci.co.uk')) {
      url = url.replace(/\/standard\/\d+\//, '/standard/1024/');
    }
  } catch (err) {
    console.log('⚠️ ছবি এক্সট্রাকশনে সমস্যা।');
  }
  return url;
}

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
    return null;
  }
}

async function generateBanglaNewsCard(titleBn, imageUrl, sourceName, funnyAd) {
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

  // লাল ব্যানার
  ctx.fillStyle = '#a3080c';
  ctx.fillRect(0, 580, 1000, 335);

  // টাইটেল
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

  // তারিখ
  const todayBn = new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px "Noto Sans Bengali", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(todayBn, 960, 860);

  // ব্রান্ডিং
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px "Noto Sans Bengali", sans-serif';
  ctx.fillText('M,A TV', 40, 895);

  ctx.font = '18px "Noto Sans Bengali", sans-serif';
  ctx.fillText('► www.matv.news   f /matvbd   🔴 /matvbd', 200, 892);

  // অ্যাড স্ট্রিপ
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 915, 1000, 85);

  ctx.fillStyle = '#d97706';
  ctx.font = 'bold 22px "Noto Sans Bengali", sans-serif';
  ctx.fillText(funnyAd.title, 40, 965);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(630, 925, 160, 65);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "Noto Sans Bengali", sans-serif';
  ctx.fillText(funnyAd.brand, 645, 962);

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px "Noto Sans Bengali", sans-serif';
  ctx.fillText(funnyAd.warranty, 805, 960);

  return canvas.toBuffer('image/png');
}

async function checkAndPostNews() {
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 ১ ঘণ্টার সংবাদ প্রসেস হচ্ছে...`);

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

        const imageUrl = await extractNewsImage(item);
        
        // ফাইল বা AI থেকে মজার অ্যাড সংগ্রহ
        const funnyAd = await getFunnyAd(titleBn);

        const photoBuffer = await generateBanglaNewsCard(titleBn, imageUrl, source.name, funnyAd);

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

        try {
          await bot.sendPhoto(CHAT_ID, photoBuffer, {
            caption: captionText,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🌐 মূল খবরটি সরাসরি পড়ুন', url: newsLink }]]
            }
          });
          console.log('✅ ফটোসহ পোস্ট সম্পন্ন!');
          savePostedNews(newsLink);
          return; // ১ ঘণ্টার মধ্যে ১টি নিউজ পোস্ট করার লজিক
        } catch (postErr) {
          console.error(`❌ পোস্ট এরর: ${postErr.message}`);
        }
      }
    } catch (err) {
      console.error(`❌ ${source.name} প্রসেসিং এরর:`, err.message);
    }
  }
}

async function startContinuousLoop() {
  console.log("⚡ M,A TV Bot অ্যাক্টিভ হয়েছে (১ ঘণ্টার টাইম ফ্রেমে চলবে)...");
  while (true) {
    await checkAndPostNews();
    await new Promise(res => setTimeout(res, 3600000));
  }
}

startContinuousLoop();
