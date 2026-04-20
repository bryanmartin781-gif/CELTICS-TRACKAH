const https = require('https');
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;
const RECIPIENT_EMAIL = 'bmartin@aypa.com';

// Fetch with timeout
function fetchData(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    
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

// Fetch Celtics games - using NBA API
async function getCelticsGames() {
  try {
    console.log('Fetching from NBA API...');
    
    // Get current season/playoff schedule
    const url = 'https://data.nba.net/prod/v1/2024/schedule.json';
    const data = await fetchData(url);
    const schedule = JSON.parse(data);

    if (!schedule.games) {
      console.log('No games in schedule');
      return { lastGame: null, nextGame: null };
    }

    const games = schedule.games.filter(g => 
      (g.homeTeam.teamId === '1610612738' || g.awayTeam.teamId === '1610612738') &&
      g.gameType >= 4 // 4 = playoff, 5 = finals
    );

    console.log(`Found ${games.length} Celtics playoff games`);

    if (games.length === 0) {
      return { lastGame: null, nextGame: null };
    }

    const now = new Date();
    let lastGame = null;
    let nextGame = null;

    for (let game of games) {
      const gameTime = new Date(game.gameEt);
      const isCeltics = game.homeTeam.teamId === '1610612738';
      const opponent = isCeltics ? game.awayTeam : game.homeTeam;

      if (gameTime < now && !lastGame && game.gameStatus >= 3) {
        // Game completed
        const celticsTeam = isCeltics ? game.homeTeam : game.awayTeam;
        lastGame = {
          date: gameTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          opponent: opponent.teamName,
          celticsPoints: isCeltics ? game.homeTeam.score : game.awayTeam.score,
          opponentPoints: isCeltics ? game.awayTeam.score : game.homeTeam.score,
          homeAway: isCeltics ? 'Home' : 'Away',
          wl: (isCeltics ? game.homeTeam.score : game.awayTeam.score) > (isCeltics ? game.awayTeam.score : game.homeTeam.score) ? 'W' : 'L',
          seriesInfo: game.seriesText || 'Playoff Game',
        };
      } else if (gameTime >= now && !nextGame) {
        // Upcoming game
        nextGame = {
          date: gameTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          time: gameTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          opponent: opponent.teamName,
          homeAway: isCeltics ? 'Home' : 'Away',
          seriesInfo: game.seriesText || 'Playoff Game',
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

// Fetch injury news from ESPN
async function getInjuryNews() {
  try {
    console.log('Fetching injury news...');
    const url = 'https://www.espn.com/nba/injuries';
    const html = await fetchData(url, 5000);
    
    // Look for Celtics and 76ers injury mentions
    const celticMatches = html.match(/Celtics[\s\S]{0,200}(Out|Day-to-Day|Questionable)/gi) || [];
    const sixersMatches = html.match(/76ers[\s\S]{0,200}(Out|Day-to-Day|Questionable)/gi) || [];
    
    const injuries = [];
    celticMatches.slice(0, 2).forEach(m => injuries.push('Celtics: ' + m.substring(0, 80)));
    sixersMatches.slice(0, 2).forEach(m => injuries.push('76ers: ' + m.substring(0, 80)));
    
    return injuries.slice(0, 3);
  } catch (error) {
    console.error('Error fetching injuries:', error.message);
    return [];
  }
}

// Build email
async function buildEmailHTML(lastGame, nextGame) {
  let html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px;">
      <h2 style="color: #007935; margin: 0 0 5px 0;">🏀 Boston Celtics Daily Update</h2>
      <p style="color: #666; font-size: 12px; margin: 0 0 20px 0;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
  `;

  // Last Game
  if (lastGame) {
    html += `
      <div style="border-left: 5px solid #007935; padding: 15px; margin-bottom: 20px; background: #f9f9f9; border-radius: 4px;">
        <h3 style="color: #007935; margin: 0 0 12px 0; font-size: 18px;">📊 Most Recent Game</h3>
        <p style="margin: 4px 0; color: #666;"><strong>Date:</strong> ${lastGame.date}</p>
        <p style="margin: 4px 0; color: #666;"><strong>Series:</strong> ${lastGame.seriesInfo}</p>
        <div style="margin: 12px 0; padding: 12px; background: white; border-radius: 4px; border: 1px solid #ddd;">
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${lastGame.wl === 'W' ? '#007935' : '#d32f2f'};">
            Celtics <span style="color: #000;">${lastGame.celticsPoints}</span> 
            <span style="color: #999; font-size: 18px;">–</span> 
            ${lastGame.opponent} <span style="color: #000;">${lastGame.opponentPoints}</span>
          </p>
          <p style="margin: 8px 0 0 0; font-size: 14px; color: ${lastGame.wl === 'W' ? '#007935' : '#d32f2f'}; font-weight: bold;">
            ${lastGame.wl === 'W' ? '✓ CELTICS WIN' : '✗ LOSS'}
          </p>
        </div>
        <p style="margin: 4px 0; color: #666;"><strong>Location:</strong> ${lastGame.homeAway}</p>
      </div>
    `;
  } else {
    html += `<p style="color: #999;">No completed games found yet.</p>`;
  }

  // Next Game
  if (nextGame) {
    html += `
      <div style="border-left: 5px solid #1f51ba; padding: 15px; margin-bottom: 20px; background: #f0f4ff; border-radius: 4px;">
        <h3 style="color: #1f51ba; margin: 0 0 12px 0; font-size: 18px;">⏰ Next Game</h3>
        <p style="margin: 4px 0; color: #666;"><strong>Series:</strong> ${nextGame.seriesInfo}</p>
        <p style="margin: 4px 0; color: #666;"><strong>Opponent:</strong> ${nextGame.opponent}</p>
        <p style="margin: 4px 0; color: #666;"><strong>Date & Time:</strong> ${nextGame.date} at ${nextGame.time} PT</p>
        <p style="margin: 4px 0; color: #666;"><strong>Location:</strong> ${nextGame.homeAway}</p>
      </div>
    `;
  } else {
    html += `<p style="color: #999;">No upcoming games scheduled.</p>`;
  }

  // Injury News (only if available)
  const injuries = await getInjuryNews();
  if (injuries.length > 0) {
    html += `
      <div style="border-left: 5px solid #ff6b35; padding: 15px; margin-bottom: 20px; background: #fff5f0; border-radius: 4px;">
        <h3 style="color: #ff6b35; margin: 0 0 12px 0;">🚑 Injury Updates</h3>
        ${injuries.map(inj => `<p style="margin: 4px 0; font-size: 13px; color: #333;">${inj}</p>`).join('')}
      </div>
    `;
  }

  html += `
    <p style="color: #ccc; font-size: 11px; margin-top: 25px; border-top: 1px solid #eee; padding-top: 10px;">
      Celtics Tracker | Updated ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} PT
    </p>
    </div>
  `;

  return html;
}

// Main
async function main() {
  console.log('🏀 Starting Celtics Tracker...');
  try {
    const { lastGame, nextGame } = await getCelticsGames();
    
    if (!lastGame && !nextGame) {
      console.log('No games found');
      return;
    }

    const html = await buildEmailHTML(lastGame, nextGame);
    await sendEmail('🏀 Boston Celtics Daily Update', html);
    console.log('✓ Complete');
  } catch (error) {
    console.error('Fatal error:', error.message);
  }
}

main();
