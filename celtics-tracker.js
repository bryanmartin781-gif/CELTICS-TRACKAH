const https = require('https');
const nodemailer = require('nodemailer');

// Configuration
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;
const RECIPIENT_EMAIL = 'bmartin@aypa.com';

// Fetch data from URL
function fetchData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Send email
async function sendEmail(subject, htmlContent) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: GMAIL_USER,
      to: RECIPIENT_EMAIL,
      subject: subject,
      html: htmlContent,
    });
    console.log(`Email sent: ${subject}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Parse ESPN Celtics data
async function getCelticsData() {
  try {
    const url = 'https://www.espn.com/nba/team/schedule/_/name/bos';
    const html = await fetchData(url);

    // Extract game data from HTML (basic parsing)
    const games = [];
    
    // Look for game rows in the HTML
    const gamePattern = /data-date="(\d{8})"/g;
    const dateMatches = [...html.matchAll(gamePattern)];

    if (dateMatches.length === 0) {
      console.log('No games found in ESPN data');
      return { recentGame: null, upcomingGame: null, news: [] };
    }

    // Get last game and next game
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Parse the most recent game info from HTML snippets
    const recentGameMatch = html.match(/Boston Celtics.*?(\d+)-(\d+).*?vs|@/s);
    const upcomingMatch = html.match(/vs|@.*?(\w+).*?(\d{1,2}):(\d{2})/s);

    // Get injury news
    const newsPattern = /<p class="news">(.*?)<\/p>/g;
    const newsMatches = [...html.matchAll(newsPattern)];
    const news = newsMatches.map(m => m[1]).slice(0, 3);

    return {
      recentGame: recentGameMatch ? { score: `${recentGameMatch[1]}-${recentGameMatch[2]}` } : null,
      upcomingGame: upcomingMatch ? { opponent: upcomingMatch[1], time: `${upcomingMatch[2]}:${upcomingMatch[3]}` } : null,
      news: news,
    };
  } catch (error) {
    console.error('Error fetching Celtics data:', error);
    return { recentGame: null, upcomingGame: null, news: [] };
  }
}

// Main function
async function main() {
  console.log('Starting Celtics tracker...');
  
  const data = await getCelticsData();

  let htmlContent = `
    <h2>🏀 Boston Celtics Daily Update</h2>
    <p>${new Date().toLocaleDateString()}</p>
  `;

  if (data.recentGame) {
    htmlContent += `
      <h3>Latest Game Result</h3>
      <p>Score: ${data.recentGame.score}</p>
    `;
  }

  if (data.upcomingGame) {
    htmlContent += `
      <h3>Upcoming Game</h3>
      <p>Opponent: ${data.upcomingGame.opponent}</p>
      <p>Time: ${data.upcomingGame.time}</p>
    `;
  }

  if (data.news.length > 0) {
    htmlContent += `
      <h3>Team News</h3>
      <ul>${data.news.map(n => `<li>${n}</li>`).join('')}</ul>
    `;
  }

  await sendEmail('🏀 Celtics Daily Update', htmlContent);
}

main().catch(console.error);
