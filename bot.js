const Parser = require('rss-parser');
const TelegramBot = require('node-telegram-bot-api');
const { createCanvas } = require('canvas');

const parser = new Parser();

// GitHub Secrets থেকে এনভায়রনমেন্ট ভেরিয়েবল নেওয়া
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(BOT_TOKEN);

// বিশ্বখ্যাত সংবাদ মাধ্যমের RSS ফিড
const RSS_FEEDS = [
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'CNN World', url: 'http://rss.cnn.com/rss/edition_world.rss' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' }
];

// সুন্দর ফটো কার্ড / নিউজ ব্যানার ডিজাইনের ফাংশন (Canvas/Graphics)
function generateNewsCard(title, sourceName) {
  const canvas = createCanvas(1200, 675); // 16:9 HD রেশিও
  const ctx = canvas.getContext('2d');

  // ১. ডার্ক লাক্সারি ব্যাকগ্রাউন্ড
  const bgGradient = ctx.createLinearGradient(0, 0, 1200, 675);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, 1200, 675);

  // ২. সাইড ব্র্যান্ডিং / লোগো স্ট্রিপ
  ctx.fillStyle = '#ef4444'; // লাল অ্যাকসেন্ট কালার
  ctx.fillRect(50, 60, 12, 555);

  // ৩. ওয়াটারমার্ক / লোগো প্লেসমেন্ট
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('🌐 GLOBAL TELECOM NEWS NETWORK', 90, 100);

  // ৪. নিউজের উৎস (Source Tag)
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`SOURCE: ${sourceName.toUpperCase()}`, 90, 140);

  // ৫. ডিভাইডার লাইন
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, 165);
  ctx.lineTo(1100, 165);
  ctx.stroke();

  // ৬. নিউজের শিরোনাম (Word Wrap সহ)
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 42px sans-serif';

  const words = title.split(' ');
  let line = '';
  let y = 240;
  const maxWidth = 1000;
  const lineHeight = 55;

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 90, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 90, y);

  // ৭. ফুটার ডিজাইন
  const today = new Date().toLocaleDateString('bn-BD', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  ctx.fillStyle = '#64748b';
  ctx.font = '20px sans-serif';
  ctx.fillText(`📅 ${today}  |  🤖 Automated Telecom Reporter`, 90, 590);

  return canvas.toBuffer('image/png');
}

// মূল এক্সিকিউশন ফাংশন
async function fetchAndPostNews() {
  try {
    console.log('সংবাদ সংগ্রহ শুরু হচ্ছে...');
    
    // এলোমেলোভাবে যেকোনো একটি ফিড নির্বাচন
    const selectedFeed = RSS_FEEDS[Math.floor(Math.random() * RSS_FEEDS.length)];
    const feed = await parser.parseURL(selectedFeed.url);
    
    // সাম্প্রতিক খবর নির্বাচন
    const item = feed.items[0];

    if (!item) {
      console.log('কোনো সংবাদ পাওয়া যায়নি।');
      return;
    }

    const title = item.title;
    const link = item.link;
    const snippet = item.contentSnippet ? item.contentSnippet.slice(0, 250) : title;

    console.log(`সংবাদ পাওয়া গেছে: ${title}`);

    // ফটো নিউজ কার্ড তৈরি
    const imageBuffer = generateNewsCard(title, selectedFeed.name);

    // টেলিগ্রাম পোস্ট ক্যাপশন
    const captionText = 
`⚡ <b>${title}</b>

📝 <b>সংক্ষিপ্ত বিবরণ:</b>
${snippet}...

🔗 <b>বিস্তারিত পড়ুন:</b> <a href="${link}">এখানে ক্লিক করুন</a>

---
📡 <i>প্রতি ২ ঘণ্টা পর পর স্বয়ংক্রিয় সংবাদ আপডেট।</i>`;

    // টেলিগ্রামে ছবি ও ক্যাপশন পাঠানো
    await bot.sendPhoto(CHAT_ID, imageBuffer, {
      caption: captionText,
      parse_mode: 'HTML'
    });

    console.log('টেলিগ্রাম গ্রুপে সফলভাবে পোস্ট করা হয়েছে!');

  } catch (error) {
    console.error('ত্রুটি ঘটেছে:', error.message);
    process.exit(1);
  }
}

fetchAndPostNews();
