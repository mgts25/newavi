const fs = require("fs");
const path = require("path");

// Merges every per-game JSON file in _data/games/ into one array, sorted by
// the "order" field. This lets the Decap CMS "Game Library" collection
// manage each game as its own record (add/remove/reorder) while Eleventy
// still sees one flat `games` list, same as before.
module.exports = () => {
  const dir = path.join(__dirname, "games");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const games = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  games.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return games;
};
