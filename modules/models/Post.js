const Sequelize = require('sequelize');

module.exports = (sequelize) => sequelize.define('Post', {
  shortcode: {
    type: Sequelize.STRING(6),
    unique: true,
    allowNull: false,
  },
  processed: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
  },
});
