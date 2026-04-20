const https = require('https');
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;
const RECIPIENT_EMAIL = 'bmartin@aypa.com';

// Simple HTTPS fetch with timeout
function fetchData(url, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeout);

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
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
    auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
  });

  try {
    await transporter.sendMail({
      from: GMAIL_USER,
      to: RECIPIENT_EMAIL,
      subject: subject,
      html: htmlContent,
    });
    console.log('✓ Email sent');
  } catch (error) {
    console.error('✗ Email failed:', error.message);
  }
}

// Fetch Celtics games from ESPN
async function getCelticsGames() {
  try {
    console.log('Fetching Celtics schedule...');
    const url = 'https://www.espn.com/nba/team/schedule/_/name/bos';
    const html = await fetchData(url);

    // Simple regex patterns to extract game info
    const gameRows = html.match(/<tr[^>]*data-date[^>]*>[\s\S]*?<\/tr>/g) || [];
    console.log(`Found ${gameRows.length} game rows`);

    let lastGame = null;
    let nextGame = null;
    const today = new Date();

    for (let row of gameRows) {
      // Extract date
      const dateMatch = row.match(/data-date="(\d{4})(\d{2})(\d{2})"/);
      if (!dateMatch) continue;

      const gameDate = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
      
      // Extract opponent (look for team name patterns)
      const opponentMatch = row.match(/<span[^>]*>([A-Z][a-z\s]+)<\/span>/);
      const opponent = opponentMatch ? opponentMatch[1].trim() : 'TBD';

      // Extract score (if game is completed)
      const scoreMatch = row.match(/(\d+)<\/span>\s*-\s*<span[^>]*>(\d+)/);
      const wlMatch = row.match(/<span[^>]*class="[^"]*status[^"]*"[^>]*>(W|L)<\/span>/i);

      // Determine if home or away
      const homeAwayMatch = row.match(/(vs|@)\s/i);
      const homeAway = homeAwayMatch ? (homeAwayMatch[1].toLowerCase() === 'vs' ? 'Home' : 'Away') : 'TBD';

      // Check if game is in past or future
      if (gameDate < today && !lastGame && scoreMatch && wlMatch) {
        lastGame = {
          date: gameDate.toLocaleDateString(),
          opponent: opponent,
          celticsPoints: parseInt(scoreMatch[1]),
          opponentPoints: parseInt(scoreMatch[2]),
          homeAway: homeAway,
          wl: wlMatch[1].toUpperCase(),
        };
      } else if (gameDate >= today && !nextGame) {
        nextGame = {
          date: gameDate.toLocaleDateString(),
          dateObj: gameDate,
          opponent: opponent,
          homeAway: homeAway,
        };
      }

      if (lastGame && nextGame) break;
    }

    return { lastGame, nextGame };
  } catch (error) {
    console.error('Error fetching games:', error.message);
    return { lastGame: null, nextGame: null };
  }
}

// Build email
function buildEmailHTML(lastGame, nextGame) {
  let html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px;">
      <h2 style="color: #007935; margin: 0 0 5px 0;">🏀 Boston Celtics Daily Update</h2>
      <p style="color: #666; font-size: 12px; margin: 0 0 15px 0;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
  `;

  if (lastGame) {
    html += `
      <div style="border-left: 4px solid #007935; padding: 12px; margin-bottom: 15px; background: #f9f9f9;">
        <h3 style="color: #007935; margin: 0 0 10px 0;">📊 Most Recent Game</h3>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${lastGame.date}</p>
        <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: ${lastGame.wl === 'W' ? '#007935' : '#d32f2f'};">
          Celtics <strong>${lastGame.celticsPoints}</strong> - ${lastGame.opponent} <strong>${lastGame.opponentPoints}</strong>
          <span style="margin-left: 10px; font-size: 14px;">${lastGame.wl === 'W' ? '✓ WIN' : '✗ LOSS'}</span>
        </p>
        <p style="margin: 5px 0;"><strong>Location:</strong> ${lastGame.homeAway}</p>
      </div>
    `;
  } else {
    html += `<p style="color: #999;">No completed games found yet.</p>`;
  }

  if (nextGame) {
    html += `
      <div style="border-left: 4px solid #1f51ba; padding: 12px; margin-bottom: 15px; background: #f0f4ff;">
        <h3 style="color: #1f51ba; margin: 0 0 10px 0;">⏰ Next Game</h3>
        <p style="margin: 5px 0;"><strong>Opponent:</strong> ${nextGame.opponent}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${nextGame.date}</p>
        <p style="margin: 5px 0;"><strong>Location:</strong> ${nextGame.homeAway}</p>
      </div>
    `;
  } else {
    html += `<p style="color: #999;">No upcoming games scheduled.</p>`;
  }

  html += `</div>`;
  return html;
}

// Main
async function main() {
  console.log('Starting Celtics tracker...');
  try {
    const { lastGame, nextGame } = await getCelticsGames();
    const html = buildEmailHTML(lastGame, nextGame);
    await sendEmail('🏀 Boston Celtics Daily Update', html);
  } catch (error) {
    console.error('Fatal error:', error.message);
  }
}

main();
