const Parser = require('rss-parser');
const TelegramBot = require('node-telegram-bot-api');
const { createCanvas } = require('canvas');
const fs = require('fs');

const parser = new Parser();

// GitHub Secrets থেকে এনভায়রনমেন্ট ভেরিয়েবল নেওয়া
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ ত্রুটি: TELEGRAM_BOT_TOKEN অথবা TELEGRAM_CHAT_ID পাওয়া যায়নি!");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN);

// বহুভাষিক ও আন্তর্জাতিক বিশ্বসংবাদ আরএসএস ফিডস
const FEEDS = [
  { name: 'BBC News', tag: 'WORLD', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', color: '#dc2626' },
  { name: 'CNN Global', tag: 'BREAKING', url: 'http://rss.cnn.com/rss/edition_world.rss', color: '#ea580c' },
  { name: 'Al Jazeera', tag: 'REPORT', url: 'https://www.aljazeera.com/xml/rss/all.xml', color: '#d97706' },
  { name: 'TechCrunch', tag: 'TECH NEWS', url: 'https://techcrunch.com/feed/', color: '#059669' }
];

// ১. হাই-কোয়ালিটি ব্যানার ছবি তৈরির ফাংশন (Graphic Designer Engine)
function drawAdvancedCard(title, source) {
  const canvas = createCanvas(1200, 675);
  const ctx = canvas.getContext('2d');

  // ব্যাকগ্রাউন্ড গ্রেডিয়েন্ট
  const bg = ctx.createLinearGradient(0, 0, 1200, 675);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1e293b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 675);

  // কাস্টম সোর্স কালার বার
  ctx.fillStyle = source.color;
  ctx.fillRect(40, 50, 14, 575);

  // হেডার অ্যান্ড ক্যাটাগরি ব্যাজ
  ctx.fillStyle = source.color;
  ctx.fillRect(80, 55, 140, 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(source.tag, 95, 78);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`|  ${source.name.toUpperCase()}`, 235, 80);

  // ডিভাইডার লাইন
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 110);
  ctx.lineTo(1120, 110);
  ctx.stroke();

  // নিউজের টাইটেল (অটোমেটিক ওয়ার্ড র‍্যাপ)
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 44px sans-serif';

  const words = title.split(' ');
  let line = '';
  let y = 190;
  const maxWidth = 1000;
  const lineHeight = 60;

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 80, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 80, y);

  // ফুটপ্রিন্ট অ্যান্ড ডেট
  const dateStr = new Date().toLocaleString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'full',
    timeStyle: 'short'
  });

  ctx.fillStyle = '#64748b';
  ctx.font = '20px sans-serif';
  ctx.fillText(`🕒 ${dateStr}  •  Telecom News Live`, 80, 600);

  return canvas.toBuffer('image/png');
}

// ২. মূল অটোমেশন প্রসেস
async function startNewsBot() {
  try {
    console.log('🔄 সর্বশেষ নিউজ চেক করা হচ্ছে...');

    // র‍্যান্ডম যেকোনো একটি ফিড নির্বাচন
    const selectedSource = FEEDS[Math.floor(Math.random() * FEEDS.length)];
    const feed = await parser.parseURL(selectedSource.url);

    if (!feed.items || feed.items.length === 0) {
      console.log('⚠️ কোনো নতুন নিউজ পাওয়া যায়নি।');
      return;
    }

    const latestNews = feed.items[0];
    const newsTitle = latestNews.title.trim();
    const newsLink = latestNews.link;
    let snippet = latestNews.contentSnippet || latestNews.content || newsTitle;
    
    // HTML ট্যাগ এবং অতিরিক্ত স্পেস দূর করা
    snippet = snippet.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
    if (snippet.length > 250) snippet = snippet.slice(0, 250) + '...';

    console.log(`📌 সংগৃহীত নিউজ: "${newsTitle}" (${selectedSource.name})`);

    // ব্যানার তৈরি
    const imageBuffer = drawAdvancedCard(newsTitle, selectedSource);

    // টেলিগ্রাম পোস্ট ফরম্যাট
    const captionText = 
`🌐 <b>${newsTitle}</b>

📝 <b>সংক্ষিপ্ত আপডেট:</b>
${snippet}

📍 <b>উৎস:</b> ${selectedSource.name}
⏱ <i>প্রতি ২ ঘণ্টা পর পর স্বয়ংক্রিয় সংবাদ বুলেটিন।</i>`;

    // টেলিগ্রামে ইনলাইন বাটনসহ ফটো পাঠানো
    await bot.sendPhoto(CHAT_ID, imageBuffer, {
      caption: captionText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔗 মূল খবরটি পড়ুন', url: newsLink }
          ]
        ]
      }
    });

    console.log('✅ টেলিগ্রাম গ্রুপে সফলভাবে পোস্ট করা হয়েছে!');

  } catch (err) {
    console.error('❌ প্রসেস চলাকালীন ত্রুটি:', err.message);
    process.exit(1);
  }
}

startNewsBot();
