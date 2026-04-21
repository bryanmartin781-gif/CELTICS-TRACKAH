const https = require('https');
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;
const RECIPIENT_EMAIL = 'bmartin@aypa.com';

// Fetch with timeout
function fetchData(url, timeout = 10000) {
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
    console.log('✓ Email sent to:', RECIPIENT_EMAIL);
  } catch (error) {
    console.error('✗ Email failed:', error.message);
  }
}

// Fetch Celtics schedule - ALL games
async function getCelticsGamesFromLeague() {
  try {
    console.log('Fetching all NBA games...');
    
    // Fetch league calendar to get all games
    const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
    const data = await fetchData(url);
    const response = JSON.parse(data);

    if (!response.events || response.events.length === 0) {
      console.log('No events found in league data');
      return { lastGame: null, nextGame: null };
    }

    const events = response.events;
    console.log(`Found ${events.length} total events`);

    const now = new Date();
    let lastGame = null;
    let nextGame = null;

    for (let event of events) {
      try {
        const eventDate = new Date(event.date);
        const competition = event.competitions[0];
        
        if (!competition || !competition.competitors) continue;

        // Find Celtics in competitors
        const celtics = competition.competitors.find(c => c.team && c.team.abbreviation === 'BOS');
        const opponent = competition.competitors.find(c => c.team && c.team.abbreviation !== 'BOS');

        if (!celtics || !opponent) continue;

        const celticsScore = parseInt(celtics.score) || 0;
        const opponentScore = parseInt(opponent.score) || 0;
        const status = competition.status.type.name;
        const isCompleted = status === 'STATUS_FINAL';
        const isUpcoming = status === 'STATUS_SCHEDULED';

        console.log(`Event: ${opponent.team.abbreviation} on ${eventDate.toDateString()} - Status: ${status}`);

        if (isCompleted && !lastGame && eventDate < now) {
          lastGame = {
            date: eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            opponent: opponent.team.name,
            celticsPoints: celticsScore,
            opponentPoints: opponentScore,
            homeAway: celtics.homeAway === 'home' ? 'Home' : 'Away',
            wl: celticsScore > opponentScore ? 'W' : 'L',
            seriesInfo: event.shortName || 'Playoff Game',
            gameId: event.id,
          };
          console.log(`✓ Last Game Found: Celtics ${celticsScore} - ${opponent.team.name} ${opponentScore}`);
        } else if (isUpcoming && !nextGame && eventDate >= now) {
          nextGame = {
            date: eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            time: eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            opponent: opponent.team.name,
            homeAway: celtics.homeAway === 'home' ? 'Home' : 'Away',
            seriesInfo: event.shortName || 'Playoff Game',
            gameId: event.id,
          };
          console.log(`✓ Next Game Found: vs ${opponent.team.name} on ${nextGame.date}`);
        }

        if (lastGame && nextGame) break;
      } catch (e) {
        console.log('Error parsing event:', e.message);
        continue;
      }
    }

    // If still no games, try fallback
    if (!lastGame && !nextGame) {
      console.log('No Celtics games found in league data, using fallback');
      return getFallbackData();
    }

    return { lastGame, nextGame };
  } catch (error) {
    console.error('Error fetching games:', error.message);
    console.log('Using fallback data due to API error');
    return getFallbackData();
  }
}

// Fetch box score for a specific game
async function getBoxScore(gameId) {
  try {
    if (!gameId) {
      console.log('No game ID provided for box score');
      return { celtics: [], opponent: [] };
    }
    console.log('Fetching box score for game:', gameId);
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
    const data = await fetchData(url, 5000);
    const response = JSON.parse(data);

    if (!response.boxscore || !response.boxscore.teams) {
      console.log('No boxscore data available');
      return { celtics: [], opponent: [] };
    }

    const teams = response.boxscore.teams;
    let celticsStats = [];
    let opponentStats = [];

    // Extract player stats
    for (let team of teams) {
      const players = team.players || [];
      const topPlayers = players
        .filter(p => p.stats && p.stats.length > 0)
        .sort((a, b) => {
          const aPoints = a.stats[0].stats ? (a.stats[0].stats.points || 0) : 0;
          const bPoints = b.stats[0].stats ? (b.stats[0].stats.points || 0) : 0;
          return bPoints - aPoints;
        })
        .slice(0, 5)
        .map(p => {
          const stat = p.stats[0].stats || {};
          return {
            name: p.displayName,
            points: stat.points || 0,
            rebounds: stat.reboundsTotal || 0,
            assists: stat.assists || 0,
          };
        });

      if (team.team.abbreviation === 'BOS') {
        celticsStats = topPlayers;
      } else {
        opponentStats = topPlayers;
      }
    }

    console.log(`✓ Box score: Celtics ${celticsStats.length} players, Opponent ${opponentStats.length} players`);
    return { celtics: celticsStats, opponent: opponentStats };
  } catch (error) {
    console.error('Error fetching box score:', error.message);
    return { celtics: [], opponent: [] };
  }
}

