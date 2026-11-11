module.exports = () => {
  const data = require("./gameLibrary.json");
  return (data.games || []).filter((game) => !game.hidden);
};
