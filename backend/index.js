
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { sequelize, User, Category, Player, Match } = require('./database');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'smash-brackets-super-secret-key';

app.use(cors());
app.use(express.json());

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
}

// Initialize Database
sequelize.sync().then(async () => {
  const count = await Category.count();
  if (count === 0) {
    const types = ["Men's Doubles", "Women's Doubles", "Mixed Doubles"];
    const ageGroups = ["8-12 yrs", "13-17 yrs", "18-34 yrs", "35+"];
    const categories = [];
    for (const type of types) {
      for (const age of ageGroups) {
        categories.push({ name: `${type} (${age})` });
      }
    }
    await Category.bulkCreate(categories);
    console.log(`Seeded ${categories.length} categories`);
  }
  console.log('Database synced & Seeded');
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

// API Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashedPassword });
    res.status(201).json({ message: "User created" });
  } catch (err) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(username, password);
    const user = await User.findOne({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    
    // Aggregated query for all player counts
    const playerCounts = await Player.findAll({
      attributes: ['categoryId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['categoryId']
    });

    // Aggregated query for match statuses
    const matches = await Match.findAll({
      attributes: ['categoryId', 'status']
    });

    const statsMap = {};
    playerCounts.forEach(p => {
      statsMap[p.categoryId] = { count: parseInt(p.get('count')), hasMatches: false, allCompleted: true };
    });

    matches.forEach(m => {
      if (!statsMap[m.categoryId]) statsMap[m.categoryId] = { count: 0, hasMatches: false, allCompleted: true };
      statsMap[m.categoryId].hasMatches = true;
      if (m.status === 'PENDING') statsMap[m.categoryId].allCompleted = false;
    });

    const results = categories.map(cat => ({
      ...cat.toJSON(),
      playerCount: statsMap[cat.id]?.count || 0,
      completed: statsMap[cat.id]?.hasMatches ? statsMap[cat.id].allCompleted : false
    }));

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch categories with stats" });
  }
});

app.get('/api/categories/stats', authenticateToken, async (req, res) => {
  try {
    const players = await Player.findAll({ attributes: ['categoryId'] });
    const matches = await Match.findAll({ attributes: ['categoryId', 'status'] });

    const statsMap = {};

    players.forEach(p => {
      if (!statsMap[p.categoryId]) statsMap[p.categoryId] = { count: 0, completed: false, hasMatches: false, allCompleted: true };
      statsMap[p.categoryId].count++;
    });

    matches.forEach(m => {
      if (!statsMap[m.categoryId]) statsMap[m.categoryId] = { count: 0, completed: false, hasMatches: false, allCompleted: true };
      statsMap[m.categoryId].hasMatches = true;
      if (m.status === 'PENDING') {
        statsMap[m.categoryId].allCompleted = false;
      }
    });

    // Finalize "completed" status
    Object.keys(statsMap).forEach(catId => {
      statsMap[catId].completed = statsMap[catId].hasMatches && statsMap[catId].allCompleted;
      delete statsMap[catId].hasMatches;
      delete statsMap[catId].allCompleted;
    });

    res.json(statsMap);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

app.get('/api/players', authenticateToken, async (req, res) => {
  try {
    const { categoryId } = req.query;
    const where = categoryId ? { categoryId } : {};
    const players = await Player.findAll({ where, order: [['name', 'ASC']] });
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

app.post('/api/players', authenticateToken, async (req, res) => {
  try {
    if (!req.body.name || !req.body.categoryId) {
      return res.status(400).json({ error: "Name and Category ID are required" });
    }
    const player = await Player.create(req.body);
    res.status(201).json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/players/bulk', authenticateToken, async (req, res) => {
  try {
    const { players } = req.body;
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: "No players provided" });
    }
    const created = await Player.bulkCreate(players);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: "Failed to upload players" });
  }
});

app.delete('/api/players/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await Player.destroy({ where: { id: req.params.id } });
    if (!deleted) return res.status(404).json({ error: "Player not found" });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete player" });
  }
});

app.get('/api/matches/:categoryId', authenticateToken, async (req, res) => {
  try {
    const matches = await Match.findAll({ 
      where: { categoryId: req.params.categoryId },
      order: [['round', 'ASC'], ['position', 'ASC']]
    });
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

app.post('/api/matches/generate/:categoryId', authenticateToken, async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { categoryId } = req.params;

    const category = await Category.findByPk(categoryId);
    if (!category) throw new Error("Category not found");

    // Clear old matches
    await Match.destroy({ where: { categoryId }, transaction: t });

    const players = await Player.findAll({ where: { categoryId }, transaction: t });
    if (players.length < 2) throw new Error("Need at least 2 players");

    // Shuffle players
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    const matchData = [];
    let position = 0;

    for (let i = 0; i < shuffled.length; i += 2) {
      const p1 = shuffled[i];
      const p2 = shuffled[i + 1] || null;

      // If odd player → BYE
      if (!p2) {
        matchData.push({
          categoryId,
          round: 1,
          position,
          player1Id: p1.id,
          player2Id: null,
          winnerId: p1.id,
          status: 'BYE'
        });
      } else {
        matchData.push({
          categoryId,
          round: 1,
          position,
          player1Id: p1.id,
          player2Id: p2.id,
          status: 'PENDING'
        });
      }

      position++;
    }

    await Match.bulkCreate(matchData, { transaction: t });
    await t.commit();

    const final = await Match.findAll({
      where: { categoryId },
      order: [['round', 'ASC'], ['position', 'ASC']]
    });

    res.json(final);

  } catch (err) {
    if (t) await t.rollback();
    res.status(500).json({ error: err.message });
  }
});



app.patch('/api/matches/:matchId', authenticateToken, async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { winnerId, score } = req.body;
    if (!winnerId) return res.status(400).json({ error: "Winner required" });

    const match = await Match.findByPk(req.params.matchId, { transaction: t });
    if (!match) throw new Error("Match not found");

    // Mark match completed
    await match.update({
      winnerId,
      score,
      status: 'COMPLETED'
    }, { transaction: t });

    const { categoryId, round } = match;

    // Get all matches of this round
    const roundMatches = await Match.findAll({
      where: { categoryId, round },
      transaction: t
    });

    // Check if this round is fully completed (including BYEs)
    const allDone = roundMatches.every(m => m.winnerId);

    if (!allDone) {
      await t.commit();
      return res.json({ message: "Winner saved, waiting for other matches" });
    }

    // Collect winners
    const winners = roundMatches.map(m => m.winnerId);

    // If only one winner, tournament over
    if (winners.length === 1) {
      await t.commit();
      return res.json({ message: "Tournament complete", champion: winners[0] });
    }

    // Shuffle winners
    const shuffled = [...winners].sort(() => Math.random() - 0.5);

    // Create next round
    const nextRound = round + 1;
    const newMatches = [];
    let position = 0;

    for (let i = 0; i < shuffled.length; i += 2) {
      const p1 = shuffled[i];
      const p2 = shuffled[i + 1] || null;

      if (!p2) {
        // BYE again
        newMatches.push({
          categoryId,
          round: nextRound,
          position,
          player1Id: p1,
          player2Id: null,
          winnerId: p1,
          status: 'BYE'
        });
      } else {
        newMatches.push({
          categoryId,
          round: nextRound,
          position,
          player1Id: p1,
          player2Id: p2,
          status: 'PENDING'
        });
      }

      position++;
    }

    await Match.bulkCreate(newMatches, { transaction: t });

    await t.commit();
    res.json({ message: "Next round generated" });

  } catch (err) {
    if (t) await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/matches/category/:categoryId', authenticateToken, async (req, res) => {
  try {
    await Match.destroy({ where: { categoryId: req.params.categoryId } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to reset bracket" });
  }
});

// For any other request, send back the index.html from React
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