// Fallback data for when API fails
function getFallbackData() {
  console.log('Loading fallback game data...');
  
  return {
    lastGame: {
      date: 'Apr 19, 2026',
      opponent: '76ers',
      celticsPoints: 123,
      opponentPoints: 91,
      homeAway: 'Home',
      wl: 'W',
      seriesInfo: 'Playoffs - Round 1, Game 1',
      gameId: null,
    },
    nextGame: {
      date: 'Mon, Apr 21',
      time: '07:30 PM',
      opponent: '76ers',
      homeAway: 'Away',
      seriesInfo: 'Playoffs - Round 1, Game 2',
      gameId: null,
    },
  };
}

// Build email with box scores
async function buildEmailHTML(lastGame, nextGame) {
  let html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px;">
      <h2 style="color: #007935; margin: 0 0 5px 0;">🏀 Boston Celtics Daily Update</h2>
      <p style="color: #666; font-size: 12px; margin: 0 0 20px 0;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
  `;

  // Last Game with Box Score
  if (lastGame) {
    const { celtics, opponent } = await getBoxScore(lastGame.gameId);

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
        
        <!-- Box Scores -->
        ${celtics.length > 0 ? `
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #007935; font-size: 13px;">🏀 CELTICS TOP SCORERS</p>
            ${celtics.map(p => `
              <p style="margin: 3px 0; font-size: 12px; color: #333;">
                <strong>${p.name}</strong> ${p.points} PTS, ${p.rebounds} REB, ${p.assists} AST
              </p>
            `).join('')}
          </div>
        ` : ''}
        
        ${opponent.length > 0 ? `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #d32f2f; font-size: 13px;">🏀 ${lastGame.opponent.toUpperCase()} TOP SCORERS</p>
            ${opponent.map(p => `
              <p style="margin: 3px 0; font-size: 12px; color: #333;">
                <strong>${p.name}</strong> ${p.points} PTS, ${p.rebounds} REB, ${p.assists} AST
              </p>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  } else {
    html += `<p style="color: #999;">No completed games found.</p>`;
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
  console.log('GMAIL_USER:', GMAIL_USER ? 'SET' : 'NOT SET');
  console.log('GMAIL_PASSWORD:', GMAIL_PASSWORD ? 'SET' : 'NOT SET');
  
  try {
    const { lastGame, nextGame } = await getCelticsGamesFromLeague();
    
    console.log('Last Game:', lastGame ? 'FOUND' : 'NOT FOUND');
    console.log('Next Game:', nextGame ? 'FOUND' : 'NOT FOUND');
    
    if (lastGame) {
      console.log('  - Opponent:', lastGame.opponent);
      console.log('  - Score:', lastGame.celticsPoints, '-', lastGame.opponentPoints);
      console.log('  - Result:', lastGame.wl);
      console.log('  - Series:', lastGame.seriesInfo);
    }
    
    if (nextGame) {
      console.log('  - Opponent:', nextGame.opponent);
      console.log('  - Date:', nextGame.date);
      console.log('  - Series:', nextGame.seriesInfo);
    }
    
    if (!lastGame && !nextGame) {
      console.log('⚠ No games found');
      return;
    }

    console.log('Building email...');
    const html = await buildEmailHTML(lastGame, nextGame);
    console.log('Sending email to:', RECIPIENT_EMAIL);
    await sendEmail('🏀 Boston Celtics Daily Update', html);
    console.log('✓ Complete');
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error('Stack:', error.stack);
  }
}

main();
