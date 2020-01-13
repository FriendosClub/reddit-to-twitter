# Reddit-to-Twitter

A JavaScript tool to mirror posts from a subreddit to a Twitter account.

## About

This is a personal project cobbled together to expand my understanding of JavaScript promises.  It's ugly, but it works.

## Usage

1. You'll need a [Twitter API key](https://apps.twitter.com/app/new) and a Reddit account or API key
  - (see the "Setting Up Snoowrap" section of [this article](https://browntreelabs.com/scraping-reddits-api-with-snoowrap/) for more info on the latter).
2. Set up the bot
  - Clone the repo
  - Run `yarn install --production`
  - Copy `.env.example` to `.env` and fill out the details.
3. Set up a cron job to run "node bot.js" however often you want the bot to post on Twitter.
  - Ex: `0,30 * * * * /usr/bin/node /home/ralph/rtt/bot.js > /dev/null 2>&1` to run the bot twice an hour
  
## Contributing

This is far from the best/cleanest implementation of this concept, so I'd be very grateful for any issues/pull requests.  

This project follows the [AirBNB style guide](https://github.com/airbnb/javascript), please ensure `yarn test` completes successfully before creating a pull request.
