/* eslint-disable no-console */

const fetch = require('node-fetch');
const fs = require('fs');
const Sequelize = require('sequelize');
const Snoowrap = require('snoowrap');
const syncForEach = require('sync-foreach');
const Twit = require('twit');

const findGoodPosts = require('./modules/findGoodPosts');

const allowedMIMETypes = ['image/gif', 'image/jpeg', 'image/png'];

require('dotenv').config();

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'db.sqlite',
});

class Post extends Sequelize.Model { }
Post.init({
  shortcode: {
    type: Sequelize.STRING(6),
    unique: true,
    allowNull: false,
  },
  processed: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
  },
}, {
  sequelize,
  modelName: 'post',
});

sequelize
  .authenticate()
  .then(() => {
    console.log('Sequelize set up successfully.');
    if (process.env.NODE_ENV !== 'production') {
      sequelize.sync({ /* force: true */ }).then(() => {
        console.log('Database synced.\n\n');
      });
    }
  })
  .catch((err) => { throw err; });

const redditUserOptions = {
  userAgent: process.env.REDDIT_USER_AGENT,
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
};

if (process.env.REDDIT_REFRESH_TOKEN) {
  redditUserOptions.refreshToken = process.env.REDDIT_REFRESH_TOKEN;
} else if (process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD) {
  redditUserOptions.username = process.env.REDDIT_USERNAME;
  redditUserOptions.password = process.env.REDDIT_PASSWORD;
} else {
  throw new Error('You must define REDDIT_REFRESH_TOKEN or REDDIT_USERNAME and REDDIT_PASSWORD in .env.');
}

const redditUser = new Snoowrap(redditUserOptions);

const twitterUser = new Twit({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  timeout_ms: 60 * 1000,
  strictSSL: true,
});

// This is where the main program logic begins
redditUser.getHot(process.env.SUBREDDIT)
  // Filter posts by simple critera (text only, etc.)
  .then(findGoodPosts)
  // Pick a suitable posts from those results + database check
  .then((goodPosts) => new Promise((resolve) => {
    console.log('> Starting sync foreach loop...');

    let chosenPost = null;

    syncForEach(goodPosts, (next, post) => {
      Post.findOrCreate({
        where: { shortcode: post.id },
        defaults: { shortcode: post.id, processed: false },
      }).then(([dbPost]) => {
        console.log(`> generated record: ${JSON.stringify(dbPost)}`);

        if (dbPost.processed === false) {
          chosenPost = post;
          next('done');
        } else {
          next();
        }
      });
    }).done(() => {
      resolve(chosenPost);
    });
  }))
  .then((post) => {
    fetch(post.url).then((res) => {
      if (!res.ok) { throw new Error(`Got response ${res.status} from ${post.url}`); }

      const contentType = res.headers.get('content-type').toLowerCase();

      if (!allowedMIMETypes.includes(contentType)) {
        return;
      }

      const fileExtension = contentType.replace('image/', '');
      const fileName = `./tmp/${post.id}.${fileExtension}`;

      const mediaAttachment = fs.createWriteStream(fileName);
      console.log(`> saving ${fileName}`);
      res.body.pipe(mediaAttachment);

      mediaAttachment.on('finish', () => {
        console.log(`> saved ${fileName}.`);

        twitterUser.postMediaChunked({ file_path: fileName }, (err, data) => {
          console.log(`media_id_string: ${data.media_id_string}`);

          twitterUser.post('statuses/update', {
            status: post.title,
            media_ids: [data.media_id_string],
          }, () => {
            Post.update({ processed: true }, { where: { shortcode: post.id } });
          });
        });
      });
    });
  });
