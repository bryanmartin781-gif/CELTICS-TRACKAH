const https = require('https');
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;
const RECIPIENT_EMAIL = 'bmartin@aypa.com';

// Fetch data from URL with timeout
function fetchData(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fetch timeout')), timeout);
    
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        resolve(data);
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
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
    console.log(`✓ Email sent: ${subject}`);
  } catch (error) {
    console.error('✗ Error sending email:', error.message);
  }
}

// Fetch Celtics schedule from NBA.com
async function getCelticsGames() {
  try {
    console.log('Fetching NBA data...');
    const nbaUrl = 'https://stats.nba.com/stats/leaguegamefinder?TeamID=1610612738&Season=2025&SeasonType=Playoffs';
    const nbaData = await fetchData(nbaUrl, 8000);
    const parsed = JSON.parse(nbaData);
    
    if (!parsed.resultSets || !parsed.resultSets[0] || !parsed.resultSets[0].rowSet) {
      console.log('No games found in NBA data');
      return { lastGame: null, nextGame: null };
    }

    const games = parsed.resultSets[0].rowSet;
    games.sort((a, b) => new Date(b[3]) - new Date(a[3]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let lastGame = null;
    let nextGame = null;

    for (let game of games) {
      const gameDate = new Date(game[3]);
      gameDate.setHours(0, 0, 0, 0);

      if (gameDate < today && !lastGame) {
        lastGame = {
          date: game[3],
          opponent: game[4],
          celticsPoints: game[21],
          opponentPoints: game[22],
          homeAway: game[5] === '@' ? 'Away' : 'Home',
          wl: game[6],
        };
      } else if (gameDate >= today && !nextGame) {
        nextGame = {
          date: game[3],
          opponent: game[4],
          homeAway: game[5] === '@' ? 'Away' : 'Home',
        };
      }

      if (lastGame && nextGame) break;
    }

    return { lastGame, nextGame };
  } catch (error) {
    console.error('Error fetching NBA data:', error.message);
    return { lastGame: null, nextGame: null };
  }
}

// Build HTML email
function buildEmailHTML(lastGame, nextGame) {
  let html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #007935;">🏀 Boston Celtics Daily Update</h2>
      <p style="color: #666; font-size: 12px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
  `;

  if (lastGame) {
    const gameDate = new Date(lastGame.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    html += `
      <div style="border: 2px solid #007935; padding: 15px; margin: 15px 0; border-radius: 8px; background: #f5f5f5;">
        <h3 style="color: #007935; margin-top: 0;">📊 Most Recent Game</h3>
        <p><strong>Date:</strong> ${gameDate}</p>
        <p style="font-size: 18px; font-weight: bold; color: ${lastGame.wl === 'W' ? '#007935' : '#d32f2f'};">
          Celtics ${lastGame.celticsPoints} - ${lastGame.opponent} ${lastGame.opponentPoints} 
          <span style="font-size: 16px; margin-left: 10px;">${lastGame.wl === 'W' ? '✓ WIN' : '✗ LOSS'}</span>
        </p>
        <p><strong>Location:</strong> ${lastGame.homeAway}</p>
      </div>
    `;
  } else {
    html += `<p style="color: #666;">No completed games found yet.</p>`;
  }

  if (nextGame) {
    const gameDate = new Date(nextGame.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const gameTime = new Date(nextGame.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    html += `
      <div style="border: 2px solid #1f51ba; padding: 15px; margin: 15px 0; border-radius: 8px; background: #f0f4ff;">
        <h3 style="color: #1f51ba; margin-top: 0;">⏰ Next Game</h3>
        <p><strong>Opponent:</strong> ${nextGame.opponent}</p>
        <p><strong>Date & Time:</strong> ${gameDate} at ${gameTime}</p>
        <p><strong>Location:</strong> ${nextGame.homeAway}</p>
      </div>
    `;
  } else {
    html += `<p style="color: #666;">No upcoming games scheduled.</p>`;
  }

  html += `
    <p style="color: #999; font-size: 11px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
      Celtics Tracker | ${new Date().toLocaleTimeString()}
    </p>
    </div>
  `;

  return html;
}

// Main function
async function main() {
  console.log('🏀 Starting Celtics Daily Tracker...');
  console.log('Current time (PT):', new Date().toLocaleTimeString());

  const { lastGame, nextGame } = await getCelticsGames();

  if (!lastGame && !nextGame) {
    console.log('⚠ No games found');
    return;
  }

  const htmlContent = buildEmailHTML(lastGame, nextGame);
  await sendEmail('🏀 Boston Celtics Daily Update', htmlContent);
  console.log('✓ Done!');
}

main().catch(console.error);
