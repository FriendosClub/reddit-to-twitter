/* eslint-disable no-console */

const fetch = require('node-fetch');
const fs = require('fs');
const Sequelize = require('sequelize');
const Snoowrap = require('snoowrap');
const syncForEach = require('sync-foreach');
const Twit = require('twit');

const findGoodPosts = require('./modules/findGoodPosts');

const allowedMIMETypes = ['image/gif', 'image/jpeg', 'image/png'];

require('console-stamp')(console, 'HH:MM:ss.l');
require('dotenv').config();

const sequelizeLogger = fs.createWriteStream('./tmp/sequelize.log', { flags: 'a' });
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'db.sqlite',
  logging: (msg) => { sequelizeLogger.write(msg); },
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
    console.log('> Sequelize set up successfully.');
    if (process.env.NODE_ENV !== 'production') {
      sequelize.sync({ /* force: true */ }).then(() => {
        console.log('> Database synced.');
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
  console.log('> Preparing Reddit account with refresh token.');
  redditUserOptions.refreshToken = process.env.REDDIT_REFRESH_TOKEN;
} else if (process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD) {
  console.log('> Preparing Reddit account with username/password');
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
    let chosenPost = null;

    console.log('> Beginning search for suitable post...');

    syncForEach(goodPosts, (next, post) => {
      Post.findOrCreate({
        where: { shortcode: post.id },
        defaults: { shortcode: post.id, processed: false },
      }).then(([dbPost]) => {
        if (dbPost.processed === false) {
          chosenPost = post;
          next('done');
        } else {
          next();
        }
      });
    }).done(() => {
      console.log(`> Chose "${chosenPost.title}" (https://redd.it/${chosenPost.id})`);
      resolve(chosenPost);
    });
  }))
  .then((post) => {
    fetch(post.url).then((res) => {
      if (!res.ok) { throw new Error(`Got response ${res.status} from ${post.url}`); }

      const contentType = res.headers.get('content-type').toLowerCase();

      if (!allowedMIMETypes.includes(contentType)) {
        console.warn(`> Aborting post ${post.id} since it is ${contentType}`);
        return;
      }

      const fileExtension = contentType.replace('image/', '');
      const fileName = `./tmp/${post.id}.${fileExtension}`;

      const mediaAttachment = fs.createWriteStream(fileName);
      res.body.pipe(mediaAttachment);

      // Once we've fully downloaded the file, upload it to Twitter via stream
      // this gives forward compatibility for videos.
      mediaAttachment.on('finish', () => {
        console.log('> Finished downloading image from Reddit');

        const filterEnabled = Boolean(process.env.FILTER_ENABLED);
        const filterRegex = new RegExp(process.env.FILTER_REGEXP, 'gi');
        let { title } = post;

        if (filterEnabled) {
          console.log('> Filtering words.');

          title = title.replace(filterRegex, (match) => {
            console.log(`> Filtering ${match}`);
            let filter = Array(match.length + 1).join('*');

            filter = match[0] + filter.slice(1, -1) + match[match.length - 1];

            return (filter);
          });
        }

        console.log(`> New title: ${title}`);

        const status = `${title}

        - Posted by u/${post.author.name} on r/${process.env.SUBREDDIT} (https://redd.it/${post.id})`;

        twitterUser.postMediaChunked({ file_path: fileName }, (err, data) => {
          twitterUser.post('statuses/update', {
            status,
            media_ids: [data.media_id_string],
          }, (e, d) => {
            if (e) { throw e; }

            console.log(`> Posted Tweet: https://twitter.com/${d.user.screen_name}/status/${d.id_str}`);
            Post.update({ processed: true }, { where: { shortcode: post.id } });
          });
        });
      });
    });
  });
