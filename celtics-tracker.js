const https = require('https');
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;
const RECIPIENT_EMAIL = 'bmartin@aypa.com';

// Fetch data from URL
function fetchData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
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
    console.log(`✓ Email sent: ${subject}`);
  } catch (error) {
    console.error('✗ Error sending email:', error.message);
  }
}

// Fetch Celtics schedule and game data
async function getCelticsGames() {
  try {
    // Fetch from NBA.com API
    const nbaUrl = 'https://stats.nba.com/stats/leaguegamefinder?TeamID=1610612738&Season=2025&SeasonType=Playoffs';
    const nbaData = await fetchData(nbaUrl);
    const games = JSON.parse(nbaData).resultSets[0].rowSet;

    if (!games || games.length === 0) {
      console.log('No playoff games found');
      return { lastGame: null, nextGame: null };
    }

    // Sort by date
    games.sort((a, b) => new Date(b[3]) - new Date(a[3]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let lastGame = null;
    let nextGame = null;

    // Find last completed game and next upcoming game
    for (let game of games) {
      const gameDate = new Date(game[3]);
      gameDate.setHours(0, 0, 0, 0);

      if (gameDate < today) {
        if (!lastGame) {
          lastGame = parseNBAGame(game);
        }
      } else if (gameDate >= today) {
        if (!nextGame) {
          nextGame = parseNBAGame(game);
        }
      }

      if (lastGame && nextGame) break;
    }

    return { lastGame, nextGame };
  } catch (error) {
    console.error('Error fetching NBA data:', error.message);
    return { lastGame: null, nextGame: null };
  }
}

function parseNBAGame(game) {
  return {
    date: game[3],
    opponent: game[4],
    celticsPoints: game[21],
    opponentPoints: game[22],
    homeAway: game[5] === '@' ? 'Away' : 'Home',
    wl: game[6],
  };
}

// Fetch spread and over/under from ESPN
async function getSpreadData(opponent, gameDate) {
  try {
    const url = 'https://www.espn.com/nba/scoreboard';
    const html = await fetchData(url);

    // Look for spread patterns in HTML
    const spreadMatch = html.match(/Celtics.*?(-?\d+\.5|\+?\d+\.5)/i);
    const ouMatch = html.match(/Over\/Under.*?(\d+\.5)/i);

    return {
      spread: spreadMatch ? spreadMatch[1] : 'N/A',
      ou: ouMatch ? ouMatch[1] : 'N/A',
    };
  } catch (error) {
    console.error('Error fetching spread data:', error.message);
    return { spread: 'N/A', ou: 'N/A' };
  }
}

// Fetch player prop winners (from ESPN)
async function getPlayerProps() {
  try {
    const url = 'https://www.espn.com/nba/scoreboard';
    const html = await fetchData(url);

    // Look for top performers
    const propPattern = /(\w+\s\w+).*?(\d+)\s(PTS|REB|AST)/gi;
    const props = [];
    let match;

    while ((match = propPattern.exec(html)) && props.length < 3) {
      props.push({
        player: match[1],
        value: match[2],
        stat: match[3],
      });
    }

    return props;
  } catch (error) {
    console.error('Error fetching player props:', error.message);
    return [];
  }
}

// Fetch injury news
async function getInjuryNews() {
  try {
    const url = 'https://www.espn.com/nba/team/_/name/bos';
    const html = await fetchData(url);

    // Look for injury reports
    const injuryPattern = /<p[^>]*>.*?(Out|Day-to-Day|Questionable).*?<\/p>/gi;
    const injuries = [];
    let match;

    while ((match = injuryPattern.exec(html)) && injuries.length < 3) {
      const text = match[0].replace(/<[^>]*>/g, '');
      if (text.includes('Celtics') || text.includes('player')) {
        injuries.push(text.trim());
      }
    }

    return injuries;
  } catch (error) {
    console.error('Error fetching injury news:', error.message);
    return [];
  }
}

// Determine if Celtics beat the spread
function didBeatSpread(celticsPoints, opponentPoints, spread) {
  if (spread === 'N/A') return 'N/A';
  const spreadNum = parseFloat(spread);
  const pointDiff = celticsPoints - opponentPoints;
  return pointDiff > spreadNum ? '✓ YES' : '✗ NO';
}

// Format HTML email
async function buildEmailHTML(lastGame, nextGame) {
  let html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #007935;">🏀 Boston Celtics Daily Update</h2>
      <p style="color: #666; font-size: 12px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
  `;

  if (lastGame) {
    const spreadData = await getSpreadData(lastGame.opponent, lastGame.date);
    const playerProps = await getPlayerProps();
    const beatSpread = didBeatSpread(lastGame.celticsPoints, lastGame.opponentPoints, spreadData.spread);

    html += `
      <div style="border: 2px solid #007935; padding: 15px; margin: 15px 0; border-radius: 8px;">
        <h3 style="color: #007935; margin-top: 0;">📊 Most Recent Game</h3>
        <p><strong>Date:</strong> ${new Date(lastGame.date).toLocaleDateString()}</p>
        <p><strong>Result:</strong> Celtics ${lastGame.celticsPoints} - ${lastGame.opponent} ${lastGame.opponentPoints} (${lastGame.wl})</p>
        <p><strong>Location:</strong> ${lastGame.homeAway}</p>
        
        <div style="background: #f0f0f0; padding: 10px; border-radius: 5px; margin: 10px 0;">
          <p style="margin: 5px 0;"><strong>Spread:</strong> ${spreadData.spread}</p>
          <p style="margin: 5px 0;"><strong>Beat Spread:</strong> ${beatSpread}</p>
          <p style="margin: 5px 0;"><strong>Over/Under:</strong> ${spreadData.ou}</p>
        </div>
        
        ${playerProps.length > 0 ? `
          <div style="background: #f9f9f9; padding: 10px; border-radius: 5px;">
            <p style="margin: 5px 0; font-weight: bold;">Key Player Props:</p>
            ${playerProps.map(prop => `<p style="margin: 3px 0;">• ${prop.player}: ${prop.value} ${prop.stat}</p>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  } else {
    html += `<p style="color: #666;">No completed games found.</p>`;
  }

  if (nextGame) {
    html += `
      <div style="border: 2px solid #1f51ba; padding: 15px; margin: 15px 0; border-radius: 8px;">
        <h3 style="color: #1f51ba; margin-top: 0;">⏰ Next Game</h3>
        <p><strong>Opponent:</strong> ${nextGame.opponent}</p>
        <p><strong>Date & Time:</strong> ${new Date(nextGame.date).toLocaleDateString()} (Time TBD)</p>
        <p><strong>Location:</strong> ${nextGame.homeAway}</p>
      </div>
    `;
  }

  const injuries = await getInjuryNews();
  if (injuries.length > 0) {
    html += `
      <div style="border: 2px solid #ff6b35; padding: 15px; margin: 15px 0; border-radius: 8px;">
        <h3 style="color: #ff6b35; margin-top: 0;">🚑 Injury Updates</h3>
        ${injuries.map(inj => `<p>• ${inj}</p>`).join('')}
      </div>
    `;
  }

  html += `
    <p style="color: #999; font-size: 11px; margin-top: 20px;">
      Celtics Tracker | Generated automatically
    </p>
    </div>
  `;

  return html;
}

// Main function
async function main() {
  console.log('🏀 Starting Celtics Daily Tracker...');

  const { lastGame, nextGame } = await getCelticsGames();

  if (!lastGame && !nextGame) {
    console.log('⚠ No games found for today');
    return;
  }

  const htmlContent = await buildEmailHTML(lastGame, nextGame);
  await sendEmail('🏀 Boston Celtics Daily Update', htmlContent);
}

main().catch(console.error);
